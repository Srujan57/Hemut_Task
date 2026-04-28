/**
 * External Data Source #2: News retrieval
 *
 * Primary: NewsAPI.org (free 100 req/day — works on localhost)
 * Fallback: Serper.dev news search (shares the same free 2,500 queries)
 *
 * NewsAPI's free tier blocks non-localhost requests, so the fallback
 * ensures this works in production without any paid upgrades.
 */

export interface NewsResult {
  headlines: string[];
  source: string;
  success: boolean;
  error?: string;
}

// ─── Primary: NewsAPI.org ────────────────────────────────────────

const NEWS_API_URL = "https://newsapi.org/v2/everything";

async function fetchFromNewsApi(companyName: string): Promise<NewsResult> {
  const apiKey = process.env.NEWS_API_KEY;
  if (!apiKey) {
    return { headlines: [], source: "newsapi", success: false, error: "NEWS_API_KEY not set" };
  }

  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
  const fromDate = twoWeeksAgo.toISOString().split("T")[0];

  const params = new URLSearchParams({
    q: `"${companyName}"`,
    from: fromDate,
    sortBy: "relevancy",
    pageSize: "5",
    language: "en",
    apiKey: apiKey,
  });

  const response = await fetch(`${NEWS_API_URL}?${params.toString()}`);

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`NewsAPI ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  const headlines: string[] = [];

  if (data.articles && Array.isArray(data.articles)) {
    for (const article of data.articles.slice(0, 5)) {
      const parts: string[] = [];
      if (article.title) parts.push(article.title);
      if (article.description) parts.push(article.description);
      if (parts.length > 0) headlines.push(parts.join(" — "));
    }
  }

  return { headlines, source: "newsapi", success: headlines.length > 0 };
}

// ─── Fallback: Serper.dev News Search ────────────────────────────

const SERPER_NEWS_URL = "https://google.serper.dev/news";

async function fetchFromSerperNews(companyName: string): Promise<NewsResult> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    return { headlines: [], source: "serper_news", success: false, error: "SERPER_API_KEY not set" };
  }

  const response = await fetch(SERPER_NEWS_URL, {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: companyName, num: 5 }),
  });

  if (!response.ok) {
    throw new Error(`Serper news returned ${response.status}`);
  }

  const data = await response.json();
  const headlines: string[] = [];

  if (data.news && Array.isArray(data.news)) {
    for (const item of data.news.slice(0, 5)) {
      const parts: string[] = [];
      if (item.title) parts.push(item.title);
      if (item.snippet) parts.push(item.snippet);
      if (parts.length > 0) headlines.push(parts.join(" — "));
    }
  }

  return { headlines, source: "serper_news", success: headlines.length > 0 };
}

// ─── Exported function with automatic fallback ───────────────────

export async function fetchCompanyNews(companyName: string): Promise<NewsResult> {
  // Try NewsAPI first
  try {
    const result = await fetchFromNewsApi(companyName);
    if (result.success) return result;
  } catch (err) {
    console.warn(`NewsAPI failed for "${companyName}":`, err);
  }

  // Fallback to Serper news search
  try {
    const result = await fetchFromSerperNews(companyName);
    return result;
  } catch (err) {
    console.warn(`Serper news also failed for "${companyName}":`, err);
    return {
      headlines: [],
      source: "none",
      success: false,
      error: "Both NewsAPI and Serper news failed",
    };
  }
}
