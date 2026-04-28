/**
 * External Data Source #1: Google Search via Serper.dev
 * Free tier: 2,500 queries. Returns structured Google results.
 */

export interface SearchResult {
  snippets: string[];
  knowledgeGraph?: string;
  source: string;
  success: boolean;
  error?: string;
}

const SERPER_URL = "https://google.serper.dev/search";

export async function searchCompany(companyName: string): Promise<SearchResult> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    return {
      snippets: [],
      source: "serper",
      success: false,
      error: "SERPER_API_KEY not configured",
    };
  }

  // Sanitize input: strip control characters and limit length
  const sanitized = companyName.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 200);

  try {
    const response = await fetch(SERPER_URL, {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: `${sanitized} company overview products services`,
        num: 5,
      }),
    });

    if (!response.ok) {
      throw new Error(`Serper API returned ${response.status}`);
    }

    const data = await response.json();

    const snippets: string[] = [];

    // Extract organic result snippets
    if (data.organic && Array.isArray(data.organic)) {
      for (const result of data.organic.slice(0, 5)) {
        if (result.snippet) {
          snippets.push(result.snippet);
        }
      }
    }

    // Extract knowledge graph if available
    let knowledgeGraph: string | undefined;
    if (data.knowledgeGraph) {
      const kg = data.knowledgeGraph;
      const parts: string[] = [];
      if (kg.title) parts.push(`Name: ${kg.title}`);
      if (kg.type) parts.push(`Type: ${kg.type}`);
      if (kg.description) parts.push(`Description: ${kg.description}`);
      if (kg.attributes) {
        for (const [key, value] of Object.entries(kg.attributes)) {
          parts.push(`${key}: ${value}`);
        }
      }
      knowledgeGraph = parts.join(". ");
    }

    return {
      snippets,
      knowledgeGraph,
      source: "serper_google_search",
      success: snippets.length > 0 || !!knowledgeGraph,
    };
  } catch (err) {
    console.error(`Serper search failed for "${companyName}":`, err);
    return {
      snippets: [],
      source: "serper",
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
