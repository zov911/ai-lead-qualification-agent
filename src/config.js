import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');

const env = (k, d) => (process.env[k] ?? '').trim() || d;
const num = (k, d) => Number(env(k, d));

function pickProvider() {
  const p = env('LLM_PROVIDER', 'auto');
  if (p !== 'auto') return p;
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return 'mock';
}

export const config = {
  port: num('PORT', 8787),
  llm: {
    provider: pickProvider(),
    anthropic: {
      model: env('ANTHROPIC_MODEL', 'claude-opus-5-5'),
      effort: env('ANTHROPIC_EFFORT', 'low'),
      useFallbacks: env('ANTHROPIC_FALLBACKS', 'true') === 'true',
    },
    openai: { model: env('OPENAI_MODEL', 'gpt-5-mini') },
  },
  embeddings: {
    provider: env('EMBEDDINGS_PROVIDER', 'ollama'),      // ollama | hash
    ollamaUrl: env('OLLAMA_URL', 'http://localhost:11434'),
    model: env('OLLAMA_EMBED_MODEL', 'qwen3-embedding:0.6b'),
  },
  weights: {
    llm: num('WEIGHT_LLM', 0.5),
    vector: num('WEIGHT_VECTOR', 0.35),
    rules: num('WEIGHT_RULES', 0.15),
  },
  security: {
    inboundSecret: env('INBOUND_WEBHOOK_SECRET', ''),   // shared secret or HMAC key for inbound webhooks
  },
  crm: {
    webhookUrl: env('CRM_WEBHOOK_URL', ''),              // Zapier / Make / n8n / Slack / your CRM
    webhookSecret: env('CRM_WEBHOOK_SECRET', ''),        // signs outbound payloads (HMAC-SHA256)
    hubspotToken: env('HUBSPOT_PRIVATE_APP_TOKEN', ''),  // updates contact properties directly
    pipedriveToken: env('PIPEDRIVE_API_TOKEN', ''),
    pipedriveDomain: env('PIPEDRIVE_COMPANY_DOMAIN', ''),
  },
  dataDir: env('DATA_DIR', 'data'),
};
