import { buildSystemPrompt, buildUserPrompt } from './prompt.js';
import { mockQualify } from '../core/mockLLM.js';

/**
 * Returns qualify(lead, ctx) for the configured provider:
 *   anthropic (default when ANTHROPIC_API_KEY is set) | openai | mock
 */
export async function createQualifier(config, knowledge) {
  const system = buildSystemPrompt(knowledge);
  let provider = config.llm.provider;
  let impl = null;

  if (provider === 'anthropic') {
    const { createAnthropicQualifier } = await import('./anthropic.js');
    impl = createAnthropicQualifier(config.llm.anthropic);
  } else if (provider === 'openai') {
    const { createOpenAIQualifier } = await import('./openai.js');
    impl = createOpenAIQualifier(config.llm.openai);
  } else {
    provider = 'mock';
  }

  async function qualify(lead, ctx) {
    if (!impl) {
      return { result: mockQualify(lead, ctx), meta: { provider: 'mock', model: 'heuristic-v1' } };
    }
    const user = buildUserPrompt(lead, ctx);
    let lastErr;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await impl({ system, user });
      } catch (err) {
        lastErr = err;
        if (err.retryable === false) break;
      }
    }
    // Never block the pipeline on the LLM: degrade to vector + rules scoring.
    const describe = provider === 'anthropic' ? (await import('./anthropic.js')).describeAnthropicError : () => null;
    return { result: null, meta: { provider, error: describe(lastErr) || lastErr?.message || 'LLM failed' } };
  }

  return { qualify, provider };
}
