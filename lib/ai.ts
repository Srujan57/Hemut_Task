/**
 * AI Processing Module — Two-Step Orchestration
 *
 * Call 1: Extract a structured company profile (industry, ICP, offerings, size)
 * Call 2: Generate sales intelligence (angles, risks, positioning)
 *
 * Call #2 receives Call #1's output — genuine multi-step orchestration.
 *
 * Provider chain with retry:
 *   Primary:  Groq (Llama 3.3 70B) — fast, free, no credit card
 *   Fallback: Google Gemini 2.5 Flash — free, no credit card
 *
 * Each provider retries 429s with exponential backoff before falling to the next.
 */

// ─── Types ───────────────────────────────────────────────────────

export interface CompanyProfile {
  industry: string;
  subIndustry: string;
  primaryProduct: string;
  targetCustomer: string;
  estimatedSize: string;
  keyOfferingSummary: string;
}

export interface SalesIntelligence {
  salesAngle1: string;
  salesAngle2: string;
  salesAngle3: string;
  riskSignal1: string;
  riskSignal2: string;
  riskSignal3: string;
  recentNewsSummary: string;
}

export interface AIResult {
  profile: CompanyProfile;
  salesIntel: SalesIntelligence;
}

export interface GatheredData {
  companyName: string;
  website: string;
  websiteText: string;
  searchSnippets: string[];
  knowledgeGraph?: string;
  newsHeadlines: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractJson(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const braceStart = text.indexOf("{");
  const braceEnd = text.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd > braceStart) return text.slice(braceStart, braceEnd + 1);
  return text.trim();
}

function parseJsonSafe<T>(text: string, label: string): T {
  const jsonStr = extractJson(text);
  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    throw new Error(`Failed to parse ${label} JSON. Raw: ${text.slice(0, 500)}`);
  }
}

// ─── Single-attempt API callers ──────────────────────────────────

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

async function callGroqOnce(apiKey: string, systemPrompt: string, userPrompt: string): Promise<string> {
  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.2,
      max_tokens: 4096,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  if (response.status === 429) throw new Error("RATE_LIMITED");
  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Groq ${response.status}: ${errText.slice(0, 200)}`);
  }
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("Groq empty response");
  return text;
}

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

async function callGeminiOnce(apiKey: string, systemPrompt: string, userPrompt: string): Promise<string> {
  const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 4096, responseMimeType: "application/json" },
    }),
  });
  if (response.status === 429) throw new Error("RATE_LIMITED");
  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Gemini ${response.status}: ${errText.slice(0, 200)}`);
  }
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`Gemini empty: ${JSON.stringify(data).slice(0, 200)}`);
  return text;
}

// ─── Retry wrapper for a single provider ─────────────────────────

async function callWithRetry(
  fn: () => Promise<string>,
  providerName: string,
  maxRetries: number = 3,
  baseDelayMs: number = 8000
): Promise<string> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg === "RATE_LIMITED" && attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(1.5, attempt); // 8s, 12s, 18s
        console.warn(`[AI] ${providerName} rate limited. Retry ${attempt + 1}/${maxRetries} in ${(delay / 1000).toFixed(0)}s...`);
        await sleep(delay);
        continue;
      }
      throw err; // Non-retryable error or exhausted retries
    }
  }
  throw new Error(`${providerName} exhausted retries`);
}

// ─── Unified caller: Groq → Gemini with retries on each ─────────

