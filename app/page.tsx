"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import {
  LayoutDashboard, TrendingUp, Settings, History, Mic, MicOff,
  Send, Square, ChevronRight, ExternalLink, MessageSquare,
  Target, Gauge, ToggleLeft, ToggleRight, Search, RefreshCw,
  CheckCircle2, AlertCircle, AlertTriangle, XCircle,
  Car, Wallet, MapPin, Clock, Copy, CheckCheck, Phone,
} from "lucide-react";

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface Msg { role: "user" | "assistant"; text: string; id: string }
interface Lead {
  id: number; ml_id: string; title: string; price_usd: number; price_ars: number;
  year: number; km: number; seller_name: string; seller_phone: string;
  url: string; rating: number; status: string; notes: string | null;
  created_at: string; updated_at: string; image_url?: string;
}
interface Stats { total_leads: number; best_price_usd: number; avg_price_usd: number; last_search?: string }
interface Config {
  max_price_usd: number; walk_away_usd: number; amarok_value_usd: number;
  max_km: number; year_min: number; year_max: number;
  permuta_only: boolean; opening_discount_pct: number;
}
interface ConvSession { session_id: string; msg_count: number; started_at: string; last_at: string }
interface ConvMsg { role: string; content: string; created_at: string }

const SESSION_ID = `s_${Date.now()}`;
const GREETING = "Buenas, con Manolo. Vi tu publicación del Mustang GT en MercadoLibre. ¿Todavía está disponible?";

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const glass: React.CSSProperties = {
  background: "rgba(255,255,255,0.09)",
  border: "1px solid rgba(255,255,255,0.18)",
  backdropFilter: "blur(28px)",
  WebkitBackdropFilter: "blur(28px)",
  borderRadius: 24,
};

function priceColor(usd: number) {
  if (usd <= 50000) return "#00D2FF";
  if (usd <= 60000) return "#FFD700";
  if (usd <= 70000) return "#FF8C00";
  return "#FF4B2B";
}

function priceAnalysis(usd: number): { label: string; color: string; Icon: React.ElementType } {
  if (usd < 45000) return { label: "PRECIO BAJO — investigar urgente", color: "#00D2FF", Icon: CheckCircle2 };
  if (usd <= 55000) return { label: "precio razonable — negociable", color: "#FFD700", Icon: AlertCircle };
  if (usd <= 70000) return { label: "algo caro — negociación fuerte", color: "#FF8C00", Icon: AlertTriangle };
  return { label: "sobrevaluado", color: "#FF4B2B", Icon: XCircle };
}

function statusColor(s: string) {
  const map: Record<string, string> = {
    nuevo: "#00D2FF", contactado: "#FFD700", negociando: "#00FF88",
    descartado: "#FF4B2B", cerrado: "#A0A0A0",
  };
  return map[s] || "#B0B0B0";
}

function timeAgo(iso: string) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
}


