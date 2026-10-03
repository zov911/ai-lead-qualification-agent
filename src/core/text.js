// Pure helpers shared by the Node service and the browser demo (no Node imports).

export const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com', 'icloud.com', 'aol.com',
  'proton.me', 'protonmail.com', 'gmx.com', 'mail.com', 'yandex.com', 'ukr.net',
]);

export function emailDomain(email = '') {
  const at = String(email).toLowerCase().trim().split('@');
  return at.length === 2 ? at[1] : '';
}

/** Canonical text representation of a lead, used for embeddings and the LLM prompt. */
export function leadToText(lead) {
  const parts = [
    lead.title && `Role: ${lead.title}`,
    lead.company && `Company: ${lead.company}`,
    lead.industry && `Industry: ${lead.industry}`,
    lead.employees && `Employees: ${lead.employees}`,
    lead.country && `Country: ${lead.country}`,
    lead.source && `Source: ${lead.source}`,
    lead.budget && `Budget: ${lead.budget}`,
    lead.timeline && `Timeline: ${lead.timeline}`,
    lead.message && `Message: ${lead.message}`,
  ];
  return parts.filter(Boolean).join('\n');
}

export function tokenize(text) {
  return String(text).toLowerCase()
    .replace(/[^a-z0-9$+#\s-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP.has(t));
}

const STOP = new Set(('a an and are as at be but by for from has have i in is it its of on or our so that the this to was we were will with you your me my us can do just any about would like hi hello thanks regards').split(' '));
