import { useState, useEffect, useCallback } from "react";
import Papa from "papaparse";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://cfijvlomsugjwdikphpe.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNmaWp2bG9tc3VnandkaWtwaHBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NzQ5ODAsImV4cCI6MjA5NTA1MDk4MH0.w3z2O8G-A_SWKIXWvG2Ul9dBQZz7VpT-215U0BAK8QI";
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Exact CSV column names from NIC Google Forms ──
const COL = {
  timestamp:  "Coluna 1",
  student:    "What is your student number?",
  email:      "What is your institutional email?",
  phone:      "What is your phone number?",
  cv:         "Please upload your CV.",
  b1:         "Tell us about yourself. What motivates you? How are you different from other applicants? Where do you see yourself in five years?  (Max 750 characters)",
  b2:         "What makes you want to join NIC-UD? Why do you think you could be a valuable member for the club? How are you different from other applicants? (Max 750 characters)",
  t1:         "If you had \u20AC100,000 to invest, how would you allocate this capital across different asset classes or markets to build a solid, future-proof portfolio? Please explain your choices by considering current macroeconomic trends and some key fundamentals. (Max 1000 characters)",
};

const QUESTIONS = [
  { id: "b1", label: "About Yourself", sublabel: "Motivation & Differentiation", weight: 1 },
  { id: "b2", label: "Why NIC-UD?",    sublabel: "Fit & Value Add",              weight: 1 },
  { id: "t1", label: "Technical",      sublabel: "€100k Portfolio Allocation",   weight: 1 },
];
const SCORE_LABELS = ["No merit", "Below avg", "Average", "Good", "Excellent"];

// NIC Logo SVG (navy blue)
const NICLogo = ({ size = 48, color = "#1a2744" }) => (
  <svg width={size} height={size * 1.2} viewBox="0 0 100 120" fill="none" xmlns="http://www.w3.org/2000/svg">
    <text x="50" y="72" textAnchor="middle" fontFamily="Georgia, serif" fontSize="72" fontWeight="900" fill={color}>NIC</text>
    <line x1="10" y1="82" x2="90" y2="82" stroke={color} strokeWidth="1.5"/>
    <text x="50" y="100" textAnchor="middle" fontFamily="Georgia, serif" fontSize="13" fill={color} letterSpacing="3">UNDERGRADUATE</text>
  </svg>
);

