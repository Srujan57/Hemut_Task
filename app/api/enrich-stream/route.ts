/**
 * POST /api/enrich-stream
 *
 * Same pipeline as /api/enrich but streams progress via SSE (Server-Sent Events).
 * The frontend gets real-time updates per company instead of waiting for the whole batch.
 *
 * SSE events:
 *   { type: "progress", company: "Stripe", step: "gathering", index: 0, total: 10 }
 *   { type: "progress", company: "Stripe", step: "ai_profile", index: 0, total: 10 }
 *   { type: "progress", company: "Stripe", step: "ai_sales", index: 0, total: 10 }
 *   { type: "company_done", company: "Stripe", index: 0, total: 10, success: true }
 *   { type: "complete", enrichedCount: 10, errorCount: 0, emailSent: true }
 *   { type: "error", message: "..." }
 */

import { NextRequest } from "next/server";
import { parseCsv, enrichRow, buildCsv, type CompanyRow } from "@/lib/csv";
import { scrapeWebsite } from "@/lib/scraper";
import { searchCompany } from "@/lib/search";
import { fetchCompanyNews } from "@/lib/news";
import { processCompanyAI, type GatheredData } from "@/lib/ai";
import { sendEnrichedCsv } from "@/lib/email";

export const maxDuration = 300;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_ROWS = 25;

function validateEmail(email: string): boolean {
  return EMAIL_REGEX.test(email) && email.length < 254;
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const email = (formData.get("email") as string)?.trim();

        if (!file) return send({ type: "error", message: "No CSV file provided" });
        if (!email || !validateEmail(email)) return send({ type: "error", message: "Invalid email address" });
        if (file.size > MAX_FILE_SIZE) return send({ type: "error", message: "File too large. Maximum 5MB." });

        const fileName = file.name?.toLowerCase() || "";
        if (!fileName.endsWith(".csv")) return send({ type: "error", message: "Only .csv files are accepted" });

        const csvText = await file.text();
        let rows: CompanyRow[];

        try {
          rows = parseCsv(csvText);
        } catch (e) {
          send({ type: "error", message: `CSV parsing failed: ${e instanceof Error ? e.message : "Unknown"}` });
          controller.close();
          return;
        }

        if (rows.length === 0) { send({ type: "error", message: "CSV has no valid rows" }); controller.close(); return; }
        if (rows.length > MAX_ROWS) { send({ type: "error", message: `Too many rows (${rows.length}). Max ${MAX_ROWS}.` }); controller.close(); return; }

        send({ type: "start", total: rows.length });

        const enrichedRows: CompanyRow[] = [];
        const errors: string[] = [];

        for (let i = 0; i < rows.length; i++) {
          const companyName = rows[i]["Company Name"].trim();
          const website = rows[i]["Website"].trim();
          const dataSources: string[] = [];

          try {
            // Stage 1: Gather data
            send({ type: "progress", company: companyName, step: "gathering", index: i, total: rows.length });

            const [websiteData, searchData, newsData] = await Promise.allSettled([
              scrapeWebsite(website),
              searchCompany(companyName),
              fetchCompanyNews(companyName),
            ]);

            const webResult = websiteData.status === "fulfilled" ? websiteData.value : null;
            const searchResult = searchData.status === "fulfilled" ? searchData.value : null;
            const newsResult = newsData.status === "fulfilled" ? newsData.value : null;

            if (webResult?.success) dataSources.push(webResult.source);
            if (searchResult?.success) dataSources.push(searchResult.source);
            if (newsResult?.success) dataSources.push(newsResult.source);

            const gathered: GatheredData = {
              companyName,
              website,
              websiteText: webResult?.rawText || "",
              searchSnippets: searchResult?.snippets || [],
              knowledgeGraph: searchResult?.knowledgeGraph,
              newsHeadlines: newsResult?.headlines || [],
            };

            // Stage 2: AI Profile
            send({ type: "progress", company: companyName, step: "ai_profile", index: i, total: rows.length });

            const aiResult = await processCompanyAI(gathered);
            dataSources.push(aiResult.provider);

            send({ type: "company_done", company: companyName, index: i, total: rows.length, success: true, industry: aiResult.profile.industry });

            enrichedRows.push(enrichRow(rows[i], aiResult.profile, aiResult.salesIntel, dataSources));
          } catch (err) {
            console.error(`[Pipeline] Failed "${companyName}":`, err);
            send({ type: "company_done", company: companyName, index: i, total: rows.length, success: false });
            enrichedRows.push({ ...rows[i], Industry: "ENRICHMENT_FAILED", "Data Sources Used": dataSources.join(", ") || "none" } as CompanyRow);
            errors.push(err instanceof Error ? err.message : "Unknown");
          }

          // 4-second pause between companies
          if (i < rows.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 4000));
          }
        }

        // Build CSV and send email
        send({ type: "progress", company: "", step: "emailing", index: rows.length, total: rows.length });
        const enrichedCsv = buildCsv(enrichedRows);
        const emailResult = await sendEnrichedCsv(email, enrichedCsv, enrichedRows.length);

        send({
          type: "complete",
          enrichedCount: enrichedRows.length,
          errorCount: errors.length,
          emailSent: emailResult.success,
          emailError: emailResult.error,
        });
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "Pipeline error" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
