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

const App = () => {
  // --- 1. ESTADOS PRINCIPALES ---
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [expenses, setExpenses] = useState([]);
  const [history, setHistory] = useState([]);
  const [manualBase, setManualBase] = useState(5408);
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
  const [cepAttached, setCepAttached] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [libsReady, setLibsReady] = useState(false);
  const [pendingMetadata, setPendingMetadata] = useState(null);
  const [tempTotalManual, setTempTotalManual] = useState("");

  const galleryInputRef = useRef();
  const cepInputRef = useRef();
  const pdfAnalysisInputRef = useRef();
  const manualPdfRef = useRef();
  const manualTicketsRef = useRef();
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

  // --- SINCRONIZACIÓN HÍBRIDA (SUPABASE + LOCALSTORAGE) ---
  const loadSupabaseData = async () => {
    try {
      const { data: expData, error: expError } = await supabase.from('expenses').select('*');
      if (expError) throw expError;
      if (expData) setExpenses(expData);

      const { data: histData, error: histError } = await supabase.from('history').select('*').order('timestamp', { ascending: false });
      if (histError) throw histError;
      if (histData) setHistory(histData);

      // maybeSingle: no lanza error si la tabla config está vacía
      const { data: confData } = await supabase.from('config').select('base_manual').maybeSingle();
      if (confData?.base_manual) setManualBase(confData.base_manual);

      if (expData && histData) {
        localStorage.setItem(STORAGE.DATA, JSON.stringify({ expenses: expData, history: histData, manualBase: confData?.base_manual || 5408 }));
      }
    } catch (error) {
      console.error("Supabase Offline", error);
      notify("Modo Offline Activado (Caché v31)", "error");
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
        await loadScript('https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js');
        // PDF.js para lectura/extracción de texto de PDFs
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.mjs');
        if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.mjs';
        setLibsReady(true);

        const savedV25 = localStorage.getItem("pension_hadi_offline_data_v25");
        const saved = localStorage.getItem(STORAGE.DATA);

        if (saved) {
          try {
            const data = JSON.parse(saved);
            if (Array.isArray(data.expenses)) setExpenses(data.expenses);
            if (Array.isArray(data.history)) setHistory(data.history);
            if (data.manualBase) setManualBase(data.manualBase);
          } catch (e) { console.error("Error legacy data", e); }
        } else if (savedV25) {
          try {
            const data25 = JSON.parse(savedV25);
            if (Array.isArray(data25.expenses)) setExpenses(data25.expenses);
            if (Array.isArray(data25.history)) setHistory(data25.history);
            if (data25.manualBase) setManualBase(data25.manualBase);
            localStorage.setItem(STORAGE.DATA, savedV25);
            notify("¡Historial anterior recuperado!", "success");
          } catch (e) { console.error("Error migration", e); }
        }

        await loadSupabaseData();
      } catch (e) { console.error("Error init"); }
    };
    init();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE.DATA, JSON.stringify({ expenses, history, manualBase }));
    } catch (e) {
      if (e.name === 'QuotaExceededError') notify("Cache lleno. Limpia el historial.", "error");
    }
  }, [expenses, history, manualBase, notify]);

  // --- LÓGICA DE CÁLCULOS ---
  const viewingHistorical = useMemo(() => {
    return (history || []).find(h => h && h.month === month && h.year === year) || null;
  }, [history, month, year]);

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
        setCepAttached(b64);
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
      setCepAttached(null);
    } else {
      setAiReport("");
      setTempTotalManual("");
      setCepAttached(null);
    }
  }, [month, year, viewingHistorical]);

  useEffect(() => { setAiReport(generatedNarrative); }, [generatedNarrative]);

  // --- MOTOR DE IA UNIVERSAL TRI-FASE ---
  const callAiFailover = async ({ prompt, imageBase64, mimeType }) => {
    const configs = [
      {
        provider: 'GEMINI',
        key: keys.gemini,
        models: ['gemini-1.5-flash', 'gemini-1.5-pro'],
        call: async (key, model) => {
          const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${key}`;
          const res = await fetch(url, {
            method: 'POST',
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }, ...(imageBase64 ? [{ inlineData: { mimeType, data: imageBase64 } }] : [])] }],
              generationConfig: { responseMimeType: "application/json" }
            })
          });
          const json = await res.json();
          return json.candidates?.[0]?.content?.parts?.[0]?.text;
        }
      },
      {
        provider: 'GROQ',
        key: keys.groq,
        models: ['llama-3.2-11b-vision-preview', 'llama-3.3-70b-versatile'],
        call: async (key, model) => {
          const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model,
              messages: [{
                role: "user", content: [
                  { type: "text", text: prompt },
                  ...(imageBase64 ? [{ type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } }] : [])
                ]
              }],
              response_format: { type: "json_object" }
            })
          });
          const json = await res.json();
          return json.choices?.[0]?.message?.content;
        }
      },
      {
        provider: 'OPENROUTER',
        key: keys.openrouter,
        models: ['google/gemini-flash-1.5', 'meta-llama/llama-3.2-11b-vision-instruct:free'],
        call: async (key, model) => {
          const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model,
              messages: [{
                role: "user", content: [
                  { type: "text", text: prompt },
                  ...(imageBase64 ? [{ type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } }] : [])
                ]
              }]
            })
          });
          const json = await res.json();
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
    const file = e.target.files?.[0];
    if (!file) return;
    setIsScanning(true);

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Data = reader.result.split(',')[1];
      const mimeType = file.type || "image/jpeg";
      const prompt = "Analiza este ticket. Responde SOLO JSON plano: {\"name\": \"...\", \"amount\": 00.00}";

      try {
        const { text, model } = await callAiFailover({ prompt, imageBase64: base64Data, mimeType });
        const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
        setNewEx(prev => ({ ...prev, name: String(parsed.name || "").toUpperCase(), amount: String(parsed.amount || ""), imageData: reader.result }));
        notify(`Escaneado vía ${model}`);
      } catch (err) {
        notify("Cámara/IA falló. Captura manual.", "error");
      } finally {
        setIsScanning(false);
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

        if (docText.trim().length > 20) {
          // PDF con texto: cualquier IA lo puede procesar
          const textPrompt = `Eres un asistente financiero de pensión alimenticia. Analiza el siguiente texto extraído de un reporte de pensión y extrae TODOS los movimientos financieros.\n\nTEXTO DEL REPORTE:\n${docText}\n\nDevuelve EXCLUSIVAMENTE este JSON sin texto adicional:\n{"base":5408.00,"totalFinal":5408.00,"aiReport":"Resumen del mes","expenses":[{"name":"CONCEPTO MAYUSCULAS","amount":100.00,"paidBy":"haidar","responsibility":"shared","installments":1}]}\nResponsabilidad: shared=50/50, kenny=solo kenny, haidar=haidar pagó por kenny, por_pagar=depósito directo.`;
          const { text: aiText, model } = await callAiFailover({ prompt: textPrompt });
          const jsonMatch = aiText.replace(/```json|```/gi, '').match(/\{[\s\S]*\}/);
          if (!jsonMatch) throw new Error(`Sin JSON: ${aiText.substring(0, 150)}`);
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
          supabase.from('history').upsert(histRow).then(({ error }) => { if (!error) notify(`✓ ${newExpenses.length} movimientos registrados vía ${model}`); });
          return;
        } else {
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

      // Vision para imágenes y PDFs escaneados
      const visionPrompt = `Analiza este documento de pensión y extrae todos los movimientos. Devuelve SOLO JSON:\n{"base":5408.00,"totalFinal":5408.00,"aiReport":"Resumen","expenses":[{"name":"CONCEPTO","amount":100.00,"paidBy":"haidar","responsibility":"shared","installments":1}]}`;
      let responseText, usedModel;
      if (mimeType === 'application/pdf' && keys.gemini) {
        const gemRes = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${keys.gemini}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: visionPrompt }, { inlineData: { mimeType, data: imageBase64 } }] }], generationConfig: { temperature: 0.1 } }) });
        const gemJson = await gemRes.json();
        if (gemJson.error) throw new Error(`Gemini: ${gemJson.error.message}`);
        responseText = gemJson.candidates?.[0]?.content?.parts?.[0]?.text;
        usedModel = 'Gemini Vision';
      } else {
        const res = await callAiFailover({ prompt: visionPrompt, imageBase64, mimeType });
        responseText = res.text; usedModel = res.model;
      }
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
      supabase.from('history').upsert(histRow).then(({ error }) => { if (!error) notify(`✓ ${newExpenses.length} movimientos registrados vía ${usedModel}`); });

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

      const updatedHist = { ...viewingHistorical, expenses: JSON.stringify(list) };
      setHistory(prev => prev.map(h => h.id === viewingHistorical.id ? updatedHist : h));

      supabase.from('history').update({ expenses: JSON.stringify(list) }).eq('id', viewingHistorical.id).then(({ error }) => {
        if (error) notify("Offline: Guardado en Historial", "error");
      });

      notify("Gasto histórico actualizado");
      resetForm();
      downloadTicketIfNew(impactData);
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

    const histRow = { id, month, year, amount: totalFinal, aiReport, expenses: JSON.stringify(finalExpensesList), baseUsed: currentBase, timestamp: Date.now() };
    const nextExpenses = expenses.map(ex => ({ ...ex, installments: Math.max(1, ex.installments - 1) })).filter(ex => ex.installments > 0 || ex.responsibility === 'por_pagar');

    // Update Local State Optimista
    if (history.some(h => h.id === id)) {
      setHistory(h => h.filter(x => x.id !== id));
    }
    setHistory(prev => [histRow, ...prev]);
    setExpenses(nextExpenses);
    notify("Periodo archivado. Sincronizando...");

    // Sync History Supabase
    supabase.from('history').upsert(histRow).then(({ error: histError }) => {
      if (histError) console.error(histError);
    });

    // Sync Expenses Supabase
    supabase.from('expenses').delete().neq('id', '0').then(async () => {
      if (nextExpenses.length > 0) {
        await supabase.from('expenses').insert(nextExpenses);
      }
    });
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

    let meta = pendingMetadata || activeAjustes.find(x => x.isMetadata);
    if (viewingHistorical) meta = JSON.parse(viewingHistorical.expenses || "[]").find(x => x.isMetadata) || meta;

    if (meta && meta.pdfData) {
      try {
        const byteString = window.atob(meta.pdfData.split(',')[1]);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
        const repPdf = await PDFDocument.load(ab);
        const copied = await finalPdf.copyPages(repPdf, repPdf.getPageIndices());
        copied.forEach(p => finalPdf.addPage(p));
      } catch (e) { console.error("Error merging PDF report manual", e); }
    }

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

    if (meta && meta.ticketsData) {
      for (const t of meta.ticketsData) {
        try {
          const page = finalPdf.addPage();
          const { width, height } = page.getSize();
          const byteString = window.atob(t.data.split(',')[1]);
          const ab = new ArrayBuffer(byteString.length);
          const ia = new Uint8Array(ab);
          for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
          const img = t.type.includes('png') ? await finalPdf.embedPng(ab) : await finalPdf.embedJpg(ab);
          const dims = img.scaleToFit(width - 40, height - 100);
          page.drawText(`EVIDENCIA ADJUNTA: ${t.name}`, { x: 20, y: height - 40, size: 14 });
          page.drawImage(img, { x: 20, y: height - 60 - dims.height, width: dims.width, height: dims.height });
        } catch (e) { console.error("Error embedding manual ticket", e); }
      }
    }

    let cepToProcess = cepAttached;
    if (meta && meta.cepData && typeof meta.cepData === 'string' && !cepToProcess) {
      try {
        const byteString = window.atob(meta.cepData.split(',')[1]);
        const mimeStr = meta.cepData.split(',')[0].split(':')[1].split(';')[0];
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
        cepToProcess = new Blob([ab], { type: mimeStr });
      } catch (e) { console.error("Error reconstr cep", e); }
    }

    if (cepToProcess && cepToProcess instanceof Blob) {
      try {
        const cepBuffer = await cepToProcess.arrayBuffer();
        if (cepToProcess.type === 'application/pdf') {
          const cepPdf = await PDFDocument.load(cepBuffer);
          const copied = await finalPdf.copyPages(cepPdf, cepPdf.getPageIndices());
          copied.forEach(p => finalPdf.addPage(p));
        } else {
          const page = finalPdf.addPage();
          const img = cepToProcess.type === 'image/png' ? await finalPdf.embedPng(cepBuffer) : await finalPdf.embedJpg(cepBuffer);
          const { width, height } = page.getSize();
          const dims = img.scaleToFit(width - 40, height - 100);
          page.drawImage(img, { x: 20, y: height - 60 - dims.height, width: dims.width, height: dims.height });
        }
      } catch (e) { console.error("Error embed cep", e); }
    }

    const pdfOutput = await finalPdf.save();
    downloadBlob(new Blob([pdfOutput], { type: 'application/pdf' }), `PENSION_HADI_${meses[month]}_${year}.pdf`);
    notify("Reporte descargado exitosamente");
  };

  const downloadBlob = (blob, name) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
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
                      <div key={h.id} className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <span className="text-xs font-black uppercase text-slate-600">{meses[h.month]}</span>
                        <span className="font-black text-slate-800">{fmt(h.amount)}</span>
                      </div>
                    ))}
                    {anualHist.length === 0 && <p className="text-center text-slate-400 text-sm font-bold p-4">No hay datos archivados en {year}</p>}
                  </div>

                  <button onClick={async () => {
                    if (anualHist.length === 0) return notify("No hay historial en " + year, "error");
                    notify("Generando reporte anual extensivo...");
                    const promptText = `Eres un auditor financiero experto. Redacta un INFORME ANUAL EXTENSIVO formal de la pensión alimenticia de Kenney, año ${year}. 
Historial por mes (Total depositado sumó ${fmt(sumaTotal)}):
${JSON.stringify(anualHist.map(h => ({ mes: meses[h.month], monto: h.amount, reporteCorto: h.aiReport })))}

Escribe un análisis completo sobre los gastos del año y el balance general. Genera el reporte final listo para presentarse formalmente, asegurándote de desglosar y explicar conclusiones generales.`;

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

              {(isPastMonth || viewingHistorical) && (
                <div className="mt-8 flex flex-wrap justify-center gap-3">
                  <button onClick={() => manualTicketsRef.current.click()} className="px-5 py-3 rounded-full text-[10px] font-black uppercase transition-all shadow-sm bg-green-50 text-green-700 border border-green-200 hover:bg-green-600 hover:text-white flex items-center gap-2">
                    <Images className="w-4 h-4" /> 1. Adjuntar Tickets
                  </button>
                  <button onClick={() => manualPdfRef.current.click()} className="px-5 py-3 rounded-full text-[10px] font-black uppercase transition-all shadow-sm bg-red-50 text-red-700 border border-red-200 hover:bg-red-600 hover:text-white flex items-center gap-2">
                    <FileText className="w-4 h-4" /> 2. Adjuntar PDF Reporte
                  </button>
                  <button onClick={() => cepInputRef.current.click()} className="px-5 py-3 rounded-full text-[10px] font-black uppercase transition-all shadow-sm bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-600 hover:text-white flex items-center gap-2">
                    <Paperclip className="w-4 h-4" /> 3. Adjuntar CEP
                  </button>
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
            <div className="flex items-center gap-2 bg-blue-50 px-3 py-1.5 rounded-full">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
              <span className="text-[8px] font-black uppercase text-blue-600 tracking-widest">Inteligencia Activa</span>
            </div>
          </div>
          <textarea ref={textareaRef} value={aiReport} onChange={e => setAiReport(e.target.value)} className="w-full min-h-[200px] p-4 bg-slate-50 rounded-2xl text-xs font-mono text-slate-700 leading-relaxed outline-none resize-none border border-slate-200 shadow-inner" />
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
                          let list = JSON.parse(viewingHistorical.expenses || "[]").filter(x => x.id !== aj.id);
                          const updatedHist = { ...viewingHistorical, expenses: JSON.stringify(list) };
                          setHistory(prev => prev.map(h => h.id === viewingHistorical.id ? updatedHist : h));
                          supabase.from('history').update({ expenses: JSON.stringify(list) }).eq('id', viewingHistorical.id);
                          notify("Eliminado del historial");
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
            <Printer className="w-5 h-5" /> {viewingHistorical ? 'REGENERAR REPORTE DEL MES Y DESCARGAR' : 'GENERAR REPORTE Y DESCARGAR'}
          </button>
        </div>

        {/* ACCIONES FINALES LATERALES */}
        {(!viewingHistorical || isEditingHistorical) && (
          <div className="flex gap-4 px-2 mt-4">
            <button onClick={() => cepInputRef.current.click()} className={`flex-1 py-3 rounded-2xl border text-[10px] font-black uppercase flex items-center justify-center gap-2 transition-all ${cepAttached ? 'bg-green-50 text-green-700 border-green-200' : 'bg-white text-slate-400 border-slate-200 shadow-sm'}`}>
              <Paperclip className="w-4 h-4" /> {viewingHistorical ? 'Vincular DOC A HISTORIAL' : (cepAttached ? 'CEP Vinculado ✓' : 'Adjuntar Documento CEP')}
            </button>
          </div>
        )}
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
              {(history || []).length === 0 ? (
                <div className="text-center p-8 bg-blue-50/50 rounded-[28px] border border-blue-100/50">
                  <p className="text-xs font-bold text-blue-800 mb-2">No tienes meses archivados</p>
                  <p className="text-[10px] text-blue-600/80 leading-relaxed font-medium">Para crear un archivo histórico, usa las flechas (+ / -) para ir a un mes pasado, agrega movimientos y presiona <b>"FINALIZAR PERIODO"</b>.</p>
                </div>
              ) : (
                (history || []).map(h => h && (
                  <div key={h.id} className="p-5 border border-slate-100 rounded-[28px] flex justify-between items-center hover:bg-amber-50/50 transition-all group">
                    <div>
                      <p className="text-[9px] font-black text-slate-400">{h.year}</p>
                      <h4 className="font-black text-sm uppercase text-slate-700 flex items-center gap-1">
                        {meses[h.month] || "MES"} {(h.expenses?.includes('isMetadata')) && <Paperclip className="w-3 h-3 text-green-500" />}
                      </h4>
                      <p className="text-[9px] text-slate-400 font-bold">{fmt(h.amount)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => { setMonth(h.month); setYear(h.year); setIsEditingHistorical(true); setShowHistory(false); }} className="p-3 bg-amber-500 text-white rounded-2xl hover:bg-amber-600 transition-all flex items-center gap-2 text-[9px] font-black uppercase shadow-md">
                        <Pencil className="w-4 h-4" /> Editar
                      </button>
                    </div>
                  </div>
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

      {/* INPUTS INVISIBLES DE EVIDENCIA */}
      <input type="file" ref={manualPdfRef} accept="application/pdf" className="hidden" onChange={(e) => handleAttachment(e, 'pdf')} />
      <input type="file" ref={manualTicketsRef} accept="image/*" multiple className="hidden" onChange={(e) => handleAttachment(e, 'tickets')} />
      <input type="file" ref={galleryInputRef} accept="image/*" capture="environment" className="hidden" onChange={handleImageScan} />
      <input type="file" ref={cepInputRef} accept="image/*,application/pdf" className="hidden" onChange={(e) => handleAttachment(e, 'cep')} />
      <input type="file" ref={pdfAnalysisInputRef} accept="image/*,application/pdf" className="hidden" onChange={analyzePdfForHistory} />

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
