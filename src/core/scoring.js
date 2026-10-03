// Scoring logic: vector fit (ICP similarity + kNN over won/lost deals), rule signals,
// and the final blended score. Pure JS, shared by the Node service and the browser demo.
import { cosine, topK } from './vector.js';
import { emailDomain, FREE_EMAIL_DOMAINS } from './text.js';

// Cosine ranges differ a lot between embedders, so each gets its own calibration window.
export const CALIBRATION = {
  ollama: { floor: 0.30, ceil: 0.72 },
  hash:   { floor: 0.02, ceil: 0.30 },
};

export const DEFAULT_WEIGHTS = { llm: 0.5, vector: 0.35, rules: 0.15 };

const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));

/**
 * @param leadVec    embedding of the incoming lead
 * @param icps       [{ id, name, vector }]
 * @param history    [{ id, company, outcome: 'won'|'lost', value, vector }]
 */
export function vectorFit(leadVec, icps, history, { embedder = 'hash', k = 5 } = {}) {
  const cal = CALIBRATION[embedder] || CALIBRATION.hash;

  const icpRanked = icps
    .map(icp => ({ id: icp.id, name: icp.name, similarity: cosine(leadVec, icp.vector) }))
    .sort((a, b) => b.similarity - a.similarity);
  const best = icpRanked[0] || { similarity: 0 };
  const icpScore = clamp((best.similarity - cal.floor) / (cal.ceil - cal.floor));

  const neighbors = topK(leadVec, history, k).map(({ vector, ...rest }) => rest);
  let wSum = 0, wWon = 0;
  for (const n of neighbors) {
    const w = Math.max(0, n.similarity) ** 2;
    wSum += w;
    if (n.outcome === 'won') wWon += w;
  }
  const winRate = wSum > 1e-6 ? wWon / wSum : 0.5;

  return {
    bestIcp: best.name ? { id: best.id, name: best.name, similarity: round(best.similarity, 3) } : null,
    icpRanked: icpRanked.map(r => ({ ...r, similarity: round(r.similarity, 3) })),
    icpScore: Math.round(icpScore * 100),
    neighbors: neighbors.map(n => ({ ...n, similarity: round(n.similarity, 3) })),
    winRate: round(winRate, 3),
    score: Math.round(100 * (0.55 * icpScore + 0.45 * winRate)),
  };
}

const SENIOR = /\b(chief|c[emtfr]o|vp|vice president|head of|director|founder|co-founder|owner|partner|president)\b/i;
const MID = /\b(manager|lead|principal|senior)\b/i;
const URGENT = /\b(asap|urgent|this (month|quarter)|next (month|quarter)|within \d+ (days|weeks)|q[1-4]|30 days|60 days)\b/i;
const SPAM = /\b(seo services|backlinks?|guest post|link building|crypto|forex|loan offer|web ?design services|rank #?1|cheap traffic)\b/i;
const NOT_BUYER = /\b(student|thesis|homework|internship|job (application|opening)|career|resume|cv)\b/i;

/** Transparent, explainable rule signals. Returns { score 0-100, signals[], flags } */
export function ruleSignals(lead) {
  const signals = [];
  const add = (label, points) => signals.push({ label, points });
  const domain = emailDomain(lead.email);
  const text = `${lead.message || ''} ${lead.budget || ''} ${lead.timeline || ''}`;

  if (!lead.email) add('No email', -10);
  else if (FREE_EMAIL_DOMAINS.has(domain)) add('Free email domain', -8);
  else add('Business email domain', 6);

  if (SENIOR.test(lead.title || '')) add('Senior decision-maker title', 8);
  else if (MID.test(lead.title || '')) add('Mid-level title', 3);

  const emp = parseInt(String(lead.employees || '').replace(/[^\d]/g, ''), 10);
  if (emp >= 50 && emp <= 5000) add('Company size in target range', 6);
  else if (emp > 0 && emp < 10) add('Very small company', -6);

  if (lead.budget || /\$\s?\d|budget/i.test(text)) add('Budget mentioned', 6);
  if (URGENT.test(text)) add('Near-term timeline', 6);
  if ((lead.message || '').trim().length < 25) add('Very short or empty message', -6);

  const spam = SPAM.test(text);
  const notBuyer = NOT_BUYER.test(text);
  if (spam) add('Spam / vendor pitch pattern', -40);
  if (notBuyer) add('Not a buyer (student, job seeker)', -25);

  const score = Math.round(clamp(50 + signals.reduce((s, x) => s + x.points, 0), 0, 100));
  return { score, signals, flags: { spam, notBuyer, freeEmail: FREE_EMAIL_DOMAINS.has(domain) } };
}

export function tierFor(score) {
  if (score >= 75) return 'A';
  if (score >= 55) return 'B';
  if (score >= 35) return 'C';
  return 'D';
}

export const ROUTES = {
  A: { route: 'sales_now', label: 'Route to AE now (SLA < 1 h)' },
  B: { route: 'sales_sequence', label: 'SDR sequence within 24 h' },
  C: { route: 'nurture', label: 'Marketing nurture track' },
  D: { route: 'disqualify', label: 'Disqualify / no follow-up' },
};

/** Blend the three scores. If the LLM step failed, its weight is redistributed. */
export function combine({ llm, vector, rules, flags = {} }, weights = DEFAULT_WEIGHTS) {
  const parts = [
    ['llm', llm, weights.llm],
    ['vector', vector, weights.vector],
    ['rules', rules, weights.rules],
  ].filter(([, v]) => typeof v === 'number');
  const wTotal = parts.reduce((s, [, , w]) => s + w, 0) || 1;
  let score = Math.round(parts.reduce((s, [, v, w]) => s + v * w, 0) / wTotal);
  // Hard guards: spam and non-buyers never reach sales, whatever the model says.
  if (flags.spam) score = Math.min(score, 10);
  else if (flags.notBuyer) score = Math.min(score, 30);
  const tier = tierFor(score);
  return { score, tier, ...ROUTES[tier] };
}

function round(x, d) { const f = 10 ** d; return Math.round(x * f) / f; }
