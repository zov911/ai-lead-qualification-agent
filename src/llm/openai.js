// OpenAI provider (alternative to Claude): Chat Completions with a strict JSON schema.
import OpenAI from 'openai';
import { z } from 'zod';
import { Qualification } from './schema.js';
import { LLMError } from './anthropic.js';

export function createOpenAIQualifier({ model }) {
  const client = new OpenAI(); // reads OPENAI_API_KEY
  const schema = z.toJSONSchema(Qualification, { target: 'draft-7' });
  delete schema.$schema;

  return async function qualify({ system, user }) {
    const completion = await client.chat.completions.create({
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      response_format: { type: 'json_schema', json_schema: { name: 'lead_qualification', schema, strict: true } },
    });
    const choice = completion.choices[0];
    if (choice.message.refusal) throw new LLMError(`OpenAI declined: ${choice.message.refusal}`);
    const parsed = Qualification.safeParse(JSON.parse(choice.message.content));
    if (!parsed.success) throw new LLMError(`Schema validation failed: ${parsed.error.message}`, { retryable: true });
    return {
      result: parsed.data,
      meta: {
        provider: 'openai',
        model: completion.model,
        usage: { input: completion.usage?.prompt_tokens, output: completion.usage?.completion_tokens },
      },
    };
  };
}
