/**
 * Website Data Retrieval
 * Uses Jina Reader API (free, no key required) to extract clean text from websites.
 * Falls back to raw fetch + basic HTML stripping if Jina is unavailable.
 */

export interface WebsiteData {
  rawText: string;
  source: string;
  success: boolean;
  error?: string;
}

const JINA_PREFIX = "https://r.jina.ai/";
const MAX_TEXT_LENGTH = 4000; // Keep token usage reasonable for downstream AI calls
const FETCH_TIMEOUT_MS = 15000;

/**
 * Fetch and extract readable content from a company website.
 */
export async function scrapeWebsite(websiteUrl: string): Promise<WebsiteData> {
  const normalizedUrl = normalizeUrl(websiteUrl);

  // Attempt 1: Jina Reader (best quality)
  try {
    const jinaResult = await fetchWithTimeout(
      `${JINA_PREFIX}${normalizedUrl}`,
      {
        headers: {
          Accept: "text/plain",
          "X-Return-Format": "text",
        },
      },
      FETCH_TIMEOUT_MS
    );

    if (jinaResult.ok) {
      const text = await jinaResult.text();
      if (text && text.length > 50) {
        return {
          rawText: text.slice(0, MAX_TEXT_LENGTH),
          source: "jina_reader",
          success: true,
        };
      }
    }
  } catch (err) {
    console.warn(`Jina Reader failed for ${normalizedUrl}:`, err);
  }

  // Attempt 2: Direct fetch with basic HTML stripping
  try {
    const directResult = await fetchWithTimeout(
      normalizedUrl,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; HemutBot/1.0; +https://hemut.com)",
        },
      },
      FETCH_TIMEOUT_MS
    );

    if (directResult.ok) {
      const html = await directResult.text();
      const stripped = stripHtml(html);
      if (stripped.length > 50) {
        return {
          rawText: stripped.slice(0, MAX_TEXT_LENGTH),
          source: "direct_fetch",
          success: true,
        };
      }
    }
  } catch (err) {
    console.warn(`Direct fetch failed for ${normalizedUrl}:`, err);
  }

  return {
    rawText: "",
    source: "none",
    success: false,
    error: `Could not retrieve content from ${normalizedUrl}`,
  };
}

function normalizeUrl(url: string): string {
  let cleaned = url.trim();
  // Security: only allow http/https protocols
  if (cleaned.startsWith("http://") || cleaned.startsWith("https://")) {
    return cleaned;
  }
  // Block dangerous protocols (file://, javascript:, data:, ftp://, etc.)
  if (/^[a-z]+:/i.test(cleaned)) {
    throw new Error(`Blocked unsafe URL protocol: ${cleaned.split(":")[0]}`);
  }
  return `https://${cleaned}`;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  return Promise.race([
    fetch(url, options),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}
