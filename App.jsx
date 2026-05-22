import { useState, useEffect, useCallback } from "react";
import Papa from "papaparse";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://cfijvlomsugjwdikphpe.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNmaWp2bG9tc3VnandkaWtwaHBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NzQ5ODAsImV4cCI6MjA5NTA1MDk4MH0.w3z2O8G-A_SWKIXWvG2Ul9dBQZz7VpT-215U0BAK8QI";
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const QUESTIONS = [
  { id: "b1", label: "Behavioural Q1", weight: 1 },
  { id: "b2", label: "Behavioural Q2", weight: 1 },
  { id: "t1", label: "Technical Q1",   weight: 1 },
];
const SCORE_LABELS = ["No merit", "Below avg", "Average", "Good", "Excellent"];

async function detectAI(candidate) {
  const prompt = `You are an AI-detection assistant for a university investment club recruitment process.
Analyze these candidate answers and estimate the probability (0-100) that each was AI-generated (ChatGPT, Claude, etc.).
Return ONLY valid JSON, no markdown, no explanation:
{"b1":<int>,"b2":<int>,"t1":<int>,"overall":<int>,"flags":"<one sentence or None detected>"}
Behavioural Q1: ${candidate.b1 || "(empty)"}
Behavioural Q2: ${candidate.b2 || "(empty)"}
Technical Q1: ${candidate.t1 || "(empty)"}`;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await res.json();
    const text = data.content?.find(b => b.type === "text")?.text || "{}";
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch {
    return { b1: null, b2: null, t1: null, overall: null, flags: "Detection failed" };
  }
}

