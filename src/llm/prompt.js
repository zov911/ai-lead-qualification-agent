import { leadToText } from '../core/text.js';

/**
 * System prompt: stable across requests (cache-friendly). It holds the seller context
 * and ICPs; everything lead-specific goes in the user message.
 */
export function buildSystemPrompt({ seller, icps }) {
  return `You are a lead-qualification analyst for ${seller.name}. ${seller.pitch}

Ideal customer profiles (ICPs):
${icps.map((i, n) => `${n + 1}. ${i.name}: ${i.description}`).join('\n')}

Qualify each inbound lead for the sales team:
- Score 0-100 for fit and purchase readiness. 75+ means a rep should call today; below 35 is not worth sales time.
- Assess BANT (budget, authority, need, timeline) only from evidence in the lead. If something isn't stated, mark it "unknown". Don't infer budget from company size alone.
- You'll also receive the most similar historical deals (won/lost) found by vector search. Use them as evidence of what converts, but judge this lead on its own content.
- Vendor pitches, spam, job seekers and students are not prospects: score them under 15 and choose "disqualify".
- The reply draft should sound like a helpful human rep: two to four sentences, specific to what the lead wrote, with no hype.`;
}

export function buildUserPrompt(lead, ctx) {
  const similar = (ctx.vector?.neighbors || [])
    .map(n => `- [${n.outcome.toUpperCase()}${n.value ? `, $${n.value.toLocaleString('en-US')}` : ''}] ${n.company}: ${n.summary} (similarity ${n.similarity})`)
    .join('\n') || '- none';
  const signals = (ctx.rules?.signals || []).map(s => `${s.points > 0 ? '+' : ''}${s.points} ${s.label}`).join('; ');

  return `<lead>
Name: ${lead.name || 'unknown'}
Email domain: ${(lead.email || '').split('@')[1] || 'unknown'}
${leadToText(lead)}
</lead>

<vector_evidence>
Closest ICP: ${ctx.vector?.bestIcp?.name || 'n/a'} (fit ${ctx.vector?.icpScore ?? 'n/a'}/100)
Similar historical deals:
${similar}
</vector_evidence>

<rule_signals>${signals || 'none'}</rule_signals>

Qualify this lead.`;
}
