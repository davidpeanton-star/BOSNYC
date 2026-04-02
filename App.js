import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, doc, onSnapshot, setDoc } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import html2canvas from "html2canvas";

/* ═══════════════════════════════════════════
   🔧 CONFIGURACIÓN
   ═══════════════════════════════════════════ */

const firebaseConfig = {
  apiKey: "AIzaSyDfjxzkymYvxK6Dtuu_OTAHB3Cj3Z8iRlk",
  authDomain: "viaje-usa-54b2f.firebaseapp.com",
  projectId: "viaje-usa-54b2f",
  storageBucket: "viaje-usa-54b2f.firebasestorage.app",
  messagingSenderId: "461014107533",
  appId: "1:461014107533:web:71a90887305c64d425e9c4",
  measurementId: "G-DBRNDPWLPB",
};

const AI_API_KEY = "AIzaSyC9k6-Lf7lVZujVSYXNYBhGoApp-gyf-sQ";

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const storage = getStorage(app);
const TRIP_DOC = doc(db, "viajes", "boston_ny_2025");

/* ═══════════════════════════════════════════
   📦 CONSTANTES Y DATOS INICIALES
   ═══════════════════════════════════════════ */

const ICONS = [
  "🏨","✈️","🚗","🗺️","🍽️","🍕","🦞","🏀","🗽","🔭",
  "🎓","🌳","🌊","🎭","🛒","🌅","🏛️","🚶","🛍️","🎨",
  "🌃","🌉","🏙️","📸","🥩","☕","🎵","🎬","🏆","🚇",
  "🎉","🌆","🍣","🎪","⛵","🏟️","🌇","🍜","🥗","🖼️",
  "🎠","🍦","🎡","🧁","🥐","⚾","🦁","🍺","🚢","🎻",
  "🌮","🔬","🏡","🌉","🎯",
];

const CATEGORIES = {
  activity:   { label: "Actividad",    bg: "#eef2ff", col: "#4f46e5", icon: "🎯" },
  restaurant: { label: "Restaurante",  bg: "#fff7ed", col: "#ea580c", icon: "🍽️" },
  hotel:      { label: "Alojamiento",  bg: "#ecfdf5", col: "#059669", icon: "🏨" },
  transport:  { label: "Transporte",   bg: "#fef2f2", col: "#dc2626", icon: "🚗" },
};

const WMO_ICONS = {
  0: "☀️", 1: "🌤️", 2: "⛅", 3: "☁️", 45: "🌫️", 48: "🌫️",
  51: "🌧️", 53: "🌧️", 55: "🌧️", 61: "☔", 63: "☔", 65: "☔",
  71: "🌨️", 73: "🌨️", 75: "🌨️", 80: "🌦️", 81: "🌦️", 82: "🌦️",
  95: "⛈️", 96: "⛈️", 99: "⛈️",
};

const NAV_TABS = [
  ["plan",        "📅 Plan"],
  ["logbook",     "📖 Bitácora"],
  ["checklist",   "🎒 Maleta"],
  ["budget",      "💰 Gastos"],
  ["suggestions", "✨ Ideas IA"],
  ["summary",     "🏁 Resumen"],
];

const INIT_CHECKLIST = [
  { id: 1, text: "Pasaportes y ESTA impresos", done: false },
  { id: 2, text: "Adaptadores de enchufe (Clavija plana)", done: false },
  { id: 3, text: "Abrigos / Chubasqueros (Clima Boston)", done: false },
  { id: 4, text: "Entradas Celtics en el móvil", done: false },
  { id: 5, text: "Billetes de avión confirmados", done: false },
];

