# Hemut Take-Home — Loom Video Script
### Target: 2–5 minutes | Covers: Architecture, API choices, AI orchestration, deployment

---

## INTRO (0:00 – 0:20)

> "Hey, I'm Srujan. I built an AI-driven lead enrichment pipeline for the Hemut take-home. You upload a CSV of companies, it enriches each one using multiple external data sources and multi-step AI processing, and emails the enriched CSV back to you. Let me walk you through the architecture, my API choices, the AI orchestration design, and the deployment."

**[SCREEN: Show the deployed app's landing page]**

---

## ARCHITECTURE OVERVIEW (0:20 – 1:15)

> "The system is a Next.js full-stack app with a six-stage pipeline."

**[SCREEN: Open the README.md and show the ASCII architecture diagram, or show the architecture strip on the landing page]**

> "When a user uploads a CSV and enters their email, it hits a streaming API endpoint. For each company, the pipeline runs in two phases."

> "Phase one is data gathering — three external sources queried in parallel. The company's website is scraped via Jina Reader, Google Search results come from Serper.dev, and recent news comes from NewsAPI with a Serper News fallback for production reliability."

> "Phase two is AI processing — two sequential calls. The first call extracts a structured company profile: industry, target customer, product, size. The second call takes that profile as input and generates sales intelligence: three sales angles, three risk signals, and a news summary. This is genuine multi-step orchestration — call two depends on call one's output, not just two independent prompts."

> "After all companies are processed, the enriched CSV is emailed via Resend."

---

## API CHOICES (1:15 – 2:00)

> "Every API I chose has a free tier with no credit card required."

**[SCREEN: Show `.env.local` (with keys redacted) or the README tech stack table]**

> "For website scraping, I use Jina Reader — it's completely free, no API key needed, and returns clean text from any URL. If Jina times out, there's a fallback to direct fetch with HTML stripping."

> "For external data enrichment, I use two sources beyond the website. Serper.dev gives me structured Google Search results including knowledge graph data — free for 2,500 queries. NewsAPI gives me recent headlines — free for 100 requests per day. And since NewsAPI's free tier blocks production requests, I built a fallback to Serper's news endpoint."

> "For AI, I use Groq running Llama 3.3 70B as the primary — it's incredibly fast at 300+ tokens per second with a generous free tier. Google Gemini 2.5 Flash is the automatic fallback. Both have retry logic with exponential backoff for rate limits."

> "For email, Resend — 100 free emails per day, native CSV attachment support."

---

## AI ORCHESTRATION DESIGN (2:00 – 3:00)

> "Let me show you the actual code."

**[SCREEN: Open `lib/ai.ts`]**

> "The key design decision is the two-step orchestration. I didn't combine everything into one large prompt — that's explicitly what the assignment says not to do."

**[SCREEN: Scroll to the `processCompanyAI` function]**

> "Call one sends the gathered data — website content, search snippets, news headlines — to the LLM with a system prompt that extracts a structured JSON profile. Industry, sub-industry, target customer, estimated size, key offering."

> "Then call two receives that extracted profile as part of its input, along with the raw data. It generates three specific sales angles, three risk signals, and a news summary. The second call is grounded in the first call's output — so if call one identifies Figma as a 'Design Collaboration' company, call two generates sales angles specific to that positioning."

**[SCREEN: Scroll to `callLLM` function showing the Groq → Gemini fallback chain]**

> "I also built a provider fallback chain. Each call tries Groq first. If Groq is rate-limited, it retries with exponential backoff. If all retries fail, it falls through to Gemini with the same retry pattern. The `Data Sources Used` column in the output CSV records which provider actually handled each company, so there's full provenance."

---

## DEPLOYMENT & DEMO (3:00 – 4:00)

> "The app is deployed on [Render/your platform] and also runs locally via Docker."

**[SCREEN: Show Docker Compose file briefly]**

> "One command — `docker compose up --build` — spins up the entire app. The Dockerfile uses a multi-stage build: install deps, build Next.js, then a minimal Alpine runner image."

**[SCREEN: Switch to the live deployed app]**

> "Let me do a quick demo. I'll upload the 10-company CSV..."

**[SCREEN: Upload the CSV, enter email, click Enrich & Send]**

> "You can see the real-time progress — each company appears as it's being processed. The UI streams Server-Sent Events from the backend, so you see exactly which company is being scraped, profiled, and analyzed."

**[SCREEN: Wait for completion, show the success screen]**

> "All 10 companies enriched, email sent. Let me check my inbox..."

**[SCREEN: Open email, show the attachment, open the CSV briefly]**

> "Every column populated — industry, ICP, sales angles, risk signals, news summaries, and the data sources used for each row."

---

## WRAP-UP (4:00 – 4:30)

> "To summarize: this is a full end-to-end pipeline with real multi-step AI orchestration, three external data sources beyond the LLM, structured JSON outputs, error isolation per company, a provider fallback chain, streaming progress UI, and containerized deployment. All on free-tier APIs."

> "The code is clean, modular — each concern is in its own file in the lib folder — and the README covers everything from setup to architecture. Thanks for reviewing."

---

## TIPS FOR RECORDING

1. **Keep it moving** — don't pause on any screen for more than 10 seconds
2. **Show, don't just tell** — when you mention the fallback chain, actually scroll to that code
3. **Have the app pre-loaded** — don't waste time on `npm install` in the video
4. **Pre-send a test email** — have a successful result already in your inbox as a backup in case the live demo takes too long
5. **Aim for ~4 minutes** — the sweet spot between thorough and concise
