/**
 * CSV Module — Parse uploaded CSV and rebuild with enriched data.
 * Uses PapaParse for robust CSV handling (BOM, encoding, etc.).
 */

import Papa from "papaparse";
import type { CompanyProfile, SalesIntelligence } from "./ai";

// ─── Types ───────────────────────────────────────────────────────

export interface CompanyRow {
  "Company Name": string;
  Website: string;
  Industry: string;
  "Sub-Industry": string;
  "Primary Product / Service": string;
  "Target Customer (ICP)": string;
  "Estimated Company Size": string;
  "Recent News Summary": string;
  "Key Offering Summary": string;
  "Sales Angle 1": string;
  "Sales Angle 2": string;
  "Sales Angle 3": string;
  "Risk Signal 1": string;
  "Risk Signal 2": string;
  "Risk Signal 3": string;
  "Data Sources Used": string;
}

// ─── Parse ───────────────────────────────────────────────────────

export function parseCsv(csvText: string): CompanyRow[] {
  // Strip BOM if present
  const cleaned = csvText.replace(/^\uFEFF/, "");

  const result = Papa.parse<CompanyRow>(cleaned, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header: string) => header.trim(),
  });

  if (result.errors.length > 0) {
    console.warn("CSV parse warnings:", result.errors);
  }

  // Validate that required columns exist
  const requiredCols = ["Company Name", "Website"];
  for (const col of requiredCols) {
    if (!result.meta.fields?.includes(col)) {
      throw new Error(`CSV is missing required column: "${col}"`);
    }
  }

  // Filter out empty rows
  return result.data.filter(
    (row) => row["Company Name"]?.trim() && row["Website"]?.trim()
  );
}

// ─── Enrich a single row ─────────────────────────────────────────

export function enrichRow(
  row: CompanyRow,
  profile: CompanyProfile,
  salesIntel: SalesIntelligence,
  dataSources: string[]
): CompanyRow {
  return {
    ...row,
    Industry: profile.industry,
    "Sub-Industry": profile.subIndustry,
    "Primary Product / Service": profile.primaryProduct,
    "Target Customer (ICP)": profile.targetCustomer,
    "Estimated Company Size": profile.estimatedSize,
    "Key Offering Summary": profile.keyOfferingSummary,
    "Recent News Summary": salesIntel.recentNewsSummary,
    "Sales Angle 1": salesIntel.salesAngle1,
    "Sales Angle 2": salesIntel.salesAngle2,
    "Sales Angle 3": salesIntel.salesAngle3,
    "Risk Signal 1": salesIntel.riskSignal1,
    "Risk Signal 2": salesIntel.riskSignal2,
    "Risk Signal 3": salesIntel.riskSignal3,
    "Data Sources Used": dataSources.join(", "),
  };
}

// ─── Rebuild CSV ─────────────────────────────────────────────────

export function buildCsv(rows: CompanyRow[]): string {
  return Papa.unparse(rows, {
    columns: [
      "Company Name",
      "Website",
      "Industry",
      "Sub-Industry",
      "Primary Product / Service",
      "Target Customer (ICP)",
      "Estimated Company Size",
      "Recent News Summary",
      "Key Offering Summary",
      "Sales Angle 1",
      "Sales Angle 2",
      "Sales Angle 3",
      "Risk Signal 1",
      "Risk Signal 2",
      "Risk Signal 3",
      "Data Sources Used",
    ],
  });
}
