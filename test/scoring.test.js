import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { hashEmbed, cosine } from '../src/core/vector.js';
import { vectorFit, ruleSignals, combine, tierFor } from '../src/core/scoring.js';
import { mockQualify } from '../src/core/mockLLM.js';
import { normalizeLead, verifyInbound } from '../src/crm/inbound.js';
import { Qualification } from '../src/llm/schema.js';

test('hash embeddings are deterministic and unit-length', () => {
  const a = hashEmbed('VP Marketing at a B2B SaaS company needs attribution');
  const b = hashEmbed('VP Marketing at a B2B SaaS company needs attribution');
  assert.deepEqual(a, b);
  assert.ok(Math.abs(cosine(a, a) - 1) < 1e-9);
});

test('similar text scores higher than unrelated text', () => {
  const q = hashEmbed('B2B SaaS attribution lead scoring HubSpot pipeline');
  assert.ok(cosine(q, hashEmbed('SaaS company HubSpot attribution and pipeline reporting')) >
            cosine(q, hashEmbed('cheap backlinks guest post packages')));
});

test('vectorFit favours leads near won deals', () => {
  const won = { id: 'w', company: 'W', outcome: 'won', value: 1, summary: '', vector: hashEmbed('saas attribution hubspot pipeline vp marketing') };
  const lost = { id: 'l', company: 'L', outcome: 'lost', value: 0, summary: '', vector: hashEmbed('student thesis free account research') };
  const icp = { id: 'i', name: 'SaaS', vector: hashEmbed('b2b saas vp marketing attribution pipeline') };
  const good = vectorFit(hashEmbed('vp marketing saas needs attribution for hubspot pipeline'), [icp], [won, lost]);
  const bad = vectorFit(hashEmbed('student writing thesis wants free research account'), [icp], [won, lost]);
  assert.ok(good.score > bad.score);
  assert.ok(good.winRate > bad.winRate);
});

test('rules flag spam and cap the final score', () => {
  const r = ruleSignals({ email: 'a@seo.net', message: 'We sell guest post and backlinks packages' });
  assert.equal(r.flags.spam, true);
  const final = combine({ llm: 90, vector: 90, rules: r.score, flags: r.flags });
  assert.ok(final.score <= 10);
  assert.equal(final.tier, 'D');
});

test('combine redistributes weight when the LLM is missing', () => {
  assert.equal(combine({ llm: undefined, vector: 80, rules: 80 }).score, 80);
});

test('tiers', () => {
  assert.deepEqual([90, 60, 40, 10].map(tierFor), ['A', 'B', 'C', 'D']);
});

test('mock qualification matches the LLM schema', () => {
  const lead = { name: 'Maya Chen', title: 'VP Marketing', company: 'Datafinch', message: 'Need attribution this quarter, budget $60k' };
  const q = mockQualify(lead, { rules: ruleSignals(lead), vector: { score: 70 } });
  assert.ok(Qualification.safeParse(q).success);
  assert.equal(q.bant.authority.status, 'strong');
});

test('normalizes HubSpot and Pipedrive payloads', () => {
  const hs = normalizeLead({ objectId: 42, properties: { firstname: { value: 'Ann' }, lastname: { value: 'Lee' }, email: { value: 'ann@x.com' }, jobtitle: { value: 'CMO' } } }, 'hubspot');
  assert.equal(hs.name, 'Ann Lee'); assert.equal(hs.title, 'CMO'); assert.equal(hs.externalId, '42');
  const pd = normalizeLead({ data: { id: 7, name: 'Bo Ray', emails: [{ value: 'bo@y.com' }], org_name: 'Y' } }, 'pipedrive');
  assert.equal(pd.email, 'bo@y.com'); assert.equal(pd.company, 'Y');
});

test('inbound webhook verification (shared secret and HMAC)', () => {
  const body = Buffer.from('{"a":1}');
  const sig = createHmac('sha256', 's3cret').update(body).digest('hex');
  assert.equal(verifyInbound(body, { 'x-signature': `sha256=${sig}` }, 's3cret'), true);
  assert.equal(verifyInbound(body, { 'x-signature': 'sha256=bad' }, 's3cret'), false);
  assert.equal(verifyInbound(body, { 'x-webhook-secret': 's3cret' }, 's3cret'), true);
  assert.equal(verifyInbound(body, {}, ''), true);
});