const INIT_DAYS = [
  {
    date: "Jue 3 Abril", city: "Boston", emoji: "✈️", label: "Llegada a Boston", color: "#059669",
    activities: [
      { time: "Tarde", icon: "🏨", title: "Check-in en Cambridge", desc: "Hotel en Cambridge, barrio universitario con ambiente estudiantil vibrante.", confirmed: false, done: false, budget: 0, link: "", address: "Cambridge, Boston, MA", category: "hotel" },
      { time: "Tarde", icon: "🚶", title: "Paseo por Harvard Square", desc: "Primera toma de contacto. Tiendas, cafeterías y el icónico ambiente de la zona.", confirmed: false, done: false, budget: 0, link: "", address: "Harvard Square, Cambridge, MA", category: "activity" },
      { time: "Noche", icon: "🍽️", title: "Cena en Cambridge", desc: "The Harvest o algo informal en Harvard Square. Cocina americana de calidad.", confirmed: false, done: false, budget: 80, link: "https://www.harvestrestaurant.com", address: "44 Brattle St, Cambridge, MA", category: "restaurant" },
    ],
  },
  {
    date: "Vie 4 Abril", city: "Boston", emoji: "🏛️", label: "Boston histórico", color: "#059669",
    activities: [
      { time: "Mañana", icon: "🎓", title: "Harvard University", desc: "Visita al campus: Harvard Yard, Memorial Hall y museo Peabody.", confirmed: false, done: false, budget: 20, link: "https://www.harvard.edu/visitors/", address: "Harvard Yard, Cambridge, MA", category: "activity" },
      { time: "Mañana", icon: "🔬", title: "MIT – Campus rápido", desc: "A 10 min andando de Harvard. El Gehry Building es muy fotogénico.", confirmed: false, done: false, budget: 0, link: "https://www.mit.edu", address: "77 Massachusetts Ave, Cambridge", category: "activity" },
      { time: "Tarde", icon: "🗺️", title: "Freedom Trail", desc: "Ruta histórica de 4 km marcada en rojo. 16 monumentos históricos.", confirmed: false, done: false, budget: 0, link: "https://www.thefreedomtrail.org", address: "Boston Common, Boston, MA", category: "activity" },
      { time: "Noche", icon: "🦞", title: "Cena en North End", desc: "Barrio italiano de Boston. Mariscos y pasta auténtica. Probar Mamma Maria.", confirmed: false, done: false, budget: 100, link: "", address: "North End, Boston, MA", category: "restaurant" },
    ],
  },
  {
    date: "Sáb 5 Abril", city: "Boston", emoji: "🏀", label: "Boston libre + ¡Celtics!", color: "#059669",
    activities: [
      { time: "Mañana", icon: "🌊", title: "New England Aquarium", desc: "Pingüinos, tiburones y tortugas gigantes.", confirmed: false, done: false, budget: 80, link: "https://www.neaq.org", address: "1 Central Wharf, Boston, MA", category: "activity" },
      { time: "Mediodía", icon: "🛒", title: "Faneuil Hall Marketplace", desc: "Mercado histórico con comida de todo el mundo.", confirmed: false, done: false, budget: 60, link: "", address: "4 South Market St, Boston, MA", category: "restaurant" },
      { time: "Tarde", icon: "🏡", title: "Paseo por Beacon Hill", desc: "El barrio más pintoresco de Boston.", confirmed: false, done: false, budget: 0, link: "", address: "Beacon Hill, Boston, MA", category: "activity" },
      { time: "20:00h", icon: "🏀", title: "CELTICS vs RAPTORS 🎟️", desc: "¡El partido! TD Garden. Llegad 45 min antes.", confirmed: true, done: false, budget: 300, link: "", address: "TD Garden, Boston, MA", category: "activity" },
    ],
  },
  {
    date: "Dom 6 Abril", city: "Boston → New York", emoji: "🚗", label: "Road Trip a NYC", color: "#ea580c",
    activities: [
      { time: "Mañana", icon: "🌳", title: "Boston Common", desc: "Último paseo matutino por el parque.", confirmed: false, done: false, budget: 0, link: "", address: "Boston Common, Boston, MA", category: "activity" },
      { time: "Mediodía", icon: "🚗", title: "Salida hacia New York", desc: "~4,5h por la I-95 South. Parada en New Haven a comer pizza.", confirmed: false, done: false, budget: 150, link: "", address: "New Haven, CT", category: "transport" },
      { time: "Tarde", icon: "🏨", title: "Check-in Manhattan", desc: "Hotel cerca de Central Park. Instalarse y dejar las maletas.", confirmed: false, done: false, budget: 0, link: "", address: "Manhattan, New York", category: "hotel" },
      { time: "Noche", icon: "🌃", title: "Times Square", desc: "Paseo nocturno por Times Square y Broadway.", confirmed: false, done: false, budget: 40, link: "", address: "Times Square, New York", category: "activity" },
    ],
  },
  {
    date: "Lun 7 Abril", city: "New York", emoji: "🗽", label: "Estatua de la Libertad", color: "#1e3a5f",
    activities: [
      { time: "7:30h", icon: "🗽", title: "Estatua Libertad + Ellis 🎟️", desc: "Ferry desde Battery Park. Ellis Island es muy emotiva.", confirmed: true, done: false, budget: 100, link: "", address: "Battery Park, New York", category: "activity" },
      { time: "Mediodía", icon: "🌉", title: "Brooklyn Bridge", desc: "Cruzad el puente (1 km) hasta DUMBO.", confirmed: false, done: false, budget: 0, link: "", address: "Brooklyn Bridge, New York", category: "activity" },
      { time: "Tarde", icon: "📸", title: "DUMBO, Brooklyn", desc: "Barrio artístico. La famosa foto del puente.", confirmed: false, done: false, budget: 30, link: "", address: "DUMBO, Brooklyn, NY", category: "activity" },
      { time: "Noche", icon: "🍕", title: "Pizza en Juliana's", desc: "Una de las mejores pizzas de Nueva York.", confirmed: false, done: false, budget: 80, link: "", address: "19 Old Fulton St, Brooklyn, NY", category: "restaurant" },
    ],
  },
  {
    date: "Mar 8 Abril", city: "New York", emoji: "🏙️", label: "El Bronx + Summit", color: "#1e3a5f",
    activities: [
      { time: "Mañana", icon: "🎨", title: "Tour por el Bronx 🎟️", desc: "Cuna del hip-hop y el grafiti. Yankee Stadium exterior.", confirmed: true, done: false, budget: 80, link: "", address: "The Bronx, New York", category: "activity" },
      { time: "Mediodía", icon: "🌳", title: "Central Park", desc: "Comida en el parque o bici de alquiler para los peques.", confirmed: false, done: false, budget: 40, link: "", address: "Central Park, New York", category: "activity" },
      { time: "17:30h", icon: "🔭", title: "SUMMIT One Vanderbilt 🎟️", desc: "Mejor mirador de NYC. Experiencia inmersiva.", confirmed: true, done: false, budget: 120, link: "", address: "45 E 42nd St, New York", category: "activity" },
    ],
  },
  {
    date: "Mié 9 Abril", city: "New York", emoji: "🎭", label: "Central Park & Cultura", color: "#1e3a5f",
    activities: [
      { time: "Mañana", icon: "🌳", title: "Central Park en profundidad", desc: "Strawberry Fields, Castillo Belvedere, carrusel.", confirmed: false, done: false, budget: 30, link: "", address: "Central Park, New York", category: "activity" },
      { time: "Mediodía", icon: "🖼️", title: "Museo MET", desc: "El museo más grande de EE.UU. Colección egipcia.", confirmed: false, done: false, budget: 80, link: "", address: "1000 Fifth Ave, New York", category: "activity" },
      { time: "Noche", icon: "🎭", title: "Broadway Show", desc: "El Rey León o Aladdin. Entradas en TKTS.", confirmed: false, done: false, budget: 300, link: "", address: "Times Square, New York", category: "activity" },
    ],
  },
  {
    date: "Jue 10 Abril", city: "New York", emoji: "🌆", label: "Manhattan Norte & Sur", color: "#1e3a5f",
    activities: [
      { time: "Mañana", icon: "🚶", title: "The High Line", desc: "Parque elevado sobre antigua vía de tren.", confirmed: false, done: false, budget: 0, link: "", address: "The High Line, New York", category: "activity" },
      { time: "Mediodía", icon: "🍽️", title: "Chelsea Market", desc: "Mercado gourmet bajo el High Line.", confirmed: false, done: false, budget: 70, link: "", address: "75 9th Ave, New York", category: "restaurant" },
      { time: "Tarde", icon: "🌆", title: "Oculus / 11-S", desc: "Memorial del 11-S muy emotivo.", confirmed: false, done: false, budget: 40, link: "", address: "180 Greenwich St, New York", category: "activity" },
    ],
  },
  {
    date: "Vie 11 Abril", city: "Boston ✈️", emoji: "✈️", label: "Vuelta a casa ⚠️", color: "#dc2626",
    activities: [
      { time: "8:00h", icon: "🌅", title: "Check-out y desayuno", desc: "Salid del hotel antes de las 9:30h.", confirmed: false, done: false, budget: 30, link: "", address: "Manhattan, New York", category: "transport" },
      { time: "9:30h", icon: "🚗", title: "Salida hacia Boston ⚠️", desc: "¡4,5h de trayecto + tráfico de viernes!", confirmed: true, done: false, budget: 150, link: "", address: "I-95 North", category: "transport" },
      { time: "14:30h", icon: "🏁", title: "Boston Logan – Vuelo", desc: "Devolved el coche. ¡Vuelo a las 17:30h!", confirmed: true, done: false, budget: 0, link: "", address: "Boston Logan International Airport", category: "transport" },
    ],
  },
];

/* ═══════════════════════════════════════════
   🛠 UTILIDADES
   ═══════════════════════════════════════════ */

/** Parsea una cadena de tiempo a un número para ordenación */
const parseTime = (t) => {
  if (!t) return 9999;
  const str = t.toLowerCase();
  if (str.includes("mañana")) return 800;
  if (str.includes("mediodía") || str.includes("mediodia")) return 1300;
  if (str.includes("tarde")) return 1700;
  if (str.includes("noche")) return 2000;
  const match = str.match(/(\d{1,2})[:h.]?(\d{2})?/);
  if (match) {
    let h = parseInt(match[1]);
    const m = parseInt(match[2] || 0);
    if (str.includes("pm") && h < 12) h += 12;
    return h * 100 + m;
  }
  return 9999;
};

/** Devuelve color temático según ciudad/día */
const getDayColor = (city, label) => {
  if (label.includes("Vuelta")) return "#dc2626";
  if (city === "Boston") return "#059669";
  if (city === "New York") return "#1e3a5f";
  if (city.includes("Boston → New York")) return "#ea580c";
  return "#4f46e5";
};

/* ═══════════════════════════════════════════
   🤖 GEMINI AI — RETRY + BACKOFF + CACHÉ
   ═══════════════════════════════════════════ */

/** Caché en memoria para respuestas de IA (evita llamadas duplicadas) */
const aiCache = new Map();

/**
 * Llama a la API de Gemini con retry automático y backoff exponencial.
 * Maneja específicamente el error 429 (rate limit).
 * @param {string} prompt - El prompt a enviar
 * @param {number} maxRetries - Número máximo de reintentos (default: 3)
 * @returns {Promise<object>} - Respuesta parseada de la IA
 */
