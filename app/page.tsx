"use client";

import React, { useState, useEffect, useCallback } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ─────────────────────────────────────────────
// CONFIGURATION SUPABASE
// ─────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const ORANGE = "#FF7900";
const ADMIN_CODE = "2026JOJDAKAR";

async function db(path: string, options: Record<string, any> = {}) {
  const { method = "GET", body, select, filter, order } = options;
  let url = `${SUPABASE_URL}/rest/v1/${path}`;
  const params = [];
  if (select) params.push(`select=${select}`);
  if (filter) params.push(filter);
  if (order)  params.push(`order=${order}`);
  if (params.length) url += "?" + params.join("&");

  const headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation",
  };

  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`Erreur Supabase`);
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

// ─────────────────────────────────────────────
// COMPOSANTS UI
// ─────────────────────────────────────────────
function AppHeader({ view, setView, onRequestAdmin }: any) {
  return (
    <header className="border-b-8 border-black bg-white sticky top-0 z-20 font-black">
      <div className="mx-auto px-6 py-4 flex items-center justify-between max-w-6xl">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-4 h-10" style={{ background: ORANGE }} />
            <span className="text-2xl tracking-tighter uppercase">JuryScore</span>
          </div>
          <nav className="hidden md:flex gap-2">
            <button onClick={() => setView("juror")} className="px-4 py-2 text-xs border-4 border-black uppercase" style={{background: view === "juror" ? ORANGE : "white"}}>Juré</button>
            <button onClick={() => setView("dashboard")} className="px-4 py-2 text-xs border-4 border-black uppercase" style={{background: view === "dashboard" ? ORANGE : "white"}}>Résultats</button>
          </nav>
        </div>
        <button onClick={onRequestAdmin} className="px-4 py-2 text-xs border-4 border-black uppercase font-black" style={{background: view === "admin" ? ORANGE : "white"}}>Admin</button>
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────
// VUE ADMIN
// ─────────────────────────────────────────────
function AdminView() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [currentSession, setCurrentSession] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [criteria, setCriteria] = useState<any[]>([]);
  const [jurors, setJurors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [newSess, setNewSess] = useState({ name: "", desc: "" });
  const [newProj, setNewProj] = useState("");
  const [newCrit, setNewCrit] = useState({ name: "", weight: "" });
  const [newJuror, setNewJuror] = useState("");

  const loadSessions = useCallback(async () => {
    const data = await db("sessions", { select: "*", order: "created_at.desc" });
    setSessions(data);
    if (data.length > 0 && !currentSession) setCurrentSession(data[0]);
    setLoading(false);
  }, [currentSession]);

  const loadDetails = useCallback(async () => {
    if (!currentSession) return;
    const [p, c, j] = await Promise.all([
      db("projects", { select: "*", filter: `session_id=eq.${currentSession.id}`, order: "created_at.asc" }),
      db("criteria", { select: "*", filter: `session_id=eq.${currentSession.id}`, order: "created_at.asc" }),
      db("session_jurors", { select: "*", filter: `session_id=eq.${currentSession.id}`, order: "created_at.asc" })
    ]);
    setProjects(p); setCriteria(c); setJurors(j);
  }, [currentSession]);

  useEffect(() => { loadSessions(); }, [loadSessions]);
  useEffect(() => { loadDetails(); }, [loadDetails]);

  const handleCreateSess = async () => {
    if (!newSess.name) return;
    await db("sessions", { method: "POST", body: { name: newSess.name, description: newSess.desc, is_active: true } });
    setNewSess({ name: "", desc: "" }); loadSessions();
  };
  const handleAddProj = async () => {
    await db("projects", { method: "POST", body: { name: newProj, session_id: currentSession.id } });
    setNewProj(""); loadDetails();
  };
  const handleAddCrit = async () => {
    if (!newCrit.name || !newCrit.weight) return;
    await db("criteria", { method: "POST", body: { name: newCrit.name, weight: parseFloat(newCrit.weight), session_id: currentSession.id } });
    setNewCrit({ name: "", weight: "" }); loadDetails();
  };
  const handleAddJuror = async () => {
    await db("session_jurors", { method: "POST", body: { full_name: newJuror, session_id: currentSession.id } });
    setNewJuror(""); loadDetails();
  };
  const deleteSess = async (id: string) => { if (confirm("Supprimer cette session ?")) { await db(`sessions?id=eq.${id}`, { method: "DELETE" }); loadSessions(); } };
  const deleteItem = async (table: string, id: string) => { await db(`${table}?id=eq.${id}`, { method: "DELETE" }); loadDetails(); };

  const totalWeight = criteria.reduce((sum, c) => sum + parseFloat(c.weight || 0), 0);

  if (loading) return <div className="p-20 text-center font-black">SYNCHRONISATION...</div>;

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 font-black text-black">
      <div className="border-8 border-black p-6 bg-white mb-10 shadow-[10px_10px_0px_0px_rgba(0,0,0,1)]">
        <h2 className="text-xl mb-6 uppercase italic border-b-4 border-black pb-2">01. Sessions de Jury</h2>
        <div className="flex flex-wrap gap-4 mb-8">
          {sessions.map(s => (
            <div key={s.id} className="relative group">
              <button onClick={() => setCurrentSession(s)} className="px-6 py-3 border-4 border-black text-xs uppercase" style={{ background: currentSession?.id === s.id ? ORANGE : "white" }}>
                {s.name}
              </button>
              <button onClick={() => deleteSess(s.id)} className="absolute -top-2 -right-2 bg-red-600 text-white w-5 h-5 border-2 border-black flex items-center justify-center text-[10px]">✕</button>
            </div>
          ))}
        </div>
        <div className="grid gap-2">
          <input value={newSess.name} onChange={(e)=>setNewSess({...newSess, name:e.target.value})} placeholder="NOM (EX: JURY A)" className="border-4 border-black p-3 text-xs outline-none uppercase bg-gray-50" />
          <input value={newSess.desc} onChange={(e)=>setNewSess({...newSess, desc:e.target.value})} placeholder="DESCRIPTION" className="border-4 border-black p-3 text-xs outline-none uppercase" />
          <button onClick={handleCreateSess} className="bg-black text-white p-3 border-4 border-black uppercase text-xs">Créer la session</button>
        </div>
      </div>

      {currentSession && (
        <div className="grid md:grid-cols-3 gap-6">
          <div className="border-8 border-black p-4 bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
            <h3 className="text-sm mb-4 border-b-4 border-black pb-2 uppercase italic">Jurés</h3>
            <div className="space-y-2 mb-4">
              {jurors.map(j => (<div key={j.id} className="p-2 border-4 border-black flex justify-between bg-gray-50 text-[10px] uppercase"><span>{j.full_name}</span><button onClick={()=>deleteItem("session_jurors", j.id)} className="text-red-600">✕</button></div>))}
            </div>
            <div className="flex gap-1"><input value={newJuror} onChange={(e)=>setNewJuror(e.target.value)} placeholder="NOM" className="flex-1 border-4 border-black p-2 text-[10px] outline-none" /><button onClick={handleAddJuror} className="bg-black text-white px-3 border-4 border-black text-[10px]">OK</button></div>
          </div>
          <div className="border-8 border-black p-4 bg-white shadow-[8px_8px_0px_0px_rgba(255,121,0,1)]">
            <h3 className="text-sm mb-4 border-b-4 border-black pb-2 uppercase italic">Projets</h3>
            <div className="space-y-2 mb-4">
              {projects.map(p => (<div key={p.id} className="p-2 border-4 border-black flex justify-between bg-gray-50 text-[10px] uppercase"><span>{p.name}</span><button onClick={()=>deleteItem("projects", p.id)} className="text-red-600">✕</button></div>))}
            </div>
            <div className="flex gap-1"><input value={newProj} onChange={(e)=>setNewProj(e.target.value)} placeholder="ÉQUIPE" className="flex-1 border-4 border-black p-2 text-[10px] outline-none" /><button onClick={handleAddProj} className="bg-black text-white px-3 border-4 border-black text-[10px]">OK</button></div>
          </div>
          <div className="border-8 border-black p-4 bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex justify-between items-center mb-4 border-b-4 border-black pb-2">
                <h3 className="text-sm uppercase italic">Barème</h3>
                <span className="text-[10px] px-2 py-1 border-2 border-black" style={{background: totalWeight === 100 ? "#4ade80" : "#fb7185"}}>{totalWeight}/100</span>
            </div>
            <div className="space-y-2 mb-4">
              {criteria.map(c => (<div key={c.id} className="p-2 border-4 border-black flex justify-between bg-gray-50 text-[10px] uppercase"><span>{c.name} ({c.weight})</span><button onClick={()=>deleteItem("criteria", c.id)} className="text-red-600">✕</button></div>))}
            </div>
            <div className="flex flex-col gap-1"><input value={newCrit.name} onChange={(e)=>setNewCrit({...newCrit, name:e.target.value})} placeholder="CRITÈRE" className="border-4 border-black p-2 text-[10px] outline-none" /><div className="flex gap-1"><input type="number" value={newCrit.weight} onChange={(e)=>setNewCrit({...newCrit, weight:e.target.value})} placeholder="POIDS" className="flex-1 border-4 border-black p-2 text-[10px] outline-none" /><button onClick={handleAddCrit} className="bg-black text-white px-4 border-4 border-black text-[10px]">OK</button></div></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// VUE JURÉ
// ─────────────────────────────────────────────
function JurorView() {
  const [step, setStep] = useState("select_session");
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [sessionJurors, setSessionJurors] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [criteria, setCriteria] = useState<any[]>([]);
  const [votedProjectIds, setVotedProjectIds] = useState<string[]>([]);
  
  const [jurorName, setJurorName] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [scores, setScores] = useState<Record<string, number>>({});

  useEffect(() => {
    (async () => {
      const data = await db("sessions", { select: "*", order: "created_at.desc" });
      setSessions(data);
    })();
  }, []);

  const handlePickSession = async (sess: any) => {
    setSelectedSession(sess);
    const [j, p, c] = await Promise.all([
      db("session_jurors", { select: "*", filter: `session_id=eq.${sess.id}`, order: "full_name.asc" }),
      db("projects", { select: "*", filter: `session_id=eq.${sess.id}`, order: "created_at.asc" }),
      db("criteria", { select: "*", filter: `session_id=eq.${sess.id}`, order: "created_at.asc" })
    ]);
    setSessionJurors(j); setProjects(p); setCriteria(c);
    setStep("select_name");
  };

  const handleCheckProgress = async () => {
    const votes = await db("scores", { select: "project_id", filter: `session_id=eq.${selectedSession.id}&juror_name=eq.${jurorName}` });
    setVotedProjectIds(votes.map((v: any) => v.project_id));
    setStep("briefing");
  };

  const submitVote = async () => {
    const rows = criteria.map(c => ({ session_id: selectedSession.id, project_id: selectedProjectId, criteria_id: c.id, juror_name: jurorName, score: scores[c.id] || 5 }));
    await db("scores", { method: "POST", body: rows });
    setVotedProjectIds([...votedProjectIds, selectedProjectId]);
    setStep("thanks");
  };

  return (
    <div className="max-w-xl mx-auto px-6 py-12 font-black text-black">
      {step === "select_session" && (
        <div className="space-y-8"><h1 className="text-4xl uppercase italic border-b-8 border-black pb-4">Choisir Session</h1><div className="grid gap-4">{sessions.map(s => (<button key={s.id} onClick={() => handlePickSession(s)} className="p-6 border-8 border-black bg-white text-left shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] uppercase text-xl font-black">{s.name}</button>))}</div></div>
      )}
      {step === "select_name" && (
        <div className="space-y-8"><h1 className="text-4xl uppercase italic border-b-8 border-black pb-4">Qui êtes-vous ?</h1><select value={jurorName} onChange={(e) => setJurorName(e.target.value)} className="w-full border-8 border-black p-5 text-xl bg-white appearance-none uppercase font-black"><option value="">-- SÉLECTIONNER NOM --</option>{sessionJurors.map(j => <option key={j.id} value={j.full_name}>{j.full_name}</option>)}</select><button disabled={!jurorName} onClick={handleCheckProgress} className="w-full p-6 text-white border-8 border-black text-2xl shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] uppercase italic" style={{backgroundColor: ORANGE}}>Continuer</button></div>
      )}
      {step === "briefing" && (
        <div className="border-8 border-black p-8 bg-white shadow-[15px_15px_0px_0px_rgba(0,0,0,1)] space-y-6 text-center"><h1 className="text-4xl uppercase italic leading-none">{selectedSession?.name}</h1><p className="p-4 border-4 border-black bg-gray-50 uppercase text-xs italic">{selectedSession?.description || "Prêt pour le vote ?"}</p><button onClick={() => setStep("select_project")} className="w-full p-6 bg-black text-white text-2xl uppercase border-4 border-black hover:bg-orange-500">Démarrer</button></div>
      )}
      {step === "select_project" && (
        <div className="space-y-8"><h1 className="text-4xl uppercase italic border-b-8 border-black pb-4">Projets</h1><div className="grid gap-4">{projects.map(p => { const isVoted = votedProjectIds.includes(p.id); return (<button key={p.id} disabled={isVoted} onClick={() => { setSelectedProjectId(p.id); setStep("scoring"); }} className={`p-6 border-8 border-black text-left transition-all uppercase text-xl font-black flex justify-between items-center ${isVoted ? 'bg-gray-200 opacity-30 grayscale cursor-not-allowed shadow-none' : 'bg-white shadow-[8px_8px_0px_0px_rgba(255,121,0,1)] hover:translate-x-1'}`}><span className={isVoted ? 'line-through' : ''}>{p.name}</span>{isVoted && <span className="text-[10px]">✓ NOTÉ</span>}</button>); })}</div></div>
      )}
      {step === "scoring" && (
        <div className="space-y-8"><div className="bg-black text-white p-4 border-8 border-black text-center uppercase text-xl italic">{projects.find(p => p.id === selectedProjectId)?.name}</div><div className="space-y-6">{criteria.map(c => (<div key={c.id} className="border-8 border-black p-6 bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] space-y-4"><div className="flex justify-between items-center uppercase"><span className="text-xs">{c.name}</span><span className="text-3xl" style={{color: ORANGE}}>{scores[c.id] || 5}/10</span></div><input type="range" min="0" max="10" step="1" value={scores[c.id] || 5} onChange={(e) => setScores({...scores, [c.id]: parseInt(e.target.value)})} className="w-full accent-orange-500 cursor-pointer" /></div>))}</div><button onClick={() => setStep("review")} className="w-full p-6 text-white border-8 border-black text-2xl shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] uppercase italic" style={{backgroundColor: ORANGE}}>Vérifier</button></div>
      )}
      {step === "review" && (
        <div className="border-8 border-black p-8 bg-white shadow-[15px_15px_0px_0px_rgba(0,0,0,1)] space-y-8"><h2 className="text-2xl uppercase italic border-b-4 border-black pb-2">Récapitulatif</h2><div className="space-y-2">{criteria.map(c => (<div key={c.id} className="flex justify-between text-xs border-b-2 border-black pb-1 uppercase italic"><span>{c.name}</span><span className="font-black text-orange-500">{scores[c.id] || 5}/10</span></div>))}</div><button onClick={submitVote} className="w-full p-6 bg-black text-white text-2xl border-4 border-black uppercase shadow-[8px_8px_0px_0px_rgba(255,121,0,1)]">Confirmer</button></div>
      )}
      {step === "thanks" && (<div className="text-center py-20 space-y-10"><div className="text-9xl animate-bounce">🏆</div><h1 className="text-4xl uppercase italic font-black">Vote Envoyé !</h1><button onClick={() => { setStep("select_project"); setScores({}); }} className="px-8 py-4 border-8 border-black bg-white uppercase text-sm shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">Suivant</button></div>)}
    </div>
  );
}

// ─────────────────────────────────────────────
// VUE DASHBOARD
// ─────────────────────────────────────────────
function DashboardView() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [rankings, setRankings] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const data = await db("sessions", { select: "*", order: "created_at.desc" });
      setSessions(data);
      if (data.length > 0) handlePickSession(data[0]);
    })();
  }, []);

  const handlePickSession = async (sess: any) => {
    setLoading(true); setSelectedSession(sess);
    const scoresData = await db("scores", { select: "project_id,score,criteria(weight),projects(name)", filter: `session_id=eq.${sess.id}` });
    const map: Record<string, any> = {};
    scoresData.forEach((v: any) => {
      const pid = v.project_id;
      const w = parseFloat(v.criteria?.weight ?? 1);
      const s = parseFloat(v.score);
      if (!map[pid]) map[pid] = { name: v.projects?.name, weightedSum: 0, maxPossible: 0, votesCount: 0 };
      map[pid].weightedSum += s * w;
      map[pid].maxPossible += 10 * w;
      map[pid].votesCount += 1;
    });
    setRankings(Object.values(map).map((r: any) => ({ ...r, finalScore: r.maxPossible > 0 ? (r.weightedSum / r.maxPossible) * 100 : 0 })).sort((a,b) => b.finalScore - a.finalScore));
    setLoading(false);
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.text(`RÉSULTATS : ${selectedSession.name}`, 14, 15);
    autoTable(doc, { head: [['Rang', 'Projet', 'Score (%)', 'Votes']], body: rankings.map((r, i) => [i + 1, r.name, `${r.finalScore.toFixed(2)}%`, r.votesCount]), startY: 25 });
    doc.save(`JOJ_2026_${selectedSession.name}.pdf`);
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 font-black text-black">
      <div className="flex flex-wrap gap-4 mb-10 border-b-8 border-black pb-6">{sessions.map(s => (<button key={s.id} onClick={() => handlePickSession(s)} className="px-4 py-2 border-4 border-black text-[10px] uppercase" style={{ background: selectedSession?.id === s.id ? ORANGE : "white" }}>{s.name}</button>))}</div>
      {loading ? (<div className="p-20 text-center animate-pulse italic uppercase">Calcul...</div>) : (
        <div className="space-y-10"><div className="flex justify-between items-end"><h1 className="text-4xl uppercase italic">{selectedSession?.name}</h1><button onClick={exportPDF} className="bg-black text-white px-6 py-2 border-4 border-black text-xs uppercase shadow-[4px_4px_0px_0px_rgba(255,121,0,1)]">PDF</button></div>
          <div className="border-8 border-black bg-white shadow-[15px_15px_0px_0px_rgba(0,0,0,1)]">{rankings.map((r, i) => (<div key={i} className="flex justify-between items-center p-6 border-b-4 border-black last:border-b-0 hover:bg-gray-50"><div className="flex items-center gap-6"><span className="text-4xl opacity-20 italic">#{i+1}</span><span className="text-xl uppercase tracking-tighter">{r.name}</span></div><div className="text-right"><div className="text-4xl" style={{color: i === 0 ? ORANGE : "black"}}>{r.finalScore.toFixed(2)}%</div><div className="text-[10px] uppercase opacity-50">{r.votesCount} points</div></div></div>))}</div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// APP PRINCIPALE
// ─────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState("admin");
  const [showLock, setShowLock] = useState(false);
  const [code, setCode] = useState("");
  return (
    <div className="min-h-screen bg-[#f0f0f0] text-black font-black">
      <AppHeader view={view} setView={setView} onRequestAdmin={() => setShowLock(true)} />
      {showLock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
          <div className="bg-white p-8 border-8 border-black max-w-sm w-full shadow-[15px_15px_0px_0px_rgba(255,121,0,1)]">
            <h2 className="text-xl mb-6 uppercase italic">Accès Admin</h2>
            <input type="password" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e)=>e.key==="Enter" && (code === ADMIN_CODE ? (setView("admin"), setShowLock(false)) : alert("FAUX"))} className="w-full border-8 border-black p-4 mb-4 text-center text-3xl outline-none" />
            <button onClick={() => { if(code === ADMIN_CODE) { setView("admin"); setShowLock(false); } else { alert("CODE FAUX"); } }} className="w-full bg-black text-white p-4 font-black uppercase">Entrer</button>
          </div>
        </div>
      )}
      <main>
        {view === "admin" && <AdminView />}
        {view === "juror" && <JurorView />}
        {view === "dashboard" && <DashboardView />}
      </main>
    </div>
  );
}