"use client";

import { useState, useRef, useCallback, type ChangeEvent, type DragEvent } from "react";

type Status = "idle" | "processing" | "success" | "error";
type CompanyStatus = "pending" | "gathering" | "ai_profile" | "ai_sales" | "done" | "failed";

interface CompanyProgress {
  name: string;
  status: CompanyStatus;
  industry?: string;
}

interface FinalResult {
  enrichedCount: number;
  errorCount: number;
  emailSent: boolean;
  emailError?: string;
}

const STEP_LABELS: Record<CompanyStatus, string> = {
  pending: "Waiting...",
  gathering: "Scraping website, search & news",
  ai_profile: "AI extracting company profile",
  ai_sales: "AI generating sales intelligence",
  done: "Complete",
  failed: "Failed",
};

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [companies, setCompanies] = useState<CompanyProgress[]>([]);
  const [result, setResult] = useState<FinalResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [emailingPhase, setEmailingPhase] = useState(false);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = useCallback((f: File) => {
    if (!f.name.toLowerCase().endsWith(".csv")) return alert("Please upload a .csv file");
    if (f.size > 5 * 1024 * 1024) return alert("File too large. Maximum 5MB.");
    setFile(f);
    setErrorMsg("");
    setStatus("idle");
  }, []);

  const submit = async () => {
    if (!file || !email) return;
    setStatus("processing");
    setCompanies([]);
    setResult(null);
    setErrorMsg("");
    setEmailingPhase(false);

    const fd = new FormData();
    fd.append("file", file);
    fd.append("email", email);

    try {
      const res = await fetch("/api/enrich-stream", { method: "POST", body: fd });
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const match = line.match(/^data: (.+)$/m);
          if (!match) continue;

          try {
            const evt = JSON.parse(match[1]);

            if (evt.type === "start") {
              // Initialize company list
              // We don't know names yet — they arrive with progress events
            }

            if (evt.type === "progress") {
              if (evt.step === "emailing") {
                setEmailingPhase(true);
                continue;
              }

              setCompanies((prev) => {
                const copy = [...prev];
                const idx = copy.findIndex((c) => c.name === evt.company);
                if (idx >= 0) {
                  copy[idx] = { ...copy[idx], status: evt.step as CompanyStatus };
                } else {
                  // New company appearing — also fill any missing "pending" entries
                  while (copy.length < evt.index) {
                    copy.push({ name: `Company ${copy.length + 1}`, status: "pending" });
                  }
                  copy.push({ name: evt.company, status: evt.step as CompanyStatus });
                }
                return copy;
              });
            }

            if (evt.type === "company_done") {
              setCompanies((prev) => {
                const copy = [...prev];
                const idx = copy.findIndex((c) => c.name === evt.company);
                if (idx >= 0) {
                  copy[idx] = {
                    ...copy[idx],
                    status: evt.success ? "done" : "failed",
                    industry: evt.industry,
                  };
                }
                return copy;
              });
            }

            if (evt.type === "complete") {
              setResult({
                enrichedCount: evt.enrichedCount,
                errorCount: evt.errorCount,
                emailSent: evt.emailSent,
                emailError: evt.emailError,
              });
              setStatus("success");
            }

            if (evt.type === "error") {
              setErrorMsg(evt.message);
              setStatus("error");
            }
          } catch {
            // Skip malformed events
          }
        }
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Network error");
      setStatus("error");
    }
  };

  const reset = () => {
    setFile(null);
    setEmail("");
    setStatus("idle");
    setCompanies([]);
    setResult(null);
    setErrorMsg("");
    setEmailingPhase(false);
  };

  const valid = file && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const completedCount = companies.filter((c) => c.status === "done" || c.status === "failed").length;
  const totalCount = companies.length || 1;

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #09090b; color: #d4d4d8; font-family: 'Inter', -apple-system, system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .3; } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideIn { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: translateX(0); } }
        .fade-up { animation: fadeUp .35s ease-out both; }
        .slide-in { animation: slideIn .3s ease-out both; }
        input:focus { border-color: #6366f1 !important; box-shadow: 0 0 0 3px rgba(99,102,241,.1); }
        button:not(:disabled):hover { transform: translateY(-1px); }
        button:not(:disabled):active { transform: translateY(0); }
        ::selection { background: rgba(99,102,241,.3); }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,.06); border-radius: 3px; }
      `}</style>

      <div style={{ minHeight: "100vh", position: "relative" }}>
        <div style={{ position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
          <div style={{ position: "absolute", top: "-25%", left: "50%", transform: "translateX(-50%)", width: 700, height: 700, borderRadius: "50%", background: "radial-gradient(circle, rgba(99,102,241,.06) 0%, transparent 70%)", filter: "blur(80px)" }} />
        </div>

        <main style={{ maxWidth: 560, margin: "0 auto", padding: "64px 20px 100px", position: "relative", zIndex: 1 }}>

          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: 40 }} className="fade-up">
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 14px", borderRadius: 99, border: "1px solid rgba(99,102,241,.2)", background: "rgba(99,102,241,.05)", color: "#818cf8", fontSize: 11, fontWeight: 600, letterSpacing: ".06em", marginBottom: 18 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#818cf8" }} />
              AI PIPELINE
            </div>
            <h1 style={{ fontSize: 36, fontWeight: 700, letterSpacing: "-.03em", lineHeight: 1.15, color: "#fafafa", marginBottom: 10 }}>
              Lead Enrichment
            </h1>
            <p style={{ fontSize: 14.5, color: "#71717a", lineHeight: 1.6, maxWidth: 400, margin: "0 auto" }}>
              Upload a CSV of companies. Get AI-enriched sales intelligence delivered to your inbox.
            </p>
          </div>

          {/* Card */}
          <div className="fade-up" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 16, padding: "26px 26px 28px", animationDelay: ".08s" }}>

            {/* ─── IDLE / ERROR ─── */}
            {(status === "idle" || status === "error") && (
              <>
                <div
                  onDragOver={(e: DragEvent) => { e.preventDefault(); setDrag(true); }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={(e: DragEvent) => { e.preventDefault(); setDrag(false); e.dataTransfer.files?.[0] && pick(e.dataTransfer.files[0]); }}
                  onClick={() => inputRef.current?.click()}
                  style={{
                    border: `1.5px dashed ${drag ? "#6366f1" : file ? "rgba(74,222,128,.3)" : "rgba(255,255,255,.08)"}`,
                    borderRadius: 12, padding: file ? "14px 16px" : "32px 16px",
                    textAlign: "center", cursor: "pointer", transition: "all .2s",
                    background: drag ? "rgba(99,102,241,.04)" : file ? "rgba(74,222,128,.02)" : "transparent",
                    marginBottom: 18,
                  }}
                >
                  <input ref={inputRef} type="file" accept=".csv" onChange={(e: ChangeEvent<HTMLInputElement>) => e.target.files?.[0] && pick(e.target.files[0])} style={{ display: "none" }} />
                  {file ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(74,222,128,.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
                      </div>
                      <div style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: "#e4e4e7", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</div>
                        <div style={{ fontSize: 11, color: "#52525b", marginTop: 1 }}>{(file.size / 1024).toFixed(1)} KB</div>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); setFile(null); }} style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.06)", color: "#71717a", borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontSize: 12 }}>Remove</button>
                    </div>
                  ) : (
                    <>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(99,102,241,.06)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                      </div>
                      <div style={{ fontSize: 13.5, color: "#a1a1aa" }}>Drop CSV here or <span style={{ color: "#818cf8", textDecoration: "underline", textUnderlineOffset: 3 }}>browse</span></div>
                      <div style={{ fontSize: 11, color: "#3f3f46", marginTop: 5 }}>Company Name and Website columns required</div>
                    </>
                  )}
                </div>

                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#52525b", marginBottom: 6, letterSpacing: ".04em" }}>DELIVERY EMAIL</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com"
                    style={{ width: "100%", padding: "10px 13px", borderRadius: 9, border: "1px solid rgba(255,255,255,.07)", background: "rgba(255,255,255,.025)", color: "#e4e4e7", fontSize: 13.5, fontFamily: "inherit", outline: "none", transition: "all .2s" }}
                  />
                </div>

                {errorMsg && (
                  <div style={{ display: "flex", gap: 8, padding: "10px 12px", background: "rgba(239,68,68,.05)", border: "1px solid rgba(239,68,68,.12)", borderRadius: 9, marginBottom: 16, fontSize: 12.5, color: "#f87171", lineHeight: 1.4 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: 2 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <span>{errorMsg}</span>
                  </div>
                )}

                <button disabled={!valid} onClick={submit}
                  style={{ width: "100%", padding: "12px 0", borderRadius: 10, border: "none", background: valid ? "linear-gradient(135deg, #6366f1, #4f46e5)" : "rgba(255,255,255,.05)", color: valid ? "#fff" : "#3f3f46", fontSize: 13.5, fontWeight: 600, fontFamily: "inherit", cursor: valid ? "pointer" : "not-allowed", transition: "all .2s" }}
                >
                  Enrich & Send
                </button>
              </>
            )}

            {/* ─── PROCESSING ─── */}
            {status === "processing" && (
              <div className="fade-up">
                {/* Overall progress */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 14, height: 14, border: "2px solid rgba(99,102,241,.2)", borderTopColor: "#818cf8", borderRadius: "50%", animation: "spin .7s linear infinite" }} />
                    <span style={{ fontSize: 13.5, fontWeight: 500, color: "#a1a1aa" }}>
                      {emailingPhase ? "Sending email..." : "Enriching companies..."}
                    </span>
                  </div>
                  <span style={{ fontSize: 12, color: "#52525b", fontVariantNumeric: "tabular-nums" }}>
                    {completedCount}/{totalCount}
                  </span>
                </div>

                {/* Progress bar */}
                <div style={{ height: 2, background: "rgba(255,255,255,.04)", borderRadius: 1, marginBottom: 20, overflow: "hidden" }}>
                  <div style={{ height: "100%", background: "#6366f1", borderRadius: 1, transition: "width .5s ease", width: `${emailingPhase ? 100 : (completedCount / totalCount) * 100}%` }} />
                </div>

                {/* Company list */}
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {companies.map((c, i) => (
                    <div key={c.name} className="slide-in" style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 10px", borderRadius: 7, fontSize: 13,
                      animationDelay: `${i * 0.05}s`,
                      background: c.status !== "pending" && c.status !== "done" && c.status !== "failed" ? "rgba(99,102,241,.04)" : "transparent",
                    }}>
                      {/* Status icon */}
                      <div style={{ width: 18, display: "flex", justifyContent: "center", flexShrink: 0 }}>
                        {c.status === "done" ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                        ) : c.status === "failed" ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        ) : c.status === "pending" ? (
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#27272a" }} />
                        ) : (
                          <span style={{ color: "#818cf8", fontSize: 11, animation: "pulse 1.2s ease-in-out infinite" }}>●</span>
                        )}
                      </div>

                      {/* Company name */}
                      <span style={{
                        fontWeight: c.status !== "pending" && c.status !== "done" && c.status !== "failed" ? 500 : 400,
                        color: c.status === "done" ? "#4ade80" : c.status === "failed" ? "#f87171" : c.status === "pending" ? "#3f3f46" : "#e4e4e7",
                        opacity: c.status === "done" ? .7 : 1,
                      }}>
                        {c.name}
                      </span>

                      {/* Status label */}
                      <span style={{ marginLeft: "auto", fontSize: 11, color: "#52525b", fontWeight: 400 }}>
                        {c.status === "done" && c.industry ? c.industry : STEP_LABELS[c.status]}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Emailing indicator */}
                {emailingPhase && (
                  <div className="slide-in" style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", marginTop: 4, borderRadius: 7, background: "rgba(244,114,182,.04)" }}>
                    <div style={{ width: 18, display: "flex", justifyContent: "center" }}>
                      <span style={{ color: "#f472b6", fontSize: 11, animation: "pulse 1.2s ease-in-out infinite" }}>●</span>
                    </div>
                    <span style={{ fontSize: 13, color: "#f472b6", fontWeight: 500 }}>Sending email via Resend</span>
                  </div>
                )}
              </div>
            )}

            {/* ─── SUCCESS ─── */}
            {status === "success" && result && (
              <div className="fade-up" style={{ textAlign: "center", padding: "14px 0" }}>
                <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(74,222,128,.08)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <h2 style={{ fontSize: 18, fontWeight: 600, color: "#fafafa", marginBottom: 6 }}>Enrichment Complete</h2>
                <p style={{ fontSize: 13.5, color: "#71717a", lineHeight: 1.5 }}>
                  <span style={{ color: "#e4e4e7", fontWeight: 500 }}>{result.enrichedCount} companies</span> enriched and sent to <span style={{ color: "#e4e4e7", fontWeight: 500 }}>{email}</span>
                </p>
                {result.errorCount > 0 && (
                  <p style={{ fontSize: 12, color: "#f59e0b", marginTop: 4 }}>{result.errorCount} had partial failures — check CSV for details.</p>
                )}
                {!result.emailSent && result.emailError && (
                  <p style={{ fontSize: 12, color: "#f87171", marginTop: 4 }}>Email failed: {result.emailError}</p>
                )}
                <button onClick={reset} style={{ marginTop: 20, padding: "10px 24px", borderRadius: 9, border: "1px solid rgba(255,255,255,.06)", background: "transparent", color: "#818cf8", fontSize: 13, fontWeight: 500, fontFamily: "inherit", cursor: "pointer", transition: "all .2s" }}>
                  Enrich Another CSV
                </button>
              </div>
            )}
          </div>

          {/* Architecture strip */}
          {status === "idle" && (
            <div className="fade-up" style={{ marginTop: 44, animationDelay: ".15s" }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "#3f3f46", letterSpacing: ".1em", textAlign: "center", marginBottom: 14 }}>PIPELINE ARCHITECTURE</div>
              <div style={{ display: "flex", alignItems: "stretch", gap: 5, flexWrap: "wrap", justifyContent: "center" }}>
                {[
                  { n: "1", l: "Website", d: "Jina Reader", c: "#2dd4bf" },
                  { n: "2", l: "Search", d: "Serper.dev", c: "#2dd4bf" },
                  { n: "3", l: "News", d: "NewsAPI", c: "#2dd4bf" },
                  { n: "4", l: "Profile", d: "Groq Llama 70B", c: "#818cf8" },
                  { n: "5", l: "Sales Intel", d: "Groq Llama 70B", c: "#818cf8" },
                  { n: "6", l: "Email", d: "Resend", c: "#f472b6" },
                ].map((s, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ padding: "7px 10px", background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.04)", borderRadius: 8, minWidth: 68, textAlign: "center" }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: s.c, marginBottom: 2 }}>{s.n}</div>
                      <div style={{ fontSize: 10.5, fontWeight: 500, color: "#a1a1aa", marginBottom: 1 }}>{s.l}</div>
                      <div style={{ fontSize: 9.5, color: "#3f3f46" }}>{s.d}</div>
                    </div>
                    {i < 5 && <span style={{ color: "#1f1f23", fontSize: 11 }}>→</span>}
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 12 }}>
                {[{ c: "#2dd4bf", l: "Data sources" }, { c: "#818cf8", l: "AI processing" }, { c: "#f472b6", l: "Delivery" }].map((x, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9.5, color: "#3f3f46" }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: x.c }} />{x.l}
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