async function callGeminiWithRetry(prompt, maxRetries = 3) {
  // Revisar caché primero
  const cacheKey = prompt.slice(0, 200); // clave basada en inicio del prompt
  if (aiCache.has(cacheKey)) {
    console.log("✅ Respuesta IA servida desde caché");
    return aiCache.get(cacheKey);
  }

  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Backoff exponencial: 0s, 2s, 4s, 8s...
      if (attempt > 0) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`⏳ Reintento ${attempt}/${maxRetries} en ${delay / 1000}s...`);
        await new Promise((r) => setTimeout(r, delay));
      }

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${AI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        }
      );

      // Error 429 específico: rate limit
      if (res.status === 429) {
        const retryAfter = res.headers.get("Retry-After");
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, attempt + 1) * 1000;
        console.warn(`⚠️ Rate limit (429). Esperando ${waitTime / 1000}s...`);
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, waitTime));
          continue;
        }
        throw new Error("Demasiadas solicitudes a la IA. Espera 1 minuto e inténtalo de nuevo.");
      }

      if (!res.ok) {
        throw new Error(`Error del servidor (${res.status}). Inténtalo de nuevo.`);
      }

      const jsonResp = await res.json();
      if (jsonResp.error) throw new Error(jsonResp.error.message);

      let raw = jsonResp.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!raw) throw new Error("Respuesta vacía de la IA.");

      // Limpieza robusta del markdown
      raw = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      const parsed = JSON.parse(raw);

      // Guardar en caché
      aiCache.set(cacheKey, parsed);
      return parsed;
    } catch (err) {
      lastError = err;
      // Si es un error de parseo JSON, no reintentar
      if (err instanceof SyntaxError) {
        throw new Error("La IA devolvió un formato incorrecto. Inténtalo de nuevo.");
      }
      // Si no quedan reintentos, lanzar
      if (attempt >= maxRetries) throw lastError;
    }
  }
  throw lastError;
}

/* ═══════════════════════════════════════════
   🧩 COMPONENTES REUTILIZABLES
   ═══════════════════════════════════════════ */

/** Badge/Etiqueta reutilizable */
function Badge({ children, bg, color, style = {} }) {
  return (
    <span
      style={{
        fontSize: 13,
        fontWeight: 700,
        padding: "4px 10px",
        borderRadius: 8,
        background: bg,
        color: color,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/** Botón con estados y animación */
function Btn({ children, onClick, variant = "primary", disabled, style = {}, ...rest }) {
  const variants = {
    primary:   { bg: "#4f46e5", color: "#fff", hoverBg: "#4338ca" },
    success:   { bg: "#059669", color: "#fff", hoverBg: "#047857" },
    danger:    { bg: "#dc2626", color: "#fff", hoverBg: "#b91c1c" },
    ghost:     { bg: "#f3f4f6", color: "#374151", hoverBg: "#e5e7eb" },
    outline:   { bg: "transparent", color: "#4f46e5", hoverBg: "#eef2ff" },
    dark:      { bg: "#111827", color: "#fff", hoverBg: "#1f2937" },
  };
  const v = variants[variant] || variants.primary;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: v.bg,
        color: v.color,
        border: variant === "outline" ? "2px solid currentColor" : "none",
        borderRadius: 14,
        padding: "14px 20px",
        fontSize: 16,
        fontWeight: 800,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        transition: "all 0.2s ease",
        fontFamily: "inherit",
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Input/Textarea reutilizable */
function FormField({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      {label && (
        <label
          style={{
            fontSize: 14,
            color: "#6b7280",
            fontWeight: 700,
            marginBottom: 8,
            display: "block",
            letterSpacing: "0.02em",
          }}
        >
          {label}
        </label>
      )}
      {children}
    </div>
  );
}

/** Tarjeta de sugerencia IA */
function SuggCard({ act, col, onAdd }) {
  const [added, setAdded] = useState(false);
  return (
    <div
      style={{
        background: "white",
        borderRadius: 18,
        marginBottom: 12,
        padding: 20,
        border: "1px solid #e5e7eb",
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        transition: "all 0.3s ease",
      }}
    >
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <span style={{ fontSize: 36, flexShrink: 0, lineHeight: 1 }}>{act.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8, color: "#111827" }}>
            {act.title}
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            {act.time && <Badge bg="#f3f4f6" color="#374151">⏰ {act.time}</Badge>}
            {act.budget > 0 && <Badge bg="#eef2ff" color="#4f46e5">💰 ~{act.budget}€</Badge>}
          </div>
          <p style={{ margin: 0, fontSize: 15, color: "#6b7280", lineHeight: 1.6 }}>
            {act.desc}
          </p>
        </div>
      </div>
      <Btn
        onClick={() => { if (!added) { onAdd(); setAdded(true); } }}
        variant={added ? "success" : "primary"}
        style={{
          marginTop: 14,
          width: "100%",
          background: added ? "#059669" : col,
          cursor: added ? "default" : "pointer",
        }}
      >
        {added ? "✅ Añadido al plan" : "➕ Añadir al plan"}
      </Btn>
    </div>
  );
}

/** Indicador de estado de guardado */
function SaveIndicator({ status }) {
  const config = {
    saving: { bg: "#f59e0b", text: "💾 Guardando..." },
    saved:  { bg: "#059669", text: "✅ Guardado" },
    cloud:  { bg: "#4f46e5", text: "☁️ Sincronizado" },
    err:    { bg: "#dc2626", text: "❌ Error" },
  };
  const c = config[status] || { bg: "rgba(255,255,255,0.15)", text: "…" };
  return (
    <div
      style={{
        background: c.bg,
        padding: "6px 14px",
        borderRadius: 10,
        fontSize: 14,
        fontWeight: 700,
        color: "white",
        transition: "all 0.4s ease",
        textAlign: "center",
      }}
    >
      {c.text}
    </div>
  );
}

/** Widget de clima */
function WeatherWidget({ weather, onClick }) {
  return (
    <div
      onClick={onClick}
      title="Clic para ver previsión por horas"
      style={{
        background: "rgba(255,255,255,0.2)",
        borderRadius: 14,
        padding: "10px 14px",
        cursor: "pointer",
        backdropFilter: "blur(8px)",
        transition: "transform 0.2s, background 0.2s",
      }}
    >
      {weather ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 28 }}>{weather.icon}</span>
          <div style={{ fontSize: 14, lineHeight: 1.4, fontWeight: 800, textAlign: "left" }}>
            <div style={{ color: "#fef08a" }}>{weather.max}º máx</div>
            <div style={{ color: "#bae6fd" }}>{weather.min}º mín</div>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 14, fontWeight: 700, opacity: 0.8 }}>Cargando clima...</div>
      )}
    </div>
  );
}