function aiColor(p) {
  if (p == null) return "#555";
  if (p >= 70) return "#ef4444";
  if (p >= 40) return "#f59e0b";
  return "#22c55e";
}
function scoreColor(s) {
  if (s == null) return "#555";
  if (s >= 75) return "#22c55e";
  if (s >= 50) return "#f59e0b";
  return "#ef4444";
}
function initials(name) {
  return (name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}
function avgScore(candidateId, allScores) {
  const rows = allScores.filter(s => s.candidate_id === candidateId);
  if (!rows.length) return null;
  return ((rows.reduce((a, r) => a + r.score, 0) / rows.length / 4) * 100).toFixed(1);
}
function memberProgress(memberId, candidates, allScores) {
  const my = allScores.filter(s => s.member_id === memberId);
  const done = (candidates || []).filter(c =>
    QUESTIONS.every(q => my.some(s => s.candidate_id === c.id && s.question_id === q.id))
  ).length;
  return { done, total: (candidates || []).length };
}

function Spinner({ size = 20 }) {
  return (
    <div style={{
      width: size, height: size,
      border: "2px solid #222", borderTop: "2px solid #c9a84c",
      borderRadius: "50%", animation: "spin 0.7s linear infinite", flexShrink: 0
    }} />
  );
}

function AiBadge({ pct }) {
  if (pct == null) return <span style={{ color: "#444", fontSize: 12 }}>—</span>;
  return (
    <span style={{
      background: aiColor(pct) + "18", color: aiColor(pct),
      border: `1px solid ${aiColor(pct)}33`, borderRadius: 4,
      padding: "2px 8px", fontSize: 12, fontWeight: 700, fontFamily: "monospace"
    }}>AI {pct}%</span>
  );
}

const DEMO_ROWS = [
  {
    "Full name": "Ana Ferreira", "Student number": "20230145", "CV (link)": "https://example.com/cv1",
    "Behavior question 1": "I led a group project by organizing weekly check-ins and mediating conflicts to keep the team focused on shared goals.",
    "Behavior question 2": "During exam period I prioritized by urgency, built a schedule, and communicated proactively with my project team.",
    "Technical question 1": "I'd start with a DCF projecting free cash flows discounted at WACC, cross-checked with EV/EBITDA and P/E multiples against comparable companies."
  },
  {
    "Full name": "João Santos", "Student number": "20231022", "CV (link)": "https://example.com/cv2",
    "Behavior question 1": "At my internship I identified a reporting inefficiency and built a template saving the team 3 hours per week. My manager rolled it out department-wide.",
    "Behavior question 2": "When facing ambiguity in a case competition I applied MECE, made explicit assumptions, and communicated them clearly to judges.",
    "Technical question 1": "Valuation requires multiple lenses: DCF for intrinsic value, EV/EBITDA and P/E for relative value, and precedent transactions for M&A context."
  },
  {
    "Full name": "Sofia Rodrigues", "Student number": "20232001", "CV (link)": "https://example.com/cv3",
    "Behavior question 1": "I caught a model flaw two days before a national competition, stayed up to recalculate, and we placed second nationally.",
    "Behavior question 2": "Managing three simultaneous deadlines I built a Gantt chart, delegated sub-tasks, and flagged risks proactively. No extensions needed.",
    "Technical question 1": "I anchor on DCF but stress-test growth rate and terminal value assumptions hardest. Then triangulate with EV/EBITDA comps. Red flags: aggressive EBITDA adjustments and goodwill-heavy balance sheets."
  },
];

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function LoginScreen({ members, onLogin }) {
  const [sel, setSel] = useState(null);
  const presidents = members.filter(m => m.role === "president");
  const regular = members.filter(m => m.role !== "president");

  return (
    <div style={S.center}>
      <div style={S.card}>
        <div style={S.logo}>NIC</div>
        <div style={S.logoSub}>Núcleo de Investimento e Consulting</div>
        <h2 style={S.cardTitle}>Recruitment Portal</h2>
        <p style={S.hint}>Select your profile to enter</p>

        {presidents.length > 0 && (
          <>
            <div style={S.secLabel}>Co-Presidents</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              {presidents.map(m => (
                <button key={m.id} style={{ ...S.memBtn, ...(sel?.id === m.id ? S.memBtnOn : {}) }} onClick={() => setSel(m)}>
                  <span style={S.av}>{initials(m.name)}</span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{m.name}</span>
                  <span style={S.presBadge}>PRES</span>
                </button>
              ))}
            </div>
          </>
        )}

        <div style={S.secLabel}>Members</div>
        <div style={S.memGrid}>
          {regular.map(m => (
            <button key={m.id} style={{ ...S.memBtn, ...(sel?.id === m.id ? S.memBtnOn : {}) }} onClick={() => setSel(m)}>
              <span style={S.av}>{initials(m.name)}</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{m.name}</span>
            </button>
          ))}
        </div>

        <button
          style={{ ...S.btnPrimary, marginTop: 28, width: "100%", opacity: sel ? 1 : 0.35 }}
          disabled={!sel}
          onClick={() => sel && onLogin(sel)}
        >
          Enter Portal →
        </button>
      </div>
    </div>
  );
}

// ─── IMPORT ───────────────────────────────────────────────────────────────────
function ImportScreen({ onImport, loading }) {
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState(null);

  const parse = f => {
    if (!f) return;
    Papa.parse(f, {
      header: true, skipEmptyLines: true,
      complete: r => { if (!r.data?.length) { setErr("CSV appears empty."); return; } onImport(r.data); },
      error: () => setErr("Failed to parse CSV. Check the file format."),
    });
  };

  return (
    <div style={S.center}>
      <div style={S.card}>
        <div style={S.logo}>NIC</div>
        <h2 style={S.cardTitle}>Import Applications</h2>
        <p style={S.hint}>
          Export your Google Forms responses as CSV and upload below.<br />
          <code style={S.code}>Full name · Student number · CV (link) · Behavior question 1 · Behavior question 2 · Technical question 1</code>
        </p>
        <div
          style={{ ...S.drop, ...(drag ? S.dropOn : {}) }}
          onDragOver={e => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); parse(e.dataTransfer.files[0]); }}
          onClick={() => document.getElementById("csvIn").click()}
        >
          <div style={{ fontSize: 38 }}>📄</div>
          <p style={{ margin: "8px 0 4px", fontWeight: 700 }}>Drop CSV or click to upload</p>
          <p style={{ margin: 0, fontSize: 12, color: "#555" }}>Google Forms → Responses → Download as CSV</p>
          <input id="csvIn" type="file" accept=".csv" style={{ display: "none" }} onChange={e => parse(e.target.files[0])} />
        </div>
        {err && <p style={{ color: "#ef4444", fontSize: 13, marginTop: 10 }}>{err}</p>}
        {loading && <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}><Spinner /></div>}
        <div style={{ borderTop: "1px solid #1a1a1a", marginTop: 22, paddingTop: 18, textAlign: "center" }}>
          <p style={{ fontSize: 12, color: "#444", marginBottom: 10 }}>Or load demo data to explore the app first</p>
          <button style={S.btnSec} onClick={() => onImport(DEMO_ROWS)}>Load 3 Demo Candidates</button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [members, setMembers] = useState([]);
  const [user, setUser] = useState(null);
  const [candidates, setCandidates] = useState(null);
  const [allScores, setAllScores] = useState([]);
  const [aiScores, setAiScores] = useState({});
  const [revealed, setRevealed] = useState(false);
  const [topN, setTopN] = useState(20);
  const [view, setView] = useState("list");
  const [selected, setSelected] = useState(null);
  const [detecting, setDetecting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [appLoading, setAppLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Load members from Supabase
  useEffect(() => {
    sb.from("members").select("*").order("name").then(({ data }) => {
      if (data) setMembers(data);
    });
  }, []);

  // Load all data when user logs in
  useEffect(() => {
    if (!user) return;
    setAppLoading(true);
    Promise.all([
      sb.from("candidates").select("*").order("full_name"),
      sb.from("scores").select("*"),
      sb.from("ai_scores").select("*"),
      sb.from("settings").select("*"),
    ]).then(([c, sc, ai, cfg]) => {
      setCandidates(c.data?.length ? c.data : null);
      if (sc.data) setAllScores(sc.data);
      if (ai.data) {
        const map = {};
        ai.data.forEach(r => { map[r.candidate_id] = r; });
        setAiScores(map);
      }
      if (cfg.data) {
        const rev = cfg.data.find(r => r.key === "revealed");
        const tn  = cfg.data.find(r => r.key === "top_n");
        if (rev) setRevealed(rev.value === "true");
        if (tn)  setTopN(parseInt(tn.value) || 20);
      }
      setAppLoading(false);
    });
  }, [user]);

  // Realtime subscriptions
  useEffect(() => {
    if (!user) return;
    const ch = sb.channel("nic-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "scores" }, p => {
        setAllScores(prev => {
          if (p.eventType === "DELETE") return prev.filter(r => r.id !== p.old.id);
          const filtered = prev.filter(r => !(r.member_id === p.new.member_id && r.candidate_id === p.new.candidate_id && r.question_id === p.new.question_id));
          return [...filtered, p.new];
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "settings" }, p => {
        if (p.new?.key === "revealed") setRevealed(p.new.value === "true");
        if (p.new?.key === "top_n")    setTopN(parseInt(p.new.value) || 20);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "candidates" }, p => {
        setCandidates(prev => prev ? [...prev, p.new] : [p.new]);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "ai_scores" }, p => {
        if (p.new) setAiScores(prev => ({ ...prev, [p.new.candidate_id]: p.new }));
      })
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [user]);

  const handleImport = useCallback(async rows => {
    setImporting(true);
    const mapped = rows.map((r, i) => ({
      id: `c_${Date.now()}_${i}`,
      full_name:      r["Full name"] || "",
      student_number: r["Student number"] || "",
      cv_link:        r["CV (link)"] || r["CV"] || "",
      b1:             r["Behavior question 1"] || "",
      b2:             r["Behavior question 2"] || "",
      t1:             r["Technical question 1"] || "",
    }));
    const { error } = await sb.from("candidates").insert(mapped);
    if (error) showToast("Import failed: " + error.message, "err");
    else { setCandidates(mapped); showToast(`${mapped.length} candidates imported successfully`, "ok"); }
    setImporting(false);
  }, []);

  const handleScore = useCallback(async (candidateId, questionId, value) => {
    // Optimistic update
    setAllScores(prev => {
      const idx = prev.findIndex(s => s.member_id === user.id && s.candidate_id === candidateId && s.question_id === questionId);
      const row = { member_id: user.id, candidate_id: candidateId, question_id: questionId, score: value, id: `opt_${Date.now()}` };
      return idx >= 0 ? prev.map((s, i) => i === idx ? { ...s, score: value } : s) : [...prev, row];
    });
    const { error } = await sb.from("scores").upsert(
      { member_id: user.id, candidate_id: candidateId, question_id: questionId, score: value, updated_at: new Date().toISOString() },
      { onConflict: "member_id,candidate_id,question_id" }
    );
    if (error) showToast("Failed to save score", "err");
  }, [user]);

  const runDetection = useCallback(async candidate => {
    if (aiScores[candidate.id]) return;
    setDetecting(true);
    const result = await detectAI(candidate);
    setDetecting(false);
    if (!result) return;
    const row = {
      candidate_id: candidate.id,
      b1_pct: result.b1, b2_pct: result.b2, t1_pct: result.t1,
      overall_pct: result.overall, flags: result.flags,
    };
    await sb.from("ai_scores").upsert(row, { onConflict: "candidate_id" });
    setAiScores(prev => ({ ...prev, [candidate.id]: row }));
  }, [aiScores]);

  const handleReveal = useCallback(async () => {
    await sb.from("settings").upsert({ key: "revealed", value: "true" }, { onConflict: "key" });
    setRevealed(true);
    showToast("Results revealed to all members", "ok");
  }, []);

  const handleTopN = useCallback(async n => {
    setTopN(n);
    await sb.from("settings").upsert({ key: "top_n", value: String(n) }, { onConflict: "key" });
  }, []);

  const isPresident  = user?.role === "president";
  const myScores     = allScores.filter(s => s.member_id === user?.id);
  const progress     = user ? memberProgress(user.id, candidates, allScores) : { done: 0, total: 0 };
  const allDone      = members.length > 0 && (candidates?.length || 0) > 0 &&
    members.every(m => { const p = memberProgress(m.id, candidates, allScores); return p.done === p.total && p.total > 0; });
  const ranked       = (candidates || [])
    .map(c => ({ ...c, avg: avgScore(c.id, allScores) }))
    .sort((a, b) => (parseFloat(b.avg) || 0) - (parseFloat(a.avg) || 0));
  const candidateAI  = selected ? (aiScores[selected.id] || {}) : {};

  // ── Gates ──
  if (!user) return <LoginScreen members={members} onLogin={setUser} />;

  if (appLoading) return (
    <div style={{ ...S.center, flexDirection: "column", gap: 16 }}>
      <div style={S.logo}>NIC</div>
      <Spinner size={32} />
      <div style={{ color: "#444", fontSize: 13 }}>Loading portal…</div>
    </div>
  );

  if (!candidates) {
    if (!isPresident) return (
      <div style={S.center}>
        <div style={{ textAlign: "center" }}>
          <div style={S.logo}>NIC</div>
          <p style={{ color: "#444", marginTop: 24, fontSize: 14 }}>Waiting for Co-Presidents to import applications.</p>
          <button style={{ ...S.btnSec, marginTop: 16 }} onClick={() => setUser(null)}>← Back</button>
        </div>
      </div>
    );
    return <ImportScreen onImport={handleImport} loading={importing} />;
  }

  return (
    <div style={S.wrap}>
      <style>{`
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes fadeUp  { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #080808; }
        ::-webkit-scrollbar-thumb { background: #1e1e1e; border-radius: 4px; }
        button { transition: filter 0.15s; }
        button:hover { filter: brightness(1.12); }
        a:hover { opacity: 0.8; }
      `}</style>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 18, right: 18, zIndex: 9999,
          background: toast.type === "err" ? "#1a0000" : "#001208",
          border: `1px solid ${toast.type === "err" ? "#ef444433" : "#22c55e33"}`,
          color: toast.type === "err" ? "#ef4444" : "#22c55e",
          borderRadius: 8, padding: "11px 18px", fontSize: 13, fontWeight: 600,
          fontFamily: "Georgia,serif", animation: "fadeUp 0.2s ease", pointerEvents: "none",
        }}>
          {toast.msg}
        </div>
      )}

      {/* ── SIDEBAR ── */}
      <aside style={S.sidebar}>
        <div style={S.logo}>NIC</div>
        <div style={{ fontSize: 9, color: "#2a2a2a", letterSpacing: 2.5, marginBottom: 26 }}>RECRUITMENT PORTAL</div>

        <div style={S.userCard}>
          <div style={S.userAv}>{initials(user.name)}</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#ddd" }}>{user.name}</div>
            {isPresident && <span style={{ ...S.presBadge, marginTop: 3, display: "inline-block" }}>CO-PRESIDENT</span>}
          </div>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 26 }}>
          {[["list", "📋  Applications"], ["results", "🏆  Results"]].map(([v, lbl]) => (
            <button key={v} style={{ ...S.navBtn, ...(view === v ? S.navBtnOn : {}) }}
              onClick={() => { setView(v); setSelected(null); }}>
              {lbl}
            </button>
          ))}
        </nav>

        <div style={S.progBlock}>
          <div style={{ fontSize: 9, color: "#333", letterSpacing: 2, marginBottom: 8 }}>MY PROGRESS</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: "#c9a84c", lineHeight: 1 }}>
            {progress.done}
            <span style={{ fontSize: 13, color: "#333", fontWeight: 400 }}>/{progress.total}</span>
          </div>
          <div style={S.bar}>
            <div style={{ ...S.barFill, width: progress.total ? `${progress.done / progress.total * 100}%` : "0%" }} />
          </div>
          <div style={{ fontSize: 10, color: "#333", marginTop: 5 }}>candidates evaluated</div>
        </div>

        {isPresident && (
          <div style={S.presBox}>
            <div style={{ fontSize: 9, color: "#333", letterSpacing: 2, marginBottom: 10 }}>TEAM STATUS · LIVE</div>
            {members.map(m => {
              const p = memberProgress(m.id, candidates, allScores);
              const done = p.done === p.total && p.total > 0;
              return (
                <div key={m.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 12, color: done ? "#22c55e" : "#444" }}>
                  <span>{m.name.split(" ")[0]}</span>
                  <span style={{ fontFamily: "monospace" }}>{p.done}/{p.total}</span>
                </div>
              );
            })}
            <div style={{ marginTop: 12 }}>
              {!revealed ? (
                <button
                  style={{ ...S.btnPrimary, fontSize: 12, padding: "9px 12px", width: "100%", opacity: allDone ? 1 : 0.35 }}
                  disabled={!allDone}
                  onClick={handleReveal}
                >
                  {allDone ? "🔓 Reveal Results" : "⏳ Awaiting all members"}
                </button>
              ) : (
                <div style={{ color: "#22c55e", fontSize: 12, fontWeight: 700 }}>✓ Results Revealed</div>
              )}
            </div>
          </div>
        )}

        <button
          style={{ background: "none", border: "none", color: "#2a2a2a", cursor: "pointer", fontSize: 12, marginTop: "auto", textAlign: "left", fontFamily: "Georgia,serif" }}
          onClick={() => { setUser(null); setView("list"); setSelected(null); }}
        >
          ← Logout
        </button>
      </aside>

      {/* ── MAIN ── */}
      <main style={S.main}>

        {/* LIST VIEW */}
        {view === "list" && !selected && (
          <div style={{ animation: "fadeUp 0.2s ease" }}>
            <div style={S.phdr}>
              <h1 style={S.ptitle}>Applications</h1>
              <span style={{ color: "#444", fontSize: 14 }}>{candidates.length} candidates</span>
            </div>
            <div style={S.tbl}>
              <div style={S.tHd}>
                <span style={{ flex: 2.5 }}>CANDIDATE</span>
                <span style={{ flex: 1 }}>AI DETECTION</span>
                <span style={{ flex: 1 }}>MY SCORES</span>
                <span style={{ flex: 0.7 }}>CV</span>
                <span style={{ flex: 0.7, textAlign: "right" }}></span>
              </div>
              {candidates.map((c, i) => {
                const cs = myScores.filter(s => s.candidate_id === c.id);
                const done = QUESTIONS.every(q => cs.some(s => s.question_id === q.id));
                const ai = aiScores[c.id];
                return (
                  <div key={c.id} style={{ ...S.tRow, background: done ? "#0c0c00" : "transparent" }}>
                    <span style={{ flex: 2.5, display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ color: "#252525", fontSize: 11, fontFamily: "monospace" }}>{String(i + 1).padStart(2, "0")}</span>
                      <span style={{ fontWeight: 700, color: "#ddd" }}>{c.full_name}</span>
                      <span style={{ fontSize: 11, color: "#383838" }}>#{c.student_number}</span>
                    </span>
                    <span style={{ flex: 1 }}><AiBadge pct={ai?.overall_pct ?? null} /></span>
                    <span style={{ flex: 1, display: "flex", gap: 3 }}>
                      {QUESTIONS.map(q => {
                        const sc = cs.find(x => x.question_id === q.id);
                        return (
                          <span key={q.id} title={q.label} style={{
                            width: 24, height: 24, borderRadius: 4,
                            background: sc != null ? "#c9a84c" : "#141414",
                            border: "1px solid #1e1e1e",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 11, color: sc != null ? "#000" : "#2a2a2a", fontWeight: 800,
                          }}>
                            {sc != null ? sc.score : "·"}
                          </span>
                        );
                      })}
                    </span>
                    <span style={{ flex: 0.7 }}>
                      {c.cv_link
                        ? <a href={c.cv_link} target="_blank" rel="noopener noreferrer" style={{ color: "#c9a84c", fontSize: 12, textDecoration: "none" }}>View ↗</a>
                        : <span style={{ color: "#2a2a2a", fontSize: 12 }}>—</span>}
                    </span>
                    <span style={{ flex: 0.7, textAlign: "right" }}>
                      <button style={S.btnSm} onClick={() => { setSelected(c); setView("evaluate"); runDetection(c); }}>
                        {done ? "Edit" : "Evaluate"}
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* EVALUATE VIEW */}
        {view === "evaluate" && selected && (
          <div style={{ animation: "fadeUp 0.2s ease" }}>
            <button
              style={{ background: "none", border: "none", color: "#444", cursor: "pointer", fontSize: 13, marginBottom: 18, padding: 0, fontFamily: "Georgia,serif" }}
              onClick={() => { setSelected(null); setView("list"); }}
            >← Back to list</button>

            <div style={S.phdr}>
              <h1 style={S.ptitle}>{selected.full_name}</h1>
              <span style={{ color: "#444", fontSize: 14 }}>#{selected.student_number}</span>
            </div>

            {/* AI Detection */}
            <div style={{ background: "#0a0d09", border: "1px solid #182018", borderRadius: 12, padding: 20, marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 9, letterSpacing: 2, color: "#2a4a2a", fontWeight: 700 }}>AI DETECTION</span>
                {detecting && <Spinner size={13} />}
              </div>
              {!detecting && candidateAI.overall_pct != null ? (
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {QUESTIONS.map(q => (
                    <div key={q.id} style={{ background: "#0e0e0e", borderRadius: 8, padding: "10px 14px", minWidth: 90 }}>
                      <div style={{ fontSize: 9, color: "#333", marginBottom: 4 }}>{q.label.toUpperCase()}</div>
                      <div style={{ fontSize: 22, fontWeight: 900, color: aiColor(candidateAI[`${q.id}_pct`]) }}>
                        {candidateAI[`${q.id}_pct`] ?? "—"}%
                      </div>
                    </div>
                  ))}
                  <div style={{ background: "#0e0e0e", borderRadius: 8, padding: "10px 14px", minWidth: 90 }}>
                    <div style={{ fontSize: 9, color: "#333", marginBottom: 4 }}>OVERALL</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: aiColor(candidateAI.overall_pct) }}>
                      {candidateAI.overall_pct ?? "—"}%
                    </div>
                  </div>
                  <div style={{ background: "#0e0e0e", borderRadius: 8, padding: "10px 14px", flex: 2, minWidth: 160 }}>
                    <div style={{ fontSize: 9, color: "#333", marginBottom: 4 }}>FLAGS</div>
                    <div style={{ fontSize: 13, color: "#777" }}>{candidateAI.flags || "None"}</div>
                  </div>
                </div>
              ) : !detecting && (
                <span style={{ color: "#333", fontSize: 13 }}>Running analysis…</span>
              )}
            </div>

            {/* CV Link */}
            {selected.cv_link && (
              <div style={{ background: "#0e0e0e", border: "1px solid #1a1a1a", borderRadius: 10, padding: "12px 18px", marginBottom: 16 }}>
                <a href={selected.cv_link} target="_blank" rel="noopener noreferrer"
                  style={{ color: "#c9a84c", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>
                  📄 Open CV / Portfolio →
                </a>
              </div>
            )}

            {/* Questions */}
            {QUESTIONS.map(q => {
              const existing = myScores.find(s => s.candidate_id === selected.id && s.question_id === q.id);
              const cur = existing?.score;
              return (
                <div key={q.id} style={{ background: "#0e0e0e", border: "1px solid #1a1a1a", borderRadius: 12, padding: 22, marginBottom: 12 }}>
                  <div style={{ fontSize: 9, color: "#c9a84c", letterSpacing: 2.5, fontWeight: 700, marginBottom: 12 }}>
                    {q.label.toUpperCase()}
                  </div>
                  <p style={{ fontSize: 15, color: "#bbb", lineHeight: 1.8, margin: "0 0 18px" }}>
                    {selected[q.id] || <em style={{ color: "#333" }}>No answer provided</em>}
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 9, color: "#333", letterSpacing: 2, marginRight: 4 }}>SCORE</span>
                    {[0, 1, 2, 3, 4].map(n => (
                      <button key={n} title={SCORE_LABELS[n]}
                        style={{ ...S.scBtn, ...(cur === n ? S.scBtnOn : {}) }}
                        onClick={() => handleScore(selected.id, q.id, n)}>
                        {n}
                      </button>
                    ))}
                    {cur != null && (
                      <span style={{ fontSize: 12, color: "#c9a84c", marginLeft: 8 }}>{SCORE_LABELS[cur]}</span>
                    )}
                  </div>
                </div>
              );
            })}

            <button style={{ ...S.btnPrimary, marginTop: 6 }} onClick={() => { setSelected(null); setView("list"); }}>
              Save & Back →
            </button>
          </div>
        )}

        {/* RESULTS VIEW */}
        {view === "results" && (
          <div style={{ animation: "fadeUp 0.2s ease" }}>
            <div style={S.phdr}>
              <h1 style={S.ptitle}>Results</h1>
              {isPresident && (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 13, color: "#444" }}>Show top</span>
                  <input
                    type="number" min={1} max={candidates.length} value={topN}
                    onChange={e => handleTopN(Math.max(1, parseInt(e.target.value) || 1))}
                    style={{ width: 56, background: "#141414", border: "1px solid #1e1e1e", borderRadius: 6, padding: "6px 8px", color: "#fff", fontSize: 15, textAlign: "center", fontFamily: "Georgia,serif" }}
                  />
                  <span style={{ fontSize: 13, color: "#444" }}>candidates</span>
                </div>
              )}
            </div>

            {!revealed && !isPresident ? (
              <div style={{ textAlign: "center", padding: "80px 20px", color: "#2a2a2a" }}>
                <div style={{ fontSize: 52 }}>🔒</div>
                <h3 style={{ color: "#383838", margin: "16px 0 8px" }}>Results are locked</h3>
                <p style={{ color: "#333", fontSize: 14 }}>Co-Presidents will reveal results once all members complete their evaluations.</p>
              </div>
            ) : (
              <>
                {!revealed && isPresident && (
                  <div style={{ background: "#120e00", border: "1px solid #f59e0b1a", borderRadius: 8, padding: "10px 16px", fontSize: 13, color: "#f59e0b", marginBottom: 18 }}>
                    ⚠️ Preview mode — not yet visible to members
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {ranked.slice(0, isPresident ? topN : ranked.length).map((c, i) => {
                    const ai = aiScores[c.id];
                    const isTop = i < topN;
                    return (
                      <div key={c.id} style={{
                        display: "flex", alignItems: "center", gap: 16,
                        background: isTop ? "#0f0e00" : "#0c0c0c",
                        border: `1px solid ${isTop ? "#c9a84c1a" : "#141414"}`,
                        borderRadius: 12, padding: "16px 22px",
                      }}>
                        <div style={{ fontSize: 13, color: isTop ? "#c9a84c" : "#252525", fontWeight: 900, fontFamily: "monospace", width: 30 }}>
                          #{i + 1}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 15, color: "#ddd" }}>{c.full_name}</div>
                          <div style={{ fontSize: 11, color: "#383838" }}>#{c.student_number}</div>
                        </div>
                        <AiBadge pct={ai?.overall_pct ?? null} />
                        <div style={{ textAlign: "right", minWidth: 80 }}>
                          <div style={{ fontSize: 26, fontWeight: 900, color: scoreColor(parseFloat(c.avg)) }}>
                            {c.avg ?? "—"}{c.avg ? "%" : ""}
                          </div>
                          <div style={{ fontSize: 9, color: "#2a2a2a", marginTop: 2, letterSpacing: 1 }}>AVG SCORE</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const S = {
  center:    { minHeight: "100vh", background: "#080808", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Georgia,serif" },
  card:      { background: "#0c0c0c", border: "1px solid #161616", borderRadius: 16, padding: "42px 38px", width: "100%", maxWidth: 560, color: "#ccc" },
  logo:      { fontSize: 32, fontWeight: 900, color: "#c9a84c", letterSpacing: 8, fontFamily: "Georgia,serif", textAlign: "center" },
  logoSub:   { fontSize: 9, color: "#2a2a2a", letterSpacing: 2.5, marginTop: 4, marginBottom: 30, textAlign: "center" },
  cardTitle: { fontSize: 19, color: "#eee", margin: "0 0 8px", fontWeight: 700, textAlign: "center" },
  hint:      { fontSize: 13, color: "#3a3a3a", marginBottom: 22, textAlign: "center", lineHeight: 1.6 },
  secLabel:  { fontSize: 9, color: "#383838", letterSpacing: 2.5, marginBottom: 8, fontWeight: 700 },
  memGrid:   { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 },
  memBtn:    { background: "#111", border: "1px solid #1a1a1a", borderRadius: 10, padding: "11px 13px", cursor: "pointer", display: "flex", alignItems: "center", gap: 9, color: "#777", textAlign: "left" },
  memBtnOn:  { border: "1px solid #c9a84c", background: "#150f00", color: "#c9a84c" },
  av:        { width: 28, height: 28, borderRadius: "50%", background: "#181818", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flexShrink: 0, color: "#666" },
  presBadge: { fontSize: 9, background: "#c9a84c14", color: "#c9a84c", border: "1px solid #c9a84c2a", borderRadius: 4, padding: "2px 6px", letterSpacing: 1 },
  btnPrimary:{ background: "#c9a84c", color: "#000", border: "none", borderRadius: 8, padding: "12px 26px", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "Georgia,serif" },
  btnSec:    { background: "transparent", color: "#4a4a4a", border: "1px solid #1a1a1a", borderRadius: 8, padding: "9px 18px", cursor: "pointer", fontSize: 13, fontFamily: "Georgia,serif" },
  btnSm:     { background: "#111", color: "#c9a84c", border: "1px solid #c9a84c1a", borderRadius: 6, padding: "6px 13px", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "Georgia,serif" },
  code:      { fontFamily: "monospace", fontSize: 11, background: "#111", padding: "2px 6px", borderRadius: 4, color: "#4a4a4a" },
  drop:      { border: "2px dashed #1a1a1a", borderRadius: 12, padding: "34px 20px", cursor: "pointer", textAlign: "center", transition: "all 0.2s", marginTop: 18, color: "#777" },
  dropOn:    { border: "2px dashed #c9a84c", background: "#150f00" },
  wrap:      { display: "flex", minHeight: "100vh", background: "#080808", fontFamily: "Georgia,serif", color: "#ccc" },
  sidebar:   { width: 230, background: "#0a0a0a", borderRight: "1px solid #111", padding: "26px 16px", display: "flex", flexDirection: "column", flexShrink: 0, position: "sticky", top: 0, height: "100vh", overflowY: "auto" },
  userCard:  { display: "flex", alignItems: "center", gap: 10, background: "#111", borderRadius: 10, padding: "10px 12px", marginBottom: 20 },
  userAv:    { width: 32, height: 32, borderRadius: "50%", background: "#150f00", border: "1px solid #c9a84c2a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: "#c9a84c", flexShrink: 0 },
  navBtn:    { background: "transparent", border: "none", borderRadius: 8, padding: "9px 12px", cursor: "pointer", textAlign: "left", color: "#383838", fontSize: 13, fontWeight: 600, fontFamily: "Georgia,serif" },
  navBtnOn:  { background: "#111", color: "#c9a84c" },
  progBlock: { background: "#0e0e0e", borderRadius: 10, padding: 13, marginBottom: 18 },
  bar:       { height: 3, background: "#161616", borderRadius: 2, marginTop: 7 },
  barFill:   { height: "100%", background: "#c9a84c", borderRadius: 2, transition: "width 0.6s ease" },
  presBox:   { background: "#0c0b00", border: "1px solid #c9a84c12", borderRadius: 10, padding: 13, marginBottom: 18 },
  main:      { flex: 1, padding: "38px 42px", overflowY: "auto" },
  phdr:      { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 },
  ptitle:    { fontSize: 24, fontWeight: 900, color: "#fff", margin: 0, letterSpacing: -0.5 },
  tbl:       { background: "#0c0c0c", border: "1px solid #111", borderRadius: 12, overflow: "hidden" },
  tHd:       { display: "flex", padding: "10px 18px", background: "#090909", borderBottom: "1px solid #111", fontSize: 9, color: "#2a2a2a", letterSpacing: 2, fontWeight: 700 },
  tRow:      { display: "flex", alignItems: "center", padding: "13px 18px", borderBottom: "1px solid #0e0e0e", transition: "background 0.1s" },
  scBtn:     { width: 37, height: 37, borderRadius: 7, border: "1px solid #1a1a1a", background: "#111", color: "#555", fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "Georgia,serif" },
  scBtnOn:   { background: "#c9a84c", color: "#000", border: "1px solid #c9a84c" },
};
