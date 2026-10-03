// Runs data/sample-leads.json through the full pipeline and prints a scorecard.
//   npm run demo                      → uses whatever LLM / embedder is configured (mock + hash offline)
//   npm run demo -- --export out.json → also writes results (used by the static demo page)
import { readFile, writeFile } from 'node:fs/promises';
import { config } from '../src/config.js';
import { createPipeline } from '../src/pipeline.js';
import { normalizeLead } from '../src/crm/inbound.js';
import { crmPayload } from '../src/crm/outbound.js';

const pipeline = await createPipeline(config);
const leads = JSON.parse(await readFile('data/sample-leads.json', 'utf8'));
console.log(`\nLLM: ${pipeline.info.llm} · embeddings: ${pipeline.info.embedder}\n`);

const results = [];
for (const raw of leads) {
  const r = await pipeline.score(normalizeLead(raw, 'generic'));
  results.push(r);
}

const pad = (s, n) => String(s ?? '').slice(0, n).padEnd(n);
console.log(pad('Lead', 28) + pad('Tier', 6) + pad('Final', 7) + pad('LLM', 6) + pad('Vector', 8) + pad('Rules', 7) + pad('ICP match', 34) + 'Route');
console.log('-'.repeat(118));
for (const r of results) {
  console.log(
    pad(`${r.lead.name} (${r.lead.company || '-'})`, 28) + pad(r.final.tier, 6) + pad(r.final.score, 7) +
    pad(r.qualification?.score ?? '-', 6) + pad(r.vector.score, 8) + pad(r.rules.score, 7) +
    pad(r.vector.bestIcp?.name, 34) + r.final.route,
  );
}

const exportIdx = process.argv.indexOf('--export');
if (exportIdx > -1) {
  const file = process.argv[exportIdx + 1] || 'demo-data.json';
  await writeFile(file, JSON.stringify({ generatedAt: new Date().toISOString(), info: pipeline.info, results: results.map(r => ({ ...r, crm: crmPayload(r) })) }, null, 2));
  console.log(`\nExported ${results.length} results → ${file}`);
}
