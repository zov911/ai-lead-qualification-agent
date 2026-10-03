// Vector math + an offline fallback embedder (feature hashing). Pure JS, browser-safe.
import { tokenize } from './text.js';

export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export function normalize(v) {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map(x => x / n);
}

/** Top-k most similar items. items: [{ vector, ...meta }] */
export function topK(query, items, k = 5) {
  return items
    .map(item => ({ ...item, similarity: cosine(query, item.vector) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k);
}

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/**
 * Deterministic "hashing trick" embedding (unigrams + bigrams, signed buckets).
 * Used when Ollama is unavailable (CI, the static demo). Much weaker than a real
 * embedding model, but keeps the pipeline runnable offline with stable results.
 */
export function hashEmbed(text, dims = 384) {
  const v = new Array(dims).fill(0);
  const toks = tokenize(text);
  const feats = toks.concat(toks.slice(1).map((t, i) => toks[i] + '_' + t));
  for (const f of feats) {
    const h = fnv1a(f);
    v[h % dims] += (h & 0x80000000) ? -1 : 1;
  }
  return normalize(v);
}
