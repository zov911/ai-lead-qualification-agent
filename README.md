# AI Lead Qualification Agent

**Live demo:** https://zov911.github.io/ai-lead-qualification-agent/

Every inbound lead scored, explained and routed in seconds. A webhook receives the lead from your CRM or forms. **Qwen3 embeddings** (local, via Ollama) compare it with your ideal customer profiles and your past won/lost deals. **Claude** (or OpenAI) qualifies it on BANT using that evidence. The score, tier, next best action and a personalized reply draft go back to **HubSpot, Pipedrive, Slack or any webhook**.

```
 HubSpot / Pipedrive / web form / Zapier
              │  POST /webhooks/lead/:source  (shared secret or HMAC)
              ▼
 ┌──────────────────────────────────────────────────────────────────────┐
 │ 1 Normalize   → one Lead schema, field-length caps                     │
 │ 2 Embed       → Ollama · qwen3-embedding (instruction-aware queries)   │
 │ 3 Vector fit  → cosine vs ICPs + similarity-weighted kNN over won/lost │
 │ 4 Rules       → email domain, seniority, size, budget, timeline, spam  │
 │ 5 LLM qualify → Claude / OpenAI, strict JSON schema (BANT, intent,     │
 │                 reasons, risks, next action, reply draft)               │
 │ 6 Blend       → 0.50 LLM + 0.35 vector + 0.15 rules → tier A–D + route  │
 └──────────────────────────────────────────────────────────────────────┘
              │  signed webhook · HubSpot properties · Pipedrive note
              ▼
        Sales: "Call Maya today: VP Marketing, $60–90k, Q3 deadline"
```

## Why this design

| Choice | Reason |
|---|---|
| **Vectors + LLM, not LLM alone** | Embeddings ground the score in *your* closed-won history, not generic "good lead" intuition. The LLM receives the nearest deals as evidence (RAG), so its reasoning is anchored. |
| **Local embeddings (Ollama + Qwen3)** | Lead data never leaves your infrastructure for vectorization, and embeddings cost nothing per lead. Qwen3-Embedding is a top open embedding model and is instruction-aware. |
| **Structured outputs** | The LLM must return schema-valid JSON (validated again with Zod), so no brittle parsing. |
| **Rules as hard guards** | Spam and job seekers are capped and never reach sales. Obvious spam skips the LLM call entirely, which saves tokens. |
| **Graceful degradation** | If the LLM fails, the score falls back to vector + rules. If Ollama is down, a hashing embedder keeps the pipeline running. |
| **Async webhooks** | Returns `202` immediately (CRM webhook timeouts are short) and scores in the background. `?sync=1` is available for testing. |
| **Prompt caching** | The system prompt (seller + ICPs) is identical for every lead and cached, so you only pay full price for the lead itself. |

## Quick start

```bash
# 1. Embeddings (optional: without Ollama the agent falls back to offline hash embeddings)
ollama pull qwen3-embedding:0.6b

# 2. Configure
cp .env.example .env        # add ANTHROPIC_API_KEY or OPENAI_API_KEY (none = mock qualifier)

# 3. Run
npm install
npm run seed                # embed ICPs + historical deals
npm run demo                # score data/sample-leads.json and print a scorecard
npm start                   # http://localhost:8787 (demo UI + API)
npm test
```

Example scorecard (offline mode):

```
Lead                        Tier  Final  LLM   Vector  Rules  Route
Maya Chen (Datafinch)       A     81     85    76      82     sales_now
Priya Natarajan (Ledgerly)  B     73     66    85      70     sales_sequence
Daniel Okafor (BrightPath)  C     45     50    27      71     nurture
Alex Kim (RankRocket SEO)   D     10     -     18      16     disqualify   ← spam, LLM skipped
```

## API

| Method | Path | Description |
|---|---|---|
| `POST` | `/webhooks/lead/hubspot` · `/pipedrive` · `/generic` | Inbound lead → 202, then scored and pushed to the CRM (`?sync=1` returns the result) |
| `POST` | `/api/score` | Dry run: score a lead and return the full breakdown, no CRM push |
| `GET` | `/api/leads` | Last 100 scored leads (CRM payload format) |
| `GET` | `/health` | Active LLM provider, embedder, index size |

```bash
curl -X POST "http://localhost:8787/webhooks/lead/generic?sync=1" \
  -H "content-type: application/json" -H "x-webhook-secret: $INBOUND_WEBHOOK_SECRET" \
  -d '{"name":"Maya Chen","email":"maya@datafinch.io","title":"VP Marketing","company":"Datafinch","employees":"340","message":"Need attribution and lead scoring in HubSpot before Q3"}'
```

Outbound payload (to your webhook / CRM):

```json
{
  "lead_id": "L-1001", "email": "maya.chen@datafinch.io",
  "ai_lead_score": 81, "ai_lead_tier": "A", "ai_route": "sales_now",
  "ai_icp_match": "Mid-market B2B SaaS revenue team",
  "ai_summary": "VP Marketing at Datafinch: high buying intent...",
  "ai_next_best_action": "book_meeting",
  "ai_reply_draft": "Hi Maya, thanks for reaching out...",
  "ai_bant": { "budget": "strong", "authority": "strong", "need": "strong", "timeline": "strong" }
}
```

## Make it yours

- `data/seller.json`: your company and offer
- `data/icp.json`: your ideal customer profiles
- `data/history.json`: past won/lost leads (export from your CRM; 50–500 rows works well)
- `.env`: weights, model, effort, CRM targets

Then run `npm run seed`. For production scale, swap `src/store.js` for pgvector, Qdrant or LanceDB; the interface is two functions.

## Project structure

```
src/core/      pure scoring logic (shared with the browser demo)
src/llm/       Claude + OpenAI providers, prompt, Zod schema
src/crm/       inbound normalizers + signature check, outbound pushes
src/pipeline.js · src/server.js · src/embeddings.js · src/store.js
data/          seller, ICPs, labeled history, sample leads
index.html     interactive demo (GitHub Pages)
```

## Tech

Node.js 20+ (no framework) · Anthropic SDK · OpenAI SDK · Zod · Ollama · `node:test`

---

## Want an AI lead agent like this for your business?

I build and deploy AI agents wired into your CRM, data and workflows, from first workshop to production.

**Reach out → [zov911.com](https://zov911.com)**

© zov911. All rights reserved.
