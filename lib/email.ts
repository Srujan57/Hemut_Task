/**
 * Email Module — Send enriched CSV via Resend.
 * Free tier: 100 emails/day. Supports attachments natively.
 */

import { Resend } from "resend";

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendEnrichedCsv(
  recipientEmail: string,
  csvContent: string,
  companyCount: number
): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { success: false, error: "RESEND_API_KEY not configured" };
  }

  // Sanitize count to integer to prevent any injection
  const safeCount = Math.floor(Math.abs(companyCount));
  const fromEmail = process.env.FROM_EMAIL || "onboarding@resend.dev";

  try {
    const resend = new Resend(apiKey);

    const { data, error } = await resend.emails.send({
      from: `Hemut Enrichment <${fromEmail}>`,
      to: [recipientEmail],
      subject: `Your Enriched Lead Data — ${safeCount} Companies`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a1a;">Lead Enrichment Complete</h2>
          <p>Your CSV has been enriched with data for <strong>${safeCount} companies</strong>.</p>
          <p>The enriched file is attached. Each company has been analyzed with:</p>
          <ul>
            <li>Website content analysis</li>
            <li>Google Search data (Serper)</li>
            <li>Recent news coverage (NewsAPI)</li>
            <li>AI-generated company profile</li>
            <li>AI-generated sales intelligence</li>
          </ul>
          <p style="color: #666; font-size: 14px; margin-top: 24px;">
            Powered by Hemut Lead Enrichment Pipeline
          </p>
        </div>
      `,
      attachments: [
        {
          filename: `enriched_leads_${new Date().toISOString().split("T")[0]}.csv`,
          content: Buffer.from(csvContent).toString("base64"),
          content_type: "text/csv",
        },
      ],
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (err) {
    console.error("Email send failed:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown email error",
    };
  }
}
