import { useState, useEffect, useCallback } from "react";
import Papa from "papaparse";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://cfijvlomsugjwdikphpe.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNmaWp2bG9tc3VnandkaWtwaHBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NzQ5ODAsImV4cCI6MjA5NTA1MDk4MH0.w3z2O8G-A_SWKIXWvG2Ul9dBQZz7VpT-215U0BAK8QI";
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Exact CSV column names from NIC Google Forms ──
const COL = {
  timestamp: "Coluna 1",
  student:   "What is your student number?",
  email:     "What is your institutional email?",
  phone:     "What is your phone number?",
  cv:        "Please upload your CV.",
  b1:        "Tell us about yourself. What motivates you? How are you different from other applicants? Where do you see yourself in five years?  (Max 750 characters)",
  b2:        "What makes you want to join NIC-UD? Why do you think you could be a valuable member for the club? How are you different from other applicants? (Max 750 characters)",
  t1:        "If you had \u20AC100,000 to invest, how would you allocate this capital across different asset classes or markets to build a solid, future-proof portfolio? Please explain your choices by considering current macroeconomic trends and some key fundamentals. (Max 1000 characters)",
};

const QUESTIONS = [
  { id: "b1", label: "About Yourself",   sublabel: "Motivation & Differentiation"  },
  { id: "b2", label: "Why NIC-UD?",      sublabel: "Fit & Value Add"               },
  { id: "t1", label: "Technical",        sublabel: "\u20AC100k Portfolio Allocation" },
];
const SCORE_LABELS = ["No merit", "Below avg", "Average", "Good", "Excellent"];

// ── AI detection ──────────────────────────────────────────────────────────────
async function detectAI(candidate) {
  const prompt = `You are an AI-detection assistant for a university investment club (NIC-UD) recruitment.
Analyze these answers and estimate the probability (0-100) each was AI-generated.
Return ONLY valid JSON, no markdown:
{"b1":<int>,"b2":<int>,"t1":<int>,"overall":<int>,"flags":"<one sentence or None detected>"}
B1: ${candidate.b1 || "(empty)"}
B2: ${candidate.b2 || "(empty)"}
T1: ${candidate.t1 || "(empty)"}`;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 300, messages: [{ role: "user", content: prompt }] }),
    });
    const data = await res.json();
    const text = data.content?.find(b => b.type === "text")?.text || "{}";
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch { return { b1: null, b2: null, t1: null, overall: null, flags: "Detection failed" }; }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const C = {
  navy:    "#0f2952",
  navyMid: "#1a3a6b",
  navyLt:  "#2451a0",
  accent:  "#2d6ae0",
  bg:      "#f4f6fb",
  white:   "#ffffff",
  border:  "#dde3ef",
  text:    "#0d1b2a",
  textMid: "#3d5278",
  textLt:  "#7a90b0",
  green:   "#16a34a",
  amber:   "#d97706",
  red:     "#dc2626",
};

function aiColor(p) { if (p==null) return C.textLt; if (p>=70) return C.red; if (p>=40) return C.amber; return C.green; }
function scoreColor(s) { if (s==null) return C.textLt; if (s>=75) return C.green; if (s>=50) return C.amber; return C.red; }
function initials(name) { return (name||"?").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase(); }
function avgScore(cid, scores) {
  const rows = scores.filter(s => s.candidate_id === cid);
  if (!rows.length) return null;
  return ((rows.reduce((a,r) => a+r.score, 0) / rows.length / 4) * 100).toFixed(1);
}
function memberProgress(mid, candidates, scores) {
  const my = scores.filter(s => s.member_id === mid);
  const done = (candidates||[]).filter(c => QUESTIONS.every(q => my.some(s => s.candidate_id===c.id && s.question_id===q.id))).length;
  return { done, total: (candidates||[]).length };
}

// ── Components ────────────────────────────────────────────────────────────────
function Spinner({ size=20 }) {
  return <div style={{ width:size, height:size, border:`2px solid ${C.border}`, borderTop:`2px solid ${C.navy}`, borderRadius:"50%", animation:"spin 0.7s linear infinite", flexShrink:0 }} />;
}

function AiBadge({ pct }) {
  if (pct==null) return <span style={{ color:C.textLt, fontSize:12 }}>—</span>;
  const col = aiColor(pct);
  return <span style={{ background:col+"15", color:col, border:`1px solid ${col}44`, borderRadius:20, padding:"3px 10px", fontSize:11, fontWeight:700, letterSpacing:0.3 }}>AI {pct}%</span>;
}

function Toast({ toast }) {
  if (!toast) return null;
  const ok = toast.type !== "err";
  return (
    <div style={{ position:"fixed", top:18, right:18, zIndex:9999, background:ok?"#f0fdf4":"#fef2f2", border:`1px solid ${ok?"#86efac":"#fca5a5"}`, color:ok?C.green:C.red, borderRadius:10, padding:"11px 20px", fontSize:14, fontWeight:600, fontFamily:"system-ui,sans-serif", animation:"fadeUp 0.2s ease", boxShadow:"0 4px 16px rgba(0,0,0,0.10)" }}>
      {toast.msg}
    </div>
  );
}

