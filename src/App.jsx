import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Trash2, Calendar, CheckCircle2, Plus, Minus, BrainCircuit, Pencil, X,
  Image as ImageIcon, History, Printer, Eye, ShoppingBag, CreditCard,
  Lock, Unlock, Paperclip, Type, Shirt, FileImage, Wallet, Fingerprint,
  Database, Save, Download, AlertCircle, RefreshCw, Zap, Layers, User
} from 'lucide-react';

import { supabase } from './supabaseClient';

// --- CONFIGURACIÓN TÉCNICA (ENTORNO PREVIEW) ---
const apiKey = "";
// const APP_STORAGE_KEY = "pension_hadi_offline_data_v25"; // Legacy

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

const App = () => {
  // --- 1. ESTADOS PRINCIPALES ---
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [expenses, setExpenses] = useState([]);
  const [history, setHistory] = useState([]);
  const [manualBase, setManualBase] = useState(5408);

  // UI States
  const [showHistory, setShowHistory] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [aiReport, setAiReport] = useState("");
  const [isEditingHistorical, setIsEditingHistorical] = useState(false);
  const [cepAttached, setCepAttached] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [libsReady, setLibsReady] = useState(false);

  const galleryInputRef = useRef();
  const cepInputRef = useRef();
  const textareaRef = useRef(null);
  const formRef = useRef(null);

  const [newEx, setNewEx] = useState({
    name: "", amount: "", paidBy: "haidar", responsibility: "shared", installments: 1, date: new Date().toISOString().split('T')[0], imageData: null
  });

  // --- NOTIFICACIONES ---
  const notify = useCallback((msg, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg: String(msg), type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  // --- SINCRONIZACIÓN SUPABASE ---
  const loadSupabaseData = async () => {
    try {
      // 1. Cargar gastos
      const { data: expData, error: expErr } = await supabase.from('expenses').select('*');
      if (expData) setExpenses(expData);

      // 2. Cargar historial
      const { data: histData, error: histErr } = await supabase.from('history').select('*').order('timestamp', { ascending: false });
      if (histData) setHistory(histData);

      // 3. Cargar Base Manual (Configuración General)
      const { data: confData, error: confErr } = await supabase.from('config').select('base_manual').single();
      if (confData && confData.base_manual) setManualBase(confData.base_manual);

    } catch (error) {
      console.error("Error sincronizando Supabase", error);
      notify("Error de conexión con la base de datos.", "error");
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
        await loadScript('https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js');
        setLibsReady(true);
        await loadSupabaseData();
      } catch (e) { console.error("Error cache loading"); }
    };
    init();
  }, []);

  // --- LÓGICA DE CÁLCULOS ---
  const viewingHistorical = useMemo(() => history.find(h => h.month === month && h.year === year) || null, [history, month, year]);

  const currentBase = useMemo(() => {
    if (viewingHistorical) return Number(viewingHistorical.baseUsed) || 5408;
    const diffYears = year - 2026;
    const baseCalculada = diffYears > 0 ? manualBase * Math.pow(1.04, diffYears) : manualBase;
    return Math.round(baseCalculada * 100) / 100;
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
      try { list = JSON.parse(viewingHistorical.expenses) || []; } catch { list = []; }
    } else {
      list = expenses.map(ex => calculateImpact(ex)).filter(r => r.monthlyImpact !== 0);
    }

    if ((month === 4 || month === 10) && !list.some(x => x.isRopaVirtual)) {
      list.unshift({
        name: "CUOTA DE ROPA (ESTACIONAL)", monthlyImpact: 1500, originalAmount: 1500,
        paidBy: "SISTEMA", isRopaVirtual: true, date: `${year}-${String(month + 1).padStart(2, '0')}-01`, id: 'ropa-v', responsibility: 'shared'
      });
    }
    return list;
  }, [expenses, viewingHistorical, month, year]);

  const totalFinal = useMemo(() => {
    const ajustesTotal = activeAjustes.reduce((acc, curr) => acc + (curr.monthlyImpact || 0), 0);
    return Math.ceil((currentBase + ajustesTotal) * 100) / 100;
  }, [currentBase, activeAjustes]);

  // --- GENERADOR DE NARRATIVA QUIRÚRGICA ---
  const generatedNarrative = useMemo(() => {
    if (viewingHistorical && !isEditingHistorical) return viewingHistorical.aiReport || "";

    const suman = activeAjustes.filter(a => a.monthlyImpact > 0);
    const restan = activeAjustes.filter(a => a.monthlyImpact < 0);

    let text = `ESTADO DE CUENTA - PENSIÓN ${meses[month]} ${year}\n`;
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

  useEffect(() => { setAiReport(generatedNarrative); }, [generatedNarrative]);

  // --- MOTOR DE ESCANEO REFORZADO (SOLUCIÓN 401) ---
  const handleImageScan = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsScanning(true);

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Data = reader.result.split(',')[1];
      const mimeType = file.type || "image/jpeg";
      const promptText = "Analiza este ticket de gasto. Extrae concepto corto (max 3 palabras) y monto total. Responde exclusivamente con un objeto JSON plano: {\"name\": \"...\", \"amount\": 00.00}";

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

      const fetchWithRetry = async (retryCount = 0) => {
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                role: "user",
                parts: [
                  { text: promptText },
                  { inlineData: { mimeType, data: base64Data } }
                ]
              }],
              generationConfig: { responseMimeType: "application/json" }
            })
          });

          if (!response.ok) {
            const errText = await response.text();
            throw new Error(`API ${response.status}: ${errText}`);
          }

          const result = await response.json();
          const aiText = result.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!aiText) throw new Error("Respuesta vacía");

          const parsed = JSON.parse(aiText);

          setNewEx(prev => ({
            ...prev,
            name: String(parsed.name || "").toUpperCase(),
            amount: String(parsed.amount || ""),
            imageData: reader.result
          }));

          notify("Nota escaneada correctamente");
          setIsScanning(false);
        } catch (err) {
          if (retryCount < 5 && !err.message.includes('401')) {
            const delays = [1000, 2000, 4000, 8000, 16000];
            setTimeout(() => fetchWithRetry(retryCount + 1), delays[retryCount]);
          } else {
            console.error("Scan Failed:", err);
            notify("Error de conexión IA. Intenta captura manual.", "error");
            setIsScanning(false);
          }
        }
      };

      fetchWithRetry();
    };
    reader.readAsDataURL(file);
  };

  const saveExpense = async () => {
    if (!newEx.name || !newEx.amount) {
      notify("Faltan datos", "error");
      return;
    }
    const impactData = calculateImpact({ ...newEx, amount: parseFloat(newEx.amount), id: editingId || Date.now().toString() });

    // Save to Supabase
    const { error } = await supabase.from('expenses').upsert(impactData);
    if (error) {
      console.error(error);
      notify("Error guardando gasto en la nube", "error");
      return;
    }

    if (editingId) {
      setExpenses(prev => prev.map(ex => ex.id === editingId ? { ...impactData, id: editingId } : ex));
    } else {
      setExpenses(prev => [...prev, impactData]);
    }
    notify("Gasto guardado con éxito");
    resetForm();
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

    const histRow = { id, month, year, amount: totalFinal, aiReport, expenses: JSON.stringify(activeAjustes), baseUsed: currentBase, timestamp: Date.now() };

    // Update History Record In Supabase
    const { error: histError } = await supabase.from('history').upsert(histRow);
    if (histError) {
      console.error(histError);
      notify("Error archivando periodo en la nube", "error");
      return;
    }

    const nextExpenses = expenses.map(ex => ({ ...ex, installments: Math.max(1, ex.installments - 1) })).filter(ex => ex.installments > 0 || ex.responsibility === 'por_pagar');

    // Update Expenses Record In Supabase (Delete old, Insert new)
    await supabase.from('expenses').delete().neq('id', '0'); // Wipe all current
    if (nextExpenses.length > 0) {
      await supabase.from('expenses').insert(nextExpenses);
    }

    // Update Local State
    if (history.some(h => h.id === id)) {
      setHistory(h => h.filter(x => x.id !== id));
    }
    setHistory(prev => [histRow, ...prev]);
    setExpenses(nextExpenses);
    notify("Periodo archivado");
  };

  const generatePDF = async () => {
    if (!libsReady) return;
    notify("Generando Reporte PDF...");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(18); doc.setTextColor(26, 115, 232);
    doc.text("ESTADO DE CUENTA - PENSIÓN ALIMENTICIA", 20, 20);
    doc.setFontSize(10); doc.setTextColor(100);
    doc.text(`${meses[month]} ${year}`, 20, 28);
    doc.setFontSize(10); doc.setTextColor(0);
    doc.setFont("courier", "normal");
    doc.text(doc.splitTextToSize(aiReport, 170), 20, 45);
    doc.setFontSize(14); doc.setFont("helvetica", "bold");
    doc.text(`DEPÓSITO FINAL: ${fmt(totalFinal)}`, 20, 210);

    const { PDFDocument } = window.PDFLib;
    const mainPdfBytes = doc.output('arraybuffer');
    let finalPdf = await PDFDocument.load(mainPdfBytes);

    for (const aj of activeAjustes) {
      if (aj.imageData) {
        const page = finalPdf.addPage();
        const { width, height } = page.getSize();
        try {
          const imgBuffer = await (await fetch(aj.imageData)).arrayBuffer();
          const img = aj.imageData.includes('png') ? await finalPdf.embedPng(imgBuffer) : await finalPdf.embedJpg(imgBuffer);
          const dims = img.scaleToFit(width - 40, height - 100);
          page.drawText(`EVIDENCIA: ${aj.name}`, { x: 20, y: height - 40, size: 14 });
          page.drawImage(img, { x: 20, y: height - 60 - dims.height, width: dims.width, height: dims.height });
        } catch (e) { console.error("PDF Embedding Error", e); }
      }
    }

    if (cepAttached) {
      const cepBuffer = await cepAttached.arrayBuffer();
      if (cepAttached.type === 'application/pdf') {
        const cepPdf = await PDFDocument.load(cepBuffer);
        const copied = await finalPdf.copyPages(cepPdf, cepPdf.getPageIndices());
        copied.forEach(p => finalPdf.addPage(p));
      } else {
        const page = finalPdf.addPage();
        const img = cepAttached.type === 'image/png' ? await finalPdf.embedPng(cepBuffer) : await finalPdf.embedJpg(cepBuffer);
        page.drawImage(img, { x: 50, y: 50, width: 100, height: 130 });
      }
    }

    const pdfOutput = await finalPdf.save();
    downloadBlob(new Blob([pdfOutput], { type: 'application/pdf' }), `PENSION_HADI_${meses[month]}.pdf`);
    notify("Reporte descargado");
  };

  const downloadBlob = (blob, name) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#202124] font-sans pb-20 selection:bg-blue-100">

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
          <button onClick={() => setShowHistory(true)} className="p-3 bg-slate-50 hover:bg-slate-100 rounded-2xl text-slate-600 shadow-sm transition-all"><History className="w-5 h-5" /></button>
        </div>

        {/* SELECTOR */}
        <div className="bg-white border border-[#DADCE0] rounded-3xl p-6 mb-6 shadow-sm">
          <div className="flex justify-between items-center">
            <div className="flex-1">
              <p className="text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest">Base Mensual Activa</p>
              <div className="text-3xl font-black text-[#1A73E8] tracking-tighter">{fmt(currentBase)}</div>
            </div>
            <div className="flex items-center bg-[#F1F3F4] p-1.5 rounded-full border border-[#DADCE0]">
              <button onClick={() => setMonth(m => m === 0 ? (setYear(y => y - 1), 11) : m - 1)} className="p-1 hover:bg-white rounded-full shadow-sm transition-all"><Minus className="w-4 h-4" /></button>
              <span className="mx-4 text-[10px] font-black uppercase min-w-[100px] text-center">{meses[month]} {year}</span>
              <button onClick={() => setMonth(m => m === 11 ? (setYear(y => y + 1), 0) : m + 1)} className="p-1 hover:bg-white rounded-full shadow-sm"><Plus className="w-4 h-4" /></button>
            </div>
          </div>
        </div>

        {/* TOTAL BANNER */}
        <div className="bg-white border-b-4 border-[#1A73E8] rounded-[40px] p-12 text-center shadow-md mb-8 relative overflow-hidden group">
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] mb-4 italic">Monto Final del Depósito</p>
          <h2 className="text-7xl font-black tracking-tighter text-slate-900 animate-in slide-in-from-top-2">{fmt(totalFinal)}</h2>
        </div>

        {/* FORMULARIO UNIFICADO */}
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

        {/* NARRATIVA RESUMEN */}
        <div className="bg-white border border-[#DADCE0] rounded-[32px] p-6 mb-8 shadow-sm">
          <div className="flex items-center gap-2 mb-3 text-blue-600">
            <Type className="w-4 h-4" />
            <h4 className="text-[10px] font-black uppercase tracking-widest">Resumen Desglosado</h4>
          </div>
          <textarea ref={textareaRef} value={aiReport} onChange={e => setAiReport(e.target.value)} className="w-full min-h-[200px] p-4 bg-slate-50 rounded-2xl text-xs font-mono text-slate-700 leading-relaxed outline-none resize-none border border-slate-200 shadow-inner" />
        </div>

        {/* LISTADO ÚNICO UNIFICADO */}
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
                {!aj.isRopaVirtual && (!viewingHistorical || isEditingHistorical) && (
                  <button onClick={async () => {
                    const { error } = await supabase.from('expenses').delete().eq('id', aj.id);
                    if (!error) setExpenses(e => e.filter(x => x.id !== aj.id));
                  }} className="p-2 bg-red-50 text-red-500 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-4 h-4" /></button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* ACCIONES FINALES */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 px-2">
          <div className="flex flex-col gap-2">
            <button onClick={archiveMonth} className="w-full bg-[#1E8E3E] text-white rounded-3xl font-black text-xs uppercase shadow-xl flex items-center justify-center gap-3 border-b-4 border-[#125827] active:border-b-0 active:translate-y-1 transition-all py-5">
              <CheckCircle2 className="w-6 h-6" /> Finalizar Periodo
            </button>
            <button onClick={() => cepInputRef.current.click()} className={`w-full py-3 rounded-2xl border text-[10px] font-black uppercase flex items-center justify-center gap-2 transition-all ${cepAttached ? 'bg-green-50 text-green-700 border-green-200' : 'bg-white text-slate-400 border-slate-200 shadow-sm'}`}>
              <Paperclip className="w-4 h-4" /> {cepAttached ? 'CEP Vinculado ✓' : 'Adjuntar CEP Pago'}
            </button>
          </div>
          <button onClick={generatePDF} className="w-full flex items-center justify-center gap-3 py-5 bg-[#1A73E8] text-white rounded-3xl font-black text-xs uppercase shadow-xl hover:bg-blue-700 transition-all">
            <Printer className="w-5 h-5" /> Reporte PDF + Fotos
          </button>
        </div>
      </div>

      {/* MODAL HISTORIAL */}
      {showHistory && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-md z-[2000] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[44px] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-8 border-b flex justify-between bg-slate-50">
              <h3 className="font-black text-xs uppercase text-slate-500">Historial Local</h3>
              <button onClick={() => setShowHistory(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 overflow-y-auto space-y-3 flex-1 custom-scroll">
              {history.map(h => (
                <div key={h.id} className="p-5 border border-slate-100 rounded-[28px] flex justify-between items-center hover:bg-blue-50/50 transition-all group">
                  <div><p className="text-[9px] font-black text-slate-400">{h.year}</p><h4 className="font-black text-sm uppercase text-slate-700">{meses[h.month]}</h4></div>
                  <div className="flex items-center gap-3"><span className="text-base font-black text-[#1A73E8]">{fmt(h.amount)}</span><button onClick={() => { setMonth(h.month); setYear(h.year); setShowHistory(false); }} className="p-3 bg-blue-50 text-blue-600 rounded-2xl hover:bg-blue-600 hover:text-white transition-all"><Eye className="w-5 h-5" /></button></div>
                </div>
              ))}
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

      <input type="file" ref={galleryInputRef} accept="image/*" className="hidden" onChange={handleImageScan} />
      <input type="file" ref={cepInputRef} accept="application/pdf,image/*" className="hidden" onChange={(e) => { setCepAttached(e.target.files[0]); notify("CEP Adjuntado"); }} />

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
