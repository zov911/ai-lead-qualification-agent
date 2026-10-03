import { z } from 'zod';

const BantField = z.object({
  status: z.enum(['strong', 'partial', 'unknown', 'negative']),
  evidence: z.string().describe('Short quote or paraphrase from the lead that supports the status'),
});

/** Structured qualification returned by the LLM (Claude or OpenAI). */
export const Qualification = z.object({
  score: z.number().int().min(0).max(100).describe('Overall purchase-readiness and fit, 0-100'),
  bant: z.object({
    budget: BantField,
    authority: BantField,
    need: BantField,
    timeline: BantField,
  }),
  persona: z.string().describe('Buyer persona, e.g. "VP Marketing, economic buyer"'),
  intent: z.enum(['high', 'medium', 'low', 'none']),
  summary: z.string().describe('One-sentence summary for the sales rep'),
  reasons: z.array(z.string()).describe('Top reasons supporting the score'),
  risks: z.array(z.string()).describe('Missing info, red flags or objections'),
  next_best_action: z.enum(['book_meeting', 'send_case_study', 'add_to_nurture', 'request_more_info', 'disqualify']),
  reply_draft: z.string().describe('Short personalized first reply (empty string if disqualify). Use {{meeting_link}} or {{case_study_link}} placeholders.'),
});