// ── LOGIN ─────────────────────────────────────────────────────────────────────
function LoginScreen({ members, onLogin }) {
  const [sel, setSel] = useState(null);
  const presidents = members.filter(m => m.role==="president");
  const regular    = members.filter(m => m.role!=="president");

  return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"system-ui,sans-serif" }}>
      <div style={{ background:C.white, border:`1px solid ${C.border}`, borderRadius:18, padding:"44px 40px", width:"100%", maxWidth:560, boxShadow:"0 8px 32px rgba(15,41,82,0.10)" }}>
        <div style={{ textAlign:"center", marginBottom:28 }}>
          <img src="/nic-logo.png" alt="NIC" style={{ height:88, objectFit:"contain" }} />
        </div>
        <div style={{ height:1, background:C.border, marginBottom:28 }} />
        <h2 style={{ fontSize:22, fontWeight:700, color:C.text, margin:"0 0 6px", textAlign:"center" }}>Recruitment Portal</h2>
        <p style={{ fontSize:14, color:C.textMid, marginBottom:28, textAlign:"center" }}>Select your profile to continue</p>

        {presidents.length > 0 && <>
          <div style={{ fontSize:11, color:C.textLt, letterSpacing:2, fontWeight:700, marginBottom:8 }}>CO-PRESIDENTS</div>
          <div style={{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap" }}>
            {presidents.map(m => (
              <button key={m.id} onClick={()=>setSel(m)}
                style={{ flex:1, minWidth:200, display:"flex", alignItems:"center", gap:10, padding:"12px 14px", background:sel?.id===m.id?C.navy:C.bg, border:`1.5px solid ${sel?.id===m.id?C.navy:C.border}`, borderRadius:10, cursor:"pointer", color:sel?.id===m.id?"#fff":C.text }}>
                <span style={{ width:32, height:32, borderRadius:"50%", background:sel?.id===m.id?"rgba(255,255,255,0.2)":C.border, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:800, flexShrink:0, color:sel?.id===m.id?"#fff":C.navy }}>
                  {initials(m.name)}
                </span>
                <span style={{ fontSize:14, fontWeight:600 }}>{m.name}</span>
                <span style={{ marginLeft:"auto", fontSize:10, background:sel?.id===m.id?"rgba(255,255,255,0.2)":"#e0e8f7", color:sel?.id===m.id?"#fff":C.navy, borderRadius:4, padding:"2px 7px", letterSpacing:1, fontWeight:700 }}>PRES</span>
              </button>
            ))}
          </div>
        </>}

        <div style={{ fontSize:11, color:C.textLt, letterSpacing:2, fontWeight:700, marginBottom:8 }}>MEMBERS</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:7, marginBottom:28 }}>
          {regular.map(m => (
            <button key={m.id} onClick={()=>setSel(m)}
              style={{ display:"flex", alignItems:"center", gap:9, padding:"10px 13px", background:sel?.id===m.id?C.navy:C.bg, border:`1.5px solid ${sel?.id===m.id?C.navy:C.border}`, borderRadius:10, cursor:"pointer", color:sel?.id===m.id?"#fff":C.text }}>
              <span style={{ width:28, height:28, borderRadius:"50%", background:sel?.id===m.id?"rgba(255,255,255,0.2)":C.border, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:800, flexShrink:0, color:sel?.id===m.id?"#fff":C.navy }}>
                {initials(m.name)}
              </span>
              <span style={{ fontSize:13, fontWeight:600 }}>{m.name}</span>
            </button>
          ))}
        </div>

        <button onClick={()=>sel&&onLogin(sel)} disabled={!sel}
          style={{ width:"100%", padding:"13px", background:sel?C.navy:"#c5cedc", color:"#fff", border:"none", borderRadius:10, fontSize:15, fontWeight:700, cursor:sel?"pointer":"not-allowed", letterSpacing:0.3 }}>
          Enter Portal →
        </button>
      </div>
    </div>
  );
}

