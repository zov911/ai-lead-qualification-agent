// The qualification pipeline: normalize → embed → vector fit → rules → LLM → blend → route.
import { leadToText } from './core/text.js';
import { vectorFit, ruleSignals, combine } from './core/scoring.js';
import { config as defaultConfig } from './config.js';
import { createEmbedder } from './embeddings.js';
import { loadKnowledge, buildIndex } from './store.js';
import { createQualifier } from './llm/index.js';

export async function createPipeline(config = defaultConfig) {
  const knowledge = await loadKnowledge(config.dataDir);
  const embedder = createEmbedder(config.embeddings);
  const index = await buildIndex(knowledge, embedder, config.dataDir);
  const { qualify, provider } = await createQualifier(config, knowledge);

  async function score(lead) {
    const t0 = Date.now();
    const [leadVec] = await embedder.embed([leadToText(lead)], 'query');
    const vector = vectorFit(leadVec, index.icps, index.history, { embedder: index.embedder });
    const rules = ruleSignals(lead);

    // Skip the LLM call entirely for obvious spam: saves tokens, same outcome.
    const llm = rules.flags.spam
      ? { result: null, meta: { provider, skipped: 'spam' } }
      : await qualify(lead, { vector, rules });

    const final = combine({ llm: llm.result?.score, vector: vector.score, rules: rules.score, flags: rules.flags }, config.weights);
    return {
      lead,
      vector,
      rules,
      qualification: llm.result,
      final,
      meta: { embedder: embedder.model, llm: llm.meta, ms: Date.now() - t0 },
      scoredAt: new Date().toISOString(),
    };
  }

  return { score, info: { llm: provider, embedder: embedder.model, icps: index.icps.length, history: index.history.length } };
}
