// Normalize inbound webhook payloads from different sources into one Lead shape:
// { externalId, source, name, email, title, company, industry, employees, country, budget, timeline, message }
import { createHmac, timingSafeEqual } from 'node:crypto';

const pick = (obj, ...keys) => { for (const k of keys) if (obj?.[k] != null && obj[k] !== '') return obj[k]; return undefined; };

/** HubSpot workflow "Send a webhook" action (contact properties flattened or under .properties). */
function fromHubSpot(p) {
  const props = p.properties
    ? Object.fromEntries(Object.entries(p.properties).map(([k, v]) => [k, v?.value ?? v]))
    : p;
  return {
    externalId: String(pick(p, 'objectId', 'vid', 'hs_object_id') ?? pick(props, 'hs_object_id') ?? ''),
    source: 'hubspot',
    name: [props.firstname, props.lastname].filter(Boolean).join(' ') || props.name,
    email: props.email,
    title: pick(props, 'jobtitle', 'job_title'),
    company: pick(props, 'company', 'company_name'),
    industry: props.industry,
    employees: pick(props, 'numemployees', 'company_size'),
    country: props.country,
    budget: props.budget,
    timeline: props.timeline,
    message: pick(props, 'message', 'how_can_we_help', 'notes_last_contacted'),
  };
}

/** Pipedrive webhooks v2: { meta, data } for person/lead/deal events. */
function fromPipedrive(p) {
  const d = p.data || p.current || p;
  const email = Array.isArray(d.emails) ? d.emails[0]?.value : Array.isArray(d.email) ? d.email[0]?.value : d.email;
  return {
    externalId: String(d.id ?? ''),
    source: 'pipedrive',
    name: d.name,
    email,
    title: d.job_title,
    company: d.org_name || d.organization?.name,
    message: d.notes || d.title,
  };
}

/** Generic JSON from website forms, Typeform/Webflow via Zapier, Make, n8n, etc. */
function fromGeneric(p) {
  return {
    externalId: String(pick(p, 'id', 'externalId', 'lead_id') ?? ''),
    source: pick(p, 'source', 'utm_source') || 'webform',
    name: pick(p, 'name', 'full_name') || [p.first_name, p.last_name].filter(Boolean).join(' '),
    email: pick(p, 'email', 'work_email'),
    title: pick(p, 'title', 'job_title', 'role'),
    company: pick(p, 'company', 'organization'),
    industry: p.industry,
    employees: pick(p, 'employees', 'company_size'),
    country: p.country,
    budget: p.budget,
    timeline: p.timeline,
    message: pick(p, 'message', 'comments', 'notes'),
  };
}

const ADAPTERS = { hubspot: fromHubSpot, pipedrive: fromPipedrive, generic: fromGeneric };

export function normalizeLead(payload, source = 'generic') {
  const adapter = ADAPTERS[source] || fromGeneric;
  const lead = adapter(payload || {});
  for (const k of Object.keys(lead)) {
    if (lead[k] == null) delete lead[k];
    else if (typeof lead[k] === 'string') lead[k] = lead[k].trim().slice(0, 4000); // cap prompt-injection surface & cost
  }
  return lead;
}

/**
 * Accepts either a shared secret header (x-webhook-secret) or an HMAC-SHA256 signature
 * of the raw body (x-signature: sha256=<hex>). If no secret is configured, all requests pass.
 */
export function verifyInbound(rawBody, headers, secret) {
  if (!secret) return true;
  const shared = headers['x-webhook-secret'];
  if (shared) return safeEqual(shared, secret);
  const sig = String(headers['x-signature'] || '').replace(/^sha256=/, '');
  if (!sig) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEqual(sig, expected);
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}