/** Card de actividad individual en la vista Plan */
function ActivityCard({
  activity: a,
  index: i,
  isExpanded,
  onToggleExpand,
  onToggleDone,
  onEdit,
  onDelete,
  onPhotoUpload,
  isUploading,
  uploadDisabled,
  col,
}) {
  const ci = CATEGORIES[a.category] || CATEGORIES.activity;
  return (
    <div
      style={{
        background: "white",
        borderRadius: 18,
        marginBottom: 14,
        overflow: "hidden",
        border: `2px solid ${a.done ? "#bbf7d0" : a.confirmed ? col + "44" : "#f3f4f6"}`,
        opacity: a.done ? 0.8 : 1,
        boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
        transition: "all 0.3s ease",
      }}
    >
      {/* Cabecera de la actividad */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "16px 18px",
          cursor: "pointer",
        }}
        onClick={onToggleExpand}
      >
        <span style={{ fontSize: 32, flexShrink: 0, lineHeight: 1 }}>{a.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
            <span
              style={{
                fontWeight: 800,
                fontSize: 17,
                color: "#111827",
                textDecoration: a.done ? "line-through" : "none",
              }}
            >
              {a.title}
            </span>
            {a.confirmed && !a.done && (
              <Badge bg={col} color="white" style={{ fontSize: 11 }}>✓ Reservado</Badge>
            )}
            {a.photo && !isExpanded && <span style={{ fontSize: 14 }}>📸</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Badge bg="#f3f4f6" color="#374151" style={{ fontSize: 14, fontWeight: 900 }}>⏰ {a.time}</Badge>
            <Badge bg={ci.bg} color={ci.col}>{ci.label}</Badge>
            {a.budget > 0 && <Badge bg="#fff7ed" color="#ea580c">💰 {a.budget}€</Badge>}
          </div>
        </div>
        <div data-html2canvas-ignore="true" style={{ flexShrink: 0 }}>
          <button
            onClick={(e) => { e.stopPropagation(); onToggleDone(); }}
            style={{
              background: a.done ? "#059669" : "#f3f4f6",
              color: a.done ? "white" : "#6b7280",
              border: "none",
              borderRadius: 10,
              padding: "8px 14px",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 800,
              transition: "all 0.2s ease",
            }}
          >
            {a.done ? "✅" : "☐"}
          </button>
        </div>
      </div>

      {/* Contenido expandido */}
      {isExpanded && (
        <div
          style={{
            padding: "0 18px 18px 64px",
            borderTop: "1px solid #f3f4f6",
            animation: "fadeIn 0.3s ease",
          }}
        >
          <p style={{ fontSize: 16, color: "#6b7280", margin: "14px 0 12px", lineHeight: 1.6 }}>
            {a.desc}
          </p>

          {/* Foto */}
          <div data-html2canvas-ignore="true" style={{ margin: "14px 0" }}>
            {a.photo ? (
              <div style={{ position: "relative" }}>
                <img
                  src={a.photo}
                  alt={a.title}
                  style={{
                    width: "100%",
                    maxHeight: 220,
                    objectFit: "cover",
                    borderRadius: 14,
                    border: "1px solid #e5e7eb",
                  }}
                />
                <label
                  style={{
                    position: "absolute", bottom: 10, right: 10,
                    background: "rgba(0,0,0,0.65)", color: "white",
                    padding: "8px 14px", borderRadius: 10, fontSize: 14,
                    cursor: "pointer", fontWeight: 700, backdropFilter: "blur(4px)",
                  }}
                >
                  {isUploading ? "⏳..." : "🔄 Cambiar"}
                  <input type="file" accept="image/*" onChange={onPhotoUpload} style={{ display: "none" }} disabled={uploadDisabled} />
                </label>
              </div>
            ) : (
              <label
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  background: "#f9fafb", padding: "14px", borderRadius: 14, cursor: "pointer",
                  color: "#6b7280", fontWeight: 700, fontSize: 15, border: "2px dashed #d1d5db",
                  transition: "all 0.2s ease",
                }}
              >
                {isUploading ? "⏳ Subiendo..." : "📸 Añadir foto"}
                <input type="file" accept="image/*" onChange={onPhotoUpload} style={{ display: "none" }} disabled={uploadDisabled} />
              </label>
            )}
          </div>

          {/* Dirección con enlace a Maps */}
          {a.address && (
            <div style={{ marginBottom: 14 }}>
              <a
                data-html2canvas-ignore="true"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.address)}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  fontSize: 14, color: col, fontWeight: 700, textDecoration: "none",
                  background: `${col}10`, padding: "8px 14px", borderRadius: 10,
                  transition: "all 0.2s ease",
                }}
              >
                📍 {a.address} ↗
              </a>
              <div style={{ display: "none" }} className="show-on-export">📍 {a.address}</div>
            </div>
          )}

          {/* Botones de acción */}
          <div data-html2canvas-ignore="true" style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <Btn onClick={(e) => { e.stopPropagation(); onEdit(); }} variant="ghost" style={{ padding: "10px 16px", fontSize: 14 }}>
              ✏️ Editar
            </Btn>
            <Btn onClick={(e) => { e.stopPropagation(); onDelete(); }} variant="ghost" style={{ padding: "10px 16px", fontSize: 14, background: "#fef2f2", color: "#dc2626" }}>
              🗑️ Borrar
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   🏠 COMPONENTE PRINCIPAL
   ═══════════════════════════════════════════ */

