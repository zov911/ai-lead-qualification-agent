// Embeds ICPs + historical deals into data/vectors.json (run after editing data/*.json).
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../src/config.js';
import { createEmbedder } from '../src/embeddings.js';
import { loadKnowledge, buildIndex } from '../src/store.js';

await rm(join(config.dataDir, 'vectors.json'), { force: true });
const embedder = createEmbedder(config.embeddings);
const index = await buildIndex(await loadKnowledge(config.dataDir), embedder, config.dataDir);
console.log(`Indexed ${index.icps.length} ICPs + ${index.history.length} deals with ${embedder.model} (dims: ${index.icps[0].vector.length})`);
