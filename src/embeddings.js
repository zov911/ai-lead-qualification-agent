// Embeddings via a local Ollama server (default: Qwen3-Embedding), with an offline fallback.
import { hashEmbed } from './core/vector.js';

// Qwen3-Embedding is instruction-aware: queries get a task instruction, documents don't.
const QUERY_INSTRUCTION = 'Instruct: Given an inbound B2B sales lead, retrieve similar customer profiles and past deals\nQuery: ';

export function createEmbedder({ provider, ollamaUrl, model }) {
  let active = provider === 'ollama' ? 'ollama' : 'hash';
  let warned = false;

  async function ollamaEmbed(texts) {
    const res = await fetch(`${ollamaUrl}/api/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, input: texts }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
    const { embeddings } = await res.json();
    return embeddings;
  }

  /** @param kind 'query' for leads, 'document' for ICPs / historical deals */
  async function embed(texts, kind = 'document') {
    const input = kind === 'query' ? texts.map(t => QUERY_INSTRUCTION + t) : texts;
    if (active === 'ollama') {
      try {
        return await ollamaEmbed(input);
      } catch (err) {
        if (!warned) {
          console.warn(`[embeddings] Ollama unavailable (${err.message}). Falling back to hash embeddings.\n` +
            `  To enable: install Ollama, then run: ollama pull ${model}`);
          warned = true;
        }
        active = 'hash';
      }
    }
    return texts.map(t => hashEmbed(t));
  }

  return {
    embed,
    get name() { return active; },
    get model() { return active === 'ollama' ? model : 'hash-384'; },
  };
}
