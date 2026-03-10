import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Trash2, Calendar, CheckCircle2, Plus, Minus, BrainCircuit, Pencil, X,
  Image as ImageIcon, History, Printer, Eye, ShoppingBag, CreditCard,
  Lock, Unlock, Paperclip, Type, Shirt, FileImage, Wallet, Fingerprint,
  Database, Save, Download, AlertCircle, RefreshCw, Zap, Layers, User,
  Images, FileText
} from 'lucide-react';

import { supabase } from './supabaseClient';

// --- CONFIGURACIÓN TÉCNICA ---
const STORAGE = {
  GEMINI: "pension_hadi_gemini_key",
  GROQ: "pension_hadi_groq_key",
  OPENROUTER: "pension_hadi_openrouter_key",
  DATA: "pension_hadi_offline_data_v31"
};

const meses = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];

const fmt = (val) => {
  const num = parseFloat(val);
  return isNaN(num) ? "$0.00" : new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(num);
};

const loadScript = (src) => {
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    document.head.appendChild(script);
  });
};

// Componente para editar monto directamente en el historial
const HistoryItem = ({ h, meses, fmt, onEdit, onSaveAmount }) => {
  const [editing, setEditing] = React.useState(false);
  const [val, setVal] = React.useState(String(h.amount));

  return (
    <div className="p-5 border border-slate-100 rounded-[28px] hover:bg-amber-50/50 transition-all">
      <div className="flex justify-between items-center">
        <div>
          <p className="text-[9px] font-black text-slate-400">{h.year}</p>
          <h4 className="font-black text-sm uppercase text-slate-700">{meses[h.month] || "MES"}</h4>
          {!editing && <p className="text-[11px] font-black text-blue-600">{fmt(h.amount)}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setEditing(!editing); setVal(String(h.amount)); }}
            className="p-2 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200 transition-all text-[9px] font-black uppercase">
            {editing ? "Cancelar" : "$ Editar"}
          </button>
          <button onClick={onEdit}
            className="p-2 bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition-all text-[9px] font-black uppercase shadow-md">
            + Desglose
          </button>
        </div>
      </div>
      {editing && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-slate-400 font-black text-sm">$</span>
          <input
            type="number"
            value={val}
            onChange={e => setVal(e.target.value)}
            className="flex-1 border border-blue-300 rounded-xl px-3 py-2 text-sm font-bold text-blue-700 outline-none focus:border-blue-500"
            placeholder="Nuevo monto..."
            autoFocus
          />
          <button onClick={async () => { await onSaveAmount(val); setEditing(false); }}
            className="px-4 py-2 bg-green-600 text-white rounded-xl text-[10px] font-black uppercase hover:bg-green-700 transition-all">
            Guardar
          </button>
        </div>
      )}
    </div>
  );
};

// Fila editable del resumen anual
const AnnualHistoryRow = ({ h, meses, fmt, STORAGE, supabase, setHistory, notify }) => {
  const [editingAmt, setEditingAmt] = React.useState(false);
  const [newAmt, setNewAmt] = React.useState(String(h.amount));
  return (
    <div className="bg-slate-50 border border-slate-100 rounded-xl overflow-hidden">
      <div className="flex justify-between items-center p-4">
        <span className="text-xs font-black uppercase text-slate-600">{meses[h.month]}</span>
        <div className="flex items-center gap-2">
          <span className="font-black text-slate-800">{fmt(h.amount)}</span>
          <button onClick={() => { setEditingAmt(!editingAmt); setNewAmt(String(h.amount)); }}
            className="px-2 py-1 bg-amber-100 text-amber-700 rounded-lg text-[9px] font-black uppercase hover:bg-amber-200 transition-all">
            {editingAmt ? 'Cancelar' : '✏️ Editar'}
          </button>
        </div>
      </div>
      {editingAmt && (
        <div className="px-4 pb-4 flex items-center gap-2">
          <span className="text-slate-400 font-black">$</span>
          <input type="number" value={newAmt} onChange={e => setNewAmt(e.target.value)}
            className="flex-1 border border-blue-300 rounded-xl px-3 py-2 text-sm font-bold text-blue-700 outline-none focus:border-blue-500"
            placeholder="Nuevo monto..." autoFocus />
          <button onClick={async () => {
            const updated = { ...h, amount: parseFloat(newAmt), timestamp: Date.now() };
            setHistory(prev => prev.map(x => x.id === h.id ? updated : x));
            const cur = JSON.parse(localStorage.getItem(STORAGE.DATA) || '{}');
            localStorage.setItem(STORAGE.DATA, JSON.stringify({ ...cur, history: (cur.history || []).map(x => x.id === h.id ? updated : x) }));
            const cleanUpdated = { ...updated }; delete cleanUpdated.cepData; delete cleanUpdated.cepName;
            const { error } = await supabase.from('history').upsert(cleanUpdated);
            notify(error ? `Error: ${error.message}` : `✓ ${meses[h.month]} → ${fmt(parseFloat(newAmt))}`);
            setEditingAmt(false);
          }} className="px-3 py-2 bg-green-600 text-white rounded-xl text-[10px] font-black uppercase hover:bg-green-700 transition-all">
            Guardar
          </button>
        </div>
      )}
    </div>
  );
};