/* ─── WhatsApp Modal ─────────────────────────────────────────────────────── */
function WAModal({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const amarok = 48000;
    const offer = Math.round(lead.price_usd * 0.88);
    const diff = Math.max(0, offer - amarok);
    const text = `Hola, vi tu ${lead.title}. Te ofrezco permuta por una Amarok Extreme 2025 con 15.000 km (vale $${amarok.toLocaleString()} USD) más $${diff.toLocaleString()} USD de diferencia. El total quedaría en $${offer.toLocaleString()} USD. Si te interesa hablamos, sino no hay problema. Saludos`;
    setMsg(text);
    setLoading(false);
  }, [lead]);

  const copy = () => {
    navigator.clipboard.writeText(msg);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(7,5,26,0.8)", backdropFilter: "blur(8px)" }}
      onClick={onClose}>
      <div style={{ ...glass, padding: 32, maxWidth: 520, width: "90%", position: "relative" }}
        onClick={e => e.stopPropagation()}>
        <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", color: "#B0B0B0", fontSize: 20, cursor: "pointer" }}>✕</button>
        <h3 style={{ color: "white", margin: "0 0 8px", fontSize: 18 }}>Mensaje WhatsApp</h3>
        <p style={{ color: "#B0B0B0", fontSize: 13, margin: "0 0 16px" }}>{lead.title}</p>
        {loading ? (
          <div style={{ color: "#B0B0B0", textAlign: "center", padding: 32 }}>Generando mensaje...</div>
        ) : (
          <>
            <textarea
              value={msg}
              onChange={e => setMsg(e.target.value)}
              rows={6}
              style={{ width: "100%", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 12, padding: 12, color: "white", fontSize: 14, resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
              <button onClick={copy} style={{ flex: 1, background: copied ? "rgba(0,255,136,0.2)" : "rgba(0,210,255,0.15)", border: `1px solid ${copied ? "#00FF88" : "#00D2FF"}`, borderRadius: 12, padding: "10px 0", color: copied ? "#00FF88" : "#00D2FF", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
                {copied ? "¡Copiado!" : "Copiar mensaje"}
              </button>
              {lead.seller_phone && (
                <a href={`https://wa.me/${lead.seller_phone.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`}
                  target="_blank" rel="noreferrer"
                  style={{ flex: 1, background: "rgba(37,211,102,0.15)", border: "1px solid #25D366", borderRadius: 12, padding: "10px 0", color: "#25D366", cursor: "pointer", fontSize: 14, fontWeight: 600, textAlign: "center", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  Abrir WhatsApp
                </a>
              )}
            </div>
            <p style={{ color: "#B0B0B0", fontSize: 12, marginTop: 12 }}>
              💡 Tip: Mandalo a la noche. Si no responde en 24hs: "¿Sigue disponible?"
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Lead Card ──────────────────────────────────────────────────────────── */
function LeadCard({ lead, onAnalyze, onWA, onStatusChange }: {
  lead: Lead;
  onAnalyze: (lead: Lead) => void;
  onWA: (lead: Lead) => void;
  onStatusChange: (ml_id: string, status: string) => void;
}) {
  const [imgSrc, setImgSrc] = useState(lead.image_url || "/mustang.png");
  const ratingDots = Array.from({ length: 10 }, (_, i) => i < Math.round(lead.rating));

  return (
    <div style={{ ...glass, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      {/* Image */}
      <div style={{ position: "relative", height: 160, background: "rgba(0,0,0,0.3)" }}>
        <img src={imgSrc} alt={lead.title} onError={() => setImgSrc("/mustang.png")}
          style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        {/* Status badge */}
        <span style={{
          position: "absolute", top: 10, right: 10, background: `${statusColor(lead.status)}22`,
          border: `1px solid ${statusColor(lead.status)}`, borderRadius: 20, padding: "3px 10px",
          color: statusColor(lead.status), fontSize: 11, fontWeight: 600
        }}>{lead.status}</span>
      </div>

      {/* Content */}
      <div style={{ padding: "14px 16px", flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
        <p style={{ color: "white", fontSize: 13, fontWeight: 600, margin: 0, lineHeight: 1.3,
          overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box",
          WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>
          {lead.title}
        </p>

        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ color: priceColor(lead.price_usd), fontSize: 20, fontWeight: 700 }}>
            ${lead.price_usd > 0 ? (lead.price_usd / 1000).toFixed(0) + "k" : "—"}
          </span>
          <span style={{ color: "#B0B0B0", fontSize: 12 }}>USD</span>
        </div>

        <div style={{ display: "flex", gap: 12, color: "#B0B0B0", fontSize: 12 }}>
          <span>{lead.year || "—"}</span>
          <span>{lead.km > 0 ? `${(lead.km / 1000).toFixed(0)}k km` : "— km"}</span>
        </div>

        {/* Rating dots */}
        <div style={{ display: "flex", gap: 3 }}>
          {ratingDots.map((filled, i) => (
            <span key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: filled ? "#00D2FF" : "rgba(255,255,255,0.15)" }} />
          ))}
          <span style={{ color: "#B0B0B0", fontSize: 11, marginLeft: 4 }}>{lead.rating.toFixed(1)}</span>
        </div>

        {(() => { const a = priceAnalysis(lead.price_usd); return (
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <a.Icon size={11} color={a.color} />
            <span style={{ color: a.color, fontSize: 11 }}>{a.label}</span>
          </div>
        ); })()}

        {/* Status selector */}
        <select value={lead.status} onChange={e => onStatusChange(lead.ml_id, e.target.value)}
          style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, padding: "4px 8px", color: "white", fontSize: 12, cursor: "pointer" }}>
          {["nuevo", "contactado", "negociando", "descartado", "cerrado"].map(s => (
            <option key={s} value={s} style={{ background: "#1a1a2e" }}>{s}</option>
          ))}
        </select>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <a href={lead.url} target="_blank" rel="noreferrer"
            style={{ flex: 1, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, padding: "7px 0", color: "#B0B0B0", fontSize: 11, textAlign: "center", textDecoration: "none", cursor: "pointer" }}>
            Ver ML
          </a>
          <button onClick={() => onWA(lead)}
            style={{ flex: 1, background: "rgba(37,211,102,0.1)", border: "1px solid rgba(37,211,102,0.4)", borderRadius: 10, padding: "7px 0", color: "#25D366", fontSize: 11, cursor: "pointer" }}>
            WhatsApp
          </button>
          <button onClick={() => onAnalyze(lead)}
            style={{ flex: 1, background: "rgba(0,210,255,0.1)", border: "1px solid rgba(0,210,255,0.4)", borderRadius: 10, padding: "7px 0", color: "#00D2FF", fontSize: 11, cursor: "pointer" }}>
            Analizar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Voice Call ─────────────────────────────────────────────────────────── */
function VoiceCall({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef  = useRef<number>(0);

  type Phase = "idle" | "listening" | "thinking" | "speaking";
  const [phase, setPhase] = useState<Phase>("idle");
  const phaseRef = useRef<Phase>("idle");
  const setPhaseAll = (p: Phase) => { phaseRef.current = p; setPhase(p); };

  const [transcript, setTranscript] = useState("");

  const queue   = useRef<string[]>([]);
  const playing = useRef(false);
  const llmDone = useRef(false);
  const curAudio = useRef<HTMLAudioElement | null>(null);
  const srRef    = useRef<any>(null); // eslint-disable-line

  /* ── audio queue ── */
  function dequeue() {
    if (playing.current) return;
    if (queue.current.length === 0) { if (llmDone.current) listen(); return; }
    playing.current = true;
    setPhaseAll("speaking");
    const text = queue.current.shift()!;
    fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) })
      .then(async r => {
        if (!r.ok) throw new Error();
        const blob = await r.blob();
        const url  = URL.createObjectURL(blob);
        const a    = new Audio(url);
        curAudio.current = a;
        a.onended = () => { URL.revokeObjectURL(url); playing.current = false; dequeue(); };
        a.onerror = () => { playing.current = false; dequeue(); };
        a.play().catch(() => { playing.current = false; dequeue(); });
      })
      .catch(() => { playing.current = false; dequeue(); });
  }

  /* ── LLM + sentence-level TTS ── */
  async function chat(text: string) {
    setPhaseAll("thinking");
    queue.current = []; llmDone.current = false;
    let buf = "", sentBuf = "", fullReply = "";

    const flush = (force = false) => {
      const s = sentBuf.trim(); if (!s) return;
      if (force || /[.!?]$/.test(s)) { queue.current.push(s); sentBuf = ""; dequeue(); }
    };

    try {
      const r = await fetch("/api/chat/stream", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, sessionId }),
      });
      if (!r.ok || !r.body) throw new Error();
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const d = JSON.parse(line.slice(6));
            if (d.chunk) {
              sentBuf += d.chunk; fullReply += d.chunk;
              const m = sentBuf.match(/^([\s\S]*?[.!?])\s+([\s\S]*)$/);
              if (m && m[1].trim().split(/\s+/).length >= 4) {
                queue.current.push(m[1].trim()); sentBuf = m[2]; dequeue();
              }
            }
            if (d.done) { flush(true); llmDone.current = true; if (!playing.current && !queue.current.length) listen(); }
          } catch { /**/ }
        }
      }
      flush(true); llmDone.current = true;
      if (!playing.current && !queue.current.length) {
        // Si LLM respondió vacío, decir fallback y volver a escuchar
        if (!fullReply) { queue.current.push("No te escuché bien, repetime."); }
        dequeue();
      }
    } catch {
      queue.current.push("Perdoná, hubo un problema. ¿Me repetís?");
      llmDone.current = true; dequeue();
    }
  }

  /* ── speech recognition ── */
  const listenRetries = useRef(0);
  function listen() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition; // eslint-disable-line
    if (!SR) { setPhaseAll("idle"); return; }
    const rec = new SR(); rec.lang = "es-AR"; rec.continuous = false; rec.interimResults = false;
    rec.onresult = (e: any) => {
      listenRetries.current = 0;
      const t = e.results[0][0].transcript; setTranscript(t); chat(t); // eslint-disable-line
    };
    rec.onerror  = () => { setPhaseAll("idle"); };
    rec.onend    = () => {
      if (phaseRef.current !== "listening") return;
      // Sin resultado: reintentar hasta 3 veces, después idle
      if (listenRetries.current < 3) {
        listenRetries.current++;
        setTimeout(listen, 300);
      } else {
        listenRetries.current = 0;
        setPhaseAll("idle");
      }
    };
    srRef.current = rec;
    setPhaseAll("listening"); rec.start();
  }

  /* ── canvas particle sphere ── */
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize(); window.addEventListener("resize", resize);

    const N = 280, golden = Math.PI * (3 - Math.sqrt(5));
    const pts: [number, number, number][] = [];
    for (let i = 0; i < N; i++) {
      const yp = 1 - (i / (N - 1)) * 2;
      const rr = Math.sqrt(Math.max(0, 1 - yp * yp));
      const theta = golden * i;
      pts.push([Math.cos(theta) * rr, yp, Math.sin(theta) * rr]);
    }

    let t = 0, rotY = 0, cY = 0.5, cR = 0.0, cGold = 1.0;

    function draw() {
      t += 0.012; rotY += 0.004;
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      const p = phaseRef.current;
      const speaking = p === "speaking", thinking = p === "thinking";
      const tY = speaking ? 0.82 : 0.5;
      const base = Math.min(W, H);
      const tR = (speaking ? 0.13 : thinking ? 0.25 : 0.33) * base;
      const tGold = speaking ? 0 : 1;
      cY += (tY - cY) * 0.06; cR += (tR - cR) * 0.06; cGold += (tGold - cGold) * 0.05;
      const R = cR * (1 + 0.07 * Math.sin(t * (thinking ? 3 : 1.5)));
      const cx = W / 2, cy = cY * H;
      const cosR = Math.cos(rotY), sinR = Math.sin(rotY);
      const rc = Math.round(212 * cGold);
      const gc = Math.round(160 * cGold + 210 * (1 - cGold));
      const bc = Math.round(23  * cGold + 255 * (1 - cGold));
      for (const [px, py, pz] of pts) {
        const rx = px * cosR - pz * sinR;
        const rz = px * sinR + pz * cosR;
        const depth = (rz + 2) / 3;
        const sx = cx + rx * R * depth, sy = cy + py * R * depth;
        const n = 0.5 + 0.5 * Math.sin(px * 4 + t) * Math.sin(py * 3 + t * 0.8) * Math.sin(pz * 4 + t * 0.6);
        const pr = Math.max(0.4, (1 + n * 1.8) * depth);
        const alpha = Math.min(1, (0.3 + 0.7 * n) * depth);
        ctx.beginPath(); ctx.arc(sx, sy, pr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${rc},${gc},${bc},${alpha.toFixed(2)})`; ctx.fill();
      }
      frameRef.current = requestAnimationFrame(draw);
    }
    frameRef.current = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frameRef.current); window.removeEventListener("resize", resize); };
  }, []);

  /* ── auto-start: Manolo habla primero, después escucha ── */
  useEffect(() => {
    const t = setTimeout(() => {
      queue.current.push("Buenas, con Manolo. Vi tu Mustang GT en Mercado Libre. ¿Sigue disponible?");
      llmDone.current = true; // cuando termine el saludo → listen()
      dequeue();
    }, 400);
    return () => { clearTimeout(t); srRef.current?.stop(); curAudio.current?.pause(); };
  }, []); // eslint-disable-line

  const bgColor = phase === "speaking" ? "#000d0d" : phase === "thinking" ? "#060610" : "#0d0800";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: bgColor, transition: "background 1s" }}>
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0 }} />

      {transcript && (
        <div style={{ position: "absolute", top: 64, left: 28, right: 28, zIndex: 1 }}>
          <p style={{ color: "rgba(255,255,255,0.82)", fontSize: 22, lineHeight: 1.6, margin: 0 }}>{transcript}</p>
        </div>
      )}

      <div style={{ position: "absolute", bottom: 136, left: 0, right: 0, textAlign: "center", zIndex: 1 }}>
        <span style={{ color: "rgba(255,255,255,0.32)", fontSize: 12, letterSpacing: 3, textTransform: "uppercase" }}>
          {phase === "idle" ? "toca el mic" : phase === "listening" ? "escuchando" : phase === "thinking" ? "pensando" : "hablando"}
        </span>
      </div>

      <div style={{ position: "absolute", bottom: 44, left: 0, right: 0, display: "flex", justifyContent: "space-between", padding: "0 52px", zIndex: 1, alignItems: "center" }}>
        <button onClick={() => { srRef.current?.stop(); curAudio.current?.pause(); onClose(); }}
          style={{ width: 58, height: 58, borderRadius: "50%", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.18)", color: "rgba(255,255,255,0.65)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <XCircle size={22} />
        </button>
        <button
          onClick={() => phase === "idle" ? listen() : (srRef.current?.stop(), setPhaseAll("idle"))}
          style={{ width: 58, height: 58, borderRadius: "50%", background: phase === "listening" ? "rgba(255,75,43,0.2)" : "rgba(255,255,255,0.08)", border: `1px solid ${phase === "listening" ? "rgba(255,75,43,0.5)" : "rgba(255,255,255,0.18)"}`, color: phase === "listening" ? "#FF4B2B" : "rgba(255,255,255,0.65)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {phase === "listening" ? <MicOff size={22} /> : <Mic size={22} />}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   ROOT
═══════════════════════════════════════════════════ */
export default function App() {
  /* ── State ── */
  const [msgs, setMsgs]             = useState<Msg[]>([]);
  const [input, setInput]           = useState("");
  const [loading, setLoading]       = useState(false);
  const [speaking, setSpeaking]     = useState(false);
  const [listening, setListening]   = useState(false);
  const [gw, setGw]                 = useState<"checking" | "live" | "down">("checking");
  const [tab, setTab]               = useState("Resumen");
  const [greeted, setGreeted]       = useState(false);
  const [voiceCall, setVoiceCall]   = useState(false);
  const [isMobile, setIsMobile]     = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  /* Mercado */
  const [leads, setLeads]           = useState<Lead[]>([]);
  const [leadsFilter, setLeadsFilter] = useState("todos");
  const [searchLoading, setSearchLoading] = useState(false);
  const [stats, setStats]           = useState<Stats>({ total_leads: 0, best_price_usd: 0, avg_price_usd: 0 });
  const [waLead, setWaLead]         = useState<Lead | null>(null);

  /* Estrategia */
  const [config, setConfig]         = useState<Config>({
    max_price_usd: 50000, walk_away_usd: 60000, amarok_value_usd: 48000,
    max_km: 80000, year_min: 2019, year_max: 2024,
    permuta_only: true, opening_discount_pct: 18,
  });
  const [configSaved, setConfigSaved] = useState(false);

  /* Historial */
  const [sessions, setSessions]     = useState<ConvSession[]>([]);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [sessionMsgs, setSessionMsgs] = useState<ConvMsg[]>([]);

  const endRef   = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  /* ── Health ── */
  useEffect(() => {
    const go = async () => {
      try {
        const r = await fetch("/api/health");
        const d = await r.json();
        setGw(d.gateway === "live" ? "live" : "down");
      } catch { setGw("down"); }
    };
    go(); const t = setInterval(go, 30000); return () => clearInterval(t);
  }, []);

  /* ── Scroll ── */
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  /* ── Speak ── */
  const speak = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setSpeaking(true);
    try {
      const r = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      if (!r.ok) throw new Error();
      const blob = await r.blob(); const url = URL.createObjectURL(blob);
      if (audioRef.current) { audioRef.current.pause(); URL.revokeObjectURL(audioRef.current.src); }
      const a = new Audio(url); audioRef.current = a;
      a.onended = () => { setSpeaking(false); URL.revokeObjectURL(url); };
      a.onerror = () => setSpeaking(false);
      await a.play();
    } catch { setSpeaking(false); }
  }, []);

  /* ── Greeting ── */
  useEffect(() => {
    if (greeted) return; setGreeted(true);
    setMsgs([{ role: "assistant", text: GREETING, id: "init" }]);
    const t = setTimeout(() => speak(GREETING), 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Send (streaming) ── */
  const send = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    setMsgs(p => [...p, { role: "user", text, id: `u${Date.now()}` }]);
    setInput(""); setLoading(true);

    const aId = `a${Date.now()}`;
    const t0 = performance.now();
    let firstTokenMs = 0;
    setMsgs(p => [...p, { role: "assistant", text: "", id: aId }]);

    try {
      const r = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, sessionId: SESSION_ID }),
      });
      if (!r.ok || !r.body) throw new Error("stream failed");

      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let full = "";
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.chunk) {
              if (!firstTokenMs) {
                firstTokenMs = performance.now() - t0;
                console.log(`[Manolo] First token: ${firstTokenMs.toFixed(0)}ms`);
              }
              full += data.chunk;
              setMsgs(p => p.map(m => m.id === aId ? { ...m, text: full } : m));
            }
            if (data.done) {
              const totalMs = performance.now() - t0;
              console.log(`[Manolo] Full response: ${totalMs.toFixed(0)}ms | First token: ${firstTokenMs.toFixed(0)}ms`);
              setLoading(false); speak(data.full || full);
            }
            if (data.error) { setMsgs(p => p.map(m => m.id === aId ? { ...m, text: "Error: " + data.error } : m)); setLoading(false); }
          } catch { /* skip malformed */ }
        }
      }
      if (loading) setLoading(false);
    } catch {
      setMsgs(p => p.map(m => m.id === aId ? { ...m, text: "Error de conexión." } : m));
      setLoading(false);
    }
  }, [loading, speak]);

  /* ── Mic ── */
  const toggleMic = useCallback(() => {
    if (listening) { (window as any).__sr?.stop(); setListening(false); return; } // eslint-disable-line
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition; // eslint-disable-line
    if (!SR) { alert("Tu browser no soporta voz."); return; }
    const rec = new SR(); rec.lang = "es-AR"; rec.continuous = false; rec.interimResults = false;
    rec.onresult = (e: any) => send(e.results[0][0].transcript); // eslint-disable-line
    rec.onerror = () => setListening(false); rec.onend = () => setListening(false);
    (window as any).__sr = rec; rec.start(); setListening(true); // eslint-disable-line
  }, [listening, send]);

  const stopAudio = () => { audioRef.current?.pause(); setSpeaking(false); };

  /* ── Load leads ── */
  const loadLeads = useCallback(async (filter?: string) => {
    try {
      const f = filter ?? leadsFilter;
      const q = f === "todos" ? "" : `?status=${f}`;
      const r = await fetch(`/api/leads${q}`);
      const d = await r.json();
      setLeads(d.leads || []);
    } catch { setLeads([]); }
  }, [leadsFilter]);

  /* ── Load stats ── */
  const loadStats = useCallback(async () => {
    try {
      const r = await fetch("/api/stats");
      const d = await r.json();
      setStats(d);
    } catch { /* ignore */ }
  }, []);

  /* ── Load config ── */
  const loadConfig = useCallback(async () => {
    try {
      const r = await fetch("/api/config");
      const d = await r.json();
      setConfig(d);
    } catch { /* ignore */ }
  }, []);

  /* ── Load sessions ── */
  const loadSessions = useCallback(async () => {
    try {
      const r = await fetch("/api/conversations");
      const d = await r.json();
      setSessions(d.sessions || []);
    } catch { setSessions([]); }
  }, []);

  /* ── Load session messages ── */
  const loadSessionMsgs = useCallback(async (sid: string) => {
    try {
      const r = await fetch(`/api/conversations/${encodeURIComponent(sid)}`);
      const d = await r.json();
      setSessionMsgs(d.messages || []);
    } catch { setSessionMsgs([]); }
  }, []);

  /* ── Tab-driven data loading ── */
  useEffect(() => {
    if (tab === "Resumen") { loadLeads(); loadStats(); loadConfig(); }
    if (tab === "Mercado") { loadLeads(); loadStats(); }
    if (tab === "Estrategia") loadConfig();
    if (tab === "Historial") loadSessions();
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Trigger search ── */
  const triggerSearch = async () => {
    setSearchLoading(true);
    try {
      await fetch("/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: "ford mustang gt", limit: 12 }) });
      await loadLeads();
      await loadStats();
    } catch { /* ignore */ }
    finally { setSearchLoading(false); }
  };

  /* ── Status change ── */
  const handleStatusChange = async (ml_id: string, status: string) => {
    try {
      await fetch(`/api/leads/${ml_id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      setLeads(prev => prev.map(l => l.ml_id === ml_id ? { ...l, status } : l));
    } catch { /* ignore */ }
  };

  /* ── Analyze lead → go to Resumen + pre-fill chat ── */
  const handleAnalyze = (lead: Lead) => {
    const q = `Analizá este Mustang: ${lead.title}, año ${lead.year}, ${lead.km.toLocaleString()} km, precio $${lead.price_usd.toLocaleString()} USD. ¿Es buen precio? ¿Qué ofrezco?`;
    setInput(q);
    setTab("Resumen");
    setTimeout(() => inputRef.current?.focus(), 300);
  };

  /* ── Save config ── */
  const saveConfig = async () => {
    try {
      await fetch("/api/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });
      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 2000);
    } catch { /* ignore */ }
  };

  /* ── Expand session ── */
  const toggleSession = (sid: string) => {
    if (expandedSession === sid) { setExpandedSession(null); setSessionMsgs([]); }
    else { setExpandedSession(sid); loadSessionMsgs(sid); }
  };

  /* ── Filter leads ── */
  const displayLeads = leadsFilter === "todos" ? leads : leads.filter(l => l.status === leadsFilter);

  /* ═══════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════ */
  const NAV_TABS = [
    { label: "Resumen",    Icon: LayoutDashboard },
    { label: "Mercado",    Icon: TrendingUp },
    { label: "Estrategia", Icon: Target },
    { label: "Historial",  Icon: History },
  ] as { label: string; Icon: React.ElementType }[];

  return (
    <div style={{ position: "relative", width: "100%", minHeight: "100vh", background: "#07051a", overflowX: "hidden" }}>

      {/* ── Mustang full-page background (ALL tabs) ── */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0 }}>
        <Image src="/mustang.png" alt="" fill priority style={{ objectFit: "cover", objectPosition: "center" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg,rgba(5,3,18,0.88) 0%,rgba(5,3,18,0.72) 50%,rgba(5,3,18,0.88) 100%)" }} />
      </div>

      {/* ── Glass Sidebar (desktop) ── */}
      <div style={{
        position: "fixed", left: 16, top: 16, bottom: 16, zIndex: 10,
        width: 68,
        background: "rgba(255,255,255,0.07)",
        border: "1px solid rgba(255,255,255,0.14)",
        backdropFilter: "blur(32px)",
        WebkitBackdropFilter: "blur(32px)",
        borderRadius: 22,
        display: isMobile ? "none" : "flex", flexDirection: "column", alignItems: "center",
        padding: "16px 0",
        gap: 6,
      }}>
        {/* Logo */}
        <div style={{ marginBottom: 12 }}>
          <Image src="/manolo-logo.png" alt="Manolo" width={36} height={36} style={{ borderRadius: 10 }} />
        </div>

        {/* Nav icons */}
        {NAV_TABS.map(({ label, Icon: TabIcon }) => {
          const active = tab === label;
          return (
            <button key={label} onClick={() => setTab(label)} title={label}
              style={{
                width: 44, height: 44, borderRadius: 12, border: "none",
                background: active ? "rgba(255,255,255,0.92)" : "transparent",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.2s",
                boxShadow: active ? "0 2px 12px rgba(0,0,0,0.25)" : "none",
              }}>
              <TabIcon size={18} color={active ? "#07051a" : "rgba(255,255,255,0.5)"} />
            </button>
          );
        })}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Status dot */}
        <div style={{ marginBottom: 4 }}>
          <span style={{
            width: 10, height: 10, borderRadius: "50%", display: "block",
            background: gw === "live" ? "#00FF88" : gw === "down" ? "#FF4B2B" : "#FFD700",
            boxShadow: gw === "live" ? "0 0 8px #00FF88" : "none",
          }} />
        </div>
      </div>

      {/* ── Bottom Nav (mobile) ── */}
      {isMobile && (
        <div style={{
          position: "fixed", bottom: 12, left: 12, right: 12, zIndex: 10,
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.14)",
          backdropFilter: "blur(32px)", WebkitBackdropFilter: "blur(32px)",
          borderRadius: 22,
          display: "flex", alignItems: "center", justifyContent: "space-around",
          padding: "10px 8px",
        }}>
          {NAV_TABS.map(({ label, Icon: TabIcon }) => {
            const active = tab === label;
            return (
              <button key={label} onClick={() => setTab(label)} title={label}
                style={{
                  flex: 1, height: 44, borderRadius: 12, border: "none",
                  background: active ? "rgba(255,255,255,0.92)" : "transparent",
                  cursor: "pointer", display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: 3,
                  transition: "all 0.2s",
                }}>
                <TabIcon size={17} color={active ? "#07051a" : "rgba(255,255,255,0.5)"} />
                <span style={{ fontSize: 9, color: active ? "#07051a" : "rgba(255,255,255,0.4)", fontWeight: active ? 600 : 400 }}>{label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Content (offset by sidebar) ── */}
      <div style={{ position: "relative", zIndex: 1, minHeight: "100vh", marginLeft: isMobile ? 0 : 100, paddingBottom: isMobile ? 88 : 0 }}>

        {/* ══════════════════════════════════════════
            TAB: RESUMEN
        ══════════════════════════════════════════ */}
        {tab === "Resumen" && (
          <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 20 : 32, padding: isMobile ? "16px 14px" : "32px 32px", alignItems: "flex-start" }}>

            {/* Left hero */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Greeting */}
              <div style={{ ...glass, padding: "24px 28px", marginBottom: 24 }}>
                <h1 style={{ color: "white", fontSize: 28, fontWeight: 700, margin: "0 0 8px" }}>
                  Hola Carlos 👋
                </h1>
                <p style={{ color: "#B0B0B0", margin: 0, lineHeight: 1.6 }}>
                  Estoy monitoreando el mercado de Mustang GT en Argentina.<br />
                  Hay <strong style={{ color: "#00D2FF" }}>{stats.total_leads} oportunidades</strong> registradas.
                  Mejor precio: <strong style={{ color: "#00D2FF" }}>${stats.best_price_usd > 0 ? (stats.best_price_usd / 1000).toFixed(0) + "k" : "—"} USD</strong>.
                </p>
              </div>

              {/* Amarok strip */}
              <div style={{ ...glass, padding: "16px 24px", display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
                <div style={{ flex: 1 }}>
                  <p style={{ color: "#B0B0B0", fontSize: 12, margin: "0 0 4px", textTransform: "uppercase", letterSpacing: 1 }}>Tu permuta</p>
                  <p style={{ color: "white", fontWeight: 700, fontSize: 18, margin: 0 }}>Amarok Extreme 2025</p>
                  <p style={{ color: "#00D2FF", fontWeight: 600, margin: "4px 0 0", fontSize: 15 }}>$48,000 USD</p>
                </div>
                <div style={{ padding: "8px 16px", background: "rgba(0,210,255,0.1)", border: "1px solid rgba(0,210,255,0.3)", borderRadius: 12 }}>
                  <p style={{ color: "#B0B0B0", fontSize: 11, margin: "0 0 4px" }}>Diferencia objetivo</p>
                  <p style={{ color: "#00D2FF", fontWeight: 700, fontSize: 18, margin: 0 }}>
                    {config.max_price_usd > config.amarok_value_usd
                      ? `~$${((config.max_price_usd - config.amarok_value_usd) / 1000).toFixed(0)}k USD`
                      : "Permuta pura"}
                  </p>
                </div>
              </div>

              {/* Top leads */}
              <div style={{ ...glass, padding: "20px 24px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <p style={{ color: "white", fontWeight: 600, margin: 0, fontSize: 14 }}>Mejores oportunidades encontradas</p>
                  <button onClick={() => setTab("Mercado")} style={{ background: "none", border: "none", color: "#00D2FF", fontSize: 12, cursor: "pointer", padding: 0 }}>Ver todas →</button>
                </div>
                {leads.slice(0, 3).length === 0 ? (
                  <p style={{ color: "#B0B0B0", fontSize: 13, margin: 0 }}>
                    Todavía no buscaste. Andá a <button onClick={() => setTab("Mercado")} style={{ background: "none", border: "none", color: "#00D2FF", cursor: "pointer", padding: 0, fontSize: 13 }}>Mercado</button> y hacé clic en Buscar en ML.
                  </p>
                ) : (
                  leads.slice().sort((a, b) => a.price_usd - b.price_usd).slice(0, 3).map(lead => (
                    <div key={lead.ml_id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ color: "white", fontSize: 13, margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lead.title}</p>
                        <p style={{ color: "#B0B0B0", fontSize: 11, margin: 0 }}>{lead.year || "—"} · {lead.km > 0 ? `${Math.round(lead.km / 1000)}k km` : "— km"}</p>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <p style={{ color: priceColor(lead.price_usd), fontWeight: 700, fontSize: 16, margin: "0 0 2px" }}>${Math.round(lead.price_usd / 1000)}k</p>
                        <a href={lead.url} target="_blank" rel="noreferrer" style={{ color: "#00D2FF", fontSize: 11, textDecoration: "none" }}>Ver ML ↗</a>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Right bento */}
            <div style={{ width: isMobile ? "100%" : 390, flexShrink: 0 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

                {/* Deal Progress — 2col */}
                <div style={{ ...glass, gridColumn: "span 2", padding: "16px 20px" }}>
                  <p style={{ color: "#B0B0B0", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, margin: "0 0 12px" }}>Progreso de búsqueda</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    {[
                      { label: "Leads totales", value: stats.total_leads },
                      { label: "Precio promedio", value: stats.avg_price_usd > 0 ? `$${(stats.avg_price_usd / 1000).toFixed(0)}k` : "—" },
                      { label: "Mejor precio", value: stats.best_price_usd > 0 ? `$${(stats.best_price_usd / 1000).toFixed(0)}k` : "—" },
                      { label: "Ahorro vs 0km", value: stats.best_price_usd > 0 ? `$${((63900 - stats.best_price_usd) / 1000).toFixed(0)}k` : "—" },
                    ].map(item => (
                      <div key={item.label}>
                        <p style={{ color: "#B0B0B0", fontSize: 11, margin: "0 0 2px" }}>{item.label}</p>
                        <p style={{ color: "#00D2FF", fontWeight: 700, fontSize: 18, margin: 0 }}>{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Price Target — 1col */}
                <div style={{ ...glass, padding: "14px 16px" }}>
                  <p style={{ color: "#B0B0B0", fontSize: 11, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: 1 }}>Precio objetivo</p>
                  <p style={{ color: "#00D2FF", fontWeight: 700, fontSize: 22, margin: 0 }}>$50k</p>
                  <p style={{ color: "#B0B0B0", fontSize: 11, margin: "4px 0 0" }}>walk-away: $60k</p>
                </div>

                {/* Km máximo — 1col */}
                <div style={{ ...glass, padding: "14px 16px" }}>
                  <p style={{ color: "#B0B0B0", fontSize: 11, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: 1 }}>Km máximo</p>
                  <p style={{ color: "#FFD700", fontWeight: 700, fontSize: 22, margin: 0 }}>{Math.round(config.max_km / 1000)}k</p>
                  <p style={{ color: "#B0B0B0", fontSize: 11, margin: "4px 0 0" }}>kilómetros aceptables</p>
                </div>

                {/* Gauge — 2col */}
                <div style={{ ...glass, gridColumn: "span 2", padding: "14px 20px" }}>
                  <p style={{ color: "#B0B0B0", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, margin: "0 0 12px" }}>Apertura de descuento</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ flex: 1, height: 8, background: "rgba(255,255,255,0.1)", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${config.opening_discount_pct}%`, background: "linear-gradient(90deg, #00D2FF, #FF4B2B)", borderRadius: 4 }} />
                    </div>
                    <span style={{ color: "#00D2FF", fontWeight: 700, fontSize: 18 }}>{config.opening_discount_pct}%</span>
                  </div>
                  <p style={{ color: "#B0B0B0", fontSize: 11, margin: "6px 0 0" }}>Abrir oferta {config.opening_discount_pct}% abajo del precio pedido</p>
                </div>

                {/* Toggle: permuta */}
                <div style={{ ...glass, padding: "14px 16px" }}>
                  <p style={{ color: "#B0B0B0", fontSize: 11, margin: "0 0 8px" }}>Solo permuta</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 36, height: 20, borderRadius: 10, background: config.permuta_only ? "#00D2FF" : "rgba(255,255,255,0.1)", transition: "background 0.2s", position: "relative", cursor: "pointer" }}
                      onClick={() => setConfig(c => ({ ...c, permuta_only: !c.permuta_only }))}>
                      <div style={{ position: "absolute", top: 2, left: config.permuta_only ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "white", transition: "left 0.2s" }} />
                    </div>
                    <span style={{ color: config.permuta_only ? "#00D2FF" : "#B0B0B0", fontSize: 13, fontWeight: 600 }}>{config.permuta_only ? "ON" : "OFF"}</span>
                  </div>
                </div>

                {/* Toggle: year filter */}
                <div style={{ ...glass, padding: "14px 16px" }}>
                  <p style={{ color: "#B0B0B0", fontSize: 11, margin: "0 0 8px" }}>Año mínimo</p>
                  <p style={{ color: "white", fontWeight: 700, fontSize: 18, margin: 0 }}>{config.year_min}</p>
                </div>

                {/* Chat card — 2col */}
                <div style={{ ...glass, gridColumn: "span 2", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <p style={{ color: "white", fontWeight: 600, margin: 0, fontSize: 14 }}>Chat con Manolo</p>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => setVoiceCall(true)}
                        style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(0,210,255,0.1)", border: "1px solid rgba(0,210,255,0.35)", borderRadius: 8, padding: "4px 10px", color: "#00D2FF", cursor: "pointer", fontSize: 12 }}>
                        <Phone size={11} /> Llamar
                      </button>
                      {speaking && (
                        <button onClick={stopAudio} style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(255,75,43,0.15)", border: "1px solid #FF4B2B", borderRadius: 8, padding: "4px 10px", color: "#FF4B2B", cursor: "pointer", fontSize: 12 }}>
                          <Square size={11} fill="#FF4B2B" /> Silenciar
                        </button>
                      )}
                      <span style={{ fontSize: 11, color: loading ? "#FFD700" : "#B0B0B0" }}>
                        {loading ? "pensando…" : speaking ? "hablando…" : ""}
                      </span>
                    </div>
                  </div>

                  {/* Messages */}
                  <div style={{ maxHeight: isMobile ? 320 : 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, paddingRight: 4 }}>
                    {msgs.map(m => (
                      <div key={m.id} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                        <div style={{ maxWidth: "85%", padding: "8px 12px", borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                          background: m.role === "user" ? "rgba(0,210,255,0.15)" : "rgba(255,255,255,0.08)",
                          border: `1px solid ${m.role === "user" ? "rgba(0,210,255,0.3)" : "rgba(255,255,255,0.12)"}`,
                          color: "white", fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                          {m.text}
                        </div>
                      </div>
                    ))}
                    {loading && (
                      <div style={{ display: "flex", gap: 4, padding: "8px 12px" }}>
                        {[0, 1, 2].map(i => (
                          <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "#00D2FF",
                            animation: `bounce 1s ease-in-out ${i * 0.15}s infinite` }} />
                        ))}
                      </div>
                    )}
                    <div ref={endRef} />
                  </div>

                  {/* Input */}
                  <div style={{ display: "flex", gap: 8 }}>
                    <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && !e.shiftKey && send(input)}
                      placeholder="Preguntale a Manolo..."
                      style={{ flex: 1, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 12, padding: "10px 14px", color: "white", fontSize: 13, outline: "none" }} />
                    <button onClick={() => send(input)} disabled={loading || !input.trim()}
                      style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 38, height: 38, borderRadius: 12, border: "none", background: loading ? "rgba(0,210,255,0.1)" : "#00D2FF", color: loading ? "#B0B0B0" : "#07051a", cursor: loading ? "not-allowed" : "pointer" }}>
                      <Send size={15} />
                    </button>
                    <button onClick={toggleMic}
                      style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 38, height: 38, borderRadius: 12, border: `1px solid ${listening ? "#FF4B2B" : "rgba(255,255,255,0.2)"}`, background: listening ? "rgba(255,75,43,0.15)" : "rgba(255,255,255,0.05)", color: listening ? "#FF4B2B" : "#B0B0B0", cursor: "pointer" }}>
                      {listening ? <MicOff size={15} /> : <Mic size={15} />}
                    </button>
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            TAB: MERCADO
        ══════════════════════════════════════════ */}
        {tab === "Mercado" && (
          <div style={{ padding: isMobile ? "16px 14px" : "32px 32px" }}>

            {/* Top bar */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["todos", "nuevo", "contactado", "negociando", "descartado"].map(f => (
                  <button key={f} onClick={() => { setLeadsFilter(f); loadLeads(f); }}
                    style={{ padding: "7px 16px", borderRadius: 20, border: `1px solid ${leadsFilter === f ? "#00D2FF" : "rgba(255,255,255,0.2)"}`,
                      background: leadsFilter === f ? "rgba(0,210,255,0.15)" : "rgba(255,255,255,0.05)",
                      color: leadsFilter === f ? "#00D2FF" : "#B0B0B0", cursor: "pointer", fontSize: 13, textTransform: "capitalize" }}>
                    {f}
                  </button>
                ))}
              </div>
              <button onClick={triggerSearch} disabled={searchLoading}
                style={{ padding: "10px 24px", borderRadius: 20, border: "1px solid #00D2FF", background: searchLoading ? "rgba(0,210,255,0.05)" : "rgba(0,210,255,0.15)", color: searchLoading ? "#B0B0B0" : "#00D2FF", cursor: searchLoading ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                {searchLoading ? (
                  <><RefreshCw size={14} style={{ animation: "spin 0.8s linear infinite" }} /> Buscando...</>
                ) : <><Search size={14} /> Buscar en ML</>}
              </button>
            </div>

            {/* Stats bar */}
            <div style={{ ...glass, padding: "12px 24px", marginBottom: 24, display: "flex", gap: 32, flexWrap: "wrap" }}>
              <span style={{ color: "#B0B0B0", fontSize: 13 }}><strong style={{ color: "white" }}>{stats.total_leads}</strong> leads encontrados</span>
              <span style={{ color: "#B0B0B0", fontSize: 13 }}>Mejor precio: <strong style={{ color: "#00D2FF" }}>${stats.best_price_usd > 0 ? (stats.best_price_usd / 1000).toFixed(0) + "k" : "—"}</strong></span>
              <span style={{ color: "#B0B0B0", fontSize: 13 }}>Promedio: <strong style={{ color: "#FFD700" }}>${stats.avg_price_usd > 0 ? (stats.avg_price_usd / 1000).toFixed(0) + "k" : "—"}</strong></span>
              {stats.last_search && <span style={{ color: "#B0B0B0", fontSize: 13 }}>Última búsqueda: <strong style={{ color: "white" }}>{stats.last_search}</strong></span>}
            </div>

            {/* Leads grid */}
            {displayLeads.length === 0 ? (
              <div style={{ ...glass, padding: 48, textAlign: "center" }}>
                <p style={{ color: "#B0B0B0", fontSize: 16, margin: 0 }}>
                  {searchLoading ? "Buscando en MercadoLibre..." : "No hay leads. Hacé clic en 🔍 Buscar en ML para empezar."}
                </p>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(300px, 1fr))", gap: 20 }}>
                {displayLeads.map(lead => (
                  <LeadCard key={lead.ml_id} lead={lead}
                    onAnalyze={handleAnalyze}
                    onWA={setWaLead}
                    onStatusChange={handleStatusChange} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════
            TAB: ESTRATEGIA
        ══════════════════════════════════════════ */}
        {tab === "Estrategia" && (
          <div style={{ padding: isMobile ? "16px 14px" : "32px 32px", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 20 : 32, alignItems: "flex-start" }}>

            {/* Config form */}
            <div style={{ ...glass, padding: "28px 32px" }}>
              <h2 style={{ color: "white", fontSize: 20, fontWeight: 700, margin: "0 0 24px" }}>Configuración de negociación</h2>

              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

                {/* Max price */}
                <div>
                  <label style={{ color: "#B0B0B0", fontSize: 13, display: "block", marginBottom: 8 }}>
                    Precio máximo: <strong style={{ color: "#00D2FF" }}>${config.max_price_usd.toLocaleString()} USD</strong>
                  </label>
                  <input type="range" min={40000} max={65000} step={500} value={config.max_price_usd}
                    onChange={e => setConfig(c => ({ ...c, max_price_usd: Number(e.target.value) }))}
                    style={{ width: "100%", accentColor: "#00D2FF" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#B0B0B0", fontSize: 11, marginTop: 2 }}>
                    <span>$40k</span><span>$65k</span>
                  </div>
                </div>

                {/* Walk-away */}
                <div>
                  <label style={{ color: "#B0B0B0", fontSize: 13, display: "block", marginBottom: 8 }}>
                    Walk-away (máximo absoluto): <strong style={{ color: "#FF4B2B" }}>${config.walk_away_usd.toLocaleString()} USD</strong>
                  </label>
                  <input type="range" min={50000} max={80000} step={500} value={config.walk_away_usd}
                    onChange={e => setConfig(c => ({ ...c, walk_away_usd: Number(e.target.value) }))}
                    style={{ width: "100%", accentColor: "#FF4B2B" }} />
                </div>

                {/* Amarok value */}
                <div>
                  <label style={{ color: "#B0B0B0", fontSize: 13, display: "block", marginBottom: 8 }}>
                    Valor Amarok (USD)
                  </label>
                  <input type="number" value={config.amarok_value_usd} min={30000} max={70000} step={500}
                    onChange={e => setConfig(c => ({ ...c, amarok_value_usd: Number(e.target.value) }))}
                    style={{ width: "100%", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, padding: "10px 14px", color: "white", fontSize: 15, boxSizing: "border-box" }} />
                </div>

                {/* Max km */}
                <div>
                  <label style={{ color: "#B0B0B0", fontSize: 13, display: "block", marginBottom: 8 }}>
                    Km máximo aceptable: <strong style={{ color: "#FFD700" }}>{config.max_km.toLocaleString()} km</strong>
                  </label>
                  <input type="range" min={0} max={150000} step={5000} value={config.max_km}
                    onChange={e => setConfig(c => ({ ...c, max_km: Number(e.target.value) }))}
                    style={{ width: "100%", accentColor: "#FFD700" }} />
                </div>

                {/* Year min */}
                <div>
                  <label style={{ color: "#B0B0B0", fontSize: 13, display: "block", marginBottom: 8 }}>Año mínimo</label>
                  <select value={config.year_min} onChange={e => setConfig(c => ({ ...c, year_min: Number(e.target.value) }))}
                    style={{ width: "100%", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, padding: "10px 14px", color: "white", fontSize: 15 }}>
                    {[2018, 2019, 2020, 2021, 2022].map(y => <option key={y} value={y} style={{ background: "#1a1a2e" }}>{y}</option>)}
                  </select>
                </div>

                {/* Permuta only */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <label style={{ color: "#B0B0B0", fontSize: 13 }}>Solo permuta</label>
                  <div style={{ width: 44, height: 24, borderRadius: 12, background: config.permuta_only ? "#00D2FF" : "rgba(255,255,255,0.15)", transition: "background 0.2s", position: "relative", cursor: "pointer" }}
                    onClick={() => setConfig(c => ({ ...c, permuta_only: !c.permuta_only }))}>
                    <div style={{ position: "absolute", top: 3, left: config.permuta_only ? 22 : 3, width: 18, height: 18, borderRadius: "50%", background: "white", transition: "left 0.2s" }} />
                  </div>
                </div>

                {/* Opening discount */}
                <div>
                  <label style={{ color: "#B0B0B0", fontSize: 13, display: "block", marginBottom: 8 }}>
                    Descuento de apertura: <strong style={{ color: "#00D2FF" }}>{config.opening_discount_pct}%</strong>
                  </label>
                  <input type="range" min={10} max={25} step={1} value={config.opening_discount_pct}
                    onChange={e => setConfig(c => ({ ...c, opening_discount_pct: Number(e.target.value) }))}
                    style={{ width: "100%", accentColor: "#00D2FF" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#B0B0B0", fontSize: 11, marginTop: 2 }}>
                    <span>10%</span><span>25%</span>
                  </div>
                </div>

                <button onClick={saveConfig}
                  style={{ padding: "12px 0", borderRadius: 14, border: `1px solid ${configSaved ? "#00FF88" : "#00D2FF"}`, background: configSaved ? "rgba(0,255,136,0.15)" : "rgba(0,210,255,0.15)", color: configSaved ? "#00FF88" : "#00D2FF", cursor: "pointer", fontSize: 15, fontWeight: 700, transition: "all 0.2s" }}>
                  {configSaved ? <><CheckCheck size={16} style={{ display: "inline", marginRight: 6 }} />Guardado</> : "Guardar configuración"}
                </button>
              </div>
            </div>

            {/* Strategy tips */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <h2 style={{ color: "white", fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>Estrategia de negociación</h2>

              {([
                { Icon: Target,     title: "Apertura baja",          desc: `Abrí siempre con ${config.opening_discount_pct}% abajo. Nunca con tu precio real. Dejá margen para negociar.` },
                { Icon: MessageSquare, title: "El silencio es poder",desc: "Después de hacer una oferta, callate. El que habla primero cede terreno. Dejá que el vendedor responda." },
                { Icon: RefreshCw,  title: "Permuta como ancla",     desc: "La Amarok es tu carta fuerte. Proponé permuta pura primero. Si no acepta, sumá diferencia gradualmente." },
                { Icon: Gauge,      title: "Argumentá con datos",    desc: `"El 0km 2025 sale sesenta y tres mil. Tu auto de ${config.year_min} debería estar en ${Math.round(63900 * 0.75 / 1000)}k máximo."` },
                { Icon: Clock,      title: "El tiempo juega a tu favor", desc: "Si el vendedor no baja, esperá 1 semana. Los autos que no se venden rápido bajan de precio." },
                { Icon: XCircle,    title: "El walk-away real",      desc: `Nunca pagues más de ${(config.walk_away_usd / 1000).toFixed(0)}k USD. Si no se puede, hay otro Mustang en el mercado.` },
                { Icon: CheckCircle2, title: "Checklist pre-compra", desc: "Mecánico propio, historial de servicio, VERAZ del vendedor, estado de documentación, transferencia directa." },
                { Icon: MapPin,     title: "Momento ideal",          desc: "Fin de mes (necesitan vender). Lunes o martes (menos tráfico). Lluvia (vendedores aburridos y receptivos)." },
              ] as { Icon: React.ElementType; title: string; desc: string }[]).map(tip => (
                <div key={tip.title} style={{ ...glass, padding: "16px 20px", display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(0,210,255,0.1)", border: "1px solid rgba(0,210,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <tip.Icon size={16} color="#00D2FF" />
                  </div>
                  <div>
                    <p style={{ color: "white", fontWeight: 600, margin: "0 0 4px", fontSize: 14 }}>{tip.title}</p>
                    <p style={{ color: "#B0B0B0", margin: 0, fontSize: 13, lineHeight: 1.5 }}>{tip.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            TAB: HISTORIAL
        ══════════════════════════════════════════ */}
        {tab === "Historial" && (
          <div style={{ padding: isMobile ? "16px 14px" : "32px 32px" }}>
            <h2 style={{ color: "white", fontSize: 20, fontWeight: 700, margin: "0 0 24px" }}>Historial de conversaciones</h2>

            {sessions.length === 0 ? (
              <div style={{ ...glass, padding: 48, textAlign: "center" }}>
                <p style={{ color: "#B0B0B0", fontSize: 16, margin: 0 }}>No hay conversaciones guardadas aún.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 800 }}>
                {sessions.map(s => (
                  <div key={s.session_id} style={{ ...glass, overflow: "hidden" }}>
                    <div style={{ padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
                      onClick={() => toggleSession(s.session_id)}>
                      <div>
                        <p style={{ color: "white", fontWeight: 600, margin: "0 0 4px", fontSize: 14 }}>
                          Sesión {new Date(s.started_at).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })}
                        </p>
                        <p style={{ color: "#B0B0B0", fontSize: 12, margin: 0 }}>
                          {s.msg_count} mensajes · última actividad: {timeAgo(s.last_at)}
                        </p>
                      </div>
                      <span style={{ color: "#B0B0B0", fontSize: 18, transition: "transform 0.2s", transform: expandedSession === s.session_id ? "rotate(180deg)" : "none" }}>
                        ↓
                      </span>
                    </div>

                    {expandedSession === s.session_id && (
                      <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", padding: "16px 24px", display: "flex", flexDirection: "column", gap: 10 }}>
                        {sessionMsgs.length === 0 ? (
                          <p style={{ color: "#B0B0B0", fontSize: 13, margin: 0 }}>Cargando mensajes...</p>
                        ) : (
                          sessionMsgs.map((m, i) => (
                            <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                              <span style={{ flexShrink: 0, width: 28, height: 28, borderRadius: "50%", background: m.role === "user" ? "rgba(0,210,255,0.2)" : "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>
                                {m.role === "user" ? "C" : "M"}
                              </span>
                              <div style={{ flex: 1 }}>
                                <p style={{ color: m.role === "user" ? "#00D2FF" : "#B0B0B0", fontSize: 11, margin: "0 0 3px", textTransform: "capitalize" }}>
                                  {m.role === "user" ? "Carlos" : "Manolo"} · {new Date(m.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                                </p>
                                <p style={{ color: "white", fontSize: 13, margin: 0, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{m.content}</p>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      {/* ── Voice Call ── */}
      {voiceCall && <VoiceCall sessionId={SESSION_ID} onClose={() => setVoiceCall(false)} />}

      {/* ── WhatsApp Modal ── */}
      {waLead && <WAModal lead={waLead} onClose={() => setWaLead(null)} />}

      {/* ── Global CSS ── */}
      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        * { box-sizing: border-box; }
        select option { background: #1a1a2e; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }
        input[type=range] { cursor: pointer; }
        html, body { overflow-x: hidden; }
        @media (max-width: 768px) {
          input, select, textarea { font-size: 16px !important; }
        }
      `}</style>
    </div>
  );
}
