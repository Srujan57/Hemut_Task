/**
 * POST /api/enrich
 *
 * Main pipeline endpoint. Accepts FormData with:
 *   - file: CSV file
 *   - email: recipient email address
 *
 * Orchestration:
 *   1. Parse CSV
 *   2. For each company (SEQUENTIAL to respect Gemini 15 RPM free tier):
 *      a. Scrape website + Google Search + News  (parallel — no rate limit)
 *      b. AI Call #1: profile extraction          (sequential)
 *      c. AI Call #2: sales intelligence          (sequential, uses #1 output)
 *   3. Rebuild enriched CSV
 *   4. Email the result
 */

import { NextRequest, NextResponse } from "next/server";
import { parseCsv, enrichRow, buildCsv, type CompanyRow } from "@/lib/csv";
import { scrapeWebsite } from "@/lib/scraper";
import { searchCompany } from "@/lib/search";
import { fetchCompanyNews } from "@/lib/news";
import { processCompanyAI, type GatheredData } from "@/lib/ai";
import { sendEnrichedCsv } from "@/lib/email";

// Allow up to 5 minutes for processing ~10 companies
export const maxDuration = 300;

// ─── Input validation ────────────────────────────────────────────

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_ROWS = 25; // Prevent API quota exhaustion

function validateEmail(email: string): boolean {
  return EMAIL_REGEX.test(email) && email.length < 254;
}

// ─── Single company enrichment ───────────────────────────────────

async function enrichCompany(
  row: CompanyRow
): Promise<{ enrichedRow: CompanyRow; error?: string }> {
  const companyName = row["Company Name"].trim();
  const website = row["Website"].trim();
  const dataSources: string[] = [];

  try {
    // Stage 1-3: Gather data from external sources (concurrent — these have no tight rate limits)
    console.log(`[Pipeline] Gathering data for "${companyName}"...`);
    const [websiteData, searchData, newsData] = await Promise.allSettled([
      scrapeWebsite(website),
      searchCompany(companyName),
      fetchCompanyNews(companyName),
    ]);

    const webResult =
      websiteData.status === "fulfilled" ? websiteData.value : null;
    const searchResult =
      searchData.status === "fulfilled" ? searchData.value : null;
    const newsResult =
      newsData.status === "fulfilled" ? newsData.value : null;

    if (webResult?.success) dataSources.push(webResult.source);
    if (searchResult?.success) dataSources.push(searchResult.source);
    if (newsResult?.success) dataSources.push(newsResult.source);

    console.log(`[Pipeline] Data gathered for "${companyName}": ${dataSources.join(", ")}`);

    // Build context for AI
    const gathered: GatheredData = {
      companyName,
      website,
      websiteText: webResult?.rawText || "",
      searchSnippets: searchResult?.snippets || [],
      knowledgeGraph: searchResult?.knowledgeGraph,
      newsHeadlines: newsResult?.headlines || [],
    };

    // Stage 4-5: Multi-step AI processing (sequential — call #2 depends on call #1)
    // The AI module handles its own retry logic for rate limits
    const aiResult = await processCompanyAI(gathered);
    dataSources.push(aiResult.provider);

    console.log(`[Pipeline] ✓ "${companyName}" enriched successfully`);

    return {
      enrichedRow: enrichRow(row, aiResult.profile, aiResult.salesIntel, dataSources),
    };
  } catch (err) {
    console.error(`[Pipeline] ✗ Failed to enrich "${companyName}":`, err);

    return {
      enrichedRow: {
        ...row,
        Industry: "ENRICHMENT_FAILED",
        "Data Sources Used": dataSources.join(", ") || "none",
      },
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ─── Main handler ────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    // Extract and validate inputs
    const file = formData.get("file") as File | null;
    const email = (formData.get("email") as string)?.trim();

    if (!file) {
      return NextResponse.json(
        { error: "No CSV file provided" },
        { status: 400 }
      );
    }

    if (!email || !validateEmail(email)) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum 5MB." },
        { status: 400 }
      );
    }

    // Validate file type (defense in depth — don't trust client)
    const fileName = file.name?.toLowerCase() || "";
    if (!fileName.endsWith(".csv")) {
      return NextResponse.json(
        { error: "Only .csv files are accepted" },
        { status: 400 }
      );
    }

    // Parse CSV
    const csvText = await file.text();
    let rows: CompanyRow[];

    try {
      rows = parseCsv(csvText);
    } catch (parseErr) {
      return NextResponse.json(
        {
          error: `CSV parsing failed: ${parseErr instanceof Error ? parseErr.message : "Unknown error"}`,
        },
        { status: 400 }
      );
    }

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "CSV contains no valid company rows" },
        { status: 400 }
      );
    }

    if (rows.length > MAX_ROWS) {
      return NextResponse.json(
        { error: `CSV contains ${rows.length} rows. Maximum ${MAX_ROWS} to avoid exceeding API quotas.` },
        { status: 400 }
      );
    }

    console.log(`[Pipeline] Starting enrichment for ${rows.length} companies...`);

    // Process companies ONE AT A TIME to respect Gemini free tier (15 RPM)
    // Each company = 2 AI calls + 2s pause inside ai.ts = ~6s per company
    // Sequential processing ensures we never exceed rate limits
    const enrichedRows: CompanyRow[] = [];
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      console.log(`[Pipeline] Processing company ${i + 1}/${rows.length}...`);

      const result = await enrichCompany(rows[i]);
      enrichedRows.push(result.enrichedRow);
      if (result.error) {
        errors.push(result.error);
      }

      // 4-second pause between companies
      if (i < rows.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 4000));
      }
    }

    console.log(
      `[Pipeline] Enrichment complete: ${enrichedRows.length} companies, ${errors.length} errors`
    );

    // Build enriched CSV
    const enrichedCsv = buildCsv(enrichedRows);

    // Send email
    const emailResult = await sendEnrichedCsv(
      email,
      enrichedCsv,
      enrichedRows.length
    );

    if (!emailResult.success) {
      return NextResponse.json(
        {
          error: `Enrichment succeeded but email delivery failed: ${emailResult.error}`,
          enrichedCount: enrichedRows.length,
          csvPreview: enrichedCsv.slice(0, 2000),
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Enriched ${enrichedRows.length} companies and sent results to ${email}`,
      enrichedCount: enrichedRows.length,
      errorCount: errors.length,
      errors: errors.length > 0 ? errors : undefined,
      emailMessageId: emailResult.messageId,
    });
  } catch (err) {
    console.error("Pipeline error:", err);
    return NextResponse.json(
      {
        error: "Internal pipeline error. Please try again.",
        details: err instanceof Error ? err.message : undefined,
      },
      { status: 500 }
    );
  }
}
