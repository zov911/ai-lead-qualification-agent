// Deterministic stand-in for the LLM qualification step. Used in demo mode (no API key),
// in tests, and in the browser demo. It returns the same shape as the real LLM output.

const has = (re, s) => re.test(s || '');

function bantField(strongRe, partialRe, text, strongEv, partialEv) {
  if (has(strongRe, text)) return { status: 'strong', evidence: strongEv };
  if (partialRe && has(partialRe, text)) return { status: 'partial', evidence: partialEv };
  return { status: 'unknown', evidence: 'Not mentioned' };
}

export function mockQualify(lead, ctx = {}) {
  const text = [lead.message, lead.budget, lead.timeline, lead.title].join(' ');
  const flags = ctx.rules?.flags || {};

  const budget = bantField(/\$\s?\d|budget (is|of|approved)|approved budget/i, /budget|pricing|cost|quote/i, text,
    'Explicit budget or approved spend mentioned', 'Asked about pricing or budget');
  const authority = bantField(/\b(chief|c[emtfr]o|vp|vice president|head of|director|founder|owner)\b/i, /\b(manager|lead)\b/i, lead.title,
    `Title "${lead.title}" suggests decision-making authority`, `Title "${lead.title}" is likely an influencer`);
  const need = bantField(/\b(need|struggl|problem|replace|migrat|losing|manual|pain|scal)/i, /\b(interested|explore|looking|evaluate|curious)/i, text,
    'Clear pain point stated', 'Exploratory interest');
  const timeline = bantField(/\b(asap|urgent|this (month|quarter)|within \d+|q[1-4]|30 days|60 days)\b/i, /\b(next year|later|soon|planning)\b/i, text,
    'Near-term timeline stated', 'Vague timeline');

  const pts = { strong: 22, partial: 12, unknown: 4, negative: 0 };
  let score = [budget, authority, need, timeline].reduce((s, f) => s + pts[f.status], 0);
  score = Math.round(score * 0.75 + (ctx.vector?.score ?? 50) * 0.25);
  if (flags.spam) score = 3;
  else if (flags.notBuyer) score = Math.min(score, 20);

  const intent = score >= 70 ? 'high' : score >= 50 ? 'medium' : score >= 25 ? 'low' : 'none';
  const nba = flags.spam || flags.notBuyer ? 'disqualify'
    : score >= 70 ? 'book_meeting' : score >= 50 ? 'send_case_study'
    : score >= 30 ? 'add_to_nurture' : 'request_more_info';

  const first = (lead.name || '').split(' ')[0] || 'there';
  const icp = ctx.vector?.bestIcp?.name;
  const reasons = [];
  if (authority.status === 'strong') reasons.push(authority.evidence);
  if (need.status !== 'unknown') reasons.push(need.evidence);
  if (budget.status !== 'unknown') reasons.push(budget.evidence);
  if (timeline.status === 'strong') reasons.push(timeline.evidence);
  if (icp && (ctx.vector?.icpScore ?? 0) >= 50) reasons.push(`Closest ICP match: ${icp}`);

  const risks = [];
  if (flags.freeEmail) risks.push('Personal email address, so company attribution is uncertain');
  if (budget.status === 'unknown') risks.push('No budget signal yet');
  if (timeline.status === 'unknown') risks.push('No timeline stated');
  if (flags.spam) risks.push('Looks like a vendor pitch or spam');
  if (flags.notBuyer) risks.push('Not a purchasing lead');

  const replies = {
    book_meeting: `Hi ${first}, thanks for reaching out. What you described is exactly where we help teams like ${lead.company || 'yours'} most. Would a 30-minute call this week work to map out your requirements? Here's my calendar: {{meeting_link}}`,
    send_case_study: `Hi ${first}, thanks for your interest. Here's a short case study from a company with a similar setup: {{case_study_link}}. Happy to walk you through it whenever it's useful.`,
    add_to_nurture: `Hi ${first}, thanks for getting in touch. I've added a few resources below that most teams find useful at the evaluation stage. Reply anytime with questions.`,
    request_more_info: `Hi ${first}, thanks for your message. To point you to the right person, could you share a bit more about your team size and what you're hoping to solve?`,
    disqualify: '',
  };

  return {
    score,
    bant: { budget, authority, need, timeline },
    persona: lead.title || 'Unknown role',
    intent,
    summary: flags.spam ? 'Unsolicited vendor pitch, not a prospect.'
      : `${lead.title || 'Contact'} at ${lead.company || 'unknown company'}: ${intent} buying intent${icp ? `, closest to "${icp}"` : ''}.`,
    reasons: reasons.length ? reasons : ['Limited qualifying information'],
    risks,
    next_best_action: nba,
    reply_draft: replies[nba],
  };
}
