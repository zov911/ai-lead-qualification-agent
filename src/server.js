// HTTP server (no framework): CRM webhooks in, scored leads out.
import { createServer } from 'node:http';
import { readFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { createPipeline } from './pipeline.js';
import { normalizeLead, verifyInbound } from './crm/inbound.js';
import { pushToCrm, crmPayload } from './crm/outbound.js';

const MAX_BODY = 256 * 1024;
const recent = [];
const pipeline = await createPipeline(config);

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(Object.assign(new Error('Payload too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const json = (res, status, data) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(data, null, 2)); };

async function handleLead(lead, { push }) {
  const result = await pipeline.score(lead);
  if (push) result.deliveries = await pushToCrm(result, config.crm);
  recent.unshift(result); recent.length = Math.min(recent.length, 100);
  await appendFile(join(config.dataDir, 'results.jsonl'), JSON.stringify(crmPayload(result)) + '\n').catch(() => {});
  const t = result.final;
  console.log(`[lead] ${lead.email || lead.name || 'unknown'} → ${t.score} (${t.tier}) ${t.route} · ${result.meta.ms} ms`);
  return result;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { ok: true, ...pipeline.info });

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      const html = await readFile('index.html');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(html);
    }
    if (req.method === 'GET' && url.pathname.startsWith('/src/core/')) {
      const js = await readFile(join('src/core', url.pathname.split('/').pop().replace(/[^\w.-]/g, '')));
      res.writeHead(200, { 'content-type': 'text/javascript' });
      return res.end(js);
    }

    const dataFile = url.pathname.match(/^\/data\/(icp|history|sample-leads|seller)\.json$/);
    if (req.method === 'GET' && dataFile) {
      const body = await readFile(join(config.dataDir, dataFile[1] + '.json'));
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(body);
    }

    const raw = req.method === 'POST' ? await readBody(req) : Buffer.alloc(0);
    if (!verifyInbound(raw, req.headers, config.security.inboundSecret)) return json(res, 401, { error: 'Invalid webhook signature' });

    // POST /webhooks/lead/:source → 202 immediately, score + push to CRM in the background.
    const hook = url.pathname.match(/^\/webhooks\/lead(?:\/(hubspot|pipedrive|generic))?$/);
    if (req.method === 'POST' && hook) {
      const lead = normalizeLead(JSON.parse(raw.toString('utf8') || '{}'), hook[1] || 'generic');
      if (url.searchParams.get('sync') === '1') return json(res, 200, await handleLead(lead, { push: true }));
      const id = randomUUID();
      json(res, 202, { accepted: true, id });
      handleLead(lead, { push: true }).catch(err => console.error('[lead] failed:', err));
      return;
    }

    // POST /api/score → synchronous dry run, no CRM push.
    if (req.method === 'POST' && url.pathname === '/api/score') {
      const body = JSON.parse(raw.toString('utf8') || '{}');
      return json(res, 200, await handleLead(normalizeLead(body, body.source_type || 'generic'), { push: false }));
    }

    if (req.method === 'GET' && url.pathname === '/api/leads') return json(res, 200, recent.map(crmPayload));

    json(res, 404, { error: 'Not found' });
  } catch (err) {
    if (res.headersSent) return res.end();
    if (err.code === 'ENOENT') return json(res, 404, { error: 'Not found' });
    json(res, err.status || (err instanceof SyntaxError ? 400 : 500), { error: err.message });
  }
});

server.listen(config.port, () => {
  const i = pipeline.info;
  console.log(`AI lead-qualification agent on http://localhost:${config.port}`);
  console.log(`  LLM: ${i.llm} · embeddings: ${i.embedder} · ${i.icps} ICPs · ${i.history} historical deals`);
  if (!config.security.inboundSecret) console.warn('  ⚠ INBOUND_WEBHOOK_SECRET is not set: webhooks are unauthenticated.');
});
