# Hemut — AI-Driven Lead Enrichment Pipeline

A full-stack web application that accepts a CSV of companies, enriches each company using multiple external data sources and multi-step AI processing, and emails the enriched CSV back to the user.

**100% free-tier APIs. No credit card required.**

## Live Demo

> **Deployed URL:** https://ai-driven-lead-enrichment-pipeline.onrender.com/

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Next.js Frontend                       │
│              Upload CSV + Enter Email                     │
└───────────────────────┬──────────────────────────────────┘
                        │ POST /api/enrich (FormData)
                        ▼
┌──────────────────────────────────────────────────────────┐
│                 Pipeline Orchestrator                      │
│         (Batch processing with error isolation)           │
│                                                           │
│  For each company (2 concurrent per batch):               │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ Stage 1: Data Gathering (parallel per company)      │ │
│  │  ├── Website Scrape ─── Jina Reader API (free)      │ │
│  │  ├── Google Search ──── Serper.dev API (free)       │ │
│  │  └── Recent News ────── NewsAPI + Serper News       │ │
│  ├─────────────────────────────────────────────────────┤ │
│  │ Stage 2: AI Processing (sequential — #2 uses #1)   │ │
│  │  ├── Call #1: Profile Extraction ── Gemini Flash    │ │
│  │  │   → industry, ICP, product, size, offering       │ │
│  │  └── Call #2: Sales Intelligence ── Gemini Flash    │ │
│  │      → 3 sales angles, 3 risk signals, news summary │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                           │
│  Rebuild CSV → Email via Resend                           │
└──────────────────────────────────────────────────────────┘
```

## Key Design Decisions

1. **Two-phase architecture**: Data gathering (stages 1-3) runs in parallel. AI processing (stages 4-5) runs sequentially because Call #2 uses Call #1's structured output — genuine multi-step orchestration, not two independent prompts.

2. **Error isolation**: `Promise.allSettled` ensures one company's failure never blocks others. Failed rows are marked `ENRICHMENT_FAILED` with metadata.

3. **Provenance tracking**: The `Data Sources Used` column records exactly which APIs returned data per row.

4. **News fallback chain**: NewsAPI (primary) → Serper News (fallback). NewsAPI's free tier blocks non-localhost requests, so Serper news search ensures production reliability.

5. **Structured JSON extraction**: Gemini sometimes wraps JSON in markdown fences. A robust `extractJson()` helper handles code fences, raw JSON, and edge cases.

## Tech Stack — All Free Tiers

| Component | Technology | Free Tier |
|---|---|---|
| Framework | Next.js 14 (App Router) | — |
| Website Scraping | Jina Reader (`r.jina.ai`) | Unlimited, no key |
| Search Data | Serper.dev | 2,500 queries |
| News Data | NewsAPI.org + Serper News | 100/day + shared |
| AI Processing | Google Gemini 2.0 Flash | 15 RPM, 1M TPM |
| Email | Resend | 100 emails/day |
| Deployment | Render.com | Free tier |
| Containerization | Docker | — |

## Quick Start

### Option A: Docker (recommended)

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/Hemut_Task.git
cd Hemut_Task

# 2. Fill in your API keys
#    Edit .env.local with your keys (see "Getting API Keys" below)

# 3. Run with Docker
docker compose up --build

# 4. Open http://localhost:3000
```

### Option B: npm

```bash
# 1. Install dependencies
npm install

# 2. Fill in your API keys in .env.local

# 3. Run dev server
npm run dev

# 4. Open http://localhost:3000
```

## Getting API Keys (5 minutes, all free)

### 1. Google Gemini (AI processing)
- Go to https://aistudio.google.com/apikey
- Click "Create API key"
- Copy the key → `GEMINI_API_KEY` in `.env.local`

### 2. Serper.dev (Google Search)
- Go to https://serper.dev
- Sign up with Google/email
- Dashboard shows your API key → `SERPER_API_KEY` in `.env.local`

### 3. NewsAPI (recent news)
- Go to https://newsapi.org/register
- Sign up, confirm email
- API key is on your account page → `NEWS_API_KEY` in `.env.local`

### 4. Resend (email delivery)
- Go to https://resend.com/signup
- Sign up, confirm email
- Go to API Keys → Create → `RESEND_API_KEY` in `.env.local`
- For testing, leave `FROM_EMAIL=onboarding@resend.dev`

## Deploying to Render (Free)

1. Push your code to GitHub
2. Go to https://render.com → New → Web Service
3. Connect your GitHub repo
4. Settings:
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Environment:** Node
5. Add all environment variables from `.env.local` in the Render dashboard
6. Deploy — Render gives you a free `.onrender.com` URL

## Testing

1. Open the app at `http://localhost:3000`
2. Upload the included `sample_template.csv` from `public/` (or download it from the app)
3. Enter your email address
4. Click "Enrich & Send"
5. Wait ~60-90 seconds
6. Check your inbox for the enriched CSV attachment

## CSV Columns

| Column | Source |
|---|---|
| Company Name | Input |
| Website | Input |
| Industry | AI Call #1 (Profile Extraction) |
| Sub-Industry | AI Call #1 |
| Primary Product / Service | AI Call #1 |
| Target Customer (ICP) | AI Call #1 |
| Estimated Company Size | AI Call #1 |
| Key Offering Summary | AI Call #1 |
| Recent News Summary | AI Call #2 (Sales Intelligence) |
| Sales Angle 1-3 | AI Call #2 |
| Risk Signal 1-3 | AI Call #2 |
| Data Sources Used | Pipeline metadata |

## Project Structure

```
├── app/
│   ├── api/enrich/route.ts   # Pipeline orchestrator API endpoint
│   ├── globals.css            # Global styles + animations
│   ├── layout.tsx             # Root layout with fonts
│   └── page.tsx               # Upload UI with drag-and-drop
├── lib/
│   ├── ai.ts                  # Two-step Gemini AI processing
│   ├── csv.ts                 # PapaParse CSV handling
│   ├── email.ts               # Resend email with attachment
│   ├── news.ts                # NewsAPI + Serper News fallback
│   ├── scraper.ts             # Jina Reader website scraper
│   └── search.ts              # Serper.dev Google Search
├── public/
│   └── sample_template.csv    # Test CSV with real companies
├── Dockerfile                 # Multi-stage production build
├── docker-compose.yml         # One-command local setup
└── .env.local                 # API keys (not committed)
```