// ── IMPORT (presidents only) ──────────────────────────────────────────────────
function ImportPanel({ onImport, loading, hasCandidates }) {
  const [drag, setDrag] = useState(false);
  const [err,  setErr]  = useState(null);

  const parse = f => {
    if (!f) return;
    Papa.parse(f, {
      header:true, skipEmptyLines:true,
      complete: r => {
        if (!r.data?.length) { setErr("CSV appears empty."); return; }
        const seen = {};
        r.data.forEach(row => {
          const sn = row[COL.student]?.trim();
          if (!sn || sn==="teste") return;
          if (!seen[sn] || row[COL.timestamp] > seen[sn][COL.timestamp]) seen[sn] = row;
        });
        const deduped = Object.values(seen);
        if (!deduped.length) { setErr("No valid candidates found."); return; }
        onImport(deduped);
      },
      error: () => setErr("Failed to parse CSV."),
    });
  };

  return (
    <div style={{ background:C.white, border:`1px solid ${C.border}`, borderRadius:14, padding:24, marginBottom:24 }}>
      <div style={{ fontSize:12, fontWeight:700, color:C.navy, letterSpacing:1, marginBottom:16 }}>
        {hasCandidates ? "📂 REPLACE APPLICATIONS (import new CSV)" : "📂 IMPORT APPLICATIONS"}
      </div>
      {hasCandidates && (
        <div style={{ background:"#fff8e6", border:"1px solid #fcd34d", borderRadius:8, padding:"10px 14px", fontSize:13, color:"#92400e", marginBottom:14 }}>
          ⚠️ Importing a new CSV will replace all existing candidates and scores.
        </div>
      )}
      <div
        style={{ border:`2px dashed ${drag?C.navy:C.border}`, borderRadius:10, padding:"28px 20px", cursor:"pointer", textAlign:"center", background:drag?"#eef3ff":C.bg, transition:"all 0.2s" }}
        onDragOver={e=>{e.preventDefault();setDrag(true);}}
        onDragLeave={()=>setDrag(false)}
        onDrop={e=>{e.preventDefault();setDrag(false);parse(e.dataTransfer.files[0]);}}
        onClick={()=>document.getElementById("csvImport").click()}>
        <div style={{ fontSize:32, marginBottom:8 }}>📄</div>
        <p style={{ margin:"0 0 4px", fontWeight:700, color:C.text, fontSize:14 }}>Drop CSV or click to upload</p>
        <p style={{ margin:0, fontSize:12, color:C.textLt }}>NIC-UD Application Answers · duplicates auto-removed</p>
        <input id="csvImport" type="file" accept=".csv" style={{ display:"none" }} onChange={e=>parse(e.target.files[0])} />
      </div>
      {err   && <p style={{ color:C.red,   fontSize:13, marginTop:10 }}>{err}</p>}
      {loading && <div style={{ display:"flex", justifyContent:"center", marginTop:14 }}><Spinner /></div>}
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function App() {
  const [members,    setMembers]    = useState([]);
  const [user,       setUser]       = useState(null);
  const [candidates, setCandidates] = useState(null);
  const [allScores,  setAllScores]  = useState([]);
  const [aiScores,   setAiScores]   = useState({});
  const [revealed,   setRevealed]   = useState(false);
  const [topN,       setTopN]       = useState(20);
  const [view,       setView]       = useState("list");
  const [selected,   setSelected]   = useState(null);
  const [detecting,  setDetecting]  = useState(false);
  const [importing,  setImporting]  = useState(false);
  const [appLoading, setAppLoading] = useState(true);
  const [toast,      setToast]      = useState(null);
  const [search,     setSearch]     = useState("");
  const [showImport, setShowImport] = useState(false);

  const showToast = (msg, type="ok") => { setToast({msg,type}); setTimeout(()=>setToast(null),3000); };

  // Load members
  useEffect(() => {
    sb.from("members").select("*").order("name").then(({data}) => { if(data) setMembers(data); });
  }, []);

  // Load all data after login
  useEffect(() => {
    if (!user) return;
    setAppLoading(true);
    Promise.all([
      sb.from("candidates").select("*").order("student_number"),
      sb.from("scores").select("*"),
      sb.from("ai_scores").select("*"),
      sb.from("settings").select("*"),
    ]).then(([c, sc, ai, cfg]) => {
      setCandidates(c.data?.length ? c.data : null);
      if (sc.data) setAllScores(sc.data);
      if (ai.data) { const m={}; ai.data.forEach(r=>{m[r.candidate_id]=r;}); setAiScores(m); }
      if (cfg.data) {
        const rev = cfg.data.find(r=>r.key==="revealed");
        const tn  = cfg.data.find(r=>r.key==="top_n");
        if (rev) setRevealed(rev.value==="true");
        if (tn)  setTopN(parseInt(tn.value)||20);
      }
      setAppLoading(false);
    });
  }, [user]);

  // Realtime
  useEffect(() => {
    if (!user) return;
    const ch = sb.channel("nic-live")
      .on("postgres_changes",{event:"*",schema:"public",table:"scores"}, p => {
        setAllScores(prev => {
          if (p.eventType==="DELETE") return prev.filter(r=>r.id!==p.old.id);
          const f = prev.filter(r=>!(r.member_id===p.new.member_id&&r.candidate_id===p.new.candidate_id&&r.question_id===p.new.question_id));
          return [...f, p.new];
        });
      })
      .on("postgres_changes",{event:"*",schema:"public",table:"settings"}, p => {
        if (p.new?.key==="revealed") setRevealed(p.new.value==="true");
        if (p.new?.key==="top_n")    setTopN(parseInt(p.new.value)||20);
      })
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"candidates"}, p => {
        setCandidates(prev => prev?[...prev,p.new]:[p.new]);
      })
      .on("postgres_changes",{event:"*",schema:"public",table:"ai_scores"}, p => {
        if (p.new) setAiScores(prev=>({...prev,[p.new.candidate_id]:p.new}));
      })
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [user]);

  // Import CSV
  const handleImport = useCallback(async rows => {
    setImporting(true);
    // If replacing, delete existing first
    if (candidates?.length) {
      await sb.from("scores").delete().neq("id","00000000-0000-0000-0000-000000000000");
      await sb.from("ai_scores").delete().neq("candidate_id","_");
      await sb.from("candidates").delete().neq("id","_");
      setAllScores([]);
      setAiScores({});
    }
    const mapped = rows.map((r,i) => ({
      id:             `c_${Date.now()}_${i}`,
      full_name:      r[COL.student]||`Candidate ${i+1}`,
      student_number: r[COL.student]||"",
      email:          r[COL.email]||"",
      phone:          r[COL.phone]||"",
      cv_link:        r[COL.cv]||"",
      b1:             r[COL.b1]||"",
      b2:             r[COL.b2]||"",
      t1:             r[COL.t1]||"",
      submitted_at:   r[COL.timestamp]||"",
    }));
    const {error} = await sb.from("candidates").insert(mapped);
    if (error) showToast("Import failed: "+error.message,"err");
    else { setCandidates(mapped); setShowImport(false); showToast(`${mapped.length} candidates imported`,"ok"); }
    setImporting(false);
  }, [candidates]);

  // Score
  const handleScore = useCallback(async (candidateId, questionId, value) => {
    setAllScores(prev => {
      const idx = prev.findIndex(s=>s.member_id===user.id&&s.candidate_id===candidateId&&s.question_id===questionId);
      const row = {member_id:user.id,candidate_id:candidateId,question_id:questionId,score:value,id:`opt_${Date.now()}`};
      return idx>=0 ? prev.map((s,i)=>i===idx?{...s,score:value}:s) : [...prev,row];
    });
    await sb.from("scores").upsert(
      {member_id:user.id,candidate_id:candidateId,question_id:questionId,score:value,updated_at:new Date().toISOString()},
      {onConflict:"member_id,candidate_id,question_id"}
    );
  }, [user]);

  // AI detection
  const runDetection = useCallback(async candidate => {
    if (aiScores[candidate.id]) return;
    setDetecting(true);
    const result = await detectAI(candidate);
    setDetecting(false);
    if (!result) return;
    const row = {candidate_id:candidate.id, b1_pct:result.b1, b2_pct:result.b2, t1_pct:result.t1, overall_pct:result.overall, flags:result.flags};
    await sb.from("ai_scores").upsert(row,{onConflict:"candidate_id"});
    setAiScores(prev=>({...prev,[candidate.id]:row}));
  }, [aiScores]);

  // Reveal
  const handleReveal = useCallback(async () => {
    await sb.from("settings").upsert({key:"revealed",value:"true"},{onConflict:"key"});
    setRevealed(true);
    showToast("Results revealed to all members","ok");
  }, []);

  const handleTopN = useCallback(async n => {
    setTopN(n);
    await sb.from("settings").upsert({key:"top_n",value:String(n)},{onConflict:"key"});
  }, []);

  // Derived
  const isPresident = user?.role==="president";
  const myScores    = allScores.filter(s=>s.member_id===user?.id);
  const progress    = user ? memberProgress(user.id,candidates,allScores) : {done:0,total:0};
  const allDone     = members.length>0 && (candidates?.length||0)>0 &&
    members.every(m=>{ const p=memberProgress(m.id,candidates,allScores); return p.done===p.total&&p.total>0; });
  const filtered    = (candidates||[]).filter(c => !search || c.student_number?.includes(search) || c.email?.toLowerCase().includes(search.toLowerCase()));
  const ranked      = (candidates||[]).map(c=>({...c,avg:avgScore(c.id,allScores)})).sort((a,b)=>(parseFloat(b.avg)||0)-(parseFloat(a.avg)||0));
  const candidateAI = selected?(aiScores[selected.id]||{}):{};

  // ── Gates ──────────────────────────────────────────────────────────────────
  if (!user) return <LoginScreen members={members} onLogin={setUser} />;

  if (appLoading) return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, fontFamily:"system-ui,sans-serif" }}>
      <img src="/nic-logo.png" alt="NIC" style={{ height:70, objectFit:"contain" }} />
      <Spinner size={28} />
      <div style={{ color:C.textMid, fontSize:14 }}>Loading portal…</div>
    </div>
  );

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display:"flex", minHeight:"100vh", background:C.bg, fontFamily:"system-ui,sans-serif", color:C.text }}>
      <style>{`
        @keyframes spin    { to { transform:rotate(360deg); } }
        @keyframes fadeUp  { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        * { box-sizing:border-box; }
        ::-webkit-scrollbar { width:5px; }
        ::-webkit-scrollbar-track { background:${C.bg}; }
        ::-webkit-scrollbar-thumb { background:${C.border}; border-radius:4px; }
        button { transition:all 0.15s; cursor:pointer; }
        button:hover:not(:disabled) { filter:brightness(0.93); }
        a:hover { opacity:0.75; }
      `}</style>

      <Toast toast={toast} />

      {/* ── SIDEBAR ── */}
      <aside style={{ width:240, background:C.navy, display:"flex", flexDirection:"column", flexShrink:0, position:"sticky", top:0, height:"100vh", overflowY:"auto" }}>
        {/* Logo */}
        <div style={{ background:C.navyMid, padding:"22px 20px 18px", textAlign:"center" }}>
          <img src="/nic-logo.png" alt="NIC" style={{ height:68, objectFit:"contain", filter:"brightness(10)" }} />
        </div>

        {/* User */}
        <div style={{ display:"flex", alignItems:"center", gap:10, background:"rgba(255,255,255,0.07)", margin:"14px 14px 0", borderRadius:10, padding:"10px 13px" }}>
          <div style={{ width:34, height:34, borderRadius:"50%", background:"rgba(255,255,255,0.15)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:800, color:"#fff", flexShrink:0 }}>
            {initials(user.name)}
          </div>
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:13, fontWeight:700, color:"#fff", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{user.name}</div>
            {isPresident && <div style={{ fontSize:10, color:"rgba(255,255,255,0.5)", letterSpacing:1, marginTop:1 }}>CO-PRESIDENT</div>}
          </div>
        </div>

        {/* Nav */}
        <nav style={{ display:"flex", flexDirection:"column", gap:2, margin:"18px 10px 0" }}>
          {[["list","📋  Applications"],["results","🏆  Results"]].map(([v,lbl])=>(
            <button key={v} onClick={()=>{setView(v);setSelected(null);setShowImport(false);}}
              style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 14px", background:view===v?"rgba(255,255,255,0.14)":"transparent", border:"none", borderRadius:9, color:view===v?"#fff":"rgba(255,255,255,0.5)", fontSize:14, fontWeight:600, textAlign:"left" }}>
              {lbl}
            </button>
          ))}
        </nav>

        {/* Progress */}
        <div style={{ background:"rgba(255,255,255,0.06)", borderRadius:10, padding:14, margin:"18px 14px 0" }}>
          <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", letterSpacing:2, marginBottom:8 }}>MY PROGRESS</div>
          <div style={{ fontSize:30, fontWeight:800, color:"#fff", lineHeight:1 }}>
            {progress.done}<span style={{ fontSize:15, color:"rgba(255,255,255,0.35)", fontWeight:400 }}>/{progress.total}</span>
          </div>
          <div style={{ height:3, background:"rgba(255,255,255,0.1)", borderRadius:2, marginTop:9 }}>
            <div style={{ height:"100%", background:"#fff", borderRadius:2, width:progress.total?`${progress.done/progress.total*100}%`:"0%", transition:"width 0.6s" }} />
          </div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.3)", marginTop:5 }}>candidates evaluated</div>
        </div>

        {/* President controls */}
        {isPresident && (
          <div style={{ background:"rgba(255,255,255,0.06)", borderRadius:10, padding:14, margin:"14px 14px 0" }}>
            <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", letterSpacing:2, marginBottom:10 }}>TEAM STATUS · LIVE</div>
            <div style={{ maxHeight:170, overflowY:"auto" }}>
              {members.map(m => {
                const p = memberProgress(m.id,candidates,allScores);
                const done = p.done===p.total&&p.total>0;
                return (
                  <div key={m.id} style={{ display:"flex", justifyContent:"space-between", marginBottom:5, fontSize:12, color:done?"#4ade80":"rgba(255,255,255,0.35)" }}>
                    <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:120 }}>{m.name.split(" ")[0]}</span>
                    <span style={{ fontFamily:"monospace", flexShrink:0 }}>{p.done}/{p.total}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop:12, display:"flex", flexDirection:"column", gap:8 }}>
              {!revealed ? (
                <button onClick={handleReveal} disabled={!allDone}
                  style={{ background:allDone?"#fff":"rgba(255,255,255,0.15)", color:allDone?C.navy:"rgba(255,255,255,0.4)", border:"none", borderRadius:8, padding:"9px 12px", width:"100%", fontSize:12, fontWeight:700, cursor:allDone?"pointer":"not-allowed" }}>
                  {allDone?"🔓 Reveal Results":"⏳ Awaiting all members"}
                </button>
              ) : <div style={{ color:"#4ade80", fontSize:12, fontWeight:700 }}>✓ Results Revealed to All</div>}
              <button onClick={()=>setShowImport(v=>!v)}
                style={{ background:"rgba(255,255,255,0.10)", color:"rgba(255,255,255,0.7)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:8, padding:"8px 12px", width:"100%", fontSize:12, fontWeight:600 }}>
                {showImport?"✕ Close Import":"📂 Import CSV"}
              </button>
            </div>
          </div>
        )}

        <button onClick={()=>{setUser(null);setView("list");setSelected(null);}}
          style={{ background:"none", border:"none", color:"rgba(255,255,255,0.2)", cursor:"pointer", fontSize:12, marginTop:"auto", padding:"14px 18px", textAlign:"left" }}>
          ← Logout
        </button>
      </aside>

      {/* ── MAIN ── */}
      <main style={{ flex:1, padding:"36px 40px", overflowY:"auto" }}>

        {/* Import panel (presidents only, toggled) */}
        {isPresident && showImport && (
          <ImportPanel onImport={handleImport} loading={importing} hasCandidates={!!(candidates?.length)} />
        )}

        {/* No candidates yet */}
        {!candidates && !showImport && (
          <div style={{ textAlign:"center", padding:"80px 20px", animation:"fadeUp 0.2s ease" }}>
            <div style={{ fontSize:48, marginBottom:16 }}>📋</div>
            <h3 style={{ color:C.navyMid, margin:"0 0 8px", fontSize:20 }}>No applications yet</h3>
            <p style={{ color:C.textMid, fontSize:14 }}>
              {isPresident ? "Use the Import CSV button in the sidebar to load applications." : "Waiting for Co-Presidents to import the applications CSV."}
            </p>
          </div>
        )}

        {/* ── LIST VIEW ── */}
        {candidates && view==="list" && !selected && (
          <div style={{ animation:"fadeUp 0.2s ease" }}>
            <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:24, gap:16 }}>
              <div>
                <h1 style={{ fontSize:26, fontWeight:800, color:C.navy, margin:0 }}>Applications</h1>
                <p style={{ color:C.textMid, fontSize:13, marginTop:4 }}>{candidates.length} candidates · {progress.done} evaluated by you</p>
              </div>
              <input type="text" placeholder="Search student no. or email…" value={search} onChange={e=>setSearch(e.target.value)}
                style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:9, padding:"9px 14px", fontSize:13, color:C.text, width:260, outline:"none" }} />
            </div>

            <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:12, overflow:"hidden", boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}>
              <div style={{ display:"flex", padding:"10px 20px", background:C.bg, borderBottom:`1px solid ${C.border}`, fontSize:11, color:C.textLt, letterSpacing:1.5, fontWeight:700 }}>
                <span style={{ flex:0.4 }}>#</span>
                <span style={{ flex:1.6 }}>STUDENT NO.</span>
                <span style={{ flex:2 }}>EMAIL</span>
                <span style={{ flex:1 }}>AI</span>
                <span style={{ flex:1 }}>MY SCORES</span>
                <span style={{ flex:0.5 }}>CV</span>
                <span style={{ flex:0.8, textAlign:"right" }}></span>
              </div>

              {filtered.length===0 && (
                <div style={{ padding:"32px 20px", textAlign:"center", color:C.textLt, fontSize:14 }}>No candidates match your search.</div>
              )}

              {filtered.map((c,i) => {
                const cs   = myScores.filter(s=>s.candidate_id===c.id);
                const done = QUESTIONS.every(q=>cs.some(s=>s.question_id===q.id));
                const ai   = aiScores[c.id];
                return (
                  <div key={c.id} style={{ display:"flex", alignItems:"center", padding:"13px 20px", borderBottom:`1px solid #f1f5f9`, background:done?"#f0fdf4":"#fff", transition:"background 0.1s" }}>
                    <span style={{ flex:0.4, color:C.textLt, fontSize:12, fontFamily:"monospace" }}>{String(i+1).padStart(2,"0")}</span>
                    <span style={{ flex:1.6, fontWeight:700, color:C.navy, fontSize:14 }}>{c.student_number||"—"}</span>
                    <span style={{ flex:2, color:C.textMid, fontSize:13 }}>{c.email||"—"}</span>
                    <span style={{ flex:1 }}><AiBadge pct={ai?.overall_pct??null} /></span>
                    <span style={{ flex:1, display:"flex", gap:3 }}>
                      {QUESTIONS.map(q => {
                        const sc = cs.find(x=>x.question_id===q.id);
                        return <span key={q.id} title={q.label} style={{ width:26, height:26, borderRadius:6, background:sc!=null?C.navy:"#f1f5f9", border:`1px solid ${sc!=null?C.navy:C.border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, color:sc!=null?"#fff":C.textLt, fontWeight:800 }}>{sc!=null?sc.score:"·"}</span>;
                      })}
                    </span>
                    <span style={{ flex:0.5 }}>
                      {c.cv_link?<a href={c.cv_link} target="_blank" rel="noopener noreferrer" style={{ color:C.accent, fontSize:12, textDecoration:"none", fontWeight:600 }}>CV ↗</a>:<span style={{ color:C.border, fontSize:12 }}>—</span>}
                    </span>
                    <span style={{ flex:0.8, textAlign:"right" }}>
                      <button onClick={()=>{setSelected(c);setView("evaluate");runDetection(c);}}
                        style={{ background:done?"#dcfce7":C.bg, color:done?C.green:C.navy, border:`1px solid ${done?"#86efac":C.border}`, borderRadius:7, padding:"6px 13px", fontSize:12, fontWeight:700 }}>
                        {done?"✓ Edit":"Evaluate"}
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── EVALUATE VIEW ── */}
        {candidates && view==="evaluate" && selected && (
          <div style={{ animation:"fadeUp 0.2s ease" }}>
            <button onClick={()=>{setSelected(null);setView("list");}}
              style={{ background:"none", border:"none", color:C.textMid, cursor:"pointer", fontSize:13, marginBottom:16, padding:0, display:"flex", alignItems:"center", gap:4 }}>
              ← Back to list
            </button>

            <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:20, gap:16 }}>
              <div>
                <h1 style={{ fontSize:24, fontWeight:800, color:C.navy, margin:0 }}>Student #{selected.student_number}</h1>
                <p style={{ color:C.textMid, fontSize:13, marginTop:4 }}>{selected.email}{selected.phone?` · ${selected.phone}`:""}</p>
              </div>
              {selected.cv_link && (
                <a href={selected.cv_link} target="_blank" rel="noopener noreferrer"
                  style={{ background:C.navy, color:"#fff", borderRadius:9, padding:"10px 18px", fontSize:13, fontWeight:700, textDecoration:"none", whiteSpace:"nowrap" }}>
                  📄 Open CV →
                </a>
              )}
            </div>

            {/* AI Detection */}
            <div style={{ background:"#f8fafc", border:`1px solid ${C.border}`, borderRadius:12, padding:20, marginBottom:16 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
                <span style={{ fontSize:11, letterSpacing:2, color:C.textMid, fontWeight:700 }}>AI DETECTION</span>
                {detecting && <Spinner size={13} />}
              </div>
              {!detecting && candidateAI.overall_pct!=null ? (
                <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                  {QUESTIONS.map(q=>(
                    <div key={q.id} style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:9, padding:"10px 16px", minWidth:100 }}>
                      <div style={{ fontSize:10, color:C.textLt, marginBottom:4, fontWeight:700 }}>{q.label.toUpperCase()}</div>
                      <div style={{ fontSize:22, fontWeight:800, color:aiColor(candidateAI[`${q.id}_pct`]) }}>{candidateAI[`${q.id}_pct`]??"-"}%</div>
                    </div>
                  ))}
                  <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:9, padding:"10px 16px", minWidth:100 }}>
                    <div style={{ fontSize:10, color:C.textLt, marginBottom:4, fontWeight:700 }}>OVERALL</div>
                    <div style={{ fontSize:22, fontWeight:800, color:aiColor(candidateAI.overall_pct) }}>{candidateAI.overall_pct??"-"}%</div>
                  </div>
                  <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:9, padding:"10px 16px", flex:2, minWidth:200 }}>
                    <div style={{ fontSize:10, color:C.textLt, marginBottom:4, fontWeight:700 }}>FLAGS</div>
                    <div style={{ fontSize:13, color:C.textMid, lineHeight:1.5 }}>{candidateAI.flags||"None detected"}</div>
                  </div>
                </div>
              ) : !detecting && <span style={{ color:C.textLt, fontSize:13 }}>Running analysis…</span>}
            </div>

            {/* Questions */}
            {QUESTIONS.map(q => {
              const existing = myScores.find(s=>s.candidate_id===selected.id&&s.question_id===q.id);
              const cur = existing?.score;
              return (
                <div key={q.id} style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:12, padding:24, marginBottom:12, boxShadow:"0 1px 4px rgba(0,0,0,0.03)" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 }}>
                    <div>
                      <div style={{ fontSize:11, color:C.navy, letterSpacing:2, fontWeight:700 }}>{q.label.toUpperCase()}</div>
                      <div style={{ fontSize:12, color:C.textLt, marginTop:2 }}>{q.sublabel}</div>
                    </div>
                    {cur!=null && (
                      <span style={{ background:C.navy, color:"#fff", borderRadius:20, padding:"4px 14px", fontSize:13, fontWeight:700 }}>
                        {cur}/4 — {SCORE_LABELS[cur]}
                      </span>
                    )}
                  </div>

                  {/* ANSWER TEXT — this is the key fix */}
                  <div style={{ fontSize:14, color:C.text, lineHeight:1.85, marginBottom:20, padding:"16px 18px", background:C.bg, borderRadius:9, borderLeft:`3px solid ${C.border}`, whiteSpace:"pre-wrap", wordBreak:"break-word" }}>
                    {selected[q.id] && selected[q.id].trim()
                      ? selected[q.id]
                      : <em style={{ color:C.textLt }}>No answer provided</em>}
                  </div>

                  <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                    <span style={{ fontSize:11, color:C.textLt, letterSpacing:2, marginRight:4, fontWeight:700 }}>SCORE</span>
                    {[0,1,2,3,4].map(n=>(
                      <button key={n} title={SCORE_LABELS[n]} onClick={()=>handleScore(selected.id,q.id,n)}
                        style={{ width:40, height:40, borderRadius:9, border:`1.5px solid ${cur===n?C.navy:C.border}`, background:cur===n?C.navy:"#fff", color:cur===n?"#fff":C.textMid, fontWeight:800, fontSize:16 }}>
                        {n}
                      </button>
                    ))}
                    {cur!=null && <span style={{ fontSize:13, color:C.navy, marginLeft:8, fontWeight:600 }}>{SCORE_LABELS[cur]}</span>}
                  </div>
                </div>
              );
            })}

            <button onClick={()=>{setSelected(null);setView("list");}}
              style={{ background:C.navy, color:"#fff", border:"none", borderRadius:9, padding:"12px 28px", fontSize:15, fontWeight:700, marginTop:8 }}>
              Save & Return →
            </button>
          </div>
        )}

        {/* ── RESULTS VIEW ── */}
        {candidates && view==="results" && (
          <div style={{ animation:"fadeUp 0.2s ease" }}>
            <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:24, gap:16 }}>
              <div>
                <h1 style={{ fontSize:26, fontWeight:800, color:C.navy, margin:0 }}>Results</h1>
                <p style={{ color:C.textMid, fontSize:13, marginTop:4 }}>
                  {revealed?"Rankings visible to all members":isPresident?"Preview — not yet revealed to members":"Locked until Co-Presidents reveal"}
                </p>
              </div>
              {isPresident && (
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ fontSize:13, color:C.textMid }}>Show top</span>
                  <input type="number" min={1} max={candidates.length} value={topN}
                    onChange={e=>handleTopN(Math.max(1,parseInt(e.target.value)||1))}
                    style={{ width:64, background:"#fff", border:`1px solid ${C.border}`, borderRadius:8, padding:"7px 10px", color:C.text, fontSize:15, textAlign:"center" }} />
                  <span style={{ fontSize:13, color:C.textMid }}>candidates</span>
                </div>
              )}
            </div>

            {!revealed && !isPresident ? (
              <div style={{ textAlign:"center", padding:"80px 20px" }}>
                <div style={{ fontSize:56 }}>🔒</div>
                <h3 style={{ color:C.textMid, margin:"16px 0 8px", fontSize:20 }}>Results are locked</h3>
                <p style={{ color:C.textLt, fontSize:14 }}>Co-Presidents will reveal results once all members complete their evaluations.</p>
              </div>
            ) : (
              <>
                {!revealed && isPresident && (
                  <div style={{ background:"#fffbeb", border:"1px solid #fcd34d", borderRadius:9, padding:"10px 16px", fontSize:13, color:"#92400e", marginBottom:18, fontWeight:600 }}>
                    ⚠️ Preview only — members still see locked screen
                  </div>
                )}
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {ranked.slice(0, isPresident?topN:ranked.length).map((c,i) => {
                    const ai   = aiScores[c.id];
                    const isTop = i<topN;
                    return (
                      <div key={c.id} style={{ display:"flex", alignItems:"center", gap:16, background:"#fff", border:`1px solid ${isTop?C.navyMid+"44":C.border}`, borderLeft:`4px solid ${isTop?C.navy:C.border}`, borderRadius:10, padding:"15px 22px", boxShadow:isTop?"0 2px 8px rgba(15,41,82,0.07)":"none" }}>
                        <div style={{ fontSize:15, color:isTop?C.navy:C.textLt, fontWeight:900, fontFamily:"monospace", width:36 }}>#{i+1}</div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontWeight:700, fontSize:15, color:C.text }}>Student #{c.student_number}</div>
                          <div style={{ fontSize:12, color:C.textLt, marginTop:2 }}>{c.email}</div>
                        </div>
                        <AiBadge pct={ai?.overall_pct??null} />
                        {c.cv_link && <a href={c.cv_link} target="_blank" rel="noopener noreferrer" style={{ color:C.accent, fontSize:12, textDecoration:"none", fontWeight:600 }}>CV ↗</a>}
                        <div style={{ textAlign:"right", minWidth:90 }}>
                          <div style={{ fontSize:28, fontWeight:900, color:scoreColor(parseFloat(c.avg)) }}>{c.avg??"-"}{c.avg?"%":""}</div>
                          <div style={{ fontSize:10, color:C.textLt, letterSpacing:1 }}>AVG SCORE</div>
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