const App = () => {
  // --- HELPER: leer localStorage una sola vez de forma síncrona ---
  const readLocal = () => {
    try {
      const s = localStorage.getItem(STORAGE.DATA);
      return s ? JSON.parse(s) : { history: [], expenses: [], manualBase: 5408, pendingMetadata: null };
    } catch { return { history: [], expenses: [], manualBase: 5408, pendingMetadata: null }; }
  };

  // --- 1. ESTADOS PRINCIPALES (lazy init desde localStorage) ---
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [expenses, setExpenses] = useState(() => { const d = readLocal(); return Array.isArray(d.expenses) ? d.expenses : []; });
  const [history, setHistory] = useState(() => { const d = readLocal(); return Array.isArray(d.history) ? d.history.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)) : []; });
  const [manualBase, setManualBase] = useState(() => { const d = readLocal(); return d.manualBase || 5408; });
  const [keys, setKeys] = useState({
    gemini: localStorage.getItem(STORAGE.GEMINI) || "",
    groq: localStorage.getItem(STORAGE.GROQ) || "",
    openrouter: localStorage.getItem(STORAGE.OPENROUTER) || ""
  });
  const [showConfig, setShowConfig] = useState(false);

  // UI States
  const [showHistory, setShowHistory] = useState(false);
  const [showAnnualSummary, setShowAnnualSummary] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [aiReport, setAiReport] = useState("");
  const [isEditingHistorical, setIsEditingHistorical] = useState(false);
  const [pendingMetadata, setPendingMetadata] = useState(() => { const d = readLocal(); return d.pendingMetadata || null; });
  const [cepData, setCepData] = useState(() => {
    const d = readLocal();
    return (d.pendingMetadata && d.pendingMetadata.cepData) ? { base64: d.pendingMetadata.cepData, name: d.pendingMetadata.cepName } : null;
  });
  const [editingId, setEditingId] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [libsReady, setLibsReady] = useState(false);
  const [tempTotalManual, setTempTotalManual] = useState("");

  const galleryInputRef = useRef();
  const ticketsInputRef = useRef();
  const cepInputRef = useRef();
  const textareaRef = useRef(null);
  const formRef = useRef(null);
  const isInitialized = useRef(false);

  const [newEx, setNewEx] = useState({
    name: "", amount: "", paidBy: "haidar", responsibility: "shared", installments: 1, date: new Date().toISOString().split('T')[0], imageData: null
  });

  // --- NOTIFICACIONES ---
  const notify = useCallback((msg, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg: String(msg), type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  // --- SINCRONIZACIÓN HÍBRIDA (SUPABASE + LOCALSTORAGE) ---
  const loadSupabaseData = async () => {
    // 1. PRIMERO cargar desde localStorage (fuente de verdad inmediata)
    const saved = localStorage.getItem(STORAGE.DATA);
    const local = saved ? JSON.parse(saved) : { history: [], expenses: [], manualBase: 5408 };

    if (Array.isArray(local.history) && local.history.length > 0) {
      setHistory(local.history.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
    }
    if (Array.isArray(local.expenses) && local.expenses.length > 0) {
      setExpenses(local.expenses);
    }
    if (local.manualBase) setManualBase(local.manualBase);

    // 2. Intentar enricher con Supabase (si falla, ya tenemos los datos locales)
    try {
      const { data: cloudHist, error: hErr } = await supabase.from('history').select('*');
      if (hErr) throw hErr;
      const { data: cloudExp, error: eErr } = await supabase.from('expenses').select('*');
      if (eErr) throw eErr;

      // Handle active unarchived metadata from the cloud
      let merged = [...(cloudHist || [])];

      const draftMetaRow = merged.find(h => h.id === 'draft-meta');
      if (draftMetaRow && draftMetaRow.expenses) {
        try {
          const parsedMeta = JSON.parse(draftMetaRow.expenses)[0];
          if (parsedMeta && (!local.pendingMetadata || (draftMetaRow.timestamp || 0) > (local.pendingMetadata.timestamp || 0))) {
            setPendingMetadata(parsedMeta);
            local.pendingMetadata = parsedMeta;
            if (parsedMeta.cepData) setCepData({ base64: parsedMeta.cepData, name: parsedMeta.cepName });
          }
        } catch (e) { }
      }

      merged = merged.filter(h => h.id !== 'draft-meta');

      // Merge: preferir el que tenga timestamp más reciente
      (local.history || []).filter(h => h.id !== 'draft-meta').forEach(localItem => {
        const idx = merged.findIndex(c => c.id === localItem.id);
        if (idx === -1) merged.push(localItem);
        else if ((localItem.timestamp || 0) > (merged[idx].timestamp || 0)) merged[idx] = localItem;
      });

      if (merged.length > 0) {
        merged.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        setHistory(merged);
        localStorage.setItem(STORAGE.DATA, JSON.stringify({ ...local, history: merged, expenses: cloudExp || local.expenses, pendingMetadata: local.pendingMetadata }));
      }
      if (cloudExp && cloudExp.length > 0) setExpenses(cloudExp);

    } catch (err) {
      console.warn("Supabase no disponible, usando modo local:", err.message);
    }
  };

  // --- useEffect A: Sincronización de datos (corre INMEDIATAMENTE, sin esperar scripts) ---
  useEffect(() => {
    const syncData = async () => {
      try {
        // Migración v25 → v31 si existe
        const savedV25 = localStorage.getItem("pension_hadi_offline_data_v25");
        const savedV31 = localStorage.getItem(STORAGE.DATA);
        if (savedV25) {
          try {
            const data25 = JSON.parse(savedV25);
            let data31 = savedV31 ? JSON.parse(savedV31) : { history: [], expenses: [] };
            if (Array.isArray(data25.history)) {
              data25.history.forEach(h => { if (!data31.history.some(h31 => h31.id === h.id)) data31.history.push(h); });
            }
            if (Array.isArray(data25.expenses)) {
              data25.expenses.forEach(e => { if (!data31.expenses.some(e31 => e31.id === e.id)) data31.expenses.push(e); });
            }
            localStorage.setItem(STORAGE.DATA, JSON.stringify(data31));
          } catch (e) { console.error("Migration error", e); }
        }

        // Sincronizar con Supabase (siempre, sin importar si hay scripts cargados)
        await loadSupabaseData();
        isInitialized.current = true;

        // Forzar estado desde localStorage post-Supabase (garantiza sync en móvil/incógnito)
        const postSync = readLocal();
        if (Array.isArray(postSync.history) && postSync.history.length > 0) {
          setHistory(postSync.history.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
        }
        if (Array.isArray(postSync.expenses) && postSync.expenses.length > 0) {
          setExpenses(postSync.expenses);
        }

        // Auto-navegar al mes siguiente al último mes con Reporte Final Consolidado
        const finalized = (postSync.history || []).filter(h => h && h.aiReport && h.aiReport.trim().length > 10);
        if (finalized.length > 0) {
          const sorted = [...finalized].sort((a, b) => b.year !== a.year ? b.year - a.year : b.month - a.month);
          const last = sorted[0];
          let nextMonth = last.month + 1;
          let nextYear = last.year;
          if (nextMonth > 11) { nextMonth = 0; nextYear++; }
          setMonth(nextMonth);
          setYear(nextYear);
        }
      } catch (e) { console.error("Error syncData", e); }
    };
    syncData();
  }, []);

  // --- useEffect B: Carga de scripts PDF (corre en paralelo, no bloquea datos) ---
  useEffect(() => {
    const loadLibs = async () => {
      try {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
        await loadScript('https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js');
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.mjs');
        if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.mjs';
        setLibsReady(true);
      } catch (e) { console.warn("Scripts PDF no cargaron:", e); setLibsReady(false); }
    };
    loadLibs();
  }, []);

  useEffect(() => {
    // SOLO guardar en localStorage DESPUÉS de que init() haya cargado los datos.
    // Esto evita que el estado inicial vacío ([]) sobreescriba los datos guardados.
    if (!isInitialized.current) return;

    try {
      localStorage.setItem(STORAGE.DATA, JSON.stringify({ expenses, history, manualBase, pendingMetadata }));
    } catch (e) {
      if (e.name === 'QuotaExceededError') notify("Cache lleno. Limpia el historial.", "error");
    }
  }, [expenses, history, manualBase, pendingMetadata, notify]);

  useEffect(() => {
    if (!isInitialized.current) return;
    if (pendingMetadata) {
      const metaRow = { id: 'draft-meta', month: new Date().getMonth(), year: new Date().getFullYear(), amount: 0, expenses: JSON.stringify([{ ...pendingMetadata, timestamp: Date.now() }]), timestamp: Date.now() };
      supabase.from('history').upsert(metaRow).catch(() => { });
    } else {
      supabase.from('history').delete().eq('id', 'draft-meta').catch(() => { });
    }
  }, [pendingMetadata]);

  // --- LÓGICA DE CÁLCULOS ---
  const viewingHistorical = useMemo(() => {
    return (history || []).find(h => h && h.month === month && h.year === year) || null;
  }, [history, month, year]);

  const historicalMetadata = useMemo(() => {
    if (!viewingHistorical) return null;
    try {
      return JSON.parse(viewingHistorical.expenses || "[]").find(x => x.isMetadata) || null;
    } catch { return null; }
  }, [viewingHistorical]);

  const currentBase = useMemo(() => {
    if (viewingHistorical) return Number(viewingHistorical.baseUsed) || 5408;
    const diffYears = year - 2026;
    const baseCalculada = diffYears > 0 ? manualBase * Math.pow(1.04, diffYears) : manualBase;
    return Math.max(0, Math.round(baseCalculada * 100) / 100);
  }, [year, viewingHistorical, manualBase]);

  const calculateImpact = (ex) => {
    const amount = parseFloat(ex.amount) || 0;
    const inst = Number(ex.installments) || 1;
    let rec = 0;
    if (ex.responsibility === 'por_pagar') rec = amount;
    else if (ex.responsibility === 'shared') rec = ex.paidBy === 'haidar' ? -(amount * 0.5) : (amount * 0.5);
    else if (ex.responsibility === 'kenny') rec = ex.paidBy === 'haidar' ? -amount : 0;
    else if (ex.responsibility === 'haidar') rec = ex.paidBy === 'kenny' ? amount : 0;
    return { ...ex, monthlyImpact: rec / inst, originalAmount: amount };
  };

  const activeAjustes = useMemo(() => {
    let list = [];
    if (viewingHistorical) {
      try {
        const parsed = JSON.parse(viewingHistorical.expenses);
        list = Array.isArray(parsed) ? parsed : [];
      } catch { list = []; }
      list = (list || []).filter(x => x && !x.isMetadata);
    } else {
      list = (expenses || []).map(ex => calculateImpact(ex)).filter(r => r && r.monthlyImpact !== 0);
    }

    if ((month === 5 || month === 11) && (list && !list.some(x => x && x.isRopaVirtual))) {
      list.unshift({
        name: "CUOTA DE ROPA (ESTACIONAL)", monthlyImpact: 1500, originalAmount: 1500,
        paidBy: "SISTEMA", isRopaVirtual: true, date: `${year}-${String(month + 1).padStart(2, '0')}-01`, id: 'ropa-v', responsibility: 'shared'
      });
    }
    return list || [];
  }, [expenses, viewingHistorical, month, year]);

  const totalFinal = useMemo(() => {
    if (viewingHistorical && !isEditingHistorical) return Number(viewingHistorical.amount) || 0;
    if (!viewingHistorical && tempTotalManual !== "") return Number(tempTotalManual) || 0;
    const ajustesTotal = (activeAjustes || []).reduce((acc, curr) => acc + (curr.monthlyImpact || 0), 0);
    const finalVal = Math.ceil((currentBase + ajustesTotal) * 100) / 100;
    return isNaN(finalVal) ? 0 : finalVal;
  }, [currentBase, activeAjustes, viewingHistorical, isEditingHistorical, tempTotalManual]);

  const handleAttachment = async (e, type) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    notify(`Procesando adjunto/s...`);

    let list = viewingHistorical ? JSON.parse(viewingHistorical.expenses || "[]") : [...activeAjustes];
    let metaIdx = list.findIndex(x => x.isMetadata);
    let metaObj = metaIdx >= 0 ? list[metaIdx] : { ...(pendingMetadata || {}), isMetadata: true };

    for (const file of files) {
      const b64 = await new Promise((res, rej) => {
        const r = new FileReader(); r.onloadend = () => res(r.result); r.onerror = rej; r.readAsDataURL(file);
      });

      if (type === 'tickets') {
        metaObj.ticketsData = metaObj.ticketsData || [];
        metaObj.ticketsData.push({ name: file.name, data: b64, type: file.type });
      } else if (type === 'pdf') {
        metaObj.pdfData = b64;
        // SMART PDF IMPORT: If it's a PDF, also trigger the AI analysis to extract expenses
        await analyzePdfForHistory({ target: { files: [file] } });
      } else if (type === 'cep') {
        metaObj.cepData = b64;
        setCepData({ base64: b64, type: file.type, name: file.name });
      }
    }

    if (viewingHistorical) {
      if (metaIdx >= 0) list[metaIdx] = metaObj; else list.unshift(metaObj);
      const updated = { ...viewingHistorical, expenses: JSON.stringify(list) };
      setHistory(prev => prev.map(h => h.id === viewingHistorical.id ? updated : h));
      supabase.from('history').update({ expenses: JSON.stringify(list) }).eq('id', viewingHistorical.id);
    } else {
      setPendingMetadata(metaObj);
    }
    notify(`✓ Archivo(s) guardado(s) correctamente`);
    if (e.target) e.target.value = "";
  };

  // --- GENERADOR DE NARRATIVA QUIRÚRGICA ---
  const generatedNarrative = useMemo(() => {
    if (viewingHistorical && !isEditingHistorical) return viewingHistorical.aiReport || "";

    const list = activeAjustes || [];
    const suman = list.filter(a => a && a.monthlyImpact > 0);
    const restan = list.filter(a => a && a.monthlyImpact < 0);

    let text = `ESTADO DE CUENTA - PENSIÓN ${meses[month] || "MES"} ${year}\n`;
    text += `==================================================\n\n`;

    text += `(+) BASE MENSUAL FIJA: ${fmt(currentBase)}\n\n`;

    if (suman.length > 0) {
      text += `CONCEPTOS QUE SUMAN AL PAGO (+)\n`;
      text += `--------------------------------------------------\n`;
      suman.forEach(s => {
        if (s.responsibility === 'shared') {
          text += `• ${s.name}: +${fmt(s.monthlyImpact)} (Es el 50% de ${fmt(s.originalAmount)})\n`;
        } else {
          text += `• ${s.name}: +${fmt(s.monthlyImpact)} (Adeudo directo)\n`;
        }
      });
      text += `\n`;
    }

    if (restan.length > 0) {
      text += `CONCEPTOS QUE RESTAN AL PAGO (-)\n`;
      text += `--------------------------------------------------\n`;
      restan.forEach(r => {
        if (r.responsibility === 'shared') {
          text += `• ${r.name}: -${fmt(Math.abs(r.monthlyImpact))} (Ya cubrí tu 50% de ${fmt(r.originalAmount)})\n`;
        } else {
          text += `• ${r.name}: -${fmt(Math.abs(r.monthlyImpact))} (Cubierto totalmente por mí)\n`;
        }
      });
      text += `\n`;
    }

    text += `==================================================\n`;
    text += `TOTAL FINAL A DEPOSITAR: ${fmt(totalFinal)}\n`;
    text += `==================================================\n\n`;

    text += `Nota: Se adjuntan comprobantes visuales al final de este reporte.\n\n`;
    text += `Saludos, Haidar Sabag.`;
    return text;
  }, [currentBase, activeAjustes, viewingHistorical, isEditingHistorical, totalFinal, month, year]);

  useEffect(() => {
    if (viewingHistorical) {
      setAiReport(viewingHistorical.aiReport || "");
      setTempTotalManual("");
      setCepData(null);
    } else {
      setAiReport("");
      setTempTotalManual("");
      setCepData(null);
    }
  }, [month, year, viewingHistorical]);

  useEffect(() => { setAiReport(generatedNarrative); }, [generatedNarrative]);

  // --- MOTOR DE IA UNIVERSAL TRI-FASE ---
  const callAiFailover = async ({ prompt, imageBase64, mimeType }) => {
    const configs = [
      {
        provider: 'GEMINI',
        key: keys.gemini,
        models: ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
        call: async (key, model) => {
          // Gemini 2.0+ usa v1beta, 1.5 también funciona en v1beta
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
          const body = {
            contents: [{
              parts: [
                { text: prompt + "\n\nIMPORTANTE: Responde de forma clara y completa." },
                ...(imageBase64 ? [{ inlineData: { mimeType, data: imageBase64 } }] : [])
              ]
            }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 4096 }
          };
          const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
          const json = await res.json();
          if (json.error) throw new Error(`Gemini ${model}: ${json.error.message}`);
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!text) throw new Error("Respuesta vacía de Gemini");
          return text;
        }
      },
      {
        provider: 'GROQ',
        key: keys.groq,
        // llama-3.3-70b-versatile: texto; llava-v1.5-7b-4096-preview: vision
        models: imageBase64 ? ['meta-llama/llama-4-scout-17b-16e-instruct'] : ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
        call: async (key, model) => {
          const body = {
            model,
            messages: [{
              role: "user",
              content: imageBase64
                ? [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } }]
                : prompt
            }],
            temperature: 0.2,
            max_tokens: 4096
          };
          const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify(body)
          });
          const json = await res.json();
          if (json.error) throw new Error(`Groq ${model}: ${json.error.message}`);
          return json.choices?.[0]?.message?.content;
        }
      },
      {
        provider: 'OPENROUTER',
        key: keys.openrouter,
        models: ['google/gemini-2.0-flash-001', 'google/gemini-flash-1.5', 'meta-llama/llama-3.2-11b-vision-instruct:free'],
        call: async (key, model) => {
          const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model,
              messages: [{
                role: "user",
                content: imageBase64
                  ? [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } }]
                  : prompt
              }]
            })
          });
          const json = await res.json();
          if (json.error) throw new Error(`OpenRouter ${model}: ${json.error?.message}`);
          return json.choices?.[0]?.message?.content;
        }
      }
    ];

    for (const config of configs) {
      if (!config.key) continue;
      for (const model of config.models) {
        try {
          console.log(`Intentando ${config.provider} con ${model}...`);
          const result = await config.call(config.key, model);
          if (result) return { text: result, model: `${config.provider} (${model})` };
        } catch (e) {
          console.warn(`Falló ${model}:`, e);
        }
      }
    }
    throw new Error("Todos los motores de IA fallaron o falta configuración.");
  };

  const handleImageScan = async (e) => {
    const target = e.target;
    const file = target.files?.[0];
    if (!file) return;
    setIsScanning(true);

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Str = reader.result;
      const base64Data = base64Str.split(',')[1];
      const mimeType = file.type || "image/jpeg";
      const prompt = "Analiza este ticket. Responde SOLO JSON plano: {\"name\": \"...\", \"amount\": 00.00}";

      notify("Escaneando datos del ticket...", "info");

      // 1. Extraer datos con IA para el formulario PRIMERO
      try {
        const { text, model } = await callAiFailover({ prompt, imageBase64: base64Data, mimeType });
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No se detectó JSON");

        const parsed = JSON.parse(jsonMatch[0].replace(/```json|```/g, "").trim());
        setNewEx(prev => ({
          ...prev,
          name: String(parsed.name || "Gasto Escaneado").toUpperCase(),
          amount: String(parsed.amount || ""),
          imageData: base64Str
        }));

        // 2. Si tuvo éxito, Guardar adjunto en metadata local/nube para agregarlo al PDF
        if (viewingHistorical) {
          let list = JSON.parse(viewingHistorical.expenses || "[]");
          let metaIdx = list.findIndex(x => x.isMetadata);
          let metaObj = metaIdx >= 0 ? list[metaIdx] : { isMetadata: true };
          metaObj.ticketsData = metaObj.ticketsData || [];
          metaObj.ticketsData.push({ name: file.name, data: base64Str, type: mimeType });
          if (metaIdx >= 0) list[metaIdx] = metaObj; else list.unshift(metaObj);

          const updatedHist = { ...viewingHistorical, expenses: JSON.stringify(list), timestamp: Date.now() };
          setHistory(prev => prev.map(h => h.id === viewingHistorical.id ? updatedHist : h));
          const cur = JSON.parse(localStorage.getItem(STORAGE.DATA) || '{}');
          localStorage.setItem(STORAGE.DATA, JSON.stringify({ ...cur, history: (cur.history || []).map(h => h.id === viewingHistorical.id ? updatedHist : h) }));

          const cleanHist = { ...updatedHist }; delete cleanHist.cepData; delete cleanHist.cepName;
          supabase.from('history').upsert(cleanHist).catch(console.error);
        } else {
          setPendingMetadata(m => {
            const mObj = m || { isMetadata: true };
            if (!mObj.ticketsData) mObj.ticketsData = [];
            mObj.ticketsData.push({ name: file.name, data: base64Str, type: mimeType });
            return { ...mObj };
          });
        }

        notify(`✓ Escaneado con ${model} y adjuntado visualmente`);
      } catch (err) {
        console.error("Scan Error:", err);
        notify("La IA no pudo leer los datos del ticket. Llénalos manual. (No se adjuntó)", "warning");
      } finally {
        setIsScanning(false);
        target.value = '';
      }
    };
    reader.readAsDataURL(file);
  };


  // --- ANALIZADOR DE PDF HISTÓRICO CON IA (V4 - SERVER FIRST) ---
  const analyzePdfForHistory = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isDocPdf = file.type === 'application/pdf';

    if (!keys.gemini && !keys.groq && !keys.openrouter) {
      notify("Configura al menos una llave de IA en ⚙️", "error");
      setShowConfig(true);
      if (pdfAnalysisInputRef.current) pdfAnalysisInputRef.current.value = "";
      return;
    }
    if (isDocPdf && !keys.gemini) {
      notify("Para PDFs necesitas la llave de Gemini (otros motores solo procesan imágenes)", "error");
      setShowConfig(true);
      if (pdfAnalysisInputRef.current) pdfAnalysisInputRef.current.value = "";
      return;
    }

    setIsScanning(true);
    try {
      let prompt, imageBase64 = null, mimeType = file.type;

      if (isDocPdf) {
        notify("Analizando PDF localmente...");
        const arrayBuffer = await file.arrayBuffer();
        let docText = '';
        try {
          if (window.pdfjsLib) {
            const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            for (let i = 1; i <= pdf.numPages; i++) {
              const page = await pdf.getPage(i);
              const textContent = await page.getTextContent();
              docText += textContent.items.map(s => s.str).join(' ') + '\n';
            }
          }
        } catch (e) { console.error('Error parseando PDF localmente:', e); }

        if (docText.trim().length > 10) {
          console.log("Texto extraído del PDF:", docText.substring(0, 300) + "...");
          // PDF con texto: cualquier IA lo puede procesar
          const textPrompt = `Eres un asistente financiero experto. Analiza el siguiente texto de un REPORTE DE PENSIÓN y extrae los movimientos financieros.

TEXTO:
${docText}

REGLAS DE NEGOCIO:
1. "paidBy" DEBE ser exclusivamente 'haidar' o 'kenny'.
2. "responsibility" DEBE ser 'shared' (50/50), 'haidar' (100% Haidar), 'kenny' (100% Kenny) o 'por_pagar' (Depósito directo).
3. Si el monto detectado es el pago base de la pensión, ponlo en "base" y NO lo incluyas en "expenses".

Devuelve EXCLUSIVAMENTE este JSON sin texto adicional:
{"base":0,"totalFinal":0,"aiReport":"Resumen corto","expenses":[{"name":"NOMBRE","amount":0,"paidBy":"haidar","responsibility":"shared"}]}`;
          const { text: aiText, model } = await callAiFailover({ prompt: textPrompt });
          console.log("Respuesta de IA para texto:", aiText);

          const jsonMatch = aiText.replace(/```json|```/gi, '').match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (Array.isArray(parsed.expenses) && parsed.expenses.length > 0) {
              const ts = Date.now();
              const newExpenses = parsed.expenses.map((ex, i) => {
                // SANITIZACIÓN DE DATOS IA
                let rb = (ex.responsibility || 'shared').toLowerCase();
                if (!['shared', 'haidar', 'kenny', 'por_pagar'].includes(rb)) rb = 'shared';
                let pb = (ex.paidBy || 'haidar').toLowerCase();
                if (!['haidar', 'kenny'].includes(pb)) pb = 'haidar';

                return { ...calculateImpact({ ...ex, responsibility: rb, paidBy: pb, id: `ai-${ts}-${i}` }), id: `ai-${ts}-${i}` };
              });
              const existingList = viewingHistorical ? JSON.parse(viewingHistorical.expenses || '[]') : [];
              const finalList = [...existingList.filter(x => x.isMetadata), ...newExpenses];
              const histId = `hist-${year}-${month}`;
              const histRow = { id: histId, month, year, timestamp: ts, amount: parsed.totalFinal || currentBase, aiReport: parsed.aiReport || `Pensión ${meses[month]} ${year}`, expenses: JSON.stringify(finalList), baseUsed: parsed.base || currentBase };
              setHistory(prev => { const ex = prev.some(h => h.id === histId); return ex ? prev.map(h => h.id === histId ? histRow : h) : [histRow, ...prev]; });
              setAiReport(histRow.aiReport);

              const cleanHist = { ...histRow }; delete cleanHist.cepData; delete cleanHist.cepName;
              supabase.from('history').upsert(cleanHist).then(({ error }) => { if (!error) notify(`✓ Reporte procesado vía ${model}`); });
              return;
            }
          }
          console.warn("IA no encontró gastos en el texto, intentando vía visión...");
        }
        else {
          // PDF escaneado sin texto → usar vision de Gemini
          const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onloadend = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
          imageBase64 = dataUrl.split(',')[1];
          mimeType = 'application/pdf';
          if (!keys.gemini) throw new Error('PDF escaneado detectado. Configura Gemini para leerlo visualmente.');
        }
      } else {
        // RUTA IMAGEN
        const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onloadend = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
        imageBase64 = dataUrl.split(',')[1];
      }

      // Vision para imágenes y PDFs escaneados (USANDO FAILOVER AUTO)
      const visionPrompt = `Analiza este documento de pensión y extrae todos los movimientos. Devuelve SOLO JSON:\n{"base":5408.00,"totalFinal":5408.00,"aiReport":"Resumen de movimientos","expenses":[{"name":"CONCEPTO","amount":100.00,"paidBy":"haidar","responsibility":"shared","installments":1}]}`;
      let responseText, usedModel;

      // RESTRICTION: Other engines (Groq/OpenRouter) usually don't support PDF via vision, only Gemini does.
      if (mimeType === 'application/pdf' && !keys.gemini) {
        throw new Error("Para leer PDFs visualmente necesitas configurar la llave de Gemini en ⚙️. Otros motores solo soportan imágenes.");
      }

      const res = await callAiFailover({ prompt: visionPrompt, imageBase64, mimeType });
      responseText = res.text;
      usedModel = res.model;
      if (!responseText) throw new Error('La IA no retornó respuesta');
      const jsonMatch = responseText.replace(/```json|```/gi, '').match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error(`Sin JSON válido: ${responseText.substring(0, 150)}`);
      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed.expenses) || !parsed.expenses.length) throw new Error('No se encontraron movimientos');
      const ts = Date.now();
      const newExpenses = parsed.expenses.map((ex, i) => ({ ...calculateImpact({ ...ex, id: `ai-${ts}-${i}` }), id: `ai-${ts}-${i}` }));
      const existingList = viewingHistorical ? JSON.parse(viewingHistorical.expenses || '[]') : [];
      const finalList = [...existingList.filter(x => x.isMetadata), ...newExpenses];
      const histId = `hist-${year}-${month}`;
      const histRow = { id: histId, month, year, timestamp: ts, amount: parsed.totalFinal || currentBase, aiReport: parsed.aiReport || `Pensión ${meses[month]} ${year}`, expenses: JSON.stringify(finalList), baseUsed: parsed.base || currentBase };
      setHistory(prev => { const ex = prev.some(h => h.id === histId); return ex ? prev.map(h => h.id === histId ? histRow : h) : [histRow, ...prev]; });
      setAiReport(histRow.aiReport);

      const cleanHist = { ...histRow }; delete cleanHist.cepData; delete cleanHist.cepName;
      supabase.from('history').upsert(cleanHist).then(({ error }) => { if (!error) notify(`✓ ${newExpenses.length} movimientos registrados vía ${usedModel}`); });

    } catch (err) {
      console.error('PDF Analysis Error:', err);
      notify(`Error: ${err.message?.substring(0, 120) || 'Fallo desconocido'}`, "error");
    } finally {
      setIsScanning(false);
      if (pdfAnalysisInputRef.current) pdfAnalysisInputRef.current.value = "";
    }
  };

  const downloadTicketIfNew = (impactData) => {
    if (impactData.imageData && !editingId) {
      try {
        const binaryString = window.atob(impactData.imageData.split(',')[1]);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'image/jpeg' });
        const dateStr = new Date().toISOString().split('T')[0];
        downloadBlob(blob, `TICKET_${dateStr}_${impactData.name.replace(/ /g, '_')}.jpg`);
      } catch (e) { }
    }
  };

  const saveExpense = async () => {
    if (!newEx.name || !newEx.amount) {
      notify("Faltan datos", "error");
      return;
    }
    const impactData = calculateImpact({ ...newEx, amount: parseFloat(newEx.amount), id: editingId || Date.now().toString() });

    if (viewingHistorical && isEditingHistorical) {
      let list = JSON.parse(viewingHistorical.expenses || "[]");
      if (editingId) {
        let match = list.findIndex(x => x.id === editingId);
        if (match >= 0) list[match] = { ...impactData, id: editingId };
      } else {
        list.push(impactData);
      }
      // Auto-recalcular monto total desde los movimientos
      const newTotal = parseFloat(viewingHistorical.baseUsed || 5408) +
        list.filter(x => !x.isMetadata).reduce((s, x) => s + (x.monthlyImpact || 0), 0);
      const updatedHist = { ...viewingHistorical, expenses: JSON.stringify(list), amount: Math.round(newTotal * 100) / 100 };
      setHistory(prev => prev.map(h => h.id === viewingHistorical.id ? updatedHist : h));

      const cleanHist = { ...updatedHist }; delete cleanHist.cepData; delete cleanHist.cepName;
      supabase.from('history').upsert(cleanHist);

      notify(`Guardado \u2022 Nuevo total: ${fmt(newTotal)}`);
      resetForm();
      return;
    }

    // UI Optimista (LocalStorage se encarga del backup)
    if (editingId) {
      setExpenses(prev => prev.map(ex => ex.id === editingId ? { ...impactData, id: editingId } : ex));
    } else {
      setExpenses(prev => [...prev, impactData]);
    }
    notify("Gasto guardado con éxito");
    resetForm();
    downloadTicketIfNew(impactData);

    // Supabase Background Sincronización
    supabase.from('expenses').upsert(impactData).then(({ error }) => {
      if (error) {
        console.error(error);
        notify("Offline: Guardado en Caché Local v31", "error");
      }
    });
  };

  const resetForm = () => {
    setNewEx({ name: "", amount: "", paidBy: "haidar", responsibility: "shared", installments: 1, date: new Date().toISOString().split('T')[0], imageData: null });
    setEditingId(null);
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  };

  const archiveMonth = async () => {
    const id = `hist-${year}-${month}`;
    if (history.some(h => h.id === id)) {
      if (!window.confirm("¿Deseas sobreescribir este mes?")) return;
    }

    let finalExpensesList = [...activeAjustes];
    if (pendingMetadata) {
      const mIdx = finalExpensesList.findIndex(x => x.isMetadata);
      if (mIdx >= 0) finalExpensesList[mIdx] = { ...finalExpensesList[mIdx], ...pendingMetadata };
      else finalExpensesList.unshift(pendingMetadata);
    }

    const histRow = {
      id, month, year, amount: totalFinal, aiReport,
      expenses: JSON.stringify(finalExpensesList),
      baseUsed: currentBase,
      timestamp: Date.now()
    };

    const nextExpenses = expenses.map(ex => ({ ...ex, installments: Math.max(1, ex.installments - 1) })).filter(ex => ex.installments > 0 || ex.responsibility === 'por_pagar');

    // 1. Actualización inmediata y local (Cache first)
    setHistory(prev => [histRow, ...prev.filter(x => x.id !== id)]);
    setExpenses(nextExpenses);
    setCepData(null);
    setPendingMetadata(null);
    setTempTotalManual("");

    // Forzar guardado en localStorage antes de que ocurra cualquier refresh
    const currentStorage = JSON.parse(localStorage.getItem(STORAGE.DATA) || '{"history":[]}');
    localStorage.setItem(STORAGE.DATA, JSON.stringify({
      ...currentStorage,
      history: [histRow, ...(currentStorage.history || []).filter(h => h.id !== id)],
      expenses: nextExpenses
    }));

    notify("Guardado local ✓. Sincronizando nube...");

    // 2. Sincronización con Supabase (Background)
    try {
      const cleanHist = { ...histRow }; delete cleanHist.cepData; delete cleanHist.cepName;
      const { error: hErr } = await supabase.from('history').upsert(cleanHist);
      if (hErr) throw hErr;

      // Limpiar gastos actuales y subir los nuevos (ajustados por mensualidad)
      await supabase.from('expenses').delete().neq('id', '0');
      if (nextExpenses.length > 0) {
        const { error: eErr } = await supabase.from('expenses').insert(nextExpenses);
        if (eErr) throw eErr;
      }
      notify("✓ Nube sincronizada", "success");
    } catch (err) {
      console.error("Cloud Sync Error:", err);
      notify("Guardado en este dispositivo (Sin conexión a nube)", "warning");
    }
  };

  const generatePDF = async () => {
    try {
      notify("Generando reporte completo...", "info");
      const { jsPDF } = window.jspdf;
      if (!jsPDF) { notify('Librería PDF cargando, intenta en 5 segundos', 'error'); return; }
      const doc = new jsPDF();
      const monthName = meses[viewingHistorical ? viewingHistorical.month : month];
      const yr = viewingHistorical ? viewingHistorical.year : year;
      const reportText = aiReport || generatedNarrative;
      const total = viewingHistorical ? viewingHistorical.amount : totalFinal;
      const meta = viewingHistorical ? historicalMetadata : pendingMetadata;

      doc.setFontSize(16); doc.setTextColor(26, 115, 232);
      doc.text(`ESTADO DE CUENTA - PENSIÓN ALIMENTICIA`, 20, 20);
      doc.setFontSize(11); doc.setTextColor(100);
      doc.text(`${monthName.toUpperCase()} ${yr}`, 20, 30);
      doc.setFontSize(9); doc.setTextColor(0);
      doc.setFont('courier', 'normal');
      const lines = doc.splitTextToSize(reportText, 170);
      doc.text(lines, 20, 44);
      let yFinal = 44 + lines.length * 4.5;

      // Resumen de archivos
      let filesSummary = [];
      if (meta?.cepName || meta?.cepData) filesSummary.push(`• Comprobante de Pago (CEP): ${meta?.cepName || 'Adjunto'}`);
      if (meta?.ticketsData?.length > 0) filesSummary.push(`• Notas / Tickets: ${meta.ticketsData.length} archivo(s) escaneado(s) adjunto(s)`);
      if (meta?.pdfData) filesSummary.push(`• Reporte Base: PDF original cargado`);

      if (filesSummary.length > 0) {
        yFinal += 10;
        if (yFinal > 250) { doc.addPage(); yFinal = 20; }
        doc.setFont('helvetica', 'bold');
        doc.text("RESUMEN DE ARCHIVOS LOCALES GUARDADOS:", 20, yFinal);
        doc.setFont('courier', 'normal');
        yFinal += 6;
        filesSummary.forEach(f => {
          doc.text(f, 20, yFinal);
          yFinal += 5;
        });
      }

      yFinal += 10;
      if (yFinal > 270) { doc.addPage(); yFinal = 20; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(26, 115, 232);
      doc.text(`TOTAL DEPOSITADO: ${fmt(total)}`, 20, yFinal);

      // Inclusión visual de anexos
      const addImageToDoc = async (base64, name) => {
        if (!base64 || base64.includes('application/pdf')) return;
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            doc.addPage();
            doc.setFontSize(12); doc.setTextColor(100);
            doc.setFont('helvetica', 'normal');
            doc.text(`Anexo: ${name}`, 20, 20);

            const imgWidth = 170;
            const imgHeight = (img.height * imgWidth) / img.width;

            let finalW = imgWidth;
            let finalH = imgHeight;
            if (finalH > 250) {
              finalH = 250;
              finalW = (img.width * finalH) / img.height;
            }

            const x = 20 + (170 - finalW) / 2;

            try {
              let format = 'JPEG';
              if (base64.includes('image/png')) format = 'PNG';
              else if (base64.includes('image/webp')) format = 'WEBP';
              doc.addImage(base64, format, x, 30, finalW, finalH);
            } catch (e) {
              console.error("Error al incrustar imagen en PDF", e);
            }
            resolve();
          };
          img.onerror = resolve;
          img.src = base64;
        });
      };

      if (meta?.cepData) {
        await addImageToDoc(meta.cepData, meta.cepName || 'CEP');
      }

      if (meta?.ticketsData) {
        for (const t of meta.ticketsData) {
          await addImageToDoc(t.data, t.name || 'Nota_Ticket');
        }
      }

      doc.save(`PENSION_${monthName.toUpperCase()}_${yr}.pdf`);
      notify('✓ Reporte generado con anexos incluidos');
    } catch (e) { notify('Error generando PDF: ' + e.message, 'error'); }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#202124] font-sans pb-20 selection:bg-blue-100">

      {/* MODAL ANUAL */}
      {showAnnualSummary && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] p-8 max-w-lg w-full shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-black text-[#3C4043] tracking-tighter uppercase text-xl flex items-center gap-2"><Layers className="w-6 h-6 text-blue-600" /> Resumen Anual {year}</h3>
              <button onClick={() => setShowAnnualSummary(false)} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 text-slate-500"><X className="w-5 h-5" /></button>
            </div>

            {(() => {
              const anualHist = (history || []).filter(h => h && h.year === year);
              const sumaTotal = anualHist.reduce((acc, h) => acc + (parseFloat(h.amount) || 0), 0);
              return (
                <div>
                  <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 text-center mb-6">
                    <p className="text-[10px] uppercase font-black text-blue-500 tracking-widest mb-2">Total Consolidado este Año</p>
                    <p className="text-4xl font-black text-blue-700">{fmt(sumaTotal)}</p>
                  </div>

                  <div className="space-y-2 mb-6">
                    {anualHist.sort((a, b) => a.month - b.month).map(h => (
                      <AnnualHistoryRow key={h.id} h={h} meses={meses} fmt={fmt}
                        STORAGE={STORAGE} supabase={supabase}
                        setHistory={setHistory} notify={notify} />
                    ))}
                    {anualHist.length === 0 && <p className="text-center text-slate-400 text-sm font-bold p-4">No hay datos archivados en {year}</p>}
                  </div>

                  <button onClick={async () => {
                    if (anualHist.length === 0) return notify("No hay historial en " + year, "error");
                    notify("Generando reporte anual extensivo...");
                    const promptText = `Eres un auditor financiero experto. Redacta un INFORME ANUAL CONSOLIDADO formal de la pensión alimenticia de Kenney, revisando en retrospectiva todo el año ${year}. 

HISTORIAL MES A MES (Total de todo el año: ${fmt(sumaTotal)}):
${JSON.stringify(anualHist.map(h => ({ mes: meses[h.month], depositado_total_mes: h.amount, reporte_original_texto: h.aiReport })))}

INSTRUCCIONES CLAVE:
1. Analiza el historial provisto y elabora un "resumen de los resúmenes mes a mes" indicando qué meses destacaron, picos, o eventos importantes de manera fluida y ejecutiva.
2. Crea un texto continuo, coherente y muy bien formateado listo para presentarse formalmente. No repitas la información punto por punto como máquina, explícala como informe de cierre de año.
3. Termina de manera formal el documento en tercera persona, mencionando que se emite a solicitud de Haidar Sabag, indicando el Balance Total de ${fmt(sumaTotal)} aportado durante ${year}.`;

                    try {
                      const { text, model } = await callAiFailover({ prompt: promptText });
                      setAiReport(text);
                      setShowAnnualSummary(false);
                      notify(`✓ Informe anual generado en pantalla`);
                    } catch (err) { notify("Error con IA: " + err.message, "error"); }
                  }} className="w-full flex items-center justify-center gap-2 py-4 bg-indigo-600 font-black uppercase text-xs text-white rounded-2xl shadow-lg hover:bg-indigo-700 transition-all">
                    <BrainCircuit className="w-4 h-4" /> Generar Informe Extenso con IA
                  </button>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* HEADER */}
      <div className="max-w-2xl mx-auto pt-6 px-4">
        <div className="bg-white p-5 rounded-[28px] shadow-sm border border-[#DADCE0] flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-[#1A73E8] flex items-center justify-center font-black text-white text-2xl shadow-inner italic tracking-tighter">H</div>
            <div>
              <h1 className="text-xs font-black text-[#3C4043] uppercase tracking-tighter">Calculadora de Pensión Alimenticia</h1>
              <div className="text-[10px] text-slate-400 font-medium italic">por Haidar</div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowAnnualSummary(true)} className="p-3 bg-slate-50 hover:bg-slate-100 rounded-2xl text-slate-600 shadow-sm transition-all text-xs font-black uppercase text-blue-600 flex items-center gap-2"><Layers className="w-5 h-5" /> Anual</button>
            <button onClick={() => setShowConfig(true)} className="p-3 bg-slate-50 hover:bg-slate-100 rounded-2xl text-slate-600 shadow-sm transition-all"><Database className="w-5 h-5" /></button>
            <button onClick={() => setShowHistory(true)} className="p-3 bg-slate-50 hover:bg-slate-100 rounded-2xl text-slate-600 shadow-sm transition-all"><History className="w-5 h-5" /></button>
          </div>
        </div>

        {/* SELECTOR */}
        <div className="bg-white border border-[#DADCE0] rounded-3xl p-6 mb-6 shadow-sm">
          <div className="flex justify-between items-center">
            <div className="flex flex-col">
              <p className="text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest">Base Mensual Activa</p>
              <div className="text-3xl font-black text-[#1A73E8] tracking-tighter">{fmt(currentBase)}</div>
            </div>
            <div className="flex items-center bg-[#F1F3F4] p-1.5 rounded-full border border-[#DADCE0]">
              <button onClick={() => {
                setIsEditingHistorical(false);
                setMonth(m => {
                  if (m === 0) {
                    setYear(y => y - 1);
                    return 11;
                  }
                  return m - 1;
                });
              }} className="p-1 hover:bg-white rounded-full shadow-sm transition-all"><Minus className="w-4 h-4" /></button>
              <span className="mx-4 text-[10px] font-black uppercase min-w-[100px] text-center">{meses[month] || "MES"} {year}</span>
              <button onClick={() => {
                setIsEditingHistorical(false);
                setMonth(m => {
                  if (m === 11) {
                    setYear(y => y + 1);
                    return 0;
                  }
                  return m + 1;
                });
              }} className="p-1 hover:bg-white rounded-full shadow-sm"><Plus className="w-4 h-4" /></button>
            </div>
          </div>
        </div>

        {/* TOTAL BANNER LÍQUIDO (MODIFICADO PARA EDICIÓN DIRECTA) */}
        {(() => {
          const now = new Date();
          const isPastMonth = year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth());
          return (
            <div className={`bg-white border-b-8 rounded-[40px] p-8 text-center shadow-2xl mb-8 relative overflow-hidden group transition-all ${viewingHistorical ? 'border-amber-400' : 'border-[#1A73E8]'}`}>
              {/* STATUS BADGE */}
              <div className="absolute top-4 right-8 flex gap-2">
                <div className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${viewingHistorical ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                  • {viewingHistorical ? 'Periodo Archivado' : isPastMonth ? 'Atrasado' : 'Mes Activo'}
                </div>
                {tempTotalManual !== "" && !viewingHistorical && (
                  <div className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest animate-pulse">
                    Monto Manual
                  </div>
                )}
              </div>

              <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] mb-4 italic">
                {viewingHistorical ? 'Reporte Final Consolidado' : isPastMonth ? 'Monto Manual (Sin Cierre)' : 'Monto Final del Depósito'}
              </p>

              {isPastMonth || viewingHistorical ? (
                <div className="flex flex-col items-center justify-center gap-4">
                  <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-3xl pr-6 border border-slate-100 shadow-inner group/input">
                    <span className="text-4xl text-slate-300 font-black ml-4">$</span>
                    <input
                      type="number"
                      value={(viewingHistorical ? viewingHistorical.amount : tempTotalManual) || ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (viewingHistorical) {
                          setHistory(prev => prev.map(h => h.id === viewingHistorical.id ? { ...h, amount: v } : h));
                        } else {
                          setTempTotalManual(v);
                        }
                      }}
                      placeholder={fmt(viewingHistorical ? viewingHistorical.amount : (tempTotalManual || totalFinal)).replace('$', '').replace(/,/g, '')}
                      className="text-6xl font-extrabold bg-transparent text-center text-blue-600 outline-none w-64 transition-all font-mono placeholder:text-blue-200"
                    />
                    {(viewingHistorical || tempTotalManual !== "") && (
                      <button
                        onClick={() => {
                          if (viewingHistorical) {
                            // Restore from calculated if in history
                            const ajustesTotal = activeAjustes.reduce((acc, curr) => acc + (curr.monthlyImpact || 0), 0);
                            const restored = Math.ceil((viewingHistorical.baseUsed + ajustesTotal) * 100) / 100;
                            setHistory(prev => prev.map(h => h.id === viewingHistorical.id ? { ...h, amount: restored } : h));
                            notify("Monto restaurado al calculado");
                          } else {
                            setTempTotalManual("");
                            notify("Regresando a cálculo automático");
                          }
                        }}
                        title="Restaurar monto calculado automáticamente"
                        className="p-3 bg-white text-slate-400 rounded-2xl shadow-sm hover:text-red-500 hover:shadow-md transition-all active:scale-95 border border-slate-100"
                      >
                        <RefreshCw className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest animate-pulse">Editando Monto Directamente</p>
                </div>
              ) : (
                <div className="relative inline-block cursor-pointer group" onClick={() => setTempTotalManual(totalFinal)}>
                  <h2 className="text-7xl font-black tracking-tighter text-slate-900 group-hover:text-blue-600 transition-colors">{fmt(totalFinal)}</h2>
                  <div className="absolute -right-8 top-0 opacity-0 group-hover:opacity-100 transition-all">
                    <Pencil className="w-6 h-6 text-blue-400" />
                  </div>
                </div>
              )}


            </div>
          );
        })()}

        {/* FORMULARIO: siempre visible en histórico (ya es edición por defecto) y en mes activo */}
        {(!viewingHistorical || isEditingHistorical) && (
          <div ref={formRef} className={`bg-white border-2 rounded-[32px] p-8 mb-8 shadow-sm transition-all ${editingId ? 'border-blue-500 scale-[1.02]' : 'border-[#DADCE0]'}`}>
            <div className="flex items-center justify-between mb-6">
              <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{editingId ? 'Modificando' : 'Nuevo Movimiento'}</h4>
              <div className="flex gap-2">
                {!editingId && <button onClick={() => galleryInputRef.current.click()} className="text-[#1A73E8] font-black text-[10px] uppercase flex items-center gap-1 border-b-2 border-blue-100 pb-1 px-1 shadow-inner rounded-md"><ImageIcon className="w-3 h-3" /> Escanear Nota</button>}
                {editingId && <button onClick={resetForm} className="text-red-500 font-black text-[10px] uppercase flex items-center gap-1"><X className="w-3 h-3" /> Cancelar</button>}
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <input placeholder="NOMBRE DEL GASTO" value={newEx.name} onChange={e => setNewEx({ ...newEx, name: e.target.value.toUpperCase() })} className="flex-1 bg-slate-50 p-4 rounded-2xl outline-none text-sm font-bold border border-transparent focus:border-blue-200 uppercase transition-all" />
                {newEx.imageData && <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center border border-green-200 animate-pulse shadow-sm"><FileImage className="w-6 h-6 text-green-600" /></div>}
              </div>

              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-black">$</span>
                <input type="number" placeholder="Monto Total" value={newEx.amount} onChange={e => setNewEx({ ...newEx, amount: e.target.value })} className="w-full bg-slate-50 p-4 pl-8 rounded-2xl outline-none text-sm font-black" />
              </div>

              <div className="space-y-2">
                <p className="text-[9px] font-black text-slate-400 uppercase ml-2 tracking-widest">¿Quién pagó?</p>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => setNewEx({ ...newEx, paidBy: 'haidar', responsibility: 'shared' })} className={`py-4 rounded-2xl text-[10px] font-black uppercase transition-all border-2 ${newEx.paidBy === 'haidar' && newEx.responsibility !== 'por_pagar' ? 'border-[#1A73E8] bg-blue-50 text-[#1A73E8]' : 'border-transparent bg-slate-100 text-slate-400'}`}>
                    <User className="w-3 h-3 inline mr-1" /> Haidar
                  </button>
                  <button onClick={() => setNewEx({ ...newEx, paidBy: 'kenny', responsibility: 'shared' })} className={`py-4 rounded-2xl text-[10px] font-black uppercase transition-all border-2 ${newEx.paidBy === 'kenny' && newEx.responsibility !== 'por_pagar' ? 'border-[#1A73E8] bg-blue-50 text-[#1A73E8]' : 'border-transparent bg-slate-100 text-slate-400'}`}>
                    <CreditCard className="w-3 h-3 inline mr-1" /> Kenny
                  </button>
                  <button onClick={() => setNewEx({ ...newEx, responsibility: 'por_pagar', installments: 1, paidBy: 'haidar' })} className={`py-4 rounded-2xl text-[10px] font-black uppercase transition-all border-2 ${newEx.responsibility === 'por_pagar' ? 'border-indigo-600 bg-indigo-600 text-white shadow-lg' : 'border-transparent bg-indigo-50 text-indigo-400'}`}>
                    <Zap className="w-3 h-3 inline mr-1" /> Por Pagar
                  </button>
                </div>
              </div>

              {newEx.responsibility !== 'por_pagar' && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                  <p className="text-[9px] font-black text-slate-400 uppercase ml-2 tracking-widest">Ajuste de Gasto (Si no es 50/50)</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[{ id: 'shared', l: '50/50' }, { id: 'kenny', l: '100% Kenny' }, { id: 'haidar', l: '100% Haidar' }].map(o => (
                      <button key={o.id} onClick={() => setNewEx({ ...newEx, responsibility: o.id })} className={`py-4 rounded-2xl text-[9px] font-black uppercase transition-all border-2 ${newEx.responsibility === o.id ? 'border-[#1A73E8] bg-blue-50 text-[#1A73E8]' : 'border-transparent bg-slate-100 text-slate-400'}`}>
                        {o.l}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {newEx.responsibility !== 'por_pagar' && (
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                  <span className="text-[10px] font-black text-slate-500 uppercase">Diferir meses:</span>
                  <div className="flex items-center gap-6">
                    <button onClick={() => setNewEx(p => ({ ...p, installments: Math.max(1, p.installments - 1) }))} className="w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center transition-all active:scale-90"><Minus className="w-3 h-3" /></button>
                    <span className="text-sm font-black text-blue-600">{newEx.installments}</span>
                    <button onClick={() => setNewEx(p => ({ ...p, installments: p.installments + 1 }))} className="w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center transition-all active:scale-90"><Plus className="w-3 h-3" /></button>
                  </div>
                </div>
              )}

              <button onClick={saveExpense} className={`w-full py-5 rounded-3xl text-white font-black text-xs uppercase shadow-xl transition-all active:scale-[0.98] ${newEx.responsibility === 'por_pagar' ? 'bg-indigo-600' : 'bg-[#1A73E8]'}`}>
                {editingId ? 'Confirmar Cambios' : 'Añadir al total'}
              </button>
            </div>
          </div>
        )}

        <div className="bg-white border border-[#DADCE0] rounded-[32px] p-6 mb-8 shadow-sm">
          <div className="flex items-center justify-between mb-3 text-blue-600">
            <div className="flex items-center gap-2">
              <Type className="w-4 h-4" />
              <h4 className="text-[10px] font-black uppercase tracking-widest">Resumen Desglosado </h4>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={async () => {
                // Regenerar narrativa directamente desde los datos (formato garantizado)
                notify("Generando resumen...");
                try {
                  const hist = viewingHistorical;
                  let exps = [];
                  try { exps = JSON.parse(hist.expenses || '[]'); } catch { }
                  const gastos = exps.filter(e => !e.isMetadata);
                  const suman = gastos.filter(e => e.monthlyImpact > 0);
                  const restan = gastos.filter(e => e.monthlyImpact < 0);
                  const mesNombre = meses[hist.month]?.toUpperCase() || '';

                  // Construir formato base directamente (sin IA)
                  let texto = `ESTADO DE CUENTA - PENSIÓN ${mesNombre} ${hist.year}\n`;
                  texto += `==================================================\n\n`;
                  texto += `(+) BASE MENSUAL FIJA: ${fmt(hist.baseUsed || 5408)}\n\n`;

                  if (suman.length > 0) {
                    texto += `CONCEPTOS QUE SUMAN AL PAGO (+)\n`;
                    texto += `--------------------------------------------------\n`;
                    suman.forEach(s => {
                      texto += `• ${s.name}: +${fmt(s.monthlyImpact)} (${s.responsibility === 'shared' ? `Es el 50% de ${fmt(s.originalAmount)}` : 'Adeudo directo'})\n`;
                    });
                    texto += `\n`;
                  }

                  if (restan.length > 0) {
                    texto += `CONCEPTOS QUE RESTAN AL PAGO (-)\n`;
                    texto += `--------------------------------------------------\n`;
                    restan.forEach(r => {
                      texto += `• ${r.name}: -${fmt(Math.abs(r.monthlyImpact))} (${r.responsibility === 'shared' ? `Ya cubrí tu 50% de ${fmt(r.originalAmount)}` : 'Cubierto totalmente por mí'})\n`;
                    });
                    texto += `\n`;
                  }

                  texto += `==================================================\n`;
                  texto += `TOTAL FINAL A DEPOSITAR: ${fmt(hist.amount)}\n`;
                  texto += `==================================================\n\n`;
                  texto += `Nota: Se adjuntan comprobantes visuales al final de este reporte.\n\n`;
                  texto += `Saludos, Haidar Sabag.`;

                  setAiReport(texto);
                  // Guardar en historial
                  const updatedHist = { ...hist, aiReport: texto, timestamp: Date.now() };
                  setHistory(prev => prev.map(h => h.id === hist.id ? updatedHist : h));
                  const cur = JSON.parse(localStorage.getItem(STORAGE.DATA) || '{}');
                  localStorage.setItem(STORAGE.DATA, JSON.stringify({ ...cur, history: (cur.history || []).map(h => h.id === hist.id ? updatedHist : h) }));

                  const cleanHist = { ...updatedHist }; delete cleanHist.cepData; delete cleanHist.cepName;
                  await supabase.from('history').upsert(cleanHist);

                  notify('✓ Resumen regenerado y guardado');
                } catch (err) {
                  notify('Error: ' + err.message, 'error');
                }
              }} className="px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-full text-[8px] font-black uppercase hover:bg-indigo-200 transition-all flex items-center gap-1">
                <BrainCircuit className="w-3 h-3" /> Regenerar con IA
              </button>
              <div className="flex items-center gap-2 bg-blue-50 px-3 py-1.5 rounded-full">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                <span className="text-[8px] font-black uppercase text-blue-600 tracking-widest">Inteligencia Activa</span>
              </div>
            </div>
          </div>
          <textarea ref={textareaRef} value={aiReport} onChange={e => setAiReport(e.target.value)} className="w-full min-h-[200px] p-4 bg-slate-50 rounded-2xl text-xs font-mono text-slate-700 leading-relaxed outline-none resize-none border border-slate-200 shadow-inner" />
          {/* Botón Guardar Resumen cuando se está editando el texto de un mes histórico */}
          {viewingHistorical && (
            <button onClick={async () => {
              const updatedHist = { ...viewingHistorical, aiReport, timestamp: Date.now() };
              setHistory(prev => prev.map(h => h.id === viewingHistorical.id ? updatedHist : h));
              const cur = JSON.parse(localStorage.getItem(STORAGE.DATA) || '{}');
              localStorage.setItem(STORAGE.DATA, JSON.stringify({ ...cur, history: (cur.history || []).map(h => h.id === viewingHistorical.id ? updatedHist : h) }));

              const cleanHist = { ...updatedHist }; delete cleanHist.cepData; delete cleanHist.cepName;
              const { error } = await supabase.from('history').upsert(cleanHist);

              notify(error ? 'Error: ' + error.message : '✓ Resumen guardado correctamente');
            }} className="mt-3 w-full py-3 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 shadow-md">
              <Save className="w-4 h-4" /> Guardar Resumen
            </button>
          )}
        </div>

        {/* LISTADO ÚNICO UNIFICADO */}
        {(!viewingHistorical || isEditingHistorical) && (
          <div className="space-y-4 mb-16 px-2">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 tracking-[0.2em]">Movimientos registrados</p>
            {activeAjustes.map((aj, i) => (
              <div key={aj.id || i} className={`p-6 rounded-[28px] border flex justify-between items-center group transition-all animate-in slide-in-from-left-2 ${aj.responsibility === 'por_pagar' ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-100'}`}>
                <div className="flex gap-4 items-center">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm ${aj.responsibility === 'por_pagar' ? 'bg-indigo-600 text-white' : aj.monthlyImpact < 0 ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'}`}>
                    {aj.responsibility === 'por_pagar' ? <Zap className="w-6 h-6" /> : aj.isRopaVirtual ? <Shirt className="w-6 h-6" /> : <CreditCard className="w-6 h-6" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h5 className={`text-xs font-black uppercase ${aj.responsibility === 'por_pagar' ? 'text-indigo-900' : 'text-slate-700'}`}>{aj.name}</h5>
                      {aj.imageData && <FileImage className="w-3 h-3 text-green-500" />}
                    </div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
                      PAGÓ: {aj.paidBy} • {aj.responsibility === 'por_pagar' ? 'DEPÓSITO DIRECTO' : `AJUSTE (${fmt(aj.originalAmount)})`}
                    </p>
                  </div>
                </div>
                <div className="text-right flex items-center gap-4">
                  <div className={`text-lg font-black ${aj.responsibility === 'por_pagar' ? 'text-indigo-600' : aj.monthlyImpact < 0 ? 'text-red-500' : 'text-blue-600'}`}>
                    {aj.monthlyImpact < 0 ? '-' : '+'}{fmt(Math.abs(aj.monthlyImpact))}
                  </div>
                  {!aj.isRopaVirtual && (viewingHistorical ? isEditingHistorical : true) && (
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => {
                        setEditingId(aj.id);
                        setNewEx({
                          name: aj.name,
                          amount: aj.originalAmount,
                          paidBy: aj.paidBy,
                          responsibility: aj.responsibility,
                          installments: aj.installments || 1,
                          date: aj.date || new Date().toISOString().split('T')[0],
                          imageData: aj.imageData || null
                        });
                        if (formRef.current) formRef.current.scrollIntoView({ behavior: 'smooth' });
                      }} className="p-2 bg-blue-50 text-blue-500 rounded-full shadow-sm hover:bg-blue-100 transition-colors"><Pencil className="w-4 h-4" /></button>
                      <button onClick={async () => {
                        if (viewingHistorical && isEditingHistorical) {
                          const list = JSON.parse(viewingHistorical.expenses || "[]").filter(x => x.id !== aj.id);
                          // Auto-recalcular monto total
                          const newTotal = parseFloat(viewingHistorical.baseUsed || 5408) +
                            list.filter(x => !x.isMetadata).reduce((s, x) => s + (x.monthlyImpact || 0), 0);
                          const updatedHist = { ...viewingHistorical, expenses: JSON.stringify(list), amount: Math.round(newTotal * 100) / 100 };
                          setHistory(prev => prev.map(h => h.id === viewingHistorical.id ? updatedHist : h));

                          const cleanHist = { ...updatedHist }; delete cleanHist.cepData; delete cleanHist.cepName;
                          supabase.from('history').upsert(cleanHist);

                          notify(`Eliminado • Nuevo total: ${fmt(newTotal)}`);
                        } else {
                          setExpenses(e => e.filter(x => x.id !== aj.id));
                          supabase.from('expenses').delete().eq('id', aj.id).then(({ error }) => {
                            if (error) notify("Error eliminando de la nube", "error");
                          });
                        }
                      }} className="p-2 bg-red-50 text-red-500 rounded-full shadow-sm hover:bg-red-100 transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CONTROLES HISTÓRICOS */}
        {viewingHistorical && !isEditingHistorical && (
          <div className="bg-amber-50 rounded-3xl p-6 mb-8 text-center border border-amber-200">
            <p className="text-amber-800 text-xs font-bold mb-4">Estás viendo el resumen guardado interactuando únicamente con los datos finales.</p>
            <button onClick={() => setIsEditingHistorical(true)} className="px-6 py-3 bg-white text-amber-700 font-black rounded-full shadow-sm text-xs uppercase border border-amber-200 hover:bg-amber-100 transition-all flex items-center justify-center gap-2 mx-auto">
              <Pencil className="w-4 h-4" /> Editar Y ver desglose de mes
            </button>
          </div>
        )}

        {/* ACCIONES FINALES */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 px-2">
          {(!viewingHistorical || isEditingHistorical) ? (
            <button onClick={archiveMonth} className="w-full bg-[#1E8E3E] text-white rounded-3xl font-black text-xs uppercase shadow-xl flex items-center justify-center gap-3 border-b-4 border-[#125827] active:border-b-0 active:translate-y-1 transition-all py-5">
              <CheckCircle2 className="w-6 h-6" /> {viewingHistorical ? "Guardar Cambios" : "Finalizar Periodo"}
            </button>
          ) : <div />}
          <button onClick={generatePDF} className={`w-full flex items-center justify-center gap-3 py-5 bg-[#1A73E8] text-white rounded-3xl font-black text-xs uppercase shadow-xl hover:bg-blue-700 transition-all ${viewingHistorical && !isEditingHistorical ? 'col-span-1 sm:col-span-2' : ''}`}>
            <Printer className="w-5 h-5" /> {viewingHistorical ? 'Generar PDF del Mes' : 'Generar Reporte PDF'}
          </button>
        </div>

        {/* ACCIÓN DE SINCRONIZACIÓN FORZADA */}
        <div className="px-2 mt-4">
          <button onClick={async () => {
            notify("Forzando sincronización completa...");
            await loadSupabaseData();
            notify("✓ Datos actualizados desde la nube", "success");
          }} className="w-full flex items-center justify-center gap-2 py-3 bg-slate-100 text-slate-500 rounded-2xl text-[10px] font-black uppercase hover:bg-slate-200 transition-all border border-slate-200">
            <RefreshCw className="w-4 h-4" /> Forzar Sincronización con la Nube
          </button>
        </div>

        {/* Acciones del mes: CEP + Notas (disponibles siempre) */}
        <div className="flex gap-3 px-2 mt-4">
          <button onClick={() => cepInputRef.current.click()}
            className={`flex-1 py-3 rounded-2xl border text-[10px] font-black uppercase flex items-center justify-center gap-2 transition-all ${(historicalMetadata?.cepData || cepData)
              ? 'bg-green-50 text-green-700 border-green-300'
              : 'bg-white text-slate-400 border-slate-200 shadow-sm hover:bg-slate-50'
              }`}>
            <Paperclip className="w-4 h-4" />
            {(historicalMetadata?.cepData || cepData) ? 'CEP Adjunto ✓' : 'Adjuntar CEP'}
          </button>
          {/* Adjuntar múltiples tickets pero solo para el PDF, sin analizar con IA */}
          <button onClick={() => ticketsInputRef.current.click()}
            className="flex-1 py-3 rounded-2xl border text-[10px] font-black uppercase flex items-center justify-center gap-2 transition-all bg-white text-slate-400 border-slate-200 shadow-sm hover:bg-slate-50">
            <ImageIcon className="w-4 h-4" /> Adjuntar Archivos para PDF
          </button>
        </div>
        {/* Previsualización del CEP adjunto */}
        {(historicalMetadata?.cepData || cepData) && (
          <div className="px-2 mt-3">
            <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileImage className="w-8 h-8 text-green-600" />
                <div>
                  <p className="text-[10px] font-black text-green-800 uppercase">CEP Adjunto</p>
                  <p className="text-[9px] text-green-600">{(historicalMetadata?.cepName || cepData?.name) || 'comprobante.jpg'}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <a href={historicalMetadata?.cepData || cepData?.base64} download={(historicalMetadata?.cepName || cepData?.name) || 'CEP.jpg'}
                  className="px-3 py-1.5 bg-green-600 text-white rounded-xl text-[9px] font-black uppercase hover:bg-green-700 transition-all">
                  Descargar
                </a>
                <button onClick={async () => {
                  if (viewingHistorical) {
                    let list = JSON.parse(viewingHistorical.expenses || "[]");
                    let metaIdx = list.findIndex(x => x.isMetadata);
                    if (metaIdx >= 0) {
                      list[metaIdx].cepData = null;
                      list[metaIdx].cepName = null;
                    }
                    const updatedHist = { ...viewingHistorical, expenses: JSON.stringify(list), timestamp: Date.now() };
                    setHistory(prev => prev.map(h => h.id === viewingHistorical.id ? updatedHist : h));
                    const cur = JSON.parse(localStorage.getItem(STORAGE.DATA) || '{}');
                    localStorage.setItem(STORAGE.DATA, JSON.stringify({ ...cur, history: (cur.history || []).map(h => h.id === viewingHistorical.id ? updatedHist : h) }));

                    const cleanHist = { ...updatedHist }; delete cleanHist.cepData; delete cleanHist.cepName;
                    await supabase.from('history').upsert(cleanHist);
                  } else {
                    setCepData(null);
                    setPendingMetadata(m => m ? { ...m, cepData: null, cepName: null } : null);
                  }
                  notify('CEP eliminado');
                }} className="px-3 py-1.5 bg-red-100 text-red-600 rounded-xl text-[9px] font-black uppercase hover:bg-red-200 transition-all">
                  Quitar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Previsualización de Notas / Tickets Adjuntos */}
        {((viewingHistorical ? historicalMetadata?.ticketsData : pendingMetadata?.ticketsData) || []).length > 0 && (
          <div className="px-2 mt-3 space-y-2">
            {((viewingHistorical ? historicalMetadata?.ticketsData : pendingMetadata?.ticketsData) || []).map((ticket, idx) => (
              <div key={idx} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 overflow-hidden">
                  <ImageIcon className="w-8 h-8 text-slate-400 shrink-0" />
                  <div className="truncate">
                    <p className="text-[10px] font-black text-slate-600 uppercase">Nota / Ticket {idx + 1}</p>
                    <p className="text-[9px] text-slate-500 truncate">{ticket.name || `imagen_${idx + 1}.jpg`}</p>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0 ml-2">
                  <a href={ticket.data} download={ticket.name || `Ticket_${idx + 1}.jpg`}
                    className="px-3 py-1.5 bg-slate-200 text-slate-700 rounded-xl text-[9px] font-black uppercase hover:bg-slate-300 transition-all">
                    Descargar
                  </a>
                  <button onClick={async () => {
                    if (viewingHistorical) {
                      let list = JSON.parse(viewingHistorical.expenses || "[]");
                      let metaIdx = list.findIndex(x => x.isMetadata);
                      if (metaIdx >= 0 && list[metaIdx].ticketsData) {
                        list[metaIdx].ticketsData.splice(idx, 1);
                      }
                      const updatedHist = { ...viewingHistorical, expenses: JSON.stringify(list), timestamp: Date.now() };
                      setHistory(prev => prev.map(h => h.id === viewingHistorical.id ? updatedHist : h));
                      const cur = JSON.parse(localStorage.getItem(STORAGE.DATA) || '{}');
                      localStorage.setItem(STORAGE.DATA, JSON.stringify({ ...cur, history: (cur.history || []).map(h => h.id === viewingHistorical.id ? updatedHist : h) }));

                      const cleanHist = { ...updatedHist }; delete cleanHist.cepData; delete cleanHist.cepName;
                      await supabase.from('history').upsert(cleanHist);
                    } else {
                      setPendingMetadata(m => {
                        const nextMeta = { ...m };
                        if (nextMeta.ticketsData) nextMeta.ticketsData.splice(idx, 1);
                        return nextMeta;
                      });
                    }
                    notify('Ticket eliminado');
                  }} className="px-3 py-1.5 bg-red-100 text-red-600 rounded-xl text-[9px] font-black uppercase hover:bg-red-200 transition-all">
                    Quitar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>


      {/* MODAL HISTORIAL */}
      {showHistory && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-md z-[2000] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[44px] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-8 border-b flex justify-between bg-slate-50">
              <h3 className="font-black text-xs uppercase text-slate-500">Historial de Meses</h3>
              <button onClick={() => setShowHistory(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 overflow-y-auto space-y-3 flex-1 custom-scroll">
              {(history || []).length === 0 ? (
                <div className="text-center p-8 bg-blue-50/50 rounded-[28px] border border-blue-100/50">
                  <p className="text-xs font-bold text-blue-800 mb-2">No tienes meses archivados</p>
                  <p className="text-[10px] text-blue-600/80 leading-relaxed font-medium">Para crear un archivo histórico, usa las flechas (+ / -) para ir a un mes pasado, agrega movimientos y presiona <b>"FINALIZAR PERIODO"</b>.</p>
                </div>
              ) : (
                (history || []).map(h => h && (
                  <HistoryItem key={h.id} h={h} meses={meses} fmt={fmt}
                    onEdit={() => { setMonth(h.month); setYear(h.year); setIsEditingHistorical(true); setShowHistory(false); }}
                    onSaveAmount={async (newAmount) => {
                      const updated = { ...h, amount: parseFloat(newAmount), timestamp: Date.now() };
                      setHistory(prev => prev.map(x => x.id === h.id ? updated : x));
                      const cur = JSON.parse(localStorage.getItem(STORAGE.DATA) || '{}');
                      localStorage.setItem(STORAGE.DATA, JSON.stringify({ ...cur, history: (cur.history || []).map(x => x.id === h.id ? updated : x) }));
                      const cleanUpdated = { ...updated }; delete cleanUpdated.cepData; delete cleanUpdated.cepName;
                      const { error } = await supabase.from('history').upsert(cleanUpdated);
                      notify(error ? 'Error al guardar en nube' : `✓ ${meses[h.month]} actualizado a ${fmt(parseFloat(newAmount))}`);
                    }}
                  />
                ))
              )}
            </div>
            <div className="p-4 bg-slate-50 border-t flex justify-center">
              <button onClick={async () => {
                if (window.confirm("¿BORRAR TODO EL HISTORIAL Y DATOS EN LA NUBE? ¡ESTO ES IRREVERSIBLE!")) {
                  await supabase.from('history').delete().neq('id', '0');
                  await supabase.from('expenses').delete().neq('id', '0');
                  window.location.reload();
                }
              }} className="text-[9px] font-black text-red-400 uppercase tracking-widest">Borrar Historial en Nube</button>
            </div>
          </div>
        </div>
      )}

      {/* INPUTS OCULTOS */}
      <input type="file" ref={galleryInputRef} accept="image/*" capture="environment" className="hidden" onChange={handleImageScan} />
      <input type="file" ref={ticketsInputRef} accept="image/*" multiple className="hidden" onChange={(e) => handleAttachment(e, 'tickets')} />
      <input type="file" ref={cepInputRef} accept="image/*" className="hidden" onChange={(e) => handleAttachment(e, 'cep')} />
      {/* MODAL CONFIGURACIÓN API KEY */}
      {showConfig && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-md z-[2000] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[44px] shadow-2xl overflow-hidden flex flex-col">
            <div className="p-8 border-b flex justify-between bg-slate-50">
              <h3 className="font-black text-xs uppercase text-slate-500 flex items-center gap-2"><Lock className="w-4 h-4" /> Configuración Gemini</h3>
              <button onClick={() => setShowConfig(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-[10px] text-slate-500 font-medium leading-relaxed uppercase tracking-tighter">
                Motores de Inteligencia Híbrida (Failover Activo)
              </p>

              <div>
                <span className="text-[9px] font-black uppercase text-slate-400 ml-2">Google Gemini:</span>
                <input type="password" value={keys.gemini} onChange={e => setKeys(p => ({ ...p, gemini: e.target.value }))} placeholder="AIzaSy..." className="w-full mt-1 bg-slate-50 p-3 rounded-xl outline-none text-xs font-mono border border-slate-200 focus:border-blue-400 transition-all" />
              </div>

              <div>
                <span className="text-[9px] font-black uppercase text-slate-400 ml-2">Groq Vision:</span>
                <input type="password" value={keys.groq} onChange={e => setKeys(p => ({ ...p, groq: e.target.value }))} placeholder="gsk_..." className="w-full mt-1 bg-slate-50 p-3 rounded-xl outline-none text-xs font-mono border border-slate-200 focus:border-orange-400 transition-all" />
              </div>

              <div>
                <span className="text-[9px] font-black uppercase text-slate-400 ml-2">OpenRouter (Pro):</span>
                <input type="password" value={keys.openrouter} onChange={e => setKeys(p => ({ ...p, openrouter: e.target.value }))} placeholder="sk-or-v1-..." className="w-full mt-1 bg-slate-50 p-3 rounded-xl outline-none text-xs font-mono border border-slate-200 focus:border-purple-400 transition-all" />
              </div>

              <button onClick={() => {
                localStorage.setItem(STORAGE.GEMINI, keys.gemini);
                localStorage.setItem(STORAGE.GROQ, keys.groq);
                localStorage.setItem(STORAGE.OPENROUTER, keys.openrouter);
                notify("Llaves de IA sincronizadas ✓");
                setShowConfig(false);
              }} className="w-full py-4 mt-2 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase shadow-lg hover:bg-black transition-all">
                Guardar Configuración
              </button>
            </div>
          </div>
        </div>
      )}

      {isScanning && (
        <div className="fixed inset-0 bg-white/95 z-[6000] flex flex-col items-center justify-center animate-in fade-in">
          <div className="relative">
            <div className="w-24 h-24 border-4 border-slate-100 border-t-blue-600 rounded-full animate-spin"></div>
            <BrainCircuit className="w-12 h-12 text-blue-600 absolute inset-0 m-auto animate-pulse" />
          </div>
          <p className="text-[10px] font-black mt-8 uppercase tracking-[0.6em] text-blue-600 animate-pulse text-center">Analizando nota y<br />capturando evidencia...</p>
        </div>
      )}

      {toasts.map(t => (
        <div key={t.id} className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-6 py-3 rounded-full text-xs font-black shadow-2xl z-[9000] flex items-center gap-2 animate-in slide-in-from-bottom-2">
          {t.type === 'error' ? <AlertCircle className="w-4 h-4 text-red-400" /> : <CheckCircle2 className="w-4 h-4 text-green-400" />}
          {t.msg}
        </div>
      ))}

      <style dangerouslySetInnerHTML={{ __html: `::-webkit-scrollbar { display: none; } .custom-scroll { scrollbar-width: none; }` }} />
    </div>
  );
};

export default App;
