// Tiny file-backed vector store: ICP profiles + labeled historical deals.
// Swap for pgvector / Qdrant / LanceDB in production; the interface stays the same.
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { leadToText } from './core/text.js';

export async function loadKnowledge(dataDir) {
  const read = async f => JSON.parse(await readFile(join(dataDir, f), 'utf8'));
  return { seller: await read('seller.json'), icps: await read('icp.json'), history: await read('history.json') };
}

export const dealText = d => `${leadToText(d)}\nOutcome summary: ${d.summary}`;
export const icpText = i => `${i.name}\n${i.description}`;

/**
 * Loads cached vectors if they were produced by the same embedder/model,
 * otherwise (re)embeds everything and caches to data/vectors.json.
 */
export async function buildIndex(knowledge, embedder, dataDir) {
  const cachePath = join(dataDir, 'vectors.json');
  const key = `${embedder.name}:${embedder.model}:${knowledge.icps.length}:${knowledge.history.length}`;
  if (existsSync(cachePath)) {
    const cached = JSON.parse(await readFile(cachePath, 'utf8'));
    if (cached.key === key) return cached;
  }
  const icpVecs = await embedder.embed(knowledge.icps.map(icpText), 'document');
  const histVecs = await embedder.embed(knowledge.history.map(dealText), 'document');
  // The embedder may have fallen back to hash mid-way; recompute the key afterwards.
  const index = {
    key: `${embedder.name}:${embedder.model}:${knowledge.icps.length}:${knowledge.history.length}`,
    embedder: embedder.name,
    icps: knowledge.icps.map((i, n) => ({ id: i.id, name: i.name, vector: icpVecs[n] })),
    history: knowledge.history.map((d, n) => ({
      id: d.id, company: d.company, outcome: d.outcome, value: d.value, summary: d.summary, vector: histVecs[n],
    })),
  };
  await writeFile(cachePath, JSON.stringify(index));
  return index;
}
