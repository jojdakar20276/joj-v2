"use client";

import { useState, useEffect, useCallback } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

// ─────────────────────────────────────────────
// CONFIG & DESIGN
// ─────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const ORANGE = "#FF7900";
const ADMIN_CODE = "2026JOJDAKAR";

async function db(path: string, options: Record<string, any> = {}) {
  const { method = "GET", body, select, filter, order, upsert } = options;
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
    "Prefer": method === "POST" ? (upsert ? "resolution=merge-duplicates,return=representation" : "return=representation") : "return=representation",
  };

  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`Erreur Supabase`);
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

// ─────────────────────────────────────────────
// UI COMPONENTS
// ─────────────────────────────────────────────
function AppHeader({ view, setView, onRequestAdmin }: { view: string; setView: (v: string) => void; onRequestAdmin: () => void }) {
  const navItems = [{ id: "admin", label: "ADMIN" }, { id: "juror", label: "JURÉ" }, { id: "dashboard", label: "CLASSEMENT" }];
  return (
    <header className="border-b-4 border-black bg-white sticky top-0 z-20 font-black">
      <div className="mx-auto px-6 py-4 flex items-center justify-between max-w-6xl">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-8" style={{ background: ORANGE }} />
            <span className="text-lg text-black tracking-tighter">JURYSCORE</span>
          </div>
          <div className="hidden sm:flex gap-1">
            {navItems.map((n) => (
              <button key={n.id} onClick={() => n.id === "admin" ? onRequestAdmin() : setView(n.id)}
                className="text-xs px-4 py-2 transition-all border-2 border-transparent"
                style={{ background: view === n.id ? ORANGE : "transparent", color: view === n.id ? "#fff" : "#000" }}>
                {n.label}
              </button>
            ))}
          </div>
        </div>
        <span className="text-xs text-black hidden sm:block">HACKATHON JOJ 2026</span>
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────
// ADMIN VIEW
// ─────────────────────────────────────────────
function AdminView() {
  const [session, setSession] = useState<any>(null);
  const [criteria, setCriteria] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCriterion, setNewCriterion] = useState({ name: "", weight: "" });
  const [newProject, setNewProject] = useState({ name: "" });

  const totalWeight = criteria.reduce((sum, c) => sum + parseFloat(c.weight || 0), 0);

  const loadData = useCallback(async () => {
    const sessions = await db("sessions", { select: "*", filter: "is_active=eq.true", order: "created_at.desc" });
    if (sessions.length) {
      const s = sessions[0]; setSession(s);
      const [c, st] = await Promise.all([
        db("criteria", { select: "*", filter: `session_id=eq.${s.id}`, order: "order_index.asc" }),
        db("projects", { select: "*", filter: `session_id=eq.${s.id}`, order: "order_index.asc" }),
      ]);
      setCriteria(c); setProjects(st);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleAddCriterion() {
    if (!newCriterion.name || !newCriterion.weight || criteria.length >= 5) return;
    await db("criteria", { method: "POST", body: { session_id: session.id, name: newCriterion.name, weight: parseFloat(newCriterion.weight), max_score: 10, order_index: criteria.length } });
    loadData(); setNewCriterion({ name: "", weight: "" });
  }

  async function handleDeleteCriterion(id: string) {
    await db(`criteria?id=eq.${id}`, { method: "DELETE" });
    loadData();
  }

  async function handleAddProject() {
    if (!newProject.name) return;
    await db("projects", { method: "POST", body: { session_id: session.id, name: newProject.name, order_index: projects.length } });
    loadData(); setNewProject({ name: "" });
  }

  async function handleDeleteProject(id: string) {
    await db(`projects?id=eq.${id}`, { method: "DELETE" });
    loadData();
  }

  if (loading) return <div className="p-20 text-center font-black">CHARGEMENT...</div>;

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 font-black text-black">
      <h1 className="text-3xl mb-10 pb-4 border-b-4 border-black">ADMINISTRATION</h1>
      {session && (
        <div className="grid gap-12">
          <div className="border-2 border-black p-6 bg-gray-50">
            <div className="flex justify-between items-center mb-6">
               <h3 className="text-sm uppercase tracking-widest">01. Critères de notation</h3>
               <span className="px-3 py-1 text-xs border-2 border-black" style={{background: totalWeight === 100 ? "#4ade80" : "#fb7185"}}>
                 TOTAL : {totalWeight}/100
               </span>
            </div>
            <div className="grid gap-2 mb-6">
              {criteria.map((c,i) => (
                <div key={c.id} className="flex justify-between items-center p-3 bg-white border-2 border-black">
                  <span>{i+1}. {c.name}</span>
                  <div className="flex items-center gap-4">
                    <span style={{color:ORANGE}}>POINTS: {c.weight}</span>
                    <button onClick={() => handleDeleteCriterion(c.id)} className="text-red-600 text-xl px-2">×</button>
                  </div>
                </div>
              ))}
            </div>
            {criteria.length < 5 && (
              <div className="flex gap-2">
                <input value={newCriterion.name} onChange={(e)=>setNewCriterion({...newCriterion, name:e.target.value})} placeholder="Critère" className="flex-1 border-2 border-black p-3 text-sm outline-none"/>
                <input type="number" value={newCriterion.weight} onChange={(e)=>setNewCriterion({...newCriterion, weight:e.target.value})} placeholder="Points" className="w-24 border-2 border-black p-3 text-sm outline-none"/>
                <button onClick={handleAddCriterion} className="bg-black text-white px-6 font-black uppercase text-xs">Ajouter</button>
              </div>
            )}
          </div>
          <div className="border-2 border-black p-6">
            <h3 className="text-sm uppercase tracking-widest mb-6">02. Liste des projets</h3>
            <div className="grid gap-2 mb-6">
              {projects.map((s,i) => (
                <div key={s.id} className="flex justify-between items-center p-3 border-2 border-black">
                  <span>{i+1}. {s.name}</span>
                  <button onClick={() => handleDeleteProject(s.id)} className="text-red-600 text-xl px-2">×</button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={newProject.name} onChange={(e)=>setNewProject({name:e.target.value})} placeholder="Nom équipe" className="flex-1 border-2 border-black p-3 text-sm outline-none"/>
              <button onClick={handleAddProject} className="bg-black text-white px-6 font-black uppercase text-xs">Ajouter</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// JUROR VIEW
// ─────────────────────────────────────────────
function JurorView() {
  const [step, setStep] = useState("ident");
  const [session, setSession] = useState<any>(null);
  const [criteria, setCriteria] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [jurorName, setJurorName] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});

  useEffect(() => {
    (async () => {
      const s = await db("sessions", { select: "*", filter: "is_active=eq.true" });
      if (s.length) {
        setSession(s[0]);
        const [c, st] = await Promise.all([
          db("criteria", { select: "*", filter: `session_id=eq.${s[0].id}`, order: "order_index.asc" }),
          db("projects", { select: "*", filter: `session_id=eq.${s[0].id}`, order: "order_index.asc" }),
        ]);
        setCriteria(c); setProjects(st);
      }
    })();
  }, []);

  async function handleSubmit() {
    const rows = criteria.map(c => ({ session_id: session.id, project_id: projectId, criteria_id: c.id, juror_name: jurorName.trim(), score: scores[c.id] || 5 }));
    await db("scores", { method: "POST", body: rows, upsert: true });
    setStep("confirm");
  }

  if (!session) return <div className="py-20 text-center font-black text-black">AUCUNE SESSION ACTIVE</div>;

  return (
    <div className="max-w-lg mx-auto px-5 py-10 font-black text-black">
      {step === "ident" && (
        <div className="flex flex-col gap-8">
          <h1 className="text-3xl border-b-4 border-black pb-4">VOTRE VOTE</h1>
          <div className="space-y-4">
            <label className="text-xs uppercase">1. Votre Nom complet</label>
            <input value={jurorName} onChange={(e)=>setJurorName(e.target.value)} placeholder="Nom Prénom" className="w-full border-4 border-black p-4 outline-none bg-white"/>
          </div>
          <div className="space-y-4">
            <label className="text-xs uppercase">2. Projet à noter</label>
            <select value={projectId || ""} onChange={(e)=>setProjectId(e.target.value)} className="w-full border-4 border-black p-4 outline-none bg-white appearance-none">
              <option value="">-- SÉLECTIONNEZ --</option>
              {projects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <button disabled={!jurorName || !projectId} onClick={()=>setStep("score")} className="text-white p-5 text-lg border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]" style={{backgroundColor:ORANGE}}>NOTER L'ÉQUIPE →</button>
        </div>
      )}
      {step === "score" && (
        <div className="flex flex-col gap-8">
          <h2 className="text-2xl p-4 bg-black text-white">{projects.find(s=>s.id===projectId)?.name}</h2>
          {criteria.map(c => (
            <div key={c.id} className="border-4 border-black p-4 space-y-4">
              <div className="flex justify-between items-center">
                <span className="uppercase text-sm">{c.name}</span>
                <span className="text-2xl" style={{color:ORANGE}}>{scores[c.id] || 5}/10</span>
              </div>
              <input type="range" min="1" max="10" value={scores[c.id] || 5} onChange={(e)=>setScores({...scores, [c.id]: parseInt(e.target.value)})} className="w-full accent-orange-500"/>
            </div>
          ))}
          <button onClick={handleSubmit} className="text-white p-5 text-lg border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]" style={{backgroundColor:ORANGE}}>ENREGISTRER LE VOTE ✓</button>
        </div>
      )}
      {step === "confirm" && (
        <div className="text-center py-20 space-y-8">
          <div className="text-8xl">🏆</div>
          <h2 className="text-3xl">VOTE BIEN REÇU</h2>
          <button onClick={()=>{setStep("ident"); setProjectId(null); setScores({});}} className="text-white p-4 border-4 border-black bg-black">RETOUR À LA LISTE</button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// DASHBOARD VIEW (PRECISION 3 DECIMALES)
// ─────────────────────────────────────────────
function DashboardView() {
  const [session, setSession] = useState<any>(null);
  const [rankings, setRankings] = useState<any[]>([]);
  const [detailedVotes, setDetailedVotes] = useState<any[]>([]);
  const [criteriaNames, setCriteriaNames] = useState<string[]>([]);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  const fetchRankings = useCallback(async (sessionId: string) => {
    const [votes, criteriaList] = await Promise.all([
      db("scores", { select: "project_id,score,juror_name,criteria(name,weight),projects(name)", filter: `session_id=eq.${sessionId}` }),
      db("criteria", { select: "name", filter: `session_id=eq.${sessionId}`, order: "order_index.asc" })
    ]);

    const cNames = criteriaList.map((c:any) => c.name);
    setCriteriaNames(cNames);

    const rankMap: Record<string, any> = {};
    const detailedMap: Record<string, any> = {};

    votes.forEach((v: any) => {
      const sid = v.project_id;
      const juror = v.juror_name;
      const key = `${juror}-${sid}`;
      const w = parseFloat(v.criteria?.weight ?? 1);
      const s = parseFloat(v.score);

      if (!rankMap[sid]) rankMap[sid] = { name: v.projects?.name, weightedSum: 0, maxPossible: 0, voteCount: new Set() };
      rankMap[sid].weightedSum += s * w;
      rankMap[sid].maxPossible += 10 * w;
      rankMap[sid].voteCount.add(juror);

      if (!detailedMap[key]) detailedMap[key] = { juror, startup: v.projects?.name, scores: {}, totalWeighted: 0, maxPossible: 0 };
      detailedMap[key].scores[v.criteria?.name] = s;
      detailedMap[key].totalWeighted += s * w;
      detailedMap[key].maxPossible += 10 * w;
    });

    setRankings(Object.values(rankMap).map(r => ({
      ...r,
      voteCount: r.voteCount.size,
      score: r.maxPossible > 0 ? (r.weightedSum / r.maxPossible) * 100 : 0
    })).sort((a,b) => b.score - a.score));

    setDetailedVotes(Object.values(detailedMap).map(d => ({
      ...d,
      finalScore: d.maxPossible > 0 ? (d.totalWeighted / d.maxPossible) * 100 : 0
    })));
    
    setLastUpdate(new Date());
  }, []);

  useEffect(() => {
    (async () => {
      const s = await db("sessions", { select: "*", filter: "is_active=eq.true" });
      if (s.length) { setSession(s[0]); await fetchRankings(s[0].id); }
    })();
  }, [fetchRankings]);

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.text(`Rapport JOJ 2026 - ${session.name}`, 14, 15);
    // Précision 3 décimales dans le PDF
    autoTable(doc, { head: [['Rang', 'Startup', 'Score (%)']], body: rankings.map((r, i) => [i + 1, r.name, `${r.score.toFixed(3)}%`]), startY: 25 });
    doc.addPage();
    autoTable(doc, { head: [['Juré', 'Startup', ...criteriaNames, 'Total (%)']], body: detailedVotes.map(v => [v.juror, v.startup, ...criteriaNames.map(c => v.scores[c] || "-"), `${v.finalScore.toFixed(3)}%`]), startY: 25 });
    doc.save("Resultats_JOJ_2026.pdf");
  };

  const exportExcel = () => {
    // Précision 3 décimales dans l'Excel
    const ws = XLSX.utils.json_to_sheet(detailedVotes.map(v => ({ "Juré": v.juror, "Startup": v.startup, ...v.scores, "Total (%)": v.finalScore.toFixed(3) })));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Scores");
    XLSX.writeFile(wb, "JOJ2026_Export.xlsx");
  };

  if (!session) return <div className="py-20 text-center font-black text-black">CHARGEMENT DES RÉSULTATS...</div>;

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 font-black text-black">
      <div className="flex justify-between items-end mb-12 border-b-8 border-black pb-6">
        <h1 className="text-4xl uppercase tracking-tighter">{session.name}</h1>
        <div className="flex gap-4">
          <button onClick={exportPDF} className="bg-black text-white px-6 py-3 border-4 border-black hover:bg-white hover:text-black transition-all">PDF</button>
          <button onClick={exportExcel} className="bg-white text-black px-6 py-3 border-4 border-black hover:bg-black hover:text-white transition-all">EXCEL</button>
        </div>
      </div>

      <h2 className="text-xs tracking-widest mb-6 uppercase">Classement Officiel</h2>
      <div className="border-4 border-black mb-16">
        {rankings.map((r,i) => (
          <div key={i} className="grid grid-cols-[5rem_1fr_12rem] p-6 border-b-4 border-black last:border-b-0 items-center bg-white">
            <span className="text-3xl">{i+1}</span>
            <span className="text-xl uppercase">{r.name}</span>
            <span className="text-right text-4xl" style={{color: i===0 ? ORANGE : "black"}}>
              {r.score.toFixed(3)}%
            </span>
          </div>
        ))}
      </div>

      <h2 className="text-xs tracking-widest mb-6 uppercase">Synthèse Détaillée (Scroll horizontal ↔)</h2>
      <div className="border-4 border-black overflow-x-auto bg-white">
        <table className="w-full text-left min-w-[800px] border-collapse">
          <thead>
            <tr className="bg-black text-white text-xs uppercase">
              <th className="p-4 border-r border-white">Juré</th>
              <th className="p-4 border-r border-white">Startup</th>
              {criteriaNames.map(c => <th key={c} className="p-4 border-r border-white">{c}</th>)}
              <th className="p-4 text-right">Total (%)</th>
            </tr>
          </thead>
          <tbody>
            {detailedVotes.map((v, i) => (
              <tr key={i} className="border-b-2 border-black last:border-b-0">
                <td className="p-4 border-r border-black">{v.juror}</td>
                <td className="p-4 border-r border-black">{v.startup}</td>
                {criteriaNames.map(c => <td key={c} className="p-4 border-r border-black">{v.scores[c] || "-"}</td>)}
                <td className="p-4 text-right text-xl" style={{color: ORANGE}}>{v.finalScore.toFixed(3)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-6 text-xs text-gray-500 uppercase">Dernière mise à jour : {lastUpdate.toLocaleTimeString()}</p>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState("juror");
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [showAdminLock, setShowAdminLock] = useState(false);
  const [adminCodeInput, setAdminCodeInput] = useState("");

  const handleAdminCodeSubmit = () => {
    if (adminCodeInput === ADMIN_CODE) { setAdminUnlocked(true); setShowAdminLock(false); setView("admin"); }
    else { alert("CODE INCORRECT"); }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-black text-black" style={{ fontFamily: "system-ui, sans-serif" }}>
      {showAdminLock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-white p-10 border-8 border-black max-w-sm w-full font-black shadow-[20px_20px_0px_0px_rgba(255,121,0,1)]">
            <h2 className="text-2xl mb-6 uppercase tracking-tighter">Accès Admin</h2>
            <input type="password" value={adminCodeInput} onChange={(e)=>setAdminCodeInput(e.target.value)} onKeyDown={(e)=>e.key==="Enter" && handleAdminCodeSubmit()} className="w-full border-4 border-black p-4 mb-6 outline-none text-2xl"/>
            <button onClick={handleAdminCodeSubmit} className="w-full bg-black text-white p-4 text-lg hover:bg-orange-500">DÉVERROUILLER</button>
          </div>
        </div>
      )}
      <AppHeader view={view} setView={setView} onRequestAdmin={()=> adminUnlocked ? setView("admin") : setShowAdminLock(true)} />
      {view === "admin" && <AdminView />}
      {view === "juror" && <JurorView />}
      {view === "dashboard" && <DashboardView />}
    </div>
  );
}