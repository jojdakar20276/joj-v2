"use client";

import React, { useState, useEffect, useCallback } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

// ─────────────────────────────────────────────
// CONFIGURATION SUPABASE & CODES
// ─────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const ORANGE = "#FF7900";
const ADMIN_CODE = "2026JOJDAKAR"; // Ton mot de passe unique

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
function AppHeader({ view, setView, isAuthorized, onRequestAdmin }: any) {
  return (
    <header className="border-b-8 border-black bg-white sticky top-0 z-20 font-black">
      <div className="mx-auto px-6 py-4 flex items-center justify-between max-w-6xl text-black">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-4 h-10" style={{ background: ORANGE }} />
            <span className="text-2xl tracking-tighter uppercase">JuryScore</span>
          </div>
          <nav className="hidden md:flex gap-2">
            <button onClick={() => setView("juror")} className="px-4 py-2 text-xs border-4 border-black uppercase" style={{background: view === "juror" ? ORANGE : "white"}}>Juré</button>
            {/* Le bouton résultats n'apparaît que si on est autorisé */}
            {isAuthorized && (
              <button onClick={() => setView("dashboard")} className="px-4 py-2 text-xs border-4 border-black uppercase" style={{background: view === "dashboard" ? ORANGE : "white"}}>Résultats</button>
            )}
          </nav>
        </div>
        <button onClick={onRequestAdmin} className="px-4 py-2 text-xs border-4 border-black uppercase font-black" style={{background: isAuthorized ? ORANGE : "white"}}>
          {isAuthorized ? " Bunker Admin" : "Accès Admin"}
        </button>
      </div>
    </header>
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
  const [pastScores, setPastScores] = useState<any[]>([]);
  const [jurorName, setJurorName] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [scores, setScores] = useState<Record<string, number>>({});

  useEffect(() => {
    (async () => {
      const data = await db("sessions", { select: "*", order: "created_at.desc" });
      setSessions(data);
    })();
  }, []);

  const loadJurorData = async (sessId: string, name: string) => {
    const votes = await db("scores", { select: "*,criteria(name, weight)", filter: `session_id=eq.${sessId}&juror_name=eq.${name}` });
    setPastScores(votes);
    setVotedProjectIds(Array.from(new Set(votes.map((v: any) => v.project_id))));
  };

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

  const getMyProjectPercent = (pid: string) => {
    let weighted = 0, max = 0;
    pastScores.filter(s => s.project_id === pid).forEach(s => {
      weighted += s.score * (s.criteria?.weight || 1);
      max += 10 * (s.criteria?.weight || 1);
    });
    return max > 0 ? (weighted / max * 100).toFixed(3) : "0.000";
  };

  const handleViewPastVote = (pid: string) => {
    setSelectedProjectId(pid);
    const relevant: Record<string, number> = {};
    pastScores.filter(s => s.project_id === pid).forEach(s => { relevant[s.criteria_id] = s.score; });
    setScores(relevant);
    setStep("view_only");
  };

  const submitVote = async () => {
    const rows = criteria.map(c => ({ session_id: selectedSession.id, project_id: selectedProjectId, criteria_id: c.id, juror_name: jurorName, score: scores[c.id] || 5 }));
    await db("scores", { method: "POST", body: rows });
    await loadJurorData(selectedSession.id, jurorName);
    setStep("thanks");
  };

  return (
    <div className="max-w-xl mx-auto px-6 py-12 font-black text-black">
      {step === "select_session" && (<div className="space-y-8"><h1 className="text-4xl uppercase italic border-b-8 border-black pb-4">Session</h1><div className="grid gap-4">{sessions.map(s => (<button key={s.id} onClick={() => handlePickSession(s)} className="p-6 border-8 border-black bg-white text-left shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] uppercase text-xl font-black">{s.name}</button>))}</div></div>)}
      {step === "select_name" && (<div className="space-y-8"><h1 className="text-4xl uppercase italic border-b-8 border-black pb-4">Identité</h1><select value={jurorName} onChange={(e) => setJurorName(e.target.value)} className="w-full border-8 border-black p-5 text-xl bg-white uppercase font-black font-black"><option value="">-- VOTRE NOM --</option>{sessionJurors.map(j => <option key={j.id} value={j.full_name}>{j.full_name}</option>)}</select><button disabled={!jurorName} onClick={() => { loadJurorData(selectedSession.id, jurorName); setStep("briefing"); }} className="w-full p-6 text-white border-8 border-black text-2xl shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] uppercase italic" style={{backgroundColor: ORANGE}}>Entrer</button></div>)}
      {step === "briefing" && (<div className="border-8 border-black p-8 bg-white shadow-[15px_15px_0px_0px_rgba(0,0,0,1)] space-y-6 text-center"><h1 className="text-4xl uppercase italic leading-none">{selectedSession?.name}</h1><p className="p-4 border-4 border-black bg-gray-50 uppercase text-xs italic">{selectedSession?.description || "Prêt ?"}</p><button onClick={() => setStep("select_project")} className="w-full p-6 bg-black text-white text-2xl uppercase border-4 border-black hover:bg-orange-500">Accéder aux projets</button></div>)}
      {step === "select_project" && (<div className="space-y-8"><h1 className="text-4xl uppercase italic border-b-8 border-black pb-4 text-black">Projets</h1><div className="grid gap-4">{projects.map(p => { const isVoted = votedProjectIds.includes(p.id); return (<div key={p.id} className={`p-6 border-8 border-black flex justify-between items-center ${isVoted ? 'bg-gray-100 opacity-60' : 'bg-white shadow-[8px_8px_0px_0px_rgba(255,121,0,1)]'}`}><div className="flex flex-col"><span className={`uppercase text-xl font-black ${isVoted ? 'line-through opacity-30 text-black' : ''}`}>{p.name}</span>{isVoted && <span className="text-[10px] text-orange-500 font-black">SCORE : {getMyProjectPercent(p.id)}%</span>}</div>{isVoted ? (<button onClick={() => handleViewPastVote(p.id)} className="px-4 py-2 border-4 border-black text-[10px] uppercase font-black bg-white hover:bg-black hover:text-white">Détails</button>) : (<button onClick={() => { setSelectedProjectId(p.id); setStep("scoring"); }} className="px-4 py-2 bg-black text-white border-4 border-black text-[10px] uppercase font-black">Noter</button>)}</div>); })}</div></div>)}
      {step === "scoring" && (<div className="space-y-8"><div className="bg-black text-white p-4 border-8 border-black text-center uppercase text-xl italic">{projects.find(p => p.id === selectedProjectId)?.name}</div><div className="space-y-6">{criteria.map(c => (<div key={c.id} className="border-8 border-black p-6 bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] space-y-4 text-black"><div className="flex justify-between items-center uppercase"><span className="text-xs">{c.name}</span><span className="text-3xl" style={{color: ORANGE}}>{scores[c.id] || 5}/10</span></div><input type="range" min="0" max="10" step="1" value={scores[c.id] || 5} onChange={(e) => setScores({...scores, [c.id]: parseInt(e.target.value)})} className="w-full accent-orange-500 cursor-pointer" /></div>))}</div><button onClick={() => setStep("review")} className="w-full p-6 text-white border-8 border-black text-2xl shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] uppercase italic" style={{backgroundColor: ORANGE}}>Vérifier</button></div>)}
      {step === "view_only" && (<div className="space-y-8 animate-in fade-in duration-500 text-black"><div className="bg-black text-white p-4 border-8 border-black text-center uppercase text-xl italic flex justify-between items-center"><span>{projects.find(p => p.id === selectedProjectId)?.name}</span><span className="text-[10px] bg-white text-black px-2 font-black">{getMyProjectPercent(selectedProjectId)}%</span></div><div className="space-y-4">{criteria.map(c => (<div key={c.id} className="border-4 border-black p-4 flex justify-between items-center bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] uppercase font-black"><span className="text-[10px]">{c.name}</span><span className="text-xl font-black">{scores[c.id] || "-"}/10</span></div>))}</div><button onClick={() => setStep("select_project")} className="w-full p-6 bg-black text-white text-2xl border-8 border-black uppercase shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] font-black">Retour</button><p className="text-[10px] text-center uppercase opacity-50 italic">Contactez l'administrateur pour une correction.</p></div>)}
      {step === "review" && (<div className="border-8 border-black p-8 bg-white shadow-[15px_15px_0px_0px_rgba(0,0,0,1)] space-y-8 text-black"><h2 className="text-2xl uppercase italic border-b-4 border-black pb-2 font-black">Récapitulatif</h2><div className="space-y-2">{criteria.map(c => (<div key={c.id} className="flex justify-between text-xs border-b-2 border-black pb-1 uppercase italic font-black"><span>{c.name}</span><span className="font-black text-orange-500">{scores[c.id] || 5}/10</span></div>))}</div><button onClick={submitVote} className="w-full p-6 bg-black text-white text-2xl border-4 border-black uppercase shadow-[8px_8px_0px_0px_rgba(255,121,0,1)] font-black">Confirmer</button></div>)}
      {step === "thanks" && (<div className="text-center py-20 space-y-10 text-black"><div className="text-9xl animate-bounce">🏆</div><h1 className="text-4xl uppercase italic font-black">Vote Envoyé !</h1><button onClick={() => setStep("select_project")} className="px-8 py-4 border-8 border-black bg-white uppercase text-sm shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] font-black">Suivant</button></div>)}
    </div>
  );
}

// ─────────────────────────────────────────────
// VUE ADMIN (POUVOIR TOTAL)
// ─────────────────────────────────────────────
function AdminView() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [currentSession, setCurrentSession] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [criteria, setCriteria] = useState<any[]>([]);
  const [jurors, setJurors] = useState<any[]>([]);
  const [allScores, setAllScores] = useState<any[]>([]);
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
    const [p, c, j, s] = await Promise.all([
      db("projects", { select: "*", filter: `session_id=eq.${currentSession.id}`, order: "created_at.asc" }),
      db("criteria", { select: "*", filter: `session_id=eq.${currentSession.id}`, order: "created_at.asc" }),
      db("session_jurors", { select: "*", filter: `session_id=eq.${currentSession.id}`, order: "created_at.asc" }),
      db("scores", { select: "*,criteria(name),projects(name)", filter: `session_id=eq.${currentSession.id}`, order: "created_at.desc" })
    ]);
    setProjects(p); setCriteria(c); setJurors(j); setAllScores(s);
  }, [currentSession]);

  useEffect(() => { loadSessions(); }, [loadSessions]);
  useEffect(() => { loadDetails(); }, [loadDetails]);

  const handleUpdateScore = async (id: string, currentVal: number) => {
    const newVal = prompt("NOUVELLE NOTE (0-10) :", currentVal.toString());
    if (newVal === null || isNaN(parseFloat(newVal))) return;
    await db(`scores?id=eq.${id}`, { method: "PATCH", body: { score: parseFloat(newVal) } });
    loadDetails();
  };
  const handleDeleteScore = async (id: string) => { if (confirm("EFFACER ?")) { await db(`scores?id=eq.${id}`, { method: "DELETE" }); loadDetails(); } };
  const handleCreateSess = async () => { if (!newSess.name) return; await db("sessions", { method: "POST", body: { name: newSess.name, description: newSess.desc, is_active: true } }); setNewSess({ name: "", desc: "" }); loadSessions(); };
  const handleAddProj = async () => { await db("projects", { method: "POST", body: { name: newProj, session_id: currentSession.id } }); setNewProj(""); loadDetails(); };
  const handleAddCrit = async () => { if (!newCrit.name || !newCrit.weight) return; await db("criteria", { method: "POST", body: { name: newCrit.name, weight: parseFloat(newCrit.weight), session_id: currentSession.id } }); setNewCrit({ name: "", weight: "" }); loadDetails(); };
  const handleAddJuror = async () => { await db("session_jurors", { method: "POST", body: { full_name: newJuror, session_id: currentSession.id } }); setNewJuror(""); loadDetails(); };
  const deleteItem = async (table: string, id: string) => { await db(`${table}?id=eq.${id}`, { method: "DELETE" }); loadDetails(); };
  const deleteSess = async (id: string) => { if (confirm("SUPPRIMER SESSION ?")) { await db(`sessions?id=eq.${id}`, { method: "DELETE" }); loadSessions(); } };
  const totalWeight = criteria.reduce((sum, c) => sum + parseFloat(c.weight || 0), 0);

  if (loading) return <div className="p-20 text-center font-black uppercase italic text-black">Synchro Admin...</div>;
  return (
    <div className="max-w-6xl mx-auto px-6 py-10 font-black text-black">
      <div className="border-8 border-black p-6 bg-white mb-10 shadow-[10px_10px_0px_0px_rgba(0,0,0,1)]">
        <h2 className="text-xl mb-6 uppercase italic border-b-4 border-black pb-2 text-black font-black">Sessions actives</h2>
        <div className="flex flex-wrap gap-4 mb-8">
          {sessions.map(s => (<div key={s.id} className="relative group"><button onClick={() => setCurrentSession(s)} className="px-6 py-3 border-4 border-black text-xs uppercase font-black" style={{ background: currentSession?.id === s.id ? ORANGE : "white" }}>{s.name}</button><button onClick={() => deleteSess(s.id)} className="absolute -top-2 -right-2 bg-red-600 text-white w-5 h-5 border-2 border-black flex items-center justify-center text-[10px] font-black">✕</button></div>))}
        </div>
        <div className="grid gap-2"><input value={newSess.name} onChange={(e)=>setNewSess({...newSess, name:e.target.value})} placeholder="NOM" className="border-4 border-black p-3 text-xs outline-none uppercase bg-gray-50 font-black text-black" /><button onClick={handleCreateSess} className="bg-black text-white p-3 border-4 border-black uppercase text-xs font-black">Créer</button></div>
      </div>
      {currentSession && (
        <div className="space-y-10">
          <div className="grid md:grid-cols-3 gap-6 text-black">
            <div className="border-8 border-black p-4 bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"><h3 className="text-sm mb-4 border-b-4 border-black pb-2 uppercase italic font-black">Jurés</h3><div className="space-y-2 mb-4">{jurors.map(j => (<div key={j.id} className="p-2 border-4 border-black flex justify-between bg-gray-50 text-[10px] uppercase font-black"><span>{j.full_name}</span><button onClick={()=>deleteItem("session_jurors", j.id)} className="text-red-600">✕</button></div>))}</div><div className="flex gap-1"><input value={newJuror} onChange={(e)=>setNewJuror(e.target.value)} placeholder="NOM" className="flex-1 border-4 border-black p-2 text-[10px] font-black text-black" /><button onClick={handleAddJuror} className="bg-black text-white px-3 border-4 border-black text-[10px] font-black font-black">OK</button></div></div>
            <div className="border-8 border-black p-4 bg-white shadow-[8px_8px_0px_0px_rgba(255,121,0,1)]"><h3 className="text-sm mb-4 border-b-4 border-black pb-2 uppercase italic font-black">Projets</h3><div className="space-y-2 mb-4">{projects.map(p => (<div key={p.id} className="p-2 border-4 border-black flex justify-between bg-gray-50 text-[10px] uppercase font-black"><span>{p.name}</span><button onClick={()=>deleteItem("projects", p.id)} className="text-red-600">✕</button></div>))}</div><div className="flex gap-1"><input value={newProj} onChange={(e)=>setNewProj(e.target.value)} placeholder="ÉQUIPE" className="flex-1 border-4 border-black p-2 text-[10px] font-black text-black" /><button onClick={handleAddProj} className="bg-black text-white px-3 border-4 border-black text-[10px] font-black font-black">OK</button></div></div>
            <div className="border-8 border-black p-4 bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"><div className="flex justify-between items-center mb-4 border-b-4 border-black pb-2"><h3 className="text-sm uppercase italic font-black">Barème</h3><span className="text-[10px] px-2 py-1 border-2 border-black font-black" style={{background: totalWeight === 100 ? "#4ade80" : "#fb7185"}}>{totalWeight}/100</span></div><div className="space-y-2 mb-4">{criteria.map(c => (<div key={c.id} className="p-2 border-4 border-black flex justify-between bg-gray-50 text-[10px] uppercase font-black"><span>{c.name} ({c.weight})</span><button onClick={()=>deleteItem("criteria", c.id)} className="text-red-600 font-black">✕</button></div>))}</div><div className="flex flex-col gap-1"><input value={newCrit.name} onChange={(e)=>setNewCrit({...newCrit, name:e.target.value})} placeholder="CRITÈRE" className="border-4 border-black p-2 text-[10px] font-black text-black" /><div className="flex gap-1"><input type="number" value={newCrit.weight} onChange={(e)=>setNewCrit({...newCrit, weight:e.target.value})} placeholder="POIDS" className="flex-1 border-4 border-black p-2 text-[10px] font-black text-black" /><button onClick={handleAddCrit} className="bg-black text-white px-4 border-4 border-black text-[10px] font-black font-black">OK</button></div></div></div>
          </div>
          <div className="border-8 border-black p-6 bg-white shadow-[15px_15px_0px_0px_rgba(0,0,0,1)] overflow-x-auto text-black">
            <h3 className="text-xl mb-6 border-b-8 border-black pb-2 uppercase italic tracking-tighter font-black">Audit & Correction des votes</h3>
            <table className="w-full text-left border-collapse text-black">
              <thead><tr className="bg-black text-white text-[10px] uppercase italic"><th className="p-4">Juré</th><th className="p-4">Projet</th><th className="p-4">Critère</th><th className="p-4">Note</th><th className="p-4 text-right font-black">Actions</th></tr></thead>
              <tbody className="text-xs uppercase font-black">{allScores.map(s => (<tr key={s.id} className="border-b-2 border-black hover:bg-gray-50"><td className="p-4">{s.juror_name}</td><td className="p-4 italic">{s.projects?.name}</td><td className="p-4 opacity-70">{s.criteria?.name}</td><td className="p-4 text-xl font-black text-orange-500">{s.score}</td><td className="p-4 text-right space-x-2"><button onClick={() => handleUpdateScore(s.id, s.score)} className="p-2 border-2 border-black font-black hover:bg-black hover:text-white transition-all font-black">📝</button><button onClick={() => handleDeleteScore(s.id)} className="p-2 border-2 border-black font-black hover:bg-red-600 hover:text-white transition-all font-black">🗑️</button></td></tr>))}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// VUE DASHBOARD (POUR ADMINS UNIQUEMENT)
// ─────────────────────────────────────────────
function DashboardView() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [rankings, setRankings] = useState<any[]>([]);
  const [detailedVotes, setDetailedVotes] = useState<any[]>([]);
  const [criteriaList, setCriteriaList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => { (async () => { const data = await db("sessions", { select: "*", order: "created_at.desc" }); setSessions(data); if (data.length > 0) handlePickSession(data[0]); })(); }, []);
  
  const handlePickSession = async (sess: any) => {
    setLoading(true); setSelectedSession(sess);
    const [scoresData, sessionCriteria] = await Promise.all([ db("scores", { select: "project_id,score,juror_name,criteria(name,weight),projects(name)", filter: `session_id=eq.${sess.id}` }), db("criteria", { select: "name,weight", filter: `session_id=eq.${sess.id}`, order: "created_at.asc" }) ]);
    setCriteriaList(sessionCriteria);
    const rankMap: Record<string, any> = {};
    scoresData.forEach((v: any) => { const pid = v.project_id; const w = parseFloat(v.criteria?.weight ?? 1); const s = parseFloat(v.score); if (!rankMap[pid]) rankMap[pid] = { name: v.projects?.name, weightedSum: 0, maxPossible: 0, votesCount: 0 }; rankMap[pid].weightedSum += s * w; rankMap[pid].maxPossible += 10 * w; rankMap[pid].votesCount += 1; });
    setRankings(Object.values(rankMap).map((r: any) => ({ ...r, finalScore: r.maxPossible > 0 ? (r.weightedSum / r.maxPossible) * 100 : 0 })).sort((a,b) => b.finalScore - a.finalScore));
    const detailedMap: Record<string, any> = {};
    scoresData.forEach((v: any) => { const key = `${v.juror_name}-${v.project_id}`; if (!detailedMap[key]) detailedMap[key] = { juror: v.juror_name, project: v.projects?.name, scores: {}, totalWeighted: 0, maxPossible: 0 }; const w = parseFloat(v.criteria?.weight ?? 1); detailedMap[key].scores[v.criteria?.name] = v.score; detailedMap[key].totalWeighted += v.score * w; detailedMap[key].maxPossible += 10 * w; });
    setDetailedVotes(Object.values(detailedMap).map((d: any) => ({ ...d, percent: d.maxPossible > 0 ? (d.totalWeighted / d.maxPossible) * 100 : 0 })));
    setLoading(false);
  };
  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rankings.map((r, i) => ({ "Rang": i + 1, "Projet": r.name, "Score (%)": r.finalScore.toFixed(3) + "%" }))), "Classement");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailedVotes.map(v => { const row: any = { "Juré": v.juror, "Projet": v.project }; criteriaList.forEach(c => { row[c.name] = v.scores[c.name] || "-"; }); row["Moyenne (%)"] = v.percent.toFixed(3) + "%"; return row; })), "Détails");
    XLSX.writeFile(wb, `Resultats_${selectedSession.name}.xlsx`);
  };
  const exportPDF = () => {
    const doc = new jsPDF();
    doc.text(`RÉSULTATS : ${selectedSession.name}`, 14, 15);
    autoTable(doc, { head: [['Rang', 'Projet', 'Score (%)']], body: rankings.map((r, i) => [i + 1, r.name, `${r.finalScore.toFixed(3)}%`]), startY: 25 });
    doc.addPage(); doc.text(`DÉTAILS`, 14, 15);
    autoTable(doc, { head: [['Juré', 'Projet', 'Score (%)']], body: detailedVotes.map(v => [v.juror, v.project, `${v.percent.toFixed(3)}%`]), startY: 25 });
    doc.save(`Resultats_${selectedSession.name}.pdf`);
  };
  return (
    <div className="max-w-6xl mx-auto px-6 py-10 font-black text-black">
      <div className="flex flex-wrap gap-4 mb-10 border-b-8 border-black pb-6 font-black">{sessions.map(s => (<button key={s.id} onClick={() => handlePickSession(s)} className="px-4 py-2 border-4 border-black text-[10px] uppercase font-black" style={{ background: selectedSession?.id === s.id ? ORANGE : "white" }}>{s.name}</button>))}</div>
      {loading ? (<div className="p-20 text-center animate-pulse italic uppercase text-black font-black">Calculs en cours...</div>) : (
        <div className="grid gap-16"><section><div className="flex justify-between items-end mb-6 text-black"><h2 className="text-3xl uppercase italic border-b-4 border-black font-black">Classement (0.001)</h2><div className="flex gap-2 font-black"><button onClick={exportPDF} className="bg-white text-black px-4 py-2 border-4 border-black text-[10px] uppercase shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] font-black">PDF</button><button onClick={exportExcel} className="bg-black text-white px-4 py-2 border-4 border-black text-[10px] uppercase shadow-[4px_4px_0px_0px_rgba(255,121,0,1)] font-black">Excel</button></div></div><div className="border-8 border-black bg-white shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] text-black">{rankings.map((r, i) => (<div key={i} className="flex justify-between items-center p-6 border-b-4 border-black last:border-b-0"><div className="flex items-center gap-6 text-black"><span className="text-4xl opacity-20 italic font-black">#{i+1}</span><span className="text-xl uppercase font-black">{r.name}</span></div><span className="text-4xl font-black" style={{color: i === 0 ? ORANGE : "black"}}>{r.finalScore.toFixed(3)}%</span></div>))}</div></section>
          <section><h2 className="text-xl uppercase italic mb-6 opacity-50 underline decoration-4 text-black text-left font-black">Détails par Juré</h2><div className="border-4 border-black overflow-x-auto bg-white shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] text-black font-black"><table className="w-full text-left border-collapse font-black text-black"><thead><tr className="bg-black text-white text-[10px] uppercase font-black"><th className="p-4">Juré</th><th className="p-4">Projet</th>{criteriaList.map(c => <th key={c.name} className="p-4 font-black">{c.name}</th>)}<th className="p-4 text-right font-black">Moyenne (%)</th></tr></thead><tbody className="text-xs uppercase font-black">{detailedVotes.map((v, i) => (<tr key={i} className="border-b-2 border-black last:border-b-0 font-black"><td className="p-4 font-black">{v.juror}</td><td className="p-4 italic font-black">{v.project}</td>{criteriaList.map(c => (<td key={c.name} className="p-4 text-orange-500 font-black">{v.scores[c.name] || "-"}</td>))}<td className="p-4 text-right font-black">{v.percent.toFixed(3)}%</td></tr>))}</tbody></table></div></section>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// PAGE PRINCIPALE (LOGIQUE DE SÉCURITÉ)
// ─────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState("juror"); // Par défaut, on arrive sur la vue Juré
  const [showLock, setShowLock] = useState(false);
  const [code, setCode] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);

  return (
    <div className="min-h-screen bg-[#f0f0f0] text-black font-black font-black">
      <AppHeader 
        view={view} 
        setView={setView} 
        isAuthorized={isAuthorized} 
        onRequestAdmin={() => setShowLock(true)} 
      />
      
      {showLock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4 text-black">
          <div className="bg-white p-8 border-8 border-black max-w-sm w-full shadow-[15px_15px_0px_0px_rgba(255,121,0,1)]">
            <h2 className="text-xl mb-6 uppercase italic font-black text-black text-center">🔐 Accès Restreint</h2>
            <input 
              type="password" 
              value={code} 
              onChange={(e) => setCode(e.target.value)} 
              onKeyDown={(e)=>e.key==="Enter" && (code === ADMIN_CODE ? (setIsAuthorized(true), setShowLock(false), setView("admin")) : alert("CODE FAUX"))} 
              className="w-full border-8 border-black p-4 mb-4 text-center text-3xl outline-none font-black text-black" 
              placeholder="****"
              autoFocus
            />
            <div className="grid gap-2">
                <button onClick={() => { if(code === ADMIN_CODE) { setIsAuthorized(true); setShowLock(false); setView("admin"); } else { alert("CODE FAUX"); } }} className="w-full bg-black text-white p-4 font-black uppercase font-black">Déverrouiller</button>
                <button onClick={() => setShowLock(false)} className="w-full text-[10px] uppercase underline opacity-50 font-black text-black">Annuler</button>
            </div>
          </div>
        </div>
      )}

      <main>
        {view === "admin" && isAuthorized && <AdminView />}
        {view === "juror" && <JurorView />}
        {view === "dashboard" && isAuthorized && <DashboardView />}
        
        {/* Protection si quelqu'un essaie d'accéder à la vue admin/dashboard sans code via un bug */}
        {((view === "admin" || view === "dashboard") && !isAuthorized) && (
            <div className="p-20 text-center uppercase italic opacity-50 font-black">Veuillez vous authentifier en tant qu'administrateur.</div>
        )}
      </main>
    </div>
  );
}