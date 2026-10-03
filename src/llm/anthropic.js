// Claude provider: official Anthropic SDK + structured outputs (JSON schema from Zod).
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { Qualification } from './schema.js';

export function createAnthropicQualifier({ model, effort, useFallbacks }) {
  // Resolves credentials from ANTHROPIC_API_KEY (or an `ant auth login` profile).
  const client = new Anthropic();
  const format = zodOutputFormat(Qualification);

  return async function qualify({ system, user }) {
    const params = {
      model,
      max_tokens: 4000,
      // Lead qualification is a classification-style task: low effort keeps it fast and cheap.
      output_config: { effort, format: { type: format.type, schema: format.schema } },
      // The system prompt is identical for every lead, so cache it.
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: user }],
    };

    // Server-side refusal fallback: if a safety classifier declines, the API re-runs the
    // request on Anthropic's recommended fallback model inside the same call.
    const response = useFallbacks
      ? await client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
      : await client.messages.create(params);

    if (response.stop_reason === 'refusal') {
      throw new LLMError(`Claude declined (${response.stop_details?.category ?? 'unspecified'})`, { retryable: false });
    }
    if (response.stop_reason === 'max_tokens') {
      throw new LLMError('Claude response truncated (max_tokens)', { retryable: true });
    }
    const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const parsed = Qualification.safeParse(JSON.parse(text));
    if (!parsed.success) throw new LLMError(`Schema validation failed: ${parsed.error.message}`, { retryable: true });

    return {
      result: parsed.data,
      meta: {
        provider: 'anthropic',
        model: response.model,
        usage: {
          input: response.usage.input_tokens,
          output: response.usage.output_tokens,
          cache_read: response.usage.cache_read_input_tokens ?? 0,
        },
      },
    };
  };
}

export function describeAnthropicError(err) {
  if (err instanceof Anthropic.AuthenticationError) return 'Invalid or missing ANTHROPIC_API_KEY';
  if (err instanceof Anthropic.RateLimitError) return 'Anthropic rate limit hit, retry later';
  if (err instanceof Anthropic.BadRequestError) return `Bad request: ${err.message}`;
  if (err instanceof Anthropic.APIError) return `Anthropic API error ${err.status}: ${err.message}`;
  return null;
}

export class LLMError extends Error {
  constructor(message, { retryable = false } = {}) { super(message); this.retryable = retryable; }
}
