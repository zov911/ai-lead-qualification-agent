// Push scored leads back to the CRM / automation layer.
import { createHmac } from 'node:crypto';

/** Compact payload for CRMs and automation tools. */
export function crmPayload(result) {
  const q = result.qualification;
  return {
    lead_id: result.lead.externalId || null,
    email: result.lead.email || null,
    ai_lead_score: result.final.score,
    ai_lead_tier: result.final.tier,
    ai_route: result.final.route,
    ai_icp_match: result.vector.bestIcp?.name || null,
    ai_summary: q?.summary || null,
    ai_next_best_action: q?.next_best_action || null,
    ai_reply_draft: q?.reply_draft || null,
    ai_bant: q ? Object.fromEntries(Object.entries(q.bant).map(([k, v]) => [k, v.status])) : null,
    scored_at: result.scoredAt,
  };
}

export async function pushToCrm(result, crm) {
  const payload = crmPayload(result);
  const deliveries = [];

  if (crm.webhookUrl) {
    const body = JSON.stringify(payload);
    const headers = { 'content-type': 'application/json' };
    if (crm.webhookSecret) headers['x-signature'] = 'sha256=' + createHmac('sha256', crm.webhookSecret).update(body).digest('hex');
    deliveries.push(send('webhook', crm.webhookUrl, { method: 'POST', headers, body }));
  }

  // HubSpot: update custom contact properties (create them once in HubSpot settings).
  if (crm.hubspotToken && result.lead.source === 'hubspot' && result.lead.externalId) {
    deliveries.push(send('hubspot', `https://api.hubapi.com/crm/v3/objects/contacts/${encodeURIComponent(result.lead.externalId)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${crm.hubspotToken}` },
      body: JSON.stringify({
        properties: {
          ai_lead_score: payload.ai_lead_score,
          ai_lead_tier: payload.ai_lead_tier,
          ai_next_best_action: payload.ai_next_best_action,
          ai_summary: payload.ai_summary,
        },
      }),
    }));
  }

  // Pipedrive: add a note with the qualification to the person.
  if (crm.pipedriveToken && crm.pipedriveDomain && result.lead.source === 'pipedrive' && result.lead.externalId) {
    deliveries.push(send('pipedrive', `https://${crm.pipedriveDomain}.pipedrive.com/api/v1/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-token': crm.pipedriveToken },
      body: JSON.stringify({
        person_id: Number(result.lead.externalId),
        content: `<b>AI lead score: ${payload.ai_lead_score} (${payload.ai_lead_tier})</b><br>${payload.ai_summary || ''}<br>Next: ${payload.ai_next_best_action || '-'}`,
      }),
    }));
  }

  return Promise.all(deliveries);
}

async function send(target, url, init) {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
    return { target, ok: res.ok, status: res.status };
  } catch (err) {
    return { target, ok: false, error: err.message };
  }
}