async function detectAI(candidate) {
  const prompt = `You are an AI-detection assistant for a university investment club (NIC-UD) recruitment process.
Analyze these candidate answers and estimate the probability (0-100) that each was AI-generated (ChatGPT, Claude, etc.).
Return ONLY valid JSON, no markdown:
{"b1":<int>,"b2":<int>,"t1":<int>,"overall":<int>,"flags":"<one sentence or None detected>"}
About Yourself (B1): ${candidate.b1 || "(empty)"}
Why NIC-UD (B2): ${candidate.b2 || "(empty)"}
Technical - Portfolio (T1): ${candidate.t1 || "(empty)"}`;
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
  if (p == null) return "#94a3b8";
  if (p >= 70) return "#ef4444";
  if (p >= 40) return "#f59e0b";
  return "#22c55e";
}
function scoreColor(s) {
  if (s == null) return "#94a3b8";
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

function Spinner({ size = 20, color = "#1a2744" }) {
  return <div style={{ width: size, height: size, border: `2px solid #e2e8f0`, borderTop: `2px solid ${color}`, borderRadius: "50%", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />;
}

function AiBadge({ pct }) {
  if (pct == null) return <span style={{ color: "#94a3b8", fontSize: 12 }}>—</span>;
  return (
    <span style={{ background: aiColor(pct) + "18", color: aiColor(pct), border: `1px solid ${aiColor(pct)}44`, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700, fontFamily: "monospace" }}>
      AI {pct}%
    </span>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function LoginScreen({ members, onLogin }) {
  const [sel, setSel] = useState(null);
  const presidents = members.filter(m => m.role === "president");
  const regular = members.filter(m => m.role !== "president");

  return (
    <div style={S.center}>
      <div style={S.loginCard}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <img src="/nic-logo.png" alt="NIC" style={{ height: 90, objectFit: "contain" }}
            onError={e => { e.target.style.display = "none"; document.getElementById("nic-svg-logo").style.display = "block"; }} />
          <div id="nic-svg-logo" style={{ display: "none" }}><NICLogo size={60} color="#1a2744" /></div>
        </div>
        <div style={S.divider} />
        <h2 style={S.loginTitle}>Recruitment Portal</h2>
        <p style={S.hint}>Select your profile to continue</p>

        {presidents.length > 0 && (
          <>
            <div style={S.secLabel}>Co-Presidents</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              {presidents.map(m => (
                <button key={m.id} style={{ ...S.memBtn, ...(sel?.id === m.id ? S.memBtnOn : {}) }} onClick={() => setSel(m)}>
                  <span style={{ ...S.av, ...(sel?.id === m.id ? S.avOn : {}) }}>{initials(m.name)}</span>
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
              <span style={{ ...S.av, ...(sel?.id === m.id ? S.avOn : {}) }}>{initials(m.name)}</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{m.name}</span>
            </button>
          ))}
        </div>

        <button style={{ ...S.btnPrimary, marginTop: 28, width: "100%", opacity: sel ? 1 : 0.4 }}
          disabled={!sel} onClick={() => sel && onLogin(sel)}>
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
      complete: r => {
        if (!r.data?.length) { setErr("CSV appears empty."); return; }
        // Deduplicate by student number — keep latest timestamp
        const seen = {};
        r.data.forEach(row => {
          const sn = row[COL.student]?.trim();
          if (!sn || sn === "teste") return;
          if (!seen[sn] || row[COL.timestamp] > seen[sn][COL.timestamp]) seen[sn] = row;
        });
        onImport(Object.values(seen));
      },
      error: () => setErr("Failed to parse CSV."),
    });
  };

  return (
    <div style={S.center}>
      <div style={S.loginCard}>
        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <img src="/nic-logo.png" alt="NIC" style={{ height: 90, objectFit: "contain" }}
            onError={e => { e.target.style.display = "none"; }} />
        </div>
        <div style={S.divider} />
        <h2 style={S.loginTitle}>Import Applications</h2>
        <p style={S.hint}>
          Export from Google Forms → Responses → Download as CSV<br />
          <span style={{ fontSize: 11, color: "#94a3b8" }}>Duplicate student numbers are automatically deduplicated</span>
        </p>

        <div style={{ ...S.drop, ...(drag ? S.dropOn : {}) }}
          onDragOver={e => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); parse(e.dataTransfer.files[0]); }}
          onClick={() => document.getElementById("csvIn").click()}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>📄</div>
          <p style={{ margin: "0 0 4px", fontWeight: 700, color: "#1a2744" }}>Drop CSV or click to upload</p>
          <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>NIC-UD Application Answers CSV</p>
          <input id="csvIn" type="file" accept=".csv" style={{ display: "none" }} onChange={e => parse(e.target.files[0])} />
        </div>
        {err && <p style={{ color: "#ef4444", fontSize: 13, marginTop: 10 }}>{err}</p>}
        {loading && <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}><Spinner /></div>}
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
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
  const [search, setSearch] = useState("");

  const showToast = (msg, type = "ok") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  useEffect(() => {
    sb.from("members").select("*").order("name").then(({ data }) => { if (data) setMembers(data); });
  }, []);

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
      if (ai.data) { const m = {}; ai.data.forEach(r => { m[r.candidate_id] = r; }); setAiScores(m); }
      if (cfg.data) {
        const rev = cfg.data.find(r => r.key === "revealed");
        const tn  = cfg.data.find(r => r.key === "top_n");
        if (rev) setRevealed(rev.value === "true");
        if (tn)  setTopN(parseInt(tn.value) || 20);
      }
      setAppLoading(false);
    });
  }, [user]);

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
      full_name:      r[COL.student] || `Candidate ${i+1}`,
      student_number: r[COL.student] || "",
      email:          r[COL.email] || "",
      phone:          r[COL.phone] || "",
      cv_link:        r[COL.cv] || "",
      b1:             r[COL.b1] || "",
      b2:             r[COL.b2] || "",
      t1:             r[COL.t1] || "",
      submitted_at:   r[COL.timestamp] || "",
    }));
    const { error } = await sb.from("candidates").insert(mapped);
    if (error) showToast("Import failed: " + error.message, "err");
    else { setCandidates(mapped); showToast(`${mapped.length} candidates imported`, "ok"); }
    setImporting(false);
  }, []);

  const handleScore = useCallback(async (candidateId, questionId, value) => {
    setAllScores(prev => {
      const idx = prev.findIndex(s => s.member_id === user.id && s.candidate_id === candidateId && s.question_id === questionId);
      const row = { member_id: user.id, candidate_id: candidateId, question_id: questionId, score: value, id: `opt_${Date.now()}` };
      return idx >= 0 ? prev.map((s, i) => i === idx ? { ...s, score: value } : s) : [...prev, row];
    });
    await sb.from("scores").upsert(
      { member_id: user.id, candidate_id: candidateId, question_id: questionId, score: value, updated_at: new Date().toISOString() },
      { onConflict: "member_id,candidate_id,question_id" }
    );
  }, [user]);

  const runDetection = useCallback(async candidate => {
    if (aiScores[candidate.id]) return;
    setDetecting(true);
    const result = await detectAI(candidate);
    setDetecting(false);
    if (!result) return;
    const row = { candidate_id: candidate.id, b1_pct: result.b1, b2_pct: result.b2, t1_pct: result.t1, overall_pct: result.overall, flags: result.flags };
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

  const isPresident = user?.role === "president";
  const myScores    = allScores.filter(s => s.member_id === user?.id);
  const progress    = user ? memberProgress(user.id, candidates, allScores) : { done: 0, total: 0 };
  const allDone     = members.length > 0 && (candidates?.length || 0) > 0 &&
    members.every(m => { const p = memberProgress(m.id, candidates, allScores); return p.done === p.total && p.total > 0; });

  const filtered = (candidates || []).filter(c =>
    !search || c.student_number?.includes(search) || c.email?.toLowerCase().includes(search.toLowerCase())
  );
  const ranked = (candidates || [])
    .map(c => ({ ...c, avg: avgScore(c.id, allScores) }))
    .sort((a, b) => (parseFloat(b.avg) || 0) - (parseFloat(a.avg) || 0));
  const candidateAI = selected ? (aiScores[selected.id] || {}) : {};

  if (!user) return <LoginScreen members={members} onLogin={setUser} />;
  if (appLoading) return (
    <div style={{ ...S.center, flexDirection: "column", gap: 16 }}>
      <NICLogo size={50} color="#1a2744" /><Spinner size={28} />
      <div style={{ color: "#64748b", fontSize: 13 }}>Loading portal…</div>
    </div>
  );
  if (!candidates) {
    if (!isPresident) return (
      <div style={S.center}>
        <div style={{ textAlign: "center" }}>
          <NICLogo size={50} color="#1a2744" />
          <p style={{ color: "#64748b", marginTop: 24, fontSize: 14 }}>Waiting for Co-Presidents to import applications.</p>
          <button style={{ ...S.btnSec, marginTop: 16 }} onClick={() => setUser(null)}>← Back</button>
        </div>
      </div>
    );
    return <ImportScreen onImport={handleImport} loading={importing} />;
  }

  return (
    <div style={S.wrap}>
      <style>{`
        @keyframes spin   { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        * { box-sizing: border-box; }
        body { background: #f0f4f8; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: #f0f4f8; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        button { transition: all 0.15s; cursor: pointer; }
        button:hover { filter: brightness(0.95); }
        a:hover { opacity: 0.75; }
        input:focus { outline: 2px solid #1a2744; outline-offset: 1px; }
      `}</style>

      {toast && (
        <div style={{ position: "fixed", top: 18, right: 18, zIndex: 9999, background: toast.type === "err" ? "#fef2f2" : "#f0fdf4", border: `1px solid ${toast.type === "err" ? "#fca5a5" : "#86efac"}`, color: toast.type === "err" ? "#dc2626" : "#16a34a", borderRadius: 10, padding: "11px 18px", fontSize: 13, fontWeight: 600, fontFamily: "Georgia,serif", animation: "fadeUp 0.2s ease", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
          {toast.msg}
        </div>
      )}

      {/* ── SIDEBAR ── */}
      <aside style={S.sidebar}>
        {/* Logo area */}
        <div style={S.sideLogoArea}>
          <img src="/nic-logo.png" alt="NIC" style={{ height: 70, objectFit: "contain" }}
            onError={e => { e.target.style.display = "none"; document.getElementById("side-nic-svg").style.display = "block"; }} />
          <div id="side-nic-svg" style={{ display: "none" }}><NICLogo size={36} color="#ffffff" /></div>
        </div>

        <div style={S.userCard}>
          <div style={S.userAv}>{initials(user.name)}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user.name}</div>
            {isPresident && <span style={S.presBadgeSide}>CO-PRESIDENT</span>}
          </div>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 28 }}>
          {[["list","📋  Applications"],["results","🏆  Results"]].map(([v, lbl]) => (
            <button key={v} style={{ ...S.navBtn, ...(view === v ? S.navBtnOn : {}) }}
              onClick={() => { setView(v); setSelected(null); }}>
              {lbl}
            </button>
          ))}
        </nav>

        <div style={S.progBlock}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: 2, marginBottom: 8 }}>MY PROGRESS</div>
          <div style={{ fontSize: 30, fontWeight: 900, color: "#fff", lineHeight: 1 }}>
            {progress.done}<span style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", fontWeight: 400 }}>/{progress.total}</span>
          </div>
          <div style={S.bar}><div style={{ ...S.barFill, width: progress.total ? `${progress.done / progress.total * 100}%` : "0%" }} /></div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 5 }}>candidates evaluated</div>
        </div>

        {isPresident && (
          <div style={S.presBox}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: 2, marginBottom: 10 }}>TEAM STATUS · LIVE</div>
            <div style={{ maxHeight: 160, overflowY: "auto" }}>
              {members.map(m => {
                const p = memberProgress(m.id, candidates, allScores);
                const done = p.done === p.total && p.total > 0;
                return (
                  <div key={m.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 12, color: done ? "#4ade80" : "rgba(255,255,255,0.4)" }}>
                    <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 110 }}>{m.name.split(" ")[0]}</span>
                    <span style={{ fontFamily: "monospace", flexShrink: 0 }}>{p.done}/{p.total}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 12 }}>
              {!revealed ? (
                <button style={{ ...S.btnReveal, opacity: allDone ? 1 : 0.4 }} disabled={!allDone} onClick={handleReveal}>
                  {allDone ? "🔓 Reveal Results" : "⏳ Awaiting all members"}
                </button>
              ) : <div style={{ color: "#4ade80", fontSize: 12, fontWeight: 700 }}>✓ Results Revealed</div>}
            </div>
          </div>
        )}

        <button style={{ background: "none", border: "none", color: "rgba(255,255,255,0.25)", cursor: "pointer", fontSize: 12, marginTop: "auto", textAlign: "left", fontFamily: "Georgia,serif" }}
          onClick={() => { setUser(null); setView("list"); setSelected(null); }}>
          ← Logout
        </button>
      </aside>

      {/* ── MAIN ── */}
      <main style={S.main}>

        {/* LIST */}
        {view === "list" && !selected && (
          <div style={{ animation: "fadeUp 0.2s ease" }}>
            <div style={S.phdr}>
              <div>
                <h1 style={S.ptitle}>Applications</h1>
                <p style={{ color: "#64748b", fontSize: 13, marginTop: 2 }}>{candidates.length} candidates · {progress.done} evaluated by you</p>
              </div>
              <input
                type="text" placeholder="Search by student no. or email…"
                value={search} onChange={e => setSearch(e.target.value)}
                style={S.searchInput}
              />
            </div>

            <div style={S.tbl}>
              <div style={S.tHd}>
                <span style={{ flex: 0.4 }}>#</span>
                <span style={{ flex: 1.8 }}>STUDENT NO.</span>
                <span style={{ flex: 2 }}>EMAIL</span>
                <span style={{ flex: 1 }}>AI DETECTION</span>
                <span style={{ flex: 1 }}>MY SCORES</span>
                <span style={{ flex: 0.6 }}>CV</span>
                <span style={{ flex: 0.8, textAlign: "right" }}></span>
              </div>

              {filtered.map((c, i) => {
                const cs = myScores.filter(s => s.candidate_id === c.id);
                const done = QUESTIONS.every(q => cs.some(s => s.question_id === q.id));
                const ai = aiScores[c.id];
                return (
                  <div key={c.id} style={{ ...S.tRow, background: done ? "#f0fdf4" : "#fff" }}>
                    <span style={{ flex: 0.4, color: "#94a3b8", fontSize: 12, fontFamily: "monospace" }}>{String(i + 1).padStart(2, "0")}</span>
                    <span style={{ flex: 1.8, fontWeight: 700, color: "#1e293b", fontSize: 14 }}>{c.student_number || "—"}</span>
                    <span style={{ flex: 2, color: "#475569", fontSize: 13 }}>{c.email || "—"}</span>
                    <span style={{ flex: 1 }}><AiBadge pct={ai?.overall_pct ?? null} /></span>
                    <span style={{ flex: 1, display: "flex", gap: 3 }}>
                      {QUESTIONS.map(q => {
                        const sc = cs.find(x => x.question_id === q.id);
                        return (
                          <span key={q.id} title={q.label} style={{ width: 26, height: 26, borderRadius: 6, background: sc != null ? "#1a2744" : "#f1f5f9", border: "1px solid", borderColor: sc != null ? "#1a2744" : "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: sc != null ? "#fff" : "#94a3b8", fontWeight: 800 }}>
                            {sc != null ? sc.score : "·"}
                          </span>
                        );
                      })}
                    </span>
                    <span style={{ flex: 0.6 }}>
                      {c.cv_link
                        ? <a href={c.cv_link} target="_blank" rel="noopener noreferrer" style={{ color: "#1a2744", fontSize: 12, textDecoration: "none", fontWeight: 600 }}>CV ↗</a>
                        : <span style={{ color: "#cbd5e1", fontSize: 12 }}>—</span>}
                    </span>
                    <span style={{ flex: 0.8, textAlign: "right" }}>
                      <button style={S.btnSm} onClick={() => { setSelected(c); setView("evaluate"); runDetection(c); }}>
                        {done ? "✓ Edit" : "Evaluate"}
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* EVALUATE */}
        {view === "evaluate" && selected && (
          <div style={{ animation: "fadeUp 0.2s ease" }}>
            <button style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 13, marginBottom: 16, padding: 0, fontFamily: "Georgia,serif" }}
              onClick={() => { setSelected(null); setView("list"); }}>← Back to list</button>

            <div style={S.phdr}>
              <div>
                <h1 style={S.ptitle}>Student #{selected.student_number}</h1>
                <p style={{ color: "#64748b", fontSize: 13, marginTop: 2 }}>{selected.email} · {selected.phone}</p>
              </div>
              {selected.cv_link && (
                <a href={selected.cv_link} target="_blank" rel="noopener noreferrer" style={S.cvBtn}>📄 Open CV →</a>
              )}
            </div>

            {/* AI Detection */}
            <div style={S.aiPanel}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <span style={{ fontSize: 10, letterSpacing: 2, color: "#475569", fontWeight: 700 }}>AI DETECTION ANALYSIS</span>
                {detecting && <Spinner size={13} />}
              </div>
              {!detecting && candidateAI.overall_pct != null ? (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {QUESTIONS.map(q => (
                    <div key={q.id} style={S.aiStat}>
                      <div style={{ fontSize: 10, color: "#64748b", marginBottom: 4 }}>{q.label.toUpperCase()}</div>
                      <div style={{ fontSize: 24, fontWeight: 900, color: aiColor(candidateAI[`${q.id}_pct`]) }}>{candidateAI[`${q.id}_pct`] ?? "—"}%</div>
                    </div>
                  ))}
                  <div style={S.aiStat}>
                    <div style={{ fontSize: 10, color: "#64748b", marginBottom: 4 }}>OVERALL</div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: aiColor(candidateAI.overall_pct) }}>{candidateAI.overall_pct ?? "—"}%</div>
                  </div>
                  <div style={{ ...S.aiStat, flex: 2, minWidth: 180 }}>
                    <div style={{ fontSize: 10, color: "#64748b", marginBottom: 4 }}>FLAGS</div>
                    <div style={{ fontSize: 13, color: "#475569" }}>{candidateAI.flags || "None detected"}</div>
                  </div>
                </div>
              ) : !detecting && <span style={{ color: "#94a3b8", fontSize: 13 }}>Analysis loading…</span>}
            </div>

            {/* Questions */}
            {QUESTIONS.map(q => {
              const existing = myScores.find(s => s.candidate_id === selected.id && s.question_id === q.id);
              const cur = existing?.score;
              return (
                <div key={q.id} style={S.qCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                    <div>
                      <div style={{ fontSize: 10, color: "#1a2744", letterSpacing: 2, fontWeight: 700 }}>{q.label.toUpperCase()}</div>
                      <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{q.sublabel}</div>
                    </div>
                    {cur != null && (
                      <span style={{ background: "#1a2744", color: "#fff", borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 700 }}>
                        {cur}/4 — {SCORE_LABELS[cur]}
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 14, color: "#334155", lineHeight: 1.8, margin: "0 0 20px", padding: "14px 16px", background: "#f8fafc", borderRadius: 8, borderLeft: "3px solid #e2e8f0" }}>
                    {selected[q.id] || <em style={{ color: "#94a3b8" }}>No answer provided</em>}
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 10, color: "#94a3b8", letterSpacing: 2, marginRight: 4 }}>SCORE</span>
                    {[0, 1, 2, 3, 4].map(n => (
                      <button key={n} title={SCORE_LABELS[n]}
                        style={{ ...S.scBtn, ...(cur === n ? S.scBtnOn : {}) }}
                        onClick={() => handleScore(selected.id, q.id, n)}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}

            <button style={{ ...S.btnPrimary, marginTop: 8 }} onClick={() => { setSelected(null); setView("list"); }}>
              Save & Return →
            </button>
          </div>
        )}

        {/* RESULTS */}
        {view === "results" && (
          <div style={{ animation: "fadeUp 0.2s ease" }}>
            <div style={S.phdr}>
              <div>
                <h1 style={S.ptitle}>Results</h1>
                <p style={{ color: "#64748b", fontSize: 13, marginTop: 2 }}>
                  {revealed ? "Rankings visible to all members" : isPresident ? "Preview mode — not yet revealed" : "Locked until Co-Presidents reveal"}
                </p>
              </div>
              {isPresident && (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 13, color: "#64748b" }}>Show top</span>
                  <input type="number" min={1} max={candidates.length} value={topN}
                    onChange={e => handleTopN(Math.max(1, parseInt(e.target.value) || 1))}
                    style={{ width: 60, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "7px 10px", color: "#1e293b", fontSize: 15, textAlign: "center", fontFamily: "Georgia,serif" }} />
                </div>
              )}
            </div>

            {!revealed && !isPresident ? (
              <div style={{ textAlign: "center", padding: "80px 20px" }}>
                <div style={{ fontSize: 56 }}>🔒</div>
                <h3 style={{ color: "#475569", margin: "16px 0 8px" }}>Results are locked</h3>
                <p style={{ color: "#94a3b8", fontSize: 14 }}>Co-Presidents will reveal results once all members complete their evaluations.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {ranked.slice(0, isPresident ? topN : ranked.length).map((c, i) => {
                  const ai = aiScores[c.id];
                  const isTop = i < topN;
                  return (
                    <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 16, background: "#fff", border: `1px solid ${isTop ? "#1a274433" : "#e2e8f0"}`, borderLeft: `4px solid ${isTop ? "#1a2744" : "#e2e8f0"}`, borderRadius: 10, padding: "16px 22px", boxShadow: isTop ? "0 2px 8px rgba(26,39,68,0.06)" : "none" }}>
                      <div style={{ fontSize: 14, color: isTop ? "#1a2744" : "#94a3b8", fontWeight: 900, fontFamily: "monospace", width: 34 }}>#{i + 1}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 15, color: "#1e293b" }}>Student #{c.student_number}</div>
                        <div style={{ fontSize: 12, color: "#94a3b8" }}>{c.email}</div>
                      </div>
                      <AiBadge pct={ai?.overall_pct ?? null} />
                      {c.cv_link && <a href={c.cv_link} target="_blank" rel="noopener noreferrer" style={{ color: "#1a2744", fontSize: 12, textDecoration: "none", fontWeight: 600 }}>CV ↗</a>}
                      <div style={{ textAlign: "right", minWidth: 90 }}>
                        <div style={{ fontSize: 28, fontWeight: 900, color: scoreColor(parseFloat(c.avg)) }}>{c.avg ?? "—"}{c.avg ? "%" : ""}</div>
                        <div style={{ fontSize: 9, color: "#94a3b8", letterSpacing: 1 }}>AVG SCORE</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const S = {
  center:    { minHeight: "100vh", background: "#f0f4f8", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Georgia,serif" },
  loginCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: "40px 36px", width: "100%", maxWidth: 560, boxShadow: "0 4px 24px rgba(26,39,68,0.08)" },
  divider:   { height: 1, background: "#e2e8f0", margin: "16px 0 24px" },
  loginTitle:{ fontSize: 20, color: "#1a2744", margin: "0 0 8px", fontWeight: 700, textAlign: "center" },
  hint:      { fontSize: 13, color: "#64748b", marginBottom: 24, textAlign: "center", lineHeight: 1.6 },
  secLabel:  { fontSize: 10, color: "#94a3b8", letterSpacing: 2.5, marginBottom: 8, fontWeight: 700 },
  memGrid:   { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 },
  memBtn:    { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "11px 13px", cursor: "pointer", display: "flex", alignItems: "center", gap: 9, color: "#475569", textAlign: "left" },
  memBtnOn:  { border: "1px solid #1a2744", background: "#f0f4ff", color: "#1a2744" },
  av:        { width: 30, height: 30, borderRadius: "50%", background: "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flexShrink: 0, color: "#64748b" },
  avOn:      { background: "#1a2744", color: "#fff" },
  presBadge: { fontSize: 9, background: "#eff6ff", color: "#1a2744", border: "1px solid #bfdbfe", borderRadius: 4, padding: "2px 6px", letterSpacing: 1, marginLeft: "auto" },
  presBadgeSide: { fontSize: 9, background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)", borderRadius: 4, padding: "2px 6px", letterSpacing: 1, display: "inline-block", marginTop: 2 },
  btnPrimary:{ background: "#1a2744", color: "#fff", border: "none", borderRadius: 8, padding: "12px 26px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "Georgia,serif" },
  btnSec:    { background: "transparent", color: "#64748b", border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 18px", cursor: "pointer", fontSize: 13, fontFamily: "Georgia,serif" },
  btnSm:     { background: "#f0f4ff", color: "#1a2744", border: "1px solid #bfdbfe", borderRadius: 6, padding: "6px 13px", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "Georgia,serif" },
  btnReveal: { background: "#fff", color: "#1a2744", border: "none", borderRadius: 7, padding: "9px 12px", width: "100%", fontSize: 12, fontWeight: 700, fontFamily: "Georgia,serif", cursor: "pointer" },
  cvBtn:     { background: "#1a2744", color: "#fff", borderRadius: 8, padding: "10px 18px", fontSize: 13, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" },
  drop:      { border: "2px dashed #cbd5e1", borderRadius: 12, padding: "36px 20px", cursor: "pointer", textAlign: "center", transition: "all 0.2s", marginTop: 18 },
  dropOn:    { border: "2px dashed #1a2744", background: "#f0f4ff" },
  wrap:      { display: "flex", minHeight: "100vh", background: "#f0f4f8", fontFamily: "Georgia,serif" },
  sidebar:   { width: 236, background: "#1a2744", padding: "0 0 24px", display: "flex", flexDirection: "column", flexShrink: 0, position: "sticky", top: 0, height: "100vh", overflowY: "auto" },
  sideLogoArea: { background: "#131e38", padding: "24px 20px 20px", textAlign: "center", marginBottom: 20 },
  userCard:  { display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.07)", borderRadius: 10, padding: "10px 14px", margin: "0 12px 20px" },
  userAv:    { width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, color: "#fff", flexShrink: 0 },
  navBtn:    { background: "transparent", border: "none", borderRadius: 8, padding: "10px 16px", cursor: "pointer", textAlign: "left", color: "rgba(255,255,255,0.45)", fontSize: 13, fontWeight: 600, fontFamily: "Georgia,serif", margin: "0 8px" },
  navBtnOn:  { background: "rgba(255,255,255,0.12)", color: "#fff" },
  progBlock: { background: "rgba(255,255,255,0.06)", borderRadius: 10, padding: 14, margin: "0 12px 18px" },
  bar:       { height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 2, marginTop: 8 },
  barFill:   { height: "100%", background: "#fff", borderRadius: 2, transition: "width 0.6s ease" },
  presBox:   { background: "rgba(255,255,255,0.06)", borderRadius: 10, padding: 14, margin: "0 12px 18px" },
  main:      { flex: 1, padding: "36px 40px", overflowY: "auto" },
  phdr:      { display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, gap: 16 },
  ptitle:    { fontSize: 26, fontWeight: 900, color: "#1a2744", margin: 0 },
  searchInput: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 14px", fontSize: 13, color: "#1e293b", fontFamily: "Georgia,serif", width: 260 },
  tbl:       { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" },
  tHd:       { display: "flex", padding: "11px 20px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontSize: 10, color: "#94a3b8", letterSpacing: 1.5, fontWeight: 700 },
  tRow:      { display: "flex", alignItems: "center", padding: "14px 20px", borderBottom: "1px solid #f1f5f9", transition: "background 0.1s" },
  aiPanel:   { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20, marginBottom: 16 },
  aiStat:    { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 16px", minWidth: 90 },
  qCard:     { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 22, marginBottom: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.03)" },
  scBtn:     { width: 38, height: 38, borderRadius: 8, border: "1px solid #e2e8f0", background: "#f8fafc", color: "#64748b", fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "Georgia,serif" },
  scBtnOn:   { background: "#1a2744", color: "#fff", border: "1px solid #1a2744" },
};