async function callLLM(
  systemPrompt: string,
  userPrompt: string
): Promise<{ text: string; provider: string }> {
  const groqKey = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  // Try Groq with retries
  if (groqKey) {
    try {
      const text = await callWithRetry(
        () => callGroqOnce(groqKey, systemPrompt, userPrompt),
        "Groq",
        3,
        8000
      );
      return { text, provider: "groq_llama3.3_70b" };
    } catch (err) {
      console.warn(`[AI] Groq exhausted: ${err instanceof Error ? err.message : "unknown"}. Trying Gemini...`);
    }
  }

  // Fallback: Gemini with retries
  if (geminiKey) {
    try {
      const text = await callWithRetry(
        () => callGeminiOnce(geminiKey, systemPrompt, userPrompt),
        "Gemini",
        3,
        10000
      );
      return { text, provider: "gemini_2.5_flash" };
    } catch (err) {
      throw new Error(`Both providers failed. Last error: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  throw new Error("No AI API key configured. Set GROQ_API_KEY or GEMINI_API_KEY.");
}

// ─── Context builder ─────────────────────────────────────────────

function buildContext(data: GatheredData): string {
  const sections: string[] = [];
  sections.push(`COMPANY: ${data.companyName}`);
  sections.push(`WEBSITE: ${data.website}`);
  if (data.websiteText) sections.push(`\n--- WEBSITE CONTENT ---\n${data.websiteText}`);
  if (data.knowledgeGraph) sections.push(`\n--- GOOGLE KNOWLEDGE GRAPH ---\n${data.knowledgeGraph}`);
  if (data.searchSnippets.length > 0) sections.push(`\n--- GOOGLE SEARCH RESULTS ---\n${data.searchSnippets.join("\n")}`);
  if (data.newsHeadlines.length > 0) sections.push(`\n--- RECENT NEWS ---\n${data.newsHeadlines.join("\n")}`);
  return sections.join("\n");
}

// ─── Prompts ─────────────────────────────────────────────────────

const PROFILE_SYSTEM_PROMPT = `You are a B2B research analyst. Given raw data about a company, extract a structured company profile.

Return ONLY valid JSON matching this exact schema:
{
  "industry": "Primary industry (e.g., Enterprise SaaS, Healthcare Technology)",
  "subIndustry": "More specific vertical (e.g., Sales Enablement, Telehealth)",
  "primaryProduct": "Main product or service in one sentence",
  "targetCustomer": "Ideal customer profile — who buys this and why",
  "estimatedSize": "Estimated company size (e.g., Startup (1-50), Mid-Market (51-500), Enterprise (500+))",
  "keyOfferingSummary": "2-3 sentence summary of their core value proposition"
}

Be specific and factual. If data is insufficient for a field, use "Not available" — never fabricate.`;

const SALES_INTEL_SYSTEM_PROMPT = `You are a senior sales strategist. Given a company profile and raw research data, generate actionable sales intelligence.

Return ONLY valid JSON matching this exact schema:
{
  "salesAngle1": "First sales approach — specific, actionable, referencing their product/market",
  "salesAngle2": "Second sales approach — different angle (e.g., competitive, ROI-based, pain-point)",
  "salesAngle3": "Third sales approach — creative angle (e.g., timing-based, expansion opportunity)",
  "riskSignal1": "First risk to watch — could be market, financial, or operational",
  "riskSignal2": "Second risk signal — different category from the first",
  "riskSignal3": "Third risk signal — relates to competition, regulation, or adoption",
  "recentNewsSummary": "1-2 sentence summary of the most notable recent news. If no news is available, say No recent news found."
}

Each field should be a concise, standalone sentence. Be specific to this company — generic advice is useless.`;

// ─── Orchestrator ────────────────────────────────────────────────

export async function processCompanyAI(data: GatheredData): Promise<AIResult & { provider: string }> {
  const context = buildContext(data);

  // Step 1: Extract structured profile
  console.log(`[AI] Call #1: Extracting profile for "${data.companyName}"...`);
  const profileResult = await callLLM(
    PROFILE_SYSTEM_PROMPT,
    `Analyze this company and extract the structured profile:\n\n${context}`
  );
  const profile = parseJsonSafe<CompanyProfile>(profileResult.text, "profile");
  console.log(`[AI] Call #1 done for "${data.companyName}" via ${profileResult.provider}: ${profile.industry}`);

  // 4-second pause between the two calls
  await sleep(4000);

  // Step 2: Generate sales intelligence (uses profile as input — true multi-step)
  const profileSummary = `
EXTRACTED PROFILE (from previous analysis step):
- Industry: ${profile.industry} / ${profile.subIndustry}
- Product: ${profile.primaryProduct}
- Target Customer: ${profile.targetCustomer}
- Size: ${profile.estimatedSize}
- Key Offering: ${profile.keyOfferingSummary}`;

  console.log(`[AI] Call #2: Generating sales intel for "${data.companyName}"...`);
  const salesResult = await callLLM(
    SALES_INTEL_SYSTEM_PROMPT,
    `Generate sales intelligence using this profile and data.\n\n${profileSummary}\n\n--- RAW RESEARCH DATA ---\n${context}`
  );
  const salesIntel = parseJsonSafe<SalesIntelligence>(salesResult.text, "salesIntel");
  console.log(`[AI] Call #2 done for "${data.companyName}" via ${salesResult.provider}`);

  return { profile, salesIntel, provider: profileResult.provider };
}