export default function App() {
  /* ── Estado ── */
  const [data, setData] = useState(null);
  const [sel, setSel] = useState(0);
  const [exp, setExp] = useState(null);
  const [view, setView] = useState("plan");
  const [editModal, setEditModal] = useState(null);
  const [form, setForm] = useState({});
  const [iconPicker, setIconPicker] = useState(false);
  const [sugg, setSugg] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [delConfirm, setDelConfirm] = useState(null);
  const [saveStatus, setSaveStatus] = useState("");
  const [weatherData, setWeatherData] = useState({});
  const [uploading, setUploading] = useState(null);
  const [newCheckItem, setNewCheckItem] = useState("");

  // Ref para debouncing de la IA
  const aiDebounceRef = useRef(null);
  const saveTimeoutRef = useRef(null);

  /* ── Firebase Sync ── */
  useEffect(() => {
    const unsubscribe = onSnapshot(
      TRIP_DOC,
      (docSnap) => {
        if (docSnap.exists()) {
          const fetched = docSnap.data();
          if (!fetched.checklist) fetched.checklist = INIT_CHECKLIST;
          setData(fetched);
          setSaveStatus("cloud");
        } else {
          const initial = { dias: INIT_DAYS, checklist: INIT_CHECKLIST };
          setDoc(TRIP_DOC, initial);
          setData(initial);
        }
      },
      (error) => {
        console.error("Firebase error:", error);
        if (!data) setData({ dias: INIT_DAYS, checklist: INIT_CHECKLIST });
      }
    );
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Clima ── */
  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const [resB, resNY] = await Promise.all([
          fetch("https://api.open-meteo.com/v1/forecast?latitude=42.3601&longitude=-71.0589&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=America%2FNew_York&forecast_days=16"),
          fetch("https://api.open-meteo.com/v1/forecast?latitude=40.7128&longitude=-74.0060&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=America%2FNew_York&forecast_days=16"),
        ]);
        const [dataB, dataNY] = await Promise.all([resB.json(), resNY.json()]);
        const wMap = {};
        const process = (d, prefix) =>
          d.daily.time.forEach((dt, i) => {
            wMap[`${prefix}-${parseInt(dt.split("-")[2], 10)}`] = {
              icon: WMO_ICONS[d.daily.weather_code[i]] || "🌤️",
              max: Math.round(d.daily.temperature_2m_max[i]),
              min: Math.round(d.daily.temperature_2m_min[i]),
            };
          });
        process(dataB, "Boston");
        process(dataNY, "New York");
        setWeatherData(wMap);
      } catch (e) {
        console.warn("No se pudo cargar el clima:", e);
      }
    };
    fetchWeather();
  }, []);

  /* ── Persistencia ── */
  const persist = useCallback(async (newData) => {
    setData(newData);
    setSaveStatus("saving");
    try {
      await setDoc(TRIP_DOC, newData);
      setSaveStatus("saved");
    } catch {
      setSaveStatus("err");
    }
    // Limpiar timeout anterior
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => setSaveStatus("cloud"), 2500);
  }, []);

  /* ── Acciones del plan ── */
  const openAdd = useCallback(() => {
    setForm({
      time: "", icon: "🎯", title: "", desc: "",
      budget: "", link: "", address: "", confirmed: false, category: "activity",
    });
    setEditModal({ di: sel, ai: -1 });
    setIconPicker(false);
  }, [sel]);

  const openEdit = useCallback((di, ai) => {
    setForm({ ...data.dias[di].activities[ai] });
    setEditModal({ di, ai });
    setIconPicker(false);
  }, [data]);

  const saveAct = useCallback(() => {
    if (!form.title?.trim()) return;
    const nDias = data.dias.map((d, i) => {
      if (i !== editModal.di) return d;
      const a = [...d.activities];
      if (editModal.ai === -1) a.push({ ...form, done: false });
      else a[editModal.ai] = form;
      return { ...d, activities: a };
    });
    persist({ ...data, dias: nDias });
    setEditModal(null);
  }, [data, editModal, form, persist]);

  const toggleDone = useCallback((di, ai) => {
    const nDias = data.dias.map((d, i) => {
      if (i !== di) return d;
      const activities = d.activities.map((a, j) =>
        j === ai ? { ...a, done: !a.done } : a
      );
      return { ...d, activities };
    });
    persist({ ...data, dias: nDias });
  }, [data, persist]);

  const updateComments = useCallback((text) => {
    const nDias = data.dias.map((d, i) =>
      i === sel ? { ...d, comments: text } : d
    );
    setData({ ...data, dias: nDias });
  }, [data, sel]);

  const delAct = useCallback((di, ai) => {
    const nDias = data.dias.map((d, i) =>
      i !== di ? d : { ...d, activities: d.activities.filter((_, j) => j !== ai) }
    );
    persist({ ...data, dias: nDias });
    setDelConfirm(null);
  }, [data, persist]);

  /* ── Checklist ── */
  const toggleCheck = useCallback((idx) => {
    if (!data.checklist) return;
    const nCheck = data.checklist.map((item, i) =>
      i === idx ? { ...item, done: !item.done } : item
    );
    persist({ ...data, checklist: nCheck });
  }, [data, persist]);

  const addCheck = useCallback(() => {
    if (!newCheckItem.trim()) return;
    const nCheck = [...(data.checklist || []), { id: Date.now(), text: newCheckItem, done: false }];
    persist({ ...data, checklist: nCheck });
    setNewCheckItem("");
  }, [data, newCheckItem, persist]);

  /* ── Fotos ── */
  const handlePhotoUpload = useCallback(async (e, di, ai) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(ai);
    try {
      const fileRef = ref(storage, `foto_actividad_${di}_${ai}_${Date.now()}`);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);
      const nDias = data.dias.map((d, i) => {
        if (i !== di) return d;
        const activities = d.activities.map((a, j) =>
          j === ai ? { ...a, photo: url } : a
        );
        return { ...d, activities };
      });
      await persist({ ...data, dias: nDias });
    } catch {
      alert("Error al subir foto. Revisa las reglas de Firebase Storage.");
    }
    setUploading(null);
  }, [data, persist]);

  /* ── Google Maps ── */
  const openSuperMap = useCallback(() => {
    const acts = data.dias[sel].activities.filter((a) => a.address);
    if (acts.length === 0) return alert("No hay actividades con dirección hoy.");
    if (acts.length === 1) {
      return window.open(
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(acts[0].address)}`,
        "_blank", "noopener,noreferrer"
      );
    }
    const origin = encodeURIComponent(acts[0].address);
    const dest = encodeURIComponent(acts[acts.length - 1].address);
    const waypoints = acts.slice(1, -1).map((a) => encodeURIComponent(a.address)).join("%7C");
    window.open(
      `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&waypoints=${waypoints}&travelmode=walking`,
      "_blank", "noopener,noreferrer"
    );
  }, [data, sel]);

  /* ── Exportar imagen ── */
  const exportDayImage = useCallback(() => {
    const el = document.getElementById("export-area");
    if (!el) return;
    html2canvas(el, { scale: 2, useCORS: true }).then((canvas) => {
      const link = document.createElement("a");
      link.download = `Plan_${data.dias[sel].date.replace(/ /g, "_")}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    });
  }, [data, sel]);

  /* ── Sugerencias IA con debounce ── */
  const fetchSugg = useCallback(async () => {
    if (!AI_API_KEY) return alert("¡Falta la clave de Gemini!");

    // Debounce: cancela llamadas rápidas sucesivas
    if (aiDebounceRef.current) clearTimeout(aiDebounceRef.current);

    setAiLoading(true);
    setAiError("");
    setSugg(null);

    aiDebounceRef.current = setTimeout(async () => {
      const d = data.dias[sel];
      const list = d.activities.map((a) => `${a.time}: ${a.title}`).join("; ");
      const prompt = `Viaje familiar (2 adultos, adolescentes 16 y niño 9) a ${d.city}. Agenda actual: ${list || "nada"}. Sugiere 3 planes y 2 restaurantes familiares baratos. Responde SOLO con un JSON estricto y sin markdown: {"activities":[{"icon":"emoji","title":"nombre","time":"hora","desc":"breve","budget":numero,"address":"lugar","link":""}],"restaurants":[{"icon":"🍽️","title":"nombre","time":"hora","desc":"breve","budget":numero,"address":"lugar","link":""}]}`;

      try {
        const result = await callGeminiWithRetry(prompt);
        setSugg(result);
      } catch (err) {
        console.error("Error IA:", err);
        setAiError(err.message);
        setSugg({ error: true });
      }
      setAiLoading(false);
    }, 800); // 800ms de debounce
  }, [data, sel]);

  /* ── Clima: click handler ── */
  const handleWeatherClick = useCallback(() => {
    if (!data) return;
    const d = data.dias[sel];
    const sorted = [...d.activities].sort((a, b) => parseTime(a.time) - parseTime(b.time));
    const now = new Date();
    const currTime = now.getHours() * 100 + now.getMinutes();
    let target = sorted.find((a) => parseTime(a.time) >= currTime);
    if (!target) target = sorted[0];
    const loc = target?.address || target?.title || d.city;
    window.open(
      `https://www.google.com/search?q=el+tiempo+por+horas+en+${encodeURIComponent(loc)}`,
      "_blank", "noopener,noreferrer"
    );
  }, [data, sel]);

  /* ── Valores derivados (memoizados) ── */
  const days = data?.dias || [];
  const day = days[sel] || {};
  const col = getDayColor(day.city || "", day.label || "");

  const total = useMemo(() =>
    days.reduce((s, d) => s + d.activities.reduce((ss, a) => ss + (parseFloat(a.budget) || 0), 0), 0),
    [days]
  );

  const sortedActivities = useMemo(() =>
    (day.activities || [])
      .map((act, index) => ({ ...act, originalIndex: index }))
      .sort((a, b) => parseTime(a.time) - parseTime(b.time)),
    [day.activities]
  );

  const dayNum = parseInt((day.date || "").replace(/\D/g, ""), 10);
  const cityKey = (day.city || "").includes("New York") ? "New York" : "Boston";
  const todayWeather = weatherData[`${cityKey}-${dayNum}`];

  /* ── Estilos compartidos ── */
  const inp = {
    width: "100%",
    padding: "13px 16px",
    borderRadius: 12,
    border: "2px solid #e5e7eb",
    fontSize: 16,
    boxSizing: "border-box",
    outline: "none",
    fontFamily: "inherit",
    transition: "border-color 0.2s",
  };

  /* ── Loading screen ── */
  if (!data) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", height: "100vh", gap: 16,
        background: "linear-gradient(135deg, #111827, #1f2937)", color: "white",
      }}>
        <div style={{ fontSize: 48, animation: "pulse 1.5s ease-in-out infinite" }}>✈️</div>
        <div style={{ fontSize: 22, fontWeight: 800 }}>Cargando tu viaje...</div>
        <div style={{ fontSize: 15, opacity: 0.6 }}>Conectando con Firebase</div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════
     🎨 RENDER PRINCIPAL
     ═══════════════════════════════════════════ */
  return (
    <div
      style={{
        fontFamily: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
        background: "#f8fafc",
        minHeight: "100vh",
        maxWidth: 560,
        margin: "0 auto",
        paddingBottom: 90,
      }}
    >
      {/* ═══ HEADER ═══ */}
      <header
        className="app-header-nav"
        style={{
          background: "linear-gradient(135deg, #0f172a, #1e293b)",
          padding: "24px 20px 18px",
          color: "white",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, letterSpacing: "-0.02em" }}>
              🇺🇸 Boston & New York
            </h1>
            <p style={{ margin: "6px 0 0", opacity: 0.7, fontSize: 14, fontWeight: 500 }}>
              3 – 11 Abril · David, Sandra, Inés & Álvaro
            </p>
          </div>
          <div style={{ textAlign: "right", display: "flex", flexDirection: "column", gap: 8 }}>
            <SaveIndicator status={saveStatus} />
            <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: "-0.01em" }}>💰 {total.toFixed(0)}€</div>
          </div>
        </div>

        {/* Navegación por pestañas */}
        <nav style={{ display: "flex", gap: 6, marginTop: 18, overflowX: "auto", paddingBottom: 4 }}>
          {NAV_TABS.map(([v, l]) => (
            <button
              key={v}
              onClick={() => {
                setView(v);
                if (v === "suggestions" && !sugg) fetchSugg();
              }}
              style={{
                flexShrink: 0,
                background: view === v ? "white" : "rgba(255,255,255,0.1)",
                color: view === v ? "#0f172a" : "rgba(255,255,255,0.8)",
                border: "none",
                borderRadius: 10,
                padding: "9px 14px",
                fontSize: 14,
                fontWeight: 800,
                cursor: "pointer",
                transition: "all 0.25s ease",
                fontFamily: "inherit",
              }}
            >
              {l}
            </button>
          ))}
        </nav>
      </header>

      {/* ═══ SELECTOR DE DÍAS ═══ */}
      {view !== "checklist" && view !== "budget" && view !== "summary" && (
        <div
          className="day-selector-nav"
          style={{
            display: "flex", gap: 8, overflowX: "auto",
            padding: "14px 20px", background: "white",
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
          }}
        >
          {days.map((d, i) => {
            const dCol = getDayColor(d.city, d.label);
            const active = sel === i;
            return (
              <button
                key={i}
                onClick={() => { setSel(i); setExp(null); setSugg(null); }}
                style={{
                  flexShrink: 0,
                  background: active ? dCol : "#f8fafc",
                  color: active ? "white" : "#64748b",
                  border: active ? "none" : "1px solid #e2e8f0",
                  borderRadius: 14,
                  padding: "10px 14px",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 800,
                  boxShadow: active ? `0 4px 14px ${dCol}40` : "none",
                  transition: "all 0.25s ease",
                  fontFamily: "inherit",
                }}
              >
                <div style={{ fontSize: 20, marginBottom: 4 }}>{d.emoji}</div>
                <div>{d.date.split(" ").slice(1, 3).join(" ")}</div>
              </button>
            );
          })}
        </div>
      )}

      {/* ═══ CONTENIDO ═══ */}
      <div style={{ padding: "18px 20px 0" }}>

        {/* ── VISTA: PLAN ── */}
        {view === "plan" && (
          <>
            <div id="export-area" style={{ background: "#f8fafc", paddingBottom: 10 }}>
              {/* Cabecera del día */}
              <div
                style={{
                  background: `linear-gradient(135deg, ${col}, ${col}cc)`,
                  borderRadius: 20,
                  padding: "22px",
                  color: "white",
                  marginBottom: 18,
                  boxShadow: `0 6px 20px ${col}35`,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 38, marginBottom: 6 }}>{day.emoji}</div>
                    <h2 style={{ margin: "0 0 4px", fontSize: 24, fontWeight: 900 }}>{day.date}</h2>
                    <div style={{ fontSize: 16, opacity: 0.9, fontWeight: 700 }}>📍 {day.city}</div>
                  </div>
                  <div style={{ textAlign: "right", display: "flex", flexDirection: "column", gap: 8 }}>
                    <WeatherWidget weather={todayWeather} onClick={handleWeatherClick} />
                    <div style={{ fontSize: 14, fontWeight: 800, opacity: 0.85 }}>
                      {day.activities.length} actividades
                    </div>
                  </div>
                </div>
              </div>

              {/* Botones de acción del día */}
              <div data-html2canvas-ignore="true" style={{ display: "flex", gap: 10, marginBottom: 18 }}>
                <Btn onClick={openSuperMap} variant="dark" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  🗺️ Súper Mapa
                </Btn>
                <Btn
                  onClick={exportDayImage}
                  variant="outline"
                  style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: col, borderColor: col }}
                >
                  📴 Descargar
                </Btn>
              </div>

              {/* Lista de actividades */}
              {sortedActivities.map((a, i) => (
                <ActivityCard
                  key={`${a.originalIndex}-${a.title}`}
                  activity={a}
                  index={i}
                  isExpanded={exp === i}
                  onToggleExpand={() => setExp(exp === i ? null : i)}
                  onToggleDone={() => toggleDone(sel, a.originalIndex)}
                  onEdit={() => openEdit(sel, a.originalIndex)}
                  onDelete={() => setDelConfirm({ di: sel, ai: a.originalIndex })}
                  onPhotoUpload={(e) => handlePhotoUpload(e, sel, a.originalIndex)}
                  isUploading={uploading === a.originalIndex}
                  uploadDisabled={uploading !== null}
                  col={col}
                />
              ))}
            </div>

            {/* Botón añadir */}
            <button
              onClick={openAdd}
              style={{
                width: "100%",
                background: `${col}08`,
                border: `2.5px dashed ${col}50`,
                borderRadius: 18,
                padding: "18px",
                color: col,
                fontSize: 16,
                fontWeight: 800,
                cursor: "pointer",
                marginTop: 8,
                transition: "all 0.2s ease",
                fontFamily: "inherit",
              }}
            >
              ＋ Añadir nueva actividad
            </button>
          </>
        )}

        {/* ── VISTA: BITÁCORA ── */}
        {view === "logbook" && (
          <div style={{
            background: "white", borderRadius: 20, padding: "24px",
            marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 22, color: "#111827", fontWeight: 900 }}>
              📖 Diario del día
            </h3>
            <p style={{ fontSize: 14, color: "#94a3b8", marginBottom: 18, lineHeight: 1.5 }}>
              Escribe cómo fue el día. Las fotos se guardan desde la pestaña 📅 Plan.
            </p>
            <textarea
              value={day.comments || ""}
              onChange={(e) => updateComments(e.target.value)}
              placeholder="Hoy nos hemos reído mucho en el parque..."
              style={{ ...inp, minHeight: 180, resize: "vertical", marginBottom: 14, lineHeight: 1.6 }}
            />
            <Btn
              onClick={() => persist(data)}
              style={{ width: "100%", background: col, marginBottom: 28 }}
            >
              💾 Guardar notas
            </Btn>

            <h4 style={{
              fontSize: 17, color: "#374151", borderBottom: "2px solid #f1f5f9",
              paddingBottom: 10, marginBottom: 14, fontWeight: 900,
            }}>
              🏆 Hitos completados
            </h4>
            {sortedActivities.filter((a) => a.done).length === 0 && (
              <p style={{ color: "#94a3b8", fontSize: 14, textAlign: "center", padding: 20 }}>
                Aún no hay actividades completadas hoy
              </p>
            )}
            {sortedActivities.filter((a) => a.done).map((a, i) => (
              <div
                key={i}
                style={{
                  display: "flex", alignItems: "center", gap: 12, marginBottom: 10,
                  background: "#f0fdf4", padding: "12px 16px", borderRadius: 12,
                  borderLeft: "5px solid #059669",
                }}
              >
                <span style={{ fontSize: 24 }}>{a.icon}</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: "#166534" }}>{a.title}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── VISTA: CHECKLIST ── */}
        {view === "checklist" && (
          <div style={{
            background: "white", borderRadius: 20, padding: "24px",
            marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 900, color: "#111827" }}>
              🎒 Lista de preparativos
            </h3>
            <p style={{ fontSize: 14, color: "#94a3b8", marginBottom: 20 }}>
              {data.checklist?.filter(c => c.done).length || 0} de {data.checklist?.length || 0} completados
            </p>

            {/* Barra de progreso */}
            <div style={{
              height: 6, background: "#f1f5f9", borderRadius: 8, marginBottom: 20, overflow: "hidden",
            }}>
              <div style={{
                height: "100%",
                width: `${((data.checklist?.filter(c => c.done).length || 0) / (data.checklist?.length || 1)) * 100}%`,
                background: "linear-gradient(90deg, #059669, #34d399)",
                borderRadius: 8,
                transition: "width 0.4s ease",
              }} />
            </div>

            <div style={{ marginBottom: 22 }}>
              {data.checklist?.map((item, idx) => (
                <div
                  key={item.id}
                  onClick={() => toggleCheck(idx)}
                  style={{
                    display: "flex", alignItems: "center", gap: 14,
                    padding: "14px 18px",
                    background: item.done ? "#f0fdf4" : "#fafafa",
                    borderRadius: 12, marginBottom: 8, cursor: "pointer",
                    border: `1.5px solid ${item.done ? "#bbf7d0" : "#e5e7eb"}`,
                    transition: "all 0.25s ease",
                  }}
                >
                  <div style={{
                    width: 24, height: 24, borderRadius: 8, flexShrink: 0,
                    background: item.done ? "#059669" : "white",
                    border: `2.5px solid ${item.done ? "#059669" : "#d1d5db"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "white", fontWeight: 900, fontSize: 14,
                    transition: "all 0.2s ease",
                  }}>
                    {item.done && "✓"}
                  </div>
                  <span style={{
                    fontSize: 16, fontWeight: item.done ? 500 : 700,
                    color: item.done ? "#166534" : "#374151",
                    textDecoration: item.done ? "line-through" : "none",
                    transition: "all 0.2s ease",
                  }}>
                    {item.text}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <input
                value={newCheckItem}
                onChange={(e) => setNewCheckItem(e.target.value)}
                placeholder="Añadir elemento..."
                style={{ ...inp, flex: 1 }}
                onKeyDown={(e) => e.key === "Enter" && addCheck()}
              />
              <Btn onClick={addCheck} variant="dark" style={{ padding: "0 20px" }}>+</Btn>
            </div>
          </div>
        )}

        {/* ── VISTA: PRESUPUESTO ── */}
        {view === "budget" && (
          <div style={{
            background: "white", borderRadius: 20, padding: "24px",
            marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          }}>
            <h3 style={{ margin: "0 0 20px", fontSize: 22, fontWeight: 900, color: "#111827" }}>
              💰 Desglose de gastos
            </h3>
            {days.map((d, di) => {
              const t = d.activities.reduce((s, a) => s + (parseFloat(a.budget) || 0), 0);
              const dCol = getDayColor(d.city, d.label);
              return (
                <div
                  key={di}
                  onClick={() => { setSel(di); setView("plan"); }}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "14px 0", borderBottom: "1px solid #f1f5f9", cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 20 }}>{d.emoji}</span>
                    <div>
                      <span style={{ color: "#111827", fontWeight: 700, fontSize: 15 }}>{d.date}</span>
                      <div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600 }}>{d.city}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{
                      fontWeight: 900, color: t > 0 ? "#111827" : "#d1d5db", fontSize: 17,
                    }}>
                      {t > 0 ? `${t.toFixed(0)}€` : "—"}
                    </span>
                    {t > 0 && (
                      <div style={{
                        height: 4, borderRadius: 4, marginTop: 4,
                        background: dCol, opacity: 0.4,
                        width: Math.max(20, (t / total) * 120),
                      }} />
                    )}
                  </div>
                </div>
              );
            })}
            <div style={{
              display: "flex", justifyContent: "space-between",
              padding: "20px 0 0", fontWeight: 900, fontSize: 22,
              borderTop: "2px solid #f1f5f9", marginTop: 8,
            }}>
              <span>TOTAL</span>
              <span style={{ color: "#4f46e5" }}>{total.toFixed(0)}€</span>
            </div>
          </div>
        )}

        {/* ── VISTA: SUGERENCIAS IA ── */}
        {view === "suggestions" && (
          <div>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              marginBottom: 18, gap: 12,
            }}>
              <div>
                <p style={{ margin: 0, fontSize: 16, color: "#111827", fontWeight: 800 }}>
                  ✨ Ideas para {day.city}
                </p>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "#94a3b8" }}>
                  Sugerencias personalizadas por IA
                </p>
              </div>
              <Btn
                onClick={fetchSugg}
                disabled={aiLoading}
                style={{ background: col, flexShrink: 0, padding: "12px 18px", fontSize: 14 }}
              >
                {aiLoading ? "⏳ Pensando..." : "🔄 Nuevas ideas"}
              </Btn>
            </div>

            {/* Mensaje de error con estilo */}
            {aiError && (
              <div style={{
                background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 14,
                padding: "16px 20px", marginBottom: 16,
              }}>
                <div style={{ fontWeight: 800, color: "#dc2626", fontSize: 15, marginBottom: 4 }}>
                  ⚠️ Error al obtener sugerencias
                </div>
                <p style={{ margin: 0, color: "#7f1d1d", fontSize: 14, lineHeight: 1.5 }}>{aiError}</p>
                <p style={{ margin: "8px 0 0", color: "#94a3b8", fontSize: 13 }}>
                  Pulsa "Nuevas ideas" para reintentar. Si persiste, espera 1 minuto.
                </p>
              </div>
            )}

            {/* Loading skeleton */}
            {aiLoading && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[1, 2, 3].map((n) => (
                  <div key={n} style={{
                    background: "white", borderRadius: 18, padding: 20,
                    border: "1px solid #e5e7eb", animation: "pulse 1.5s ease-in-out infinite",
                  }}>
                    <div style={{ display: "flex", gap: 14 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: "#f1f5f9" }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ height: 18, borderRadius: 6, background: "#f1f5f9", width: "60%", marginBottom: 10 }} />
                        <div style={{ height: 14, borderRadius: 6, background: "#f1f5f9", width: "80%" }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Resultados */}
            {sugg?.activities && !aiLoading && (
              <>
                <h4 style={{ fontSize: 15, color: "#64748b", fontWeight: 700, margin: "0 0 12px" }}>
                  🎯 Actividades sugeridas
                </h4>
                {sugg.activities.map((a, i) => (
                  <SuggCard
                    key={i}
                    act={a}
                    col={col}
                    onAdd={() => {
                      const nDias = [...data.dias];
                      nDias[sel].activities.push({ ...a, category: "activity", done: false, confirmed: false });
                      persist({ ...data, dias: nDias });
                    }}
                  />
                ))}
              </>
            )}
            {sugg?.restaurants && !aiLoading && (
              <>
                <h4 style={{ fontSize: 15, color: "#64748b", fontWeight: 700, margin: "16px 0 12px" }}>
                  🍽️ Restaurantes sugeridos
                </h4>
                {sugg.restaurants.map((r, i) => (
                  <SuggCard
                    key={i}
                    act={r}
                    col={col}
                    onAdd={() => {
                      const nDias = [...data.dias];
                      nDias[sel].activities.push({ ...r, category: "restaurant", done: false, confirmed: false });
                      persist({ ...data, dias: nDias });
                    }}
                  />
                ))}
              </>
            )}
          </div>
        )}

        {/* ── VISTA: RESUMEN ── */}
        {view === "summary" && (
          <div style={{
            background: "white", borderRadius: 20, padding: "26px",
            marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          }}>
            <div className="hide-on-print" style={{
              display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24,
            }}>
              <h3 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "#111827" }}>
                📖 Gran Resumen
              </h3>
              <Btn onClick={() => window.print()} style={{ background: "#4f46e5", padding: "12px 18px", fontSize: 14 }}>
                🖨️ Guardar PDF
              </Btn>
            </div>

            <div className="print-only-header" style={{
              display: "none", textAlign: "center", marginBottom: 40,
              paddingBottom: 20, borderBottom: "3px solid #111827",
            }}>
              <h1 style={{ fontSize: 32, marginBottom: 10, fontWeight: 900, color: "#111827" }}>
                🇺🇸 Nuestro Viaje a Boston & NY
              </h1>
              <p style={{ fontSize: 18, color: "#64748b", fontWeight: 700 }}>
                Viaje David, Sandra, Inés y Álvaro • Abril 2025
              </p>
            </div>

            {days.map((d, i) => (
              <div
                key={i}
                style={{
                  marginBottom: 36, paddingBottom: 28,
                  borderBottom: i < days.length - 1 ? "2px solid #f1f5f9" : "none",
                  pageBreakInside: "avoid",
                }}
              >
                <h4 style={{
                  fontSize: 22, color: getDayColor(d.city, d.label), marginBottom: 18,
                  display: "flex", alignItems: "center", gap: 10, fontWeight: 900,
                }}>
                  <span style={{ fontSize: 28 }}>{d.emoji}</span> {d.date} – {d.city}
                </h4>
                {d.comments && (
                  <div style={{
                    background: "#f8fafc", padding: "18px 22px", borderRadius: 14,
                    borderLeft: `5px solid ${getDayColor(d.city, d.label)}`, marginBottom: 22,
                  }}>
                    <p style={{
                      margin: 0, fontSize: 16, lineHeight: 1.6, color: "#374151",
                      fontStyle: "italic", whiteSpace: "pre-wrap",
                    }}>
                      "{d.comments}"
                    </p>
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  {d.activities.map((act, actIdx) => (
                    <div key={actIdx} style={{ pageBreakInside: "avoid" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                        <span style={{ fontSize: 24 }}>{act.icon}</span>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 17, color: "#111827" }}>{act.title}</div>
                          {act.time && <div style={{ fontSize: 14, color: "#94a3b8", fontWeight: 700 }}>{act.time}</div>}
                        </div>
                      </div>
                      {act.photo && (
                        <img
                          src={act.photo}
                          alt={act.title}
                          style={{
                            width: "100%", maxHeight: 350, objectFit: "cover",
                            borderRadius: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.08)", marginTop: 10,
                          }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div style={{
              marginTop: 32, textAlign: "center", padding: 24,
              background: "linear-gradient(135deg, #ecfdf5, #f0fdf4)", borderRadius: 18,
              border: "2px solid #bbf7d0", pageBreakInside: "avoid",
            }}>
              <h3 style={{ margin: 0, color: "#059669", fontSize: 24, fontWeight: 900 }}>
                💰 Presupuesto total: {total.toFixed(0)}€
              </h3>
            </div>
          </div>
        )}
      </div>

      {/* ═══ MODAL: EDITAR / AÑADIR ═══ */}
      {editModal && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
            zIndex: 100, display: "flex", alignItems: "flex-end",
            backdropFilter: "blur(4px)", animation: "fadeIn 0.25s ease",
          }}
          onClick={() => setEditModal(null)}
        >
          <div
            style={{
              background: "white", borderRadius: "24px 24px 0 0",
              padding: "26px 22px", width: "100%", maxWidth: 560,
              margin: "0 auto", maxHeight: "90vh", overflowY: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
              <h3 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>
                {editModal.ai === -1 ? "➕ Nueva actividad" : "✏️ Editar actividad"}
              </h3>
              <Btn onClick={() => setEditModal(null)} variant="ghost" style={{ padding: "8px 14px" }}>✕</Btn>
            </div>

            {/* Icono selector */}
            <div style={{ marginBottom: 18 }}>
              <button
                onClick={() => setIconPicker(!iconPicker)}
                style={{
                  fontSize: 34, background: "#f8fafc", border: "2px solid #e5e7eb",
                  borderRadius: 14, padding: "10px 20px", cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                {form.icon || "🎯"}
              </button>
              {iconPicker && (
                <div style={{
                  display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12,
                  background: "#f8fafc", borderRadius: 14, padding: 14,
                  maxHeight: 180, overflowY: "auto",
                }}>
                  {ICONS.map((ic) => (
                    <button
                      key={ic}
                      onClick={() => { setForm((f) => ({ ...f, icon: ic })); setIconPicker(false); }}
                      style={{
                        background: form.icon === ic ? "#4f46e5" : "white",
                        border: "none", borderRadius: 8, padding: "6px",
                        cursor: "pointer", fontSize: 24, transition: "all 0.15s",
                      }}
                    >
                      {ic}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
              <FormField label="Título *">
                <input value={form.title || ""} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} style={inp} />
              </FormField>
              <FormField label="Hora">
                <input value={form.time || ""} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} style={inp} placeholder="10:00, Mañana..." />
              </FormField>
            </div>

            <FormField label="Descripción">
              <textarea value={form.desc || ""} onChange={(e) => setForm((f) => ({ ...f, desc: e.target.value }))} style={{ ...inp, minHeight: 90, resize: "vertical" }} />
            </FormField>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <FormField label="Presupuesto (€)">
                <input type="number" value={form.budget || ""} onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))} style={inp} />
              </FormField>
              <FormField label="Categoría">
                <select value={form.category || "activity"} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} style={{ ...inp, background: "white" }}>
                  {Object.entries(CATEGORIES).map(([k, v]) => (
                    <option key={k} value={k}>{v.icon} {v.label}</option>
                  ))}
                </select>
              </FormField>
            </div>

            <FormField label="Dirección (se abrirá en Maps)">
              <input value={form.address || ""} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} style={inp} placeholder="Dirección o nombre del lugar" />
            </FormField>

            <Btn onClick={saveAct} style={{ width: "100%", background: "#4f46e5", marginTop: 4 }}>
              💾 Guardar
            </Btn>
          </div>
        </div>
      )}

      {/* ═══ MODAL: CONFIRMAR BORRADO ═══ */}
      {delConfirm && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
            zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center",
            padding: 20, backdropFilter: "blur(4px)", animation: "fadeIn 0.25s ease",
          }}
          onClick={() => setDelConfirm(null)}
        >
          <div
            style={{
              background: "white", borderRadius: 22, padding: "26px",
              maxWidth: 340, width: "100%", textAlign: "center",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 40, marginBottom: 12 }}>🗑️</div>
            <h3 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 900 }}>¿Eliminar actividad?</h3>
            <p style={{ color: "#94a3b8", fontSize: 14, margin: "0 0 22px" }}>Esta acción no se puede deshacer.</p>
            <div style={{ display: "flex", gap: 10 }}>
              <Btn onClick={() => setDelConfirm(null)} variant="ghost" style={{ flex: 1 }}>Cancelar</Btn>
              <Btn onClick={() => delAct(delConfirm.di, delConfirm.ai)} variant="danger" style={{ flex: 1 }}>Eliminar</Btn>
            </div>
          </div>
        </div>
      )}

      {/* ═══ ESTILOS GLOBALES ═══ */}
      <style>{`
        * { box-sizing: border-box; }
        
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        
        /* Scrollbar personalizado */
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        
        /* Hover en botones */
        button:hover:not(:disabled) { filter: brightness(0.95); }
        button:active:not(:disabled) { transform: scale(0.98); }
        
        /* Focus en inputs */
        input:focus, textarea:focus, select:focus {
          border-color: #4f46e5 !important;
          box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
        }
        
        /* Print styles */
        @media print {
          body { background: white !important; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .hide-on-print, .app-header-nav, .day-selector-nav { display: none !important; }
          .print-only-header { display: block !important; }
          .show-on-export { display: block !important; color: #64748b; font-size: 14px; font-weight: 700; margin-top: 6px; }
          @page { margin: 1.5cm; }
        }
        
        /* Responsive */
        @media (max-width: 400px) {
          h1 { font-size: 20px !important; }
          h2 { font-size: 20px !important; }
        }
      `}</style>
    </div>
  );
}
