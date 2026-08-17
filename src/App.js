import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, doc, onSnapshot, setDoc } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import jsPDF from "jspdf";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "@fontsource/plus-jakarta-sans/800.css";

// ───────────────────────────────────────────────────────────────────────────
// Firebase (mismo proyecto que el resto de apps del usuario; se usa un
// documento propio para no mezclar datos)
// ───────────────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyDfjxzkymYvxK6Dtuu_OTAHB3Cj3Z8iRlk",
  authDomain: "viaje-usa-54b2f.firebaseapp.com",
  projectId: "viaje-usa-54b2f",
  storageBucket: "viaje-usa-54b2f.firebasestorage.app",
  messagingSenderId: "461014107533",
  appId: "1:461014107533:web:71a90887305c64d425e9c4",
  measurementId: "G-DBRNDPWLPB",
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
getStorage(app);
const TRIP_DOC = doc(db, "caminos", "sanabres_ourense_santiago_2026");
const LS_KEY = "camino_sanabres_2026_v2";

// Colores usados directamente en el mapa Leaflet (no puede leer variables CSS)
const MAP_COLORS = { primary: "#178A55", secondary: "#2F86D6", warm: "#E2622E" };

// ───────────────────────────────────────────────────────────────────────────
// Utilidades
// ───────────────────────────────────────────────────────────────────────────
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function bearing(lat1, lon1, lat2, lon2) {
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function formatDist(m) {
  if (m == null || isNaN(m)) return "—";
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`;
}

const COMPASS_DIRS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];
function compassLabel(deg) {
  return COMPASS_DIRS[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
}

function trackLengthFrom(points, idx) {
  let d = 0;
  for (let i = idx; i < points.length - 1; i++) {
    d += haversine(points[i].lat, points[i].lon, points[i + 1].lat, points[i + 1].lon);
  }
  return d;
}

function nearestPointIndex(points, lat, lon) {
  let best = 0;
  let bestD = Infinity;
  points.forEach((p, i) => {
    const d = haversine(lat, lon, p.lat, p.lon);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return { idx: best, dist: bestD };
}

function resizeImageFile(file, maxDim = 1100, quality = 0.62) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height >= width && height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function parseGPX(text) {
  try {
    const xml = new DOMParser().parseFromString(text, "text/xml");
    let nodes = Array.from(xml.getElementsByTagName("trkpt"));
    if (!nodes.length) nodes = Array.from(xml.getElementsByTagName("rtept"));
    return nodes
      .map((p) => ({
        lat: parseFloat(p.getAttribute("lat")),
        lon: parseFloat(p.getAttribute("lon")),
      }))
      .filter((p) => !isNaN(p.lat) && !isNaN(p.lon));
  } catch {
    return [];
  }
}

function normalizeTxt(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function mapsUrl(query) {
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(query);
}

const MESES = { enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5, julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11 };
function parseStageDate(str) {
  const m = (str || "").match(/(\d{1,2})\s+([a-zA-Zñáéíóú]+)\s+(\d{4})/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = MESES[normalizeTxt(m[2])];
  const year = parseInt(m[3], 10);
  if (month == null) return null;
  return new Date(year, month, day);
}

// ───────────────────────────────────────────────────────────────────────────
// Persistencia local (localStorage) + copia de seguridad exportable
// ───────────────────────────────────────────────────────────────────────────
const DEFAULT_CHECKLIST_LABELS = [
  "Botas de trekking ya rodadas (¡nunca estrenar en el Camino!)",
  "Calcetines técnicos (varios pares)",
  "Mochila 30–40L con cubremochilas",
  "Saco de sábanas / forro para albergues",
  "Chubasquero o poncho de lluvia",
  "Protector solar y gorra",
  "Bastones de trekking",
  "Botiquín: tiritas, Compeed para ampollas, ibuprofeno",
  "Credencial del peregrino",
  "Powerbank y cargador",
  "Documentación, tarjeta y seguro de viaje",
  "Botella de agua (mín. 1,5 L)",
];
function defaultChecklist() {
  return DEFAULT_CHECKLIST_LABELS.map((label, i) => ({ id: "d" + i, label, done: false, custom: false }));
}

function defaultData() {
  return { diary: {}, gpx: {}, walk: {}, completed: {}, checklist: defaultChecklist(), stamps: {}, emergency: {} };
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaultData();
    const parsed = JSON.parse(raw);
    return { ...defaultData(), ...parsed, checklist: parsed.checklist?.length ? parsed.checklist : defaultChecklist() };
  } catch {
    return defaultData();
  }
}
function saveLocal(data) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("No se pudo guardar en localStorage (quizá lleno):", e);
  }
}

function exportBackupFile({ diary, gpx, walk, completed, checklist, stamps, emergency }) {
  const payload = {
    version: 2,
    app: "camino-sanabres-2026",
    exportedAt: new Date().toISOString(),
    diary, gpx, walk, completed, checklist, stamps, emergency,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "camino-sanabres-copia.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function parseBackupFile(file) {
  let text;
  try {
    text = await file.text();
  } catch {
    throw new Error("No se ha podido leer el archivo.");
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Este archivo no parece una copia válida de la app (no es un JSON legible).");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Este archivo no parece una copia válida de la app.");
  }
  return data;
}

// ───────────────────────────────────────────────────────────────────────────
// Datos del Camino Sanabrés — Ourense → Santiago de Compostela
// 5 etapas (18–22 de agosto de 2026), ~108,5 km en total.
// Coordenadas de pueblos: aproximadas (centro del núcleo urbano), suficientes
// para el mapa general. Para navegación fiable metro a metro, sube el GPX
// real de cada etapa (botón "Subir track GPX" dentro del mapa).
// ───────────────────────────────────────────────────────────────────────────
const STAGES = [
  {
    id: 1,
    date: "Martes 18 agosto 2026",
    from: "Ourense",
    to: "San Cristovo de Cea",
    km: 21.2,
    difficulty: "Alta (3/5) — subida constante",
    desnivel: "Sube de ~115 m (Ourense) a ~525 m (Cea): +611 m / −231 m aprox.",
    description:
      "Primera etapa y una de las más exigentes de todo el Sanabrés: sale de Ourense por la Ponte Vella cruzando el Miño y empieza a ganar altura casi sin descanso, dejando el valle para subir a la Dorsal Galega. Hay dos variantes que confluyen en Casas Novas, antes de Cea: por Tamallancos (oficial, menos asfalto, pasa por Soutelo, Cudeiro, Bouzas, Sobreira, Faramontaos) o por Canedo (1,1 km más corta, sale por el Puente Romano). Cea es el núcleo grande de la etapa: todos los servicios, y sobre todo su famoso Pan de Cea con IGP (Indicación Geográfica Protegida), horneado en hornos de leña desde el siglo XIII — imprescindible comprarlo para el camino.",
    variants: [
      { name: "Variante por Tamallancos (oficial)", note: "Más pista y camino real empedrado, menos asfalto que por Canedo." },
      { name: "Variante por Canedo", note: "1,1 km más corta, sale por el Puente Romano, algo más de asfalto." },
    ],
    tips: [
      "Sal antes de las 8:00 — es la subida más dura de todo el Camino y en agosto aprieta el calor.",
      "Compra Pan de Cea al llegar: se conserva bien y es un básico para el resto de etapas.",
      "Lleva agua de sobra, hay pocas fuentes en la subida inicial desde Ourense.",
    ],
    waypoints: [
      { name: "Ourense (Ponte Vella)", lat: 42.3358, lon: -7.8639, type: "start" },
      { name: "Tamallancos", lat: 42.374, lon: -7.946, type: "town" },
      { name: "Faramontaos", lat: 42.407, lon: -8.021, type: "town" },
      { name: "San Cristovo de Cea", lat: 42.43, lon: -8.07, type: "end" },
    ],
    albergues: [
      { name: "Albergue de Peregrinos de Cea \"Casa das Netas\"", type: "Público (Xunta)", town: "San Cristovo de Cea", address: "Rúa Santo Cristo, 5 (a 60 m del Camino)", phone: "600 878 289", price: "8 €", reserva: "No admite reserva — 24 plazas, registro 13:00, cierre 22:00", link: "" },
      { name: "Alojamiento Pazos (casa rural)", type: "Privado", town: "A 2 km de San Cristovo de Cea", address: "", phone: "", price: "Precio especial peregrinos (no confirmado)", reserva: "Consultar disponibilidad", link: "https://www.escapadarural.com/casas-rurales/san-cristovo-de-cea" },
      { name: "Casa Cea Ourense", type: "Privado (hotel/hostal)", town: "San Cristovo de Cea", address: "", phone: "", price: "45–82 € aprox. (rango orientativo, no confirmado)", reserva: "Consultar", link: "" },
    ],
    restaurants: [
      { name: "Forno do Carlos", town: "Faramontaos, 9 (Cea)", note: "Pan de Cea IGP, horno de leña tradicional, varias generaciones. Abierto 9:00–21:00 todos los días", phone: "988 282 279" },
      { name: "Forno da Rosa", town: "San Cristovo de Cea", note: "Pan de Cea 100% IGP, elaboración artesanal certificada", phone: "" },
    ],
  },
  {
    id: 2,
    date: "Miércoles 19 agosto 2026",
    from: "San Cristovo de Cea",
    to: "Castro Dozón",
    km: 14.5,
    difficulty: "Media",
    desnivel: "Etapa corta con altibajos constantes; sube hacia el Alto de Santo Domingo (~700 m)",
    description:
      "La etapa más corta del Camino y una de las más bonitas del Sanabrés: mayoritariamente bosque y monte, pistas y sendas, con muy poco asfalto. Dos variantes que confluyen en Castro Dozón: la oficial/corta por Piñor-Cotelas (~14,5 km), o la más larga por el Monasterio de Santa María de Oseira (+4,3 km, ~19 km total) — uno de los cistercienses más bellos de Galicia, con posibilidad de dormir en su propio albergue si se hace tarde. Castro Dozón (O Castro) es la capital del municipio de Dozón.",
    variants: [
      { name: "Oficial por Piñor (Cotelas)", note: "~14,5 km, más directa. Bar-tienda O Refugio en Cotelas (km ~5)." },
      { name: "Por Monasterio de Oseira", note: "~19 km. Pasa por Silvaboa y Pieles (subida dura, 1,3 km al 6%) hasta el monasterio; posibilidad de alojarse allí." },
    ],
    tips: [
      "Etapa corta: aprovecha para descansar piernas antes de la etapa larga de mañana.",
      "Confirma por teléfono el alojamiento de esta noche — el albergue municipal está cerrado (ver aviso abajo).",
    ],
    waypoints: [
      { name: "San Cristovo de Cea", lat: 42.43, lon: -8.07, type: "start" },
      { name: "Cotelas", lat: 42.463, lon: -8.075, type: "town" },
      { name: "Castro Dozón (O Castro)", lat: 42.5835, lon: -8.0464, type: "end" },
    ],
    albergues: [
      {
        name: "Albergue Municipal de Castro Dozón",
        type: "Público (Concello de Dozón)",
        town: "O Castro, Dozón",
        address: "Ctra. N-525, s/n (junto a las piscinas municipales)",
        phone: "986 780 471",
        price: "—",
        closed: true,
        reserva: "Cerrado desde 2023/2024. La Xunta confirmó su reconstrucción en la antigua casa rectoral, con apertura prevista para el Xacobeo 2027 — NO disponible en agosto 2026.",
        link: "",
        note: "IMPORTANTE: confirma alojamiento alternativo antes de salir (ver opciones abajo) — llama con antelación.",
      },
      { name: "Albergue de Peregrinos del Monasterio de Oseira", type: "Parroquial / monástico", town: "Oseira (si haces la variante larga)", address: "Monasterio de Sta. María de Oseira", phone: "", price: "Donativo / ~5 € según fuente", reserva: "Recepción 10:00–13:00 y 15:30–19:30; reservas solo para grupos", link: "" },
      { name: "O Refugio (bar-tienda-alojamiento)", type: "Privado", town: "Cotelas (km ~5 desde Cea)", address: "Lugar Cotelas, 14", phone: "988 282 593", price: "Consultar", reserva: "Llamar con antelación", link: "" },
      { name: "\"La Casa en Dozón\" (turismo rural)", type: "Privado", town: "Dozón", address: "No confirmada", phone: "", price: "No confirmado", reserva: "Buscar en Ruralgia y confirmar por teléfono", link: "https://www.ruralgia.com/peregrinocastrodozon-otros" },
    ],
    restaurants: [
      { name: "O Refugio", town: "Cotelas (km ~5)", note: "Bar-restaurante-tienda, punto de referencia para peregrinos en esta variante", phone: "988 282 593" },
      { name: "Café Fraga", town: "Dozón, O Castro (Rúa Doutor Martínez Iglesia, 2)", note: "Café-bar con horario amplio", phone: "986 780 061" },
    ],
  },
  {
    id: 3,
    date: "Jueves 20 agosto 2026",
    from: "Castro Dozón",
    to: "Silleda",
    km: 32.7,
    difficulty: "Muy alta — la etapa más larga (32,7 km)",
    desnivel: "Perfil exigente: sube fuerte al Alto de Santo Domingo y Puxallos (~658 m) nada más salir, y vuelve a tener altibajos en el tramo final hacia Silleda — la de más desnivel acumulado del Camino",
    description:
      "La etapa más larga y dura de las cinco: sale de Castro Dozón junto a la N-525, sube al Alto de Santo Domingo (cruceiro y ermita) y sigue hasta Puxallos, el punto más alto de la etapa. Baja por Pontenoufe (río Asneiro) hasta Botos, la 'Estación de Lalín', donde hay un bar-hostal muy usado por peregrinos, y llega a Lalín, capital de la comarca del Deza y célebre por su cocido gallego — buen sitio para una parada larga de comida. Después continúa bajando por el paseo fluvial del río Pontiñas hasta O Espiño, cruza zona industrial por A Ponte Taboada y Prado, y sube por última vez hacia Silleda, capital de la comarca de Trasdeza y con todos los servicios.",
    variants: [
      { name: "Partir la etapa en Lalín (recomendado si te cansas)", note: "Lalín está aprox. a mitad de camino y tiene todos los servicios y alojamiento — puedes dormir ahí y retomar hasta Silleda al día siguiente si 32,7 km de un tirón es demasiado." },
      { name: "Final oficial del Sanabrés en A Laxe", note: "El trazado oficial pasa por A Laxe (Bendoiro) antes de Lalín, con el único albergue público de este primer tramo." },
    ],
    tips: [
      "Es la etapa más larga y dura de las cinco (32,7 km) — sal antes de las 7:00 si puedes.",
      "Si te cansas, puedes quedarte a dormir en Lalín o A Laxe y retomar al día siguiente en vez de forzar hasta Silleda.",
      "Lleva comida y agua extra: hay tramos largos sin bares entre Puxallos y Botos.",
      "Aprovecha Lalín para un cocido gallego contundente — te dará energía para la segunda mitad del día.",
    ],
    waypoints: [
      { name: "Castro Dozón", lat: 42.5735, lon: -8.158, type: "start" },
      { name: "Alto de Santo Domingo", lat: 42.6, lon: -8.08, type: "town" },
      { name: "Puxallos", lat: 42.615, lon: -8.09, type: "town" },
      { name: "Botos (Estación de Lalín)", lat: 42.64, lon: -8.11, type: "town" },
      { name: "A Laxe (Bendoiro)", lat: 42.635, lon: -8.13, type: "town" },
      { name: "Lalín", lat: 42.6603, lon: -8.1131, type: "town" },
      { name: "O Espiño", lat: 42.665, lon: -8.145, type: "town" },
      { name: "A Ponte Taboada", lat: 42.672, lon: -8.175, type: "town" },
      { name: "Prado", lat: 42.685, lon: -8.21, type: "town" },
      { name: "Silleda", lat: 42.7015, lon: -8.2481, type: "end" },
    ],
    albergues: [
      { name: "El Gran Albergue Silleda", type: "Privado", town: "Silleda", address: "Rúa Antón Alonso Ríos, 18", phone: "611 286 757", price: "Desde 10 €", reserva: "Admite reserva", link: "" },
      { name: "Albergue Santa Olaia", type: "Privado", town: "Silleda", address: "Avenida do Parque, 17", phone: "626 405 652", price: "10 € (ropa de cama desechable incl.)", reserva: "Admite reserva — check-in 12:00, cierre 22:00, 60 plazas", link: "https://www.booking.com/hotel/es/albergue-santa-olaia-silleda.html" },
      { name: "Albergue Turístico Silleda", type: "Privado", town: "Silleda", address: "Rúa Venezuela, 38, 3º-4º izq.", phone: "643 898 693", price: "Consultar", reserva: "Admite reserva — check-in 12:00, cierre 22:00", link: "" },
      { name: "Hotel Ramos", type: "Privado (hotel)", town: "Silleda, céntrico", address: "Rúa Antón Alonso Ríos, 24", phone: "986 581 212", price: "Individual desde 34 € / Doble desde 55 €", reserva: "Consultar disponibilidad", link: "" },
      { name: "Hostal Toxa", type: "Privado (hostal)", town: "Silleda, céntrico", address: "Rúa Trasdeza, 88", phone: "986 580 111", price: "Consultar", reserva: "Consultar", link: "" },
      { name: "Albergue de peregrinos de A Laxe", type: "Público (Xunta)", town: "A Laxe, Bendoiro", address: "C/ A Laxe, 21", phone: "658 038 042", price: "10 € (sábanas y manta desechables incl.)", reserva: "No admite reserva — orden de llegada", link: "", note: "Para acortar esta larga etapa: aquí termina el trazado oficial, unos 18 km desde Castro Dozón." },
      { name: "A Taberna do Vento (bar + hostal)", type: "Privado", town: "Botos, Estación de Lalín", address: "Estación de Botos, 38", phone: "629 306 679", price: "Consultar", reserva: "Reserva por teléfono/WhatsApp", link: "https://www.booking.com/hotel/es/a-taberna-de-vento.html", note: "Para acortar la etapa, parando en Botos." },
      { name: "Albergue-Pensión Lalín Centro", type: "Privado", town: "Lalín centro", address: "Rúa Observatorio, 8 - 2º", phone: "610 207 992", price: "Consultar", reserva: "Admite reserva (temporada Semana Santa–2 octubre)", link: "https://www.facebook.com/alberguelalincentro/", note: "Para partir la etapa en dos, durmiendo en Lalín (aprox. mitad de camino)." },
      { name: "Hostal Caracas", type: "Privado", town: "Lalín, salida hacia el camino", address: "Rúa da Corredoira, 32", phone: "680 176 205", price: "Individual desde 30 € / Doble desde 50 €", reserva: "Reserva vía Booking", link: "https://www.booking.com/hotel/es/hostal-caracas.html", note: "Para partir la etapa en dos, durmiendo en Lalín." },
    ],
    restaurants: [
      { name: "A Taberna do Vento", town: "Botos", note: "Cocido, raciones, tostas, desayunos; cerrado domingos; guarda bicis", phone: "629 306 679" },
      { name: "Pazo de Bendoiro (Mesón)", town: "Bendoiro, km 297 N-525", note: "Pazo del s. XIX, cocina gallega tradicional", phone: "986 794 289" },
      { name: "Cabanas", town: "Lalín (Rúa Pintor Laxeiro, 3)", note: "El clásico para probar el auténtico cocido de Lalín", phone: "986 782 317" },
      { name: "Casa Currás", town: "Lalín (Plaza de la Iglesia)", note: "+80 años de tradición, cocido gallego", phone: "" },
      { name: "Casa Pablo", town: "Lalín", note: "Parrillada y menú del día, cocido casero", phone: "" },
      { name: "O Camiño", town: "Silleda", note: "Menú del día, churrasco a la brasa viernes noche y sábados", phone: "689 180 928" },
      { name: "Camiño De Ferro", town: "Silleda", note: "En la antigua estación de tren; raciones y churrasco, buena relación calidad-precio", phone: "" },
      { name: "Panadería Luis Mella", town: "Silleda", note: "Empanadas muy recomendadas por peregrinos", phone: "" },
    ],
  },
  {
    id: 4,
    date: "Viernes 21 agosto 2026",
    from: "Silleda",
    to: "Outeiro",
    km: 23.1,
    difficulty: "Media-Alta",
    desnivel: "Perfil ondulado, con un tramo final pronunciado (~10%, 2,5 km en zigzag) bajando hacia Ponte Ulla",
    description:
      "Tras salir de Silleda en paralelo a la N-640, el camino cruza O Foxo y San Fiz hasta A Bandeira (todos los servicios). Después continúa entre campos y bosques por Piñeiro, Vilariño, Besteiro y San Martiño de Dornelas — merece la pena parar en su iglesia románica del s. XII, ligada a la donación de la reina Urraca a la Catedral de Santiago en 1115. Tras O Seixo baja con fuerte pendiente hasta Ponte Ulla, en el límite entre Pontevedra y A Coruña, cruzando el río Ulla por el puente histórico junto al mirador de Gundián. La etapa continúa un poco más allá, ya subiendo, hasta Outeiro (Vedra), donde está el único albergue de esta última parte del día.",
    variants: [
      { name: "Fin de etapa alternativo en Ponte Ulla", note: "Si prefieres no llegar hasta Outeiro, Ponte Ulla tiene más oferta de alojamiento y restauración — la etapa siguiente se alarga unos km." },
    ],
    tips: [
      "Outeiro apenas tiene servicios: compra cena y desayuno en Ponte Ulla o Bandeira antes de llegar.",
      "El tramo final desde San Miguel de Castro baja con fuerte pendiente — cuidado con las rodillas, usa los bastones.",
      "Solo hay un albergue en Outeiro y sin reserva — si va muy lleno, ten Ponte Ulla como alternativa cercana.",
    ],
    waypoints: [
      { name: "Silleda", lat: 42.7015, lon: -8.2481, type: "start" },
      { name: "A Bandeira", lat: 42.726, lon: -8.289, type: "town" },
      { name: "San Martiño de Dornelas", lat: 42.754, lon: -8.337, type: "town" },
      { name: "Ponte Ulla", lat: 42.7825, lon: -8.385, type: "town" },
      { name: "Outeiro (Vedra)", lat: 42.8, lon: -8.4165, type: "end" },
    ],
    albergues: [
      { name: "Albergue de peregrinos de Outeiro", type: "Público (Xunta)", town: "Outeiro, Vedra", address: "O Outeiro, s/n", phone: "630 941 288", price: "8–10 € (sábanas/mantas desechables incl. según fuente)", reserva: "Normalmente sin reserva — fuentes contradictorias, llamar para confirmar", link: "" },
      { name: "Albergue-Pensión O Cruceiro da Ulla", type: "Privado (albergue + pensión)", town: "Ponte Ulla", address: "Vista Alegre, s/n", phone: "981 512 099", price: "16 €/persona (albergue); menú 14 €; desayuno 4,50 €", reserva: "Admite reserva", link: "https://www.ocruceiro.es/", note: "En Ponte Ulla, unos 3-4 km antes de Outeiro — alternativa si prefieres más servicios." },
      { name: "Hostal Ríos", type: "Privado (hostal)", town: "Ponte Ulla, cruzando el puente", address: "A pie de camino", phone: "981 512 305", price: "Desde 12 €/persona", reserva: "Consultar", link: "", note: "En Ponte Ulla, alternativa a Outeiro." },
      { name: "Pensión A Taberna de Gundián", type: "Privado", town: "Ponte Ulla", address: "", phone: "", price: "Consultar", reserva: "Consultar", link: "" },
      { name: "Pensión Juanito", type: "Privado", town: "Ponte Ulla", address: "", phone: "", price: "Consultar", reserva: "Consultar", link: "" },
      { name: "Albergue de peregrinos de Bandeira", type: "Público (Xunta)", town: "A Bandeira", address: "Rúa Lourás, s/n", phone: "670 502 356", price: "10 € (sábanas/mantas desechables incl.)", reserva: "No admite reserva", link: "", note: "Opción intermedia si prefieres acortar esta etapa y alargar la anterior o la siguiente." },
    ],
    restaurants: [
      { name: "Trécola Bar", town: "A Bandeira", note: "Bar de peregrinos en pleno camino: pizzas, hamburguesas, tortilla, tapas; pulpo los días 14 y 29 (mercado)", phone: "986 181 634" },
      { name: "O Cruceiro da Ulla (bar-restaurante)", town: "Ponte Ulla", note: "Menú del día 14 €, desayuno 4,50 € — última opción de comer antes de Outeiro", phone: "981 512 099" },
    ],
  },
  {
    id: 5,
    date: "Sábado 22 agosto 2026",
    from: "Outeiro",
    to: "Santiago de Compostela",
    km: 17.0,
    difficulty: "Media — última etapa, con fuerzas de sobra por la emoción de llegar",
    desnivel: "Alterna subidas y bajadas suaves por monte gallego hasta la entrada en Santiago",
    description:
      "¡Última etapa! Sale de Outeiro atravesando bosques hasta Lestedo, en Boqueixón — desde aquí hay un desvío opcional al Pico Sacro. Sigue por Susana, ya en el municipio de Santiago, con pocos servicios en este tramo (lleva agua y algo de comida). La entrada a la ciudad es por el barrio de Sar, junto a la Colegiata románica de Santa María a Real do Sar, cruzando el puente románico y subiendo por Castrón Douro hasta el casco histórico por la Porta de Mazarelos. De ahí a la Praza da Quintana, Praza das Praterías y, por fin, la Praza do Obradoiro frente a la Catedral. Guarda fuerzas (y algo de emoción) para el abrazo al Apóstol.",
    variants: [],
    tips: [
      "¡Llegada! Guarda algo de comida para el tramo Susana-Sar, tiene pocos servicios.",
      "Sella la credencial en cuanto puedas al llegar y pasa por la Oficina del Peregrino para tu Compostela.",
      "Reserva la tarde para celebrarlo: la Praza do Obradoiro y el casco histórico merecen tiempo con calma.",
    ],
    waypoints: [
      { name: "Outeiro (Vedra)", lat: 42.8, lon: -8.4165, type: "start" },
      { name: "Lestedo (Boqueixón)", lat: 42.822, lon: -8.4558, type: "town" },
      { name: "Susana", lat: 42.849, lon: -8.503, type: "town" },
      { name: "Sar (Colegiata)", lat: 42.8708, lon: -8.5423, type: "town" },
      { name: "Santiago de Compostela (Catedral)", lat: 42.8805, lon: -8.5456, type: "end" },
    ],
    albergues: [
      { name: "Albergue de peregrinos San Lázaro", type: "Público (Xunta)", town: "Santiago de Compostela", address: "Rúa de San Lázaro, s/n", phone: "981 571 488", price: "10 € (ropa de cama desechable incl.)", reserva: "Admite reserva previa (excepcional para un albergue público)", link: "" },
      { name: "Albergue Seminario Menor", type: "Privado", town: "Santiago (Belvís, ~15 min a pie de la Catedral)", address: "Avenida Quiroga Palacios, 2", phone: "881 031 768", price: "22–24 € litera; desayuno 5 €", reserva: "Admite reserva", link: "" },
      { name: "Albergue Roots & Boots", type: "Privado", town: "Santiago (junto a la Alameda, vistas a la Catedral)", address: "Campo Cruceiro do Gaio, 7", phone: "881 259 092", price: "12–18 € según temporada", reserva: "Consultar", link: "" },
      { name: "Albergue The Last Stamp", type: "Privado", town: "Santiago (~200 m de la Catedral)", address: "Rúa do Preguntoiro, 10", phone: "981 563 525", price: "20–26 € según temporada", reserva: "Admite reserva", link: "" },
    ],
    restaurants: [
      { name: "Casa Camilo", town: "Santiago (Calle da Raíña, 24)", note: "Restaurante histórico de +80 años a metros de la Catedral, tradición entre peregrinos para celebrar la llegada", phone: "981 584 593" },
      { name: "Casa Manolo", town: "Santiago (Praza de Cervantes)", note: "Menú del día abundante y económico, muy popular entre peregrinos y estudiantes", phone: "981 582 950" },
      { name: "Casa Marcelo", town: "Santiago (junto a la Catedral)", note: "Cocina de autor/fusión, para darse un capricho gastronómico tras el Camino", phone: "" },
      { name: "Benboa", town: "Santiago (Rúa do Preguntoiro)", note: "Antigua farmacia reconvertida en restaurante de cocina atlántica", phone: "" },
    ],
  },
];

const OFICINA_PEREGRINO = {
  address: "Rúa das Carretas, 33, Santiago de Compostela (a pocos metros de la Praza do Obradoiro)",
  phone: "981 568 846",
  horario: "09:00–19:00 (ampliado hasta las 21:00 en temporada alta). Cerrado 25 dic y 1 ene.",
  email: "oficinadelperegrino@catedraldesantiago.es",
};

const OURENSE_ALBERGUE_SALIDA = {
  name: "Albergue de Peregrinos de Ourense (Eligio Rivas Quintas)",
  type: "Público (Xunta de Galicia)",
  town: "Ourense",
  address: "Rúa da Barreira, 12 — Ourense",
  phone: "988 238 948",
  price: "€ (tarifa pública Xunta)",
  reserva: "No admite reserva — orden de llegada",
  link: "",
  note: "Útil para la noche del lunes 17, antes de arrancar el martes.",
};

function getTodayStageId() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const s of STAGES) {
    const d = parseStageDate(s.date);
    if (d && d.getTime() === today.getTime()) return s.id;
  }
  const first = parseStageDate(STAGES[0].date);
  const last = parseStageDate(STAGES[STAGES.length - 1].date);
  if (last && today > last) return STAGES[STAGES.length - 1].id;
  if (first && today < first) return STAGES[0].id;
  return STAGES[0].id;
}

// ───────────────────────────────────────────────────────────────────────────
// Ayuda IA — asistente conversacional con geolocalización
// El peregrino escribe "me he perdido", "busco un bar cerca", "me duele el
// pie"... y recibe una respuesta apoyada en su posición GPS real y en los
// puntos de interés (albergues, restaurantes, pueblos) ya verificados de la
// app — la IA no inventa nombres/teléfonos, solo los usa o dice que no sabe.
// ───────────────────────────────────────────────────────────────────────────
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const AI_KEY_LS = "camino_sanabres_2026_groq_key";

function loadAiKey() {
  try {
    return localStorage.getItem(AI_KEY_LS) || "";
  } catch {
    return "";
  }
}
function saveAiKey(k) {
  try {
    if (k) localStorage.setItem(AI_KEY_LS, k);
    else localStorage.removeItem(AI_KEY_LS);
  } catch {
    // localStorage no disponible: la key solo dura la sesión en memoria
  }
}

let _poiIndexCache = null;
function buildPOIIndex() {
  if (_poiIndexCache) return _poiIndexCache;
  const townCoords = {};
  STAGES.forEach((s) => s.waypoints.forEach((w) => { townCoords[normalizeTxt(w.name)] = { lat: w.lat, lon: w.lon }; }));
  townCoords[normalizeTxt("Ourense")] = { lat: 42.3358, lon: -7.8639 };
  townCoords[normalizeTxt("Santiago de Compostela")] = { lat: 42.8805, lon: -8.5456 };

  const keys = Object.keys(townCoords);
  function findCoords(town, fallback) {
    const n = normalizeTxt(town);
    const key = keys.find((k) => k.length > 2 && (n.includes(k) || k.includes(n)));
    return key ? townCoords[key] : fallback;
  }

  const pois = [];
  STAGES.forEach((stage) => {
    const fallback = stage.waypoints[stage.waypoints.length - 1];
    stage.waypoints.forEach((w) => pois.push({ name: w.name, type: "Punto del camino", lat: w.lat, lon: w.lon, stageId: stage.id }));
    stage.albergues.forEach((a) => {
      const c = findCoords(a.town, fallback);
      pois.push({ name: a.name, type: "Albergue (" + a.type + ")", lat: c.lat, lon: c.lon, phone: a.phone, address: a.address, price: a.price, stageId: stage.id });
    });
    stage.restaurants.forEach((r) => {
      const c = findCoords(r.town, fallback);
      pois.push({ name: r.name, type: "Restaurante/bar", lat: c.lat, lon: c.lon, phone: r.phone, note: r.note, stageId: stage.id });
    });
  });
  pois.push({ name: OURENSE_ALBERGUE_SALIDA.name, type: "Albergue", lat: 42.3358, lon: -7.8639, phone: OURENSE_ALBERGUE_SALIDA.phone, address: OURENSE_ALBERGUE_SALIDA.address });
  pois.push({ name: "Oficina del Peregrino (Compostela)", type: "Oficina", lat: 42.8805, lon: -8.5456, phone: OFICINA_PEREGRINO.phone, address: OFICINA_PEREGRINO.address });
  _poiIndexCache = pois;
  return pois;
}

function nearestPOIs(lat, lon, n = 6) {
  return buildPOIIndex()
    .map((p) => ({ ...p, dist: haversine(lat, lon, p.lat, p.lon), brg: bearing(lat, lon, p.lat, p.lon) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, n);
}

function buildAiSystemPrompt(currentStage, pos) {
  let loc = "No se ha podido obtener la ubicación GPS del peregrino — pide que la active o responde de forma más general.";
  let poiText = "";
  if (pos) {
    loc = `Ubicación GPS actual: lat ${pos.lat.toFixed(5)}, lon ${pos.lon.toFixed(5)} (precisión ±${Math.round(pos.accuracy || 0)} m).`;
    const near = nearestPOIs(pos.lat, pos.lon, 6);
    poiText =
      "Puntos de interés REALES más cercanos a su posición actual, ordenados por distancia (única fuente de verdad — usa estos nombres/teléfonos/direcciones tal cual, NO inventes otros lugares, teléfonos ni direcciones distintas de esta lista):\n" +
      near
        .map((p, i) => `${i + 1}. ${p.name} — ${p.type} — a ${formatDist(p.dist)} hacia ${compassLabel(p.brg)}${p.phone ? ` — tel: ${p.phone}` : ""}${p.address ? ` — ${p.address}` : ""}`)
        .join("\n");
  }
  const stageText = currentStage
    ? `Etapa seleccionada ahora mismo en la app: Etapa ${currentStage.id} (${currentStage.from} → ${currentStage.to}, ${currentStage.km} km, ${currentStage.date}).`
    : "El peregrino no tiene ninguna etapa concreta abierta ahora mismo.";

  return `Eres el asistente de una app para un peregrino que está caminando ahora mismo el Camino Sanabrés (Ourense → Santiago de Compostela), del 18 al 22 de agosto de 2026 (5 etapas).
${stageText}
${loc}
${poiText}

Instrucciones:
- Responde siempre en español, breve (máximo 4-5 frases salvo que de verdad haga falta más), cercano y práctico, como un compañero de camino con experiencia.
- Si el peregrino describe una urgencia médica seria, un accidente o un peligro real, dile PRIMERO que llame al 112 (emergencias en España) antes de nada más.
- Si pregunta dónde ir, qué hay cerca, o busca un albergue/bar/restaurante, usa exclusivamente los puntos de interés listados arriba (nombre, distancia, rumbo, teléfono). Si ninguno encaja con lo que pide, dilo con honestidad en vez de inventar un sitio.
- No tienes acceso a datos meteorológicos ni de tráfico en tiempo real: si preguntan por el tiempo actual, dilo claramente y sugiere consultar AEMET, o el botón "Ver tiempo" de la etapa.
- Para dolores o molestias (ampollas, rodillas, etc.) da consejos prácticos generales de peregrino, dejando claro que no sustituye a un profesional sanitario si el dolor es fuerte o no mejora.
- Si no tienes su ubicación GPS, pide que la active desde el botón "Actualizar mi ubicación" del panel, o responde de forma más general sin inventar distancias.`;
}

async function askAi(apiKey, systemPrompt, history, userMessage) {
  const messages = [
    { role: "system", content: systemPrompt },
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: userMessage },
  ];
  let res;
  try {
    res = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: GROQ_MODEL, messages, temperature: 0.4, max_tokens: 500 }),
    });
  } catch {
    throw new Error("No hay conexión a internet ahora mismo. Inténtalo cuando tengas cobertura o wifi.");
  }
  if (!res.ok) {
    if (res.status === 401) throw new Error("La clave de IA no es válida. Revísala en Ajustes.");
    if (res.status === 429) throw new Error("Se ha alcanzado el límite de peticiones gratuitas por ahora. Prueba en un minuto.");
    throw new Error("No se ha podido contactar con la IA (error " + res.status + ").");
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "No he sabido responder a eso.";
}

const AI_SUGGESTIONS = [
  "🆘 Me he perdido, ¿qué hago?",
  "🛏️ ¿Cuál es el albergue más cercano?",
  "🍽️ Busco un bar o restaurante cerca",
  "🩹 Me duele el pie, ¿algún consejo?",
  "📞 Dame el teléfono del sitio más cercano para llamar",
];

// ───────────────────────────────────────────────────────────────────────────
// Clima bajo demanda (Open-Meteo — gratis, sin clave)
// ───────────────────────────────────────────────────────────────────────────
function weatherEmoji(code) {
  if (code === 0) return "☀️";
  if ([1, 2, 3].includes(code)) return "⛅";
  if ([45, 48].includes(code)) return "🌫️";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 80, 81, 82].includes(code)) return "🌧️";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "❄️";
  if ([95, 96, 99].includes(code)) return "⛈️";
  return "🌡️";
}

function WeatherButton({ stage }) {
  const [state, setState] = useState("idle");
  const [data, setData] = useState(null);
  const wp = stage.waypoints[0];

  const fetchWeather = async () => {
    setState("loading");
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${wp.lat}&longitude=${wp.lon}&current=temperature_2m,precipitation,weather_code&timezone=auto`;
      const res = await fetch(url);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setData(json.current);
      setState("ok");
    } catch {
      setState("error");
    }
  };

  return (
    <div className="cs-weather">
      {state === "idle" && (
        <button className="cs-btn secondary" onClick={fetchWeather}>
          🌦️ Ver tiempo en {wp.name.split(" (")[0]}
        </button>
      )}
      {state === "loading" && <div className="cs-empty">Consultando el tiempo…</div>}
      {state === "error" && <div className="cs-empty">Sin datos de tiempo ahora mismo (¿sin conexión?). <button className="cs-link" onClick={fetchWeather}>Reintentar</button></div>}
      {state === "ok" && data && (
        <div className="cs-weather-result">
          {weatherEmoji(data.weather_code)} {Math.round(data.temperature_2m)}°C hoy en {wp.name.split(" (")[0]}
          {data.precipitation > 0 && <span> · 🌧️ {data.precipitation} mm</span>}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Compartir
// ───────────────────────────────────────────────────────────────────────────
function shareApp() {
  const text = "Estoy caminando el Camino Sanabrés (Ourense → Santiago) con esta app 🐚";
  const url = window.location.href;
  if (navigator.share) {
    navigator.share({ title: "Camino Sanabrés", text, url }).catch(() => {});
  } else {
    window.open(`https://wa.me/?text=${encodeURIComponent(text + " " + url)}`, "_blank", "noreferrer");
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Estilos globales (inyectados una vez) — tokens de diseño + tema claro/oscuro
// ───────────────────────────────────────────────────────────────────────────
const GLOBAL_CSS = `
  :root {
    --cs-bg: #FFFBF2;
    --cs-surface: #FFFFFF;
    --cs-text: #241C14;
    --cs-text-2: #6E6455;
    --cs-border: #EEE3CE;
    --cs-primary: #178A55;
    --cs-primary-soft: #E4F5EC;
    --cs-accent: #FFB800;
    --cs-accent-soft: #FFF3D6;
    --cs-secondary: #2F86D6;
    --cs-secondary-soft: #E7F1FC;
    --cs-warm: #E2622E;
    --cs-warm-soft: #FBE4D9;
    --cs-success: #2E9E5B;
    --cs-danger: #D6473A;
    --cs-danger-soft: #FBE4E2;
    --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px; --sp-5: 20px; --sp-6: 24px; --sp-7: 32px; --sp-8: 40px;
    --r-sm: 8px; --r-md: 12px; --r-lg: 16px; --r-xl: 24px; --r-pill: 999px;
    --sh-1: 0 1px 3px rgba(36,28,20,.07);
    --sh-2: 0 4px 14px rgba(36,28,20,.12);
    --sh-3: 0 8px 28px rgba(36,28,20,.18);
  }
  :root[data-theme="dark"] {
    --cs-bg: #14201A;
    --cs-surface: #1C2A22;
    --cs-text: #F3EFE3;
    --cs-text-2: #A9A08C;
    --cs-border: #2A3A31;
    --cs-primary: #4BC98D;
    --cs-primary-soft: #1E3A2C;
    --cs-accent: #FFD166;
    --cs-accent-soft: #3A2F14;
    --cs-secondary: #6FB6E8;
    --cs-secondary-soft: #1B2E3D;
    --cs-warm: #F0865B;
    --cs-warm-soft: #3A2318;
    --cs-success: #4BC98D;
    --cs-danger: #F3766A;
    --cs-danger-soft: #3A1F1C;
    --sh-1: 0 1px 3px rgba(0,0,0,.3);
    --sh-2: 0 4px 14px rgba(0,0,0,.4);
    --sh-3: 0 8px 28px rgba(0,0,0,.5);
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--cs-bg); color: var(--cs-text); }
  .cs-app { font-family: "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; max-width: 640px; margin: 0 auto; min-height: 100vh; background: var(--cs-bg); color: var(--cs-text); padding-bottom: calc(84px + env(safe-area-inset-bottom)); }
  .cs-header { background: linear-gradient(135deg,#178A55,#2F86D6); color: #fff; padding: 18px 16px 16px; position: sticky; top: 0; z-index: 20; box-shadow: var(--sh-2); }
  .cs-header h1 { margin: 0; font-size: 20px; font-weight: 800; display:flex; align-items:center; gap:8px; }
  .cs-header p { margin: 4px 0 0; font-size: 12.5px; opacity: .92; font-weight: 500; }
  .cs-offline-banner { background: var(--cs-warm-soft); color: var(--cs-warm); font-size: 12.5px; font-weight: 700; padding: 8px 16px; text-align: center; }
  .cs-content { padding: 16px; }
  .cs-card { background: var(--cs-surface); border-radius: var(--r-lg); padding: 16px; margin-bottom: 14px; box-shadow: var(--sh-1); border: 1px solid var(--cs-border); }
  .cs-badge { display: inline-block; padding: 4px 10px; border-radius: var(--r-pill); font-size: 11.5px; font-weight: 800; margin-right: 6px; margin-bottom: 6px; }
  .cs-badge.public { background: var(--cs-primary-soft); color: var(--cs-primary); }
  .cs-badge.private { background: var(--cs-secondary-soft); color: var(--cs-secondary); }
  .cs-badge.parish { background: var(--cs-warm-soft); color: var(--cs-warm); }
  .cs-badge.price { background: var(--cs-accent-soft); color: #8a6400; }
  :root[data-theme="dark"] .cs-badge.price { color: var(--cs-accent); }
  .cs-sections, .cs-stage-pills { display: flex; gap: 8px; overflow-x: auto; margin-bottom: 14px; scrollbar-width: none; padding-bottom: 2px; }
  .cs-sections::-webkit-scrollbar, .cs-stage-pills::-webkit-scrollbar { display: none; }
  .cs-sec-btn { flex: 0 0 auto; padding: 8px 14px; border-radius: var(--r-pill); border: 1.5px solid var(--cs-border); background: var(--cs-surface); color: var(--cs-text); font-size: 12.5px; font-weight: 700; cursor: pointer; font-family: inherit; transition: transform .1s; }
  .cs-sec-btn:active { transform: scale(.96); }
  .cs-sec-btn.active { background: var(--cs-primary); color: #fff; border-color: var(--cs-primary); }
  .cs-stage-pill { flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; gap: 1px; padding: 9px 16px; border-radius: var(--r-lg); border: 1.5px solid var(--cs-border); background: var(--cs-surface); color: var(--cs-text); cursor: pointer; font-family: inherit; transition: transform .1s; }
  .cs-stage-pill:active { transform: scale(.96); }
  .cs-stage-pill .num { font-weight: 800; font-size: 16px; }
  .cs-stage-pill .lbl { font-size: 10.5px; color: var(--cs-text-2); font-weight: 600; }
  .cs-stage-pill.active { background: var(--cs-primary); border-color: var(--cs-primary); }
  .cs-stage-pill.active .num, .cs-stage-pill.active .lbl { color: #fff; }
  .cs-stage-pill.done { border-color: var(--cs-success); }
  .cs-map { width: 100%; height: 320px; border-radius: var(--r-md); overflow: hidden; margin-bottom: 12px; z-index: 1; }
  .cs-btn { background: var(--cs-primary); color: #fff; border: none; padding: 11px 16px; border-radius: var(--r-md); font-size: 13.5px; font-weight: 700; cursor: pointer; font-family: inherit; transition: transform .1s; }
  .cs-btn:active { transform: scale(.97); }
  .cs-btn.secondary { background: var(--cs-surface); color: var(--cs-primary); border: 1.5px solid var(--cs-primary); }
  .cs-btn.warm { background: var(--cs-warm); }
  .cs-btn.done { background: var(--cs-success); }
  .cs-btn:disabled { opacity: .5; }
  .cs-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .cs-alb { border: 1px solid var(--cs-border); border-radius: var(--r-md); padding: 12px 14px; margin-bottom: 10px; }
  .cs-alb.closed { border-color: var(--cs-danger); background: var(--cs-danger-soft); }
  .cs-alb-warning-badge { display: inline-block; background: var(--cs-danger); color: #fff; font-size: 11px; font-weight: 800; padding: 3px 10px; border-radius: var(--r-pill); margin-bottom: 8px; }
  .cs-alb h4 { margin: 0 0 6px; font-size: 15px; font-weight: 800; }
  .cs-alb .meta { font-size: 12.5px; color: var(--cs-text-2); margin-bottom: 8px; line-height: 1.5; }
  .cs-alb .meta .note { font-style: italic; margin-top: 2px; }
  .cs-alb .actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .cs-link { display: inline-block; font-size: 12.5px; padding: 8px 12px; border-radius: var(--r-md); background: var(--cs-bg); color: var(--cs-text); text-decoration: none; font-weight: 700; border: 1.5px solid var(--cs-border); }
  .cs-link.primary { background: var(--cs-secondary); color: #fff; border-color: var(--cs-secondary); }
  .cs-empty { color: var(--cs-text-2); font-size: 13px; font-style: italic; padding: 8px 0; }
  .cs-tips { background: var(--cs-accent-soft); border-radius: var(--r-md); padding: 12px 14px; margin: 12px 0; }
  .cs-tips ul { margin: 6px 0 0; padding-left: 18px; font-size: 13px; line-height: 1.6; }
  .cs-diary textarea { width: 100%; min-height: 140px; border-radius: var(--r-md); border: 1.5px solid var(--cs-border); padding: 10px; font-size: 14px; font-family: inherit; resize: vertical; background: var(--cs-surface); color: var(--cs-text); }
  .cs-photos { display: grid; grid-template-columns: repeat(3,1fr); gap: 6px; margin-top: 10px; }
  .cs-photos img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: var(--r-sm); }
  .cs-photo-wrap { position: relative; }
  .cs-photo-del { position: absolute; top: 2px; right: 2px; background: rgba(0,0,0,.6); color:#fff; border:none; border-radius: 50%; width: 22px; height: 22px; font-size: 12px; cursor: pointer; line-height:1; }
  .gps-dot { width: 14px; height: 14px; border-radius: 50%; background: var(--cs-secondary); border: 2px solid #fff; box-shadow: 0 0 0 2px var(--cs-secondary); }
  .gps-pulse { position:absolute; top:-8px; left:-8px; width: 30px; height: 30px; border-radius: 50%; background: rgba(47,134,214,.35); animation: cspulse 1.6s ease-out infinite; }
  @keyframes cspulse { 0% { transform: scale(.4); opacity: .8;} 100% { transform: scale(1.6); opacity: 0; } }
  .cs-compass { width: 64px; height: 64px; border-radius: 50%; border: 3px solid var(--cs-secondary); display:flex; align-items:center; justify-content:center; margin: 0 auto; transition: transform .2s linear; font-size: 26px; }
  .cs-gpsbox { background: var(--cs-secondary-soft); border-radius: var(--r-md); padding: 12px 14px; margin-bottom: 10px; font-size: 13px; }
  .cs-gpsgrid { display:grid; grid-template-columns: 1fr 1fr; gap: 8px 10px; margin-top:8px; }
  .cs-gpsgrid div b { display:block; font-size:15px; }
  .cs-weather { margin-top: 10px; }
  .cs-weather-result { font-size: 14.5px; font-weight: 700; background: var(--cs-secondary-soft); display: inline-block; padding: 8px 14px; border-radius: var(--r-pill); }
  .emoji-marker { text-align:center; }

  .cs-bottomnav { position: fixed; left: 0; right: 0; bottom: 0; height: calc(64px + env(safe-area-inset-bottom)); padding-bottom: env(safe-area-inset-bottom); background: var(--cs-surface); border-top: 1px solid var(--cs-border); display: flex; max-width: 640px; margin: 0 auto; box-shadow: var(--sh-2); z-index: 40; }
  .cs-bn-item { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; background: none; border: none; color: var(--cs-text-2); font-size: 10.5px; font-weight: 700; cursor: pointer; font-family: inherit; }
  .cs-bn-item .ic { font-size: 21px; }
  .cs-bn-item.active { color: var(--cs-primary); }

  .cs-ai-fab { position: fixed; right: 16px; bottom: calc(80px + env(safe-area-inset-bottom)); width: 54px; height: 54px; border-radius: 50%; background: var(--cs-secondary); color: #fff; border: none; font-size: 24px; box-shadow: var(--sh-2); cursor: pointer; z-index: 50; }
  .cs-sos-fab { position: fixed; left: 16px; bottom: calc(80px + env(safe-area-inset-bottom)); width: 50px; height: 50px; border-radius: 50%; background: var(--cs-danger); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 21px; text-decoration: none; box-shadow: var(--sh-2); z-index: 50; }
  .cs-ai-overlay { position: fixed; inset: 0; background: rgba(20,32,26,.5); z-index: 60; display: flex; align-items: flex-end; justify-content: center; }
  .cs-ai-panel { width: 100%; max-width: 640px; height: 82vh; background: var(--cs-bg); border-radius: var(--r-xl) var(--r-xl) 0 0; display: flex; flex-direction: column; overflow: hidden; box-shadow: var(--sh-3); }
  .cs-ai-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; background: linear-gradient(135deg,#178A55,#2F86D6); color: #fff; }
  .cs-ai-emergency { background: var(--cs-danger-soft); color: var(--cs-danger); font-size: 12.5px; font-weight: 700; padding: 8px 16px; }
  .cs-ai-emergency a { color: var(--cs-danger); }
  .cs-ai-keyform { background: var(--cs-accent-soft); padding: 12px 16px; border-bottom: 1px solid var(--cs-border); }
  .cs-ai-keyinput { flex: 1; padding: 9px 12px; border-radius: var(--r-md); border: 1.5px solid var(--cs-border); font-size: 13px; min-width: 0; background: var(--cs-surface); color: var(--cs-text); }
  .cs-ai-messages { flex: 1; overflow-y: auto; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
  .cs-ai-chips { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
  .cs-ai-bubble { max-width: 85%; padding: 10px 14px; border-radius: var(--r-lg); font-size: 13.5px; line-height: 1.45; white-space: pre-wrap; }
  .cs-ai-bubble.me { align-self: flex-end; background: var(--cs-primary); color: #fff; border-bottom-right-radius: 3px; }
  .cs-ai-bubble.ai { align-self: flex-start; background: var(--cs-surface); border: 1px solid var(--cs-border); border-bottom-left-radius: 3px; }
  .cs-ai-bubble.error { align-self: center; background: var(--cs-danger-soft); color: var(--cs-danger); }
  .cs-ai-inputrow { display: flex; gap: 8px; padding: 12px 14px; border-top: 1px solid var(--cs-border); background: var(--cs-surface); }
  .cs-ai-inputrow input { flex: 1; padding: 11px 14px; border-radius: var(--r-pill); border: 1.5px solid var(--cs-border); font-size: 14px; min-width: 0; background: var(--cs-bg); color: var(--cs-text); }

  .cs-progress-card { background: linear-gradient(160deg, var(--cs-primary-soft), var(--cs-surface)); }
  .cs-progress-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
  .cs-progress-title { font-size: 17px; font-weight: 800; }
  .cs-progress-sub { font-size: 12.5px; color: var(--cs-text-2); font-weight: 600; margin-top: 2px; }
  .cs-countdown { text-align: center; background: var(--cs-primary); color: #fff; border-radius: var(--r-md); padding: 6px 12px; font-size: 18px; font-weight: 800; line-height: 1.1; }
  .cs-countdown span { display: block; font-size: 9px; font-weight: 700; opacity: .9; }
  .cs-progress-bar { height: 10px; border-radius: var(--r-pill); background: var(--cs-border); overflow: hidden; margin: 14px 0 10px; }
  .cs-progress-fill { height: 100%; background: linear-gradient(90deg, var(--cs-primary), var(--cs-secondary)); border-radius: var(--r-pill); transition: width .6s ease-out; }
  .cs-badges-row { display: flex; gap: 8px; flex-wrap: wrap; }
  .cs-badge-pill { display: flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: var(--r-pill); background: var(--cs-border); color: var(--cs-text-2); font-size: 11.5px; font-weight: 700; opacity: .55; }
  .cs-badge-pill.earned { background: var(--cs-accent-soft); color: #8a6400; opacity: 1; }
  :root[data-theme="dark"] .cs-badge-pill.earned { color: var(--cs-accent); }

  .cs-segmented { display: flex; gap: 8px; }
  .cs-seg-btn { flex: 1; padding: 10px; border-radius: var(--r-md); border: 1.5px solid var(--cs-border); background: var(--cs-surface); color: var(--cs-text); font-weight: 700; font-size: 12.5px; cursor: pointer; font-family: inherit; }
  .cs-seg-btn.active { background: var(--cs-primary); border-color: var(--cs-primary); color: #fff; }

  .cs-check-item { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--cs-border); }
  .cs-check-item:last-of-type { border-bottom: none; }
  .cs-check-item input { width: 20px; height: 20px; accent-color: var(--cs-primary); flex-shrink: 0; }
  .cs-check-item span { flex: 1; font-size: 13.5px; }
  .cs-check-item span.done { text-decoration: line-through; color: var(--cs-text-2); }
  .cs-check-item button { background: none; border: none; color: var(--cs-danger); font-size: 16px; cursor: pointer; }

  .cs-stamp-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--cs-border); font-size: 12.5px; gap: 8px; }
  .cs-stamp-row:last-of-type { border-bottom: none; }
  .cs-stamp-counter { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
  .cs-stamp-counter button { width: 30px; height: 30px; border-radius: 50%; border: 1.5px solid var(--cs-border); background: var(--cs-surface); color: var(--cs-text); font-weight: 800; cursor: pointer; font-size: 16px; }
  .cs-stamp-counter b { font-size: 16px; min-width: 16px; text-align: center; }

  .cs-input { width: 100%; padding: 11px 14px; border-radius: var(--r-md); border: 1.5px solid var(--cs-border); font-size: 14px; font-family: inherit; margin-bottom: 10px; background: var(--cs-surface); color: var(--cs-text); }
  .cs-sos-banner a { display: block; text-align: center; background: var(--cs-danger); color: #fff; padding: 14px; border-radius: var(--r-md); font-weight: 800; text-decoration: none; margin-bottom: 12px; font-size: 16px; }
`;

function injectGlobalStyles() {
  const existing = document.getElementById("cs-global-style");
  if (existing) return;
  const style = document.createElement("style");
  style.id = "cs-global-style";
  style.textContent = GLOBAL_CSS;
  document.head.appendChild(style);
}

// ───────────────────────────────────────────────────────────────────────────
// Tema claro / oscuro
// ───────────────────────────────────────────────────────────────────────────
const THEME_LS = "camino_sanabres_2026_theme";
function loadThemePref() {
  try {
    return localStorage.getItem(THEME_LS) || "auto";
  } catch {
    return "auto";
  }
}
function saveThemePref(v) {
  try {
    localStorage.setItem(THEME_LS, v);
  } catch {
    // ignorar
  }
}
function resolveTheme(pref) {
  if (pref === "light" || pref === "dark") return pref;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function emojiIcon(emoji, size = 24) {
  return L.divIcon({
    html: `<div class="emoji-marker" style="font-size:${size}px;transform:translate(-50%,-95%);">${emoji}</div>`,
    className: "",
    iconSize: [0, 0],
  });
}

const gpsDivIcon = L.divIcon({
  html: '<div style="position:relative;width:14px;height:14px;"><div class="gps-pulse"></div><div class="gps-dot"></div></div>',
  className: "",
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

// ───────────────────────────────────────────────────────────────────────────
// Mapa de etapa con seguimiento GPS + carga de GPX real + brújula
// ───────────────────────────────────────────────────────────────────────────
function StageMap({ stage, gpxPoints, onGpxUpload, walkStat, onWalkUpdate }) {
  const mapRef = useRef(null);
  const mapDivRef = useRef(null);
  const routeLayerRef = useRef(null);
  const markersLayerRef = useRef(null);
  const liveMarkerRef = useRef(null);
  const accCircleRef = useRef(null);

  const [tracking, setTracking] = useState(false);
  const [pos, setPos] = useState(null);
  const [geoError, setGeoError] = useState("");
  const [heading, setHeading] = useState(null);
  const [compassOn, setCompassOn] = useState(false);
  const watchIdRef = useRef(null);

  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
    const map = L.map(mapDivRef.current, { zoomControl: true }).setView(
      [stage.waypoints[0].lat, stage.waypoints[0].lon],
      12
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: "© OpenStreetMap",
    }).addTo(map);
    mapRef.current = map;
    routeLayerRef.current = L.layerGroup().addTo(map);
    markersLayerRef.current = L.layerGroup().addTo(map);
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [stage.id]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    routeLayerRef.current.clearLayers();
    markersLayerRef.current.clearLayers();

    const hasGpx = gpxPoints && gpxPoints.length > 1;
    const latlngs = hasGpx
      ? gpxPoints.map((p) => [p.lat, p.lon])
      : stage.waypoints.map((p) => [p.lat, p.lon]);

    L.polyline(latlngs, {
      color: hasGpx ? MAP_COLORS.warm : MAP_COLORS.primary,
      weight: hasGpx ? 4 : 3,
      dashArray: hasGpx ? null : "6 6",
      opacity: 0.9,
    }).addTo(routeLayerRef.current);

    stage.waypoints.forEach((wp) => {
      const emoji = wp.type === "start" ? "🟢" : wp.type === "end" ? "🏁" : "📍";
      L.marker([wp.lat, wp.lon], { icon: emojiIcon(emoji, 22) })
        .bindPopup(`<b>${wp.name}</b>`)
        .addTo(markersLayerRef.current);
    });

    const bounds = L.latLngBounds(latlngs);
    map.fitBounds(bounds, { padding: [24, 24] });
  }, [stage, gpxPoints]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pos) return;
    if (!liveMarkerRef.current) {
      liveMarkerRef.current = L.marker([pos.lat, pos.lon], { icon: gpsDivIcon, zIndexOffset: 1000 }).addTo(map);
    } else {
      liveMarkerRef.current.setLatLng([pos.lat, pos.lon]);
    }
    if (pos.accuracy) {
      if (!accCircleRef.current) {
        accCircleRef.current = L.circle([pos.lat, pos.lon], {
          radius: pos.accuracy,
          color: MAP_COLORS.secondary,
          weight: 1,
          fillOpacity: 0.08,
        }).addTo(map);
      } else {
        accCircleRef.current.setLatLng([pos.lat, pos.lon]).setRadius(pos.accuracy);
      }
    }
  }, [pos]);

  const startTracking = () => {
    if (!navigator.geolocation) {
      setGeoError("Este dispositivo/navegador no soporta geolocalización.");
      return;
    }
    setGeoError("");
    setTracking(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (p) => {
        const next = {
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          accuracy: p.coords.accuracy,
          speed: p.coords.speed,
          ts: p.timestamp,
        };
        setPos(next);
        onWalkUpdate(next);
        if (mapRef.current) mapRef.current.panTo([next.lat, next.lon]);
      },
      (err) => setGeoError("No se pudo obtener tu posición: " + err.message),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
    );
  };

  const stopTracking = () => {
    if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = null;
    setTracking(false);
  };

  useEffect(() => () => {
    if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
  }, []);

  const enableCompass = async () => {
    const DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === "function") {
      try {
        const res = await DOE.requestPermission();
        if (res !== "granted") return;
      } catch {
        return;
      }
    }
    window.addEventListener("deviceorientationabsolute", handleOrientation, true);
    window.addEventListener("deviceorientation", handleOrientation, true);
    setCompassOn(true);
  };

  function handleOrientation(e) {
    let h = e.webkitCompassHeading != null ? e.webkitCompassHeading : e.alpha;
    if (h != null) setHeading(360 - h < 360 ? (e.webkitCompassHeading != null ? h : 360 - h) : h);
  }

  useEffect(
    () => () => {
      window.removeEventListener("deviceorientationabsolute", handleOrientation, true);
      window.removeEventListener("deviceorientation", handleOrientation, true);
    },
    []
  );

  const guidance = useMemo(() => {
    if (!pos) return null;
    const points = gpxPoints && gpxPoints.length > 1 ? gpxPoints : stage.waypoints;
    const { idx, dist: distToTrack } = nearestPointIndex(points, pos.lat, pos.lon);
    const remaining = trackLengthFrom(points, idx);
    const target = points[Math.min(idx + 3, points.length - 1)] || points[points.length - 1];
    const brg = bearing(pos.lat, pos.lon, target.lat, target.lon);
    const finalWp = stage.waypoints[stage.waypoints.length - 1];
    const straightToEnd = haversine(pos.lat, pos.lon, finalWp.lat, finalWp.lon);
    return {
      distToTrack,
      remaining: (gpxPoints && gpxPoints.length > 1) ? remaining : straightToEnd,
      bearingToNext: brg,
      usingGpx: !!(gpxPoints && gpxPoints.length > 1),
    };
  }, [pos, gpxPoints, stage]);

  const arrowRotation = useMemo(() => {
    if (!guidance) return 0;
    if (heading != null) return guidance.bearingToNext - heading;
    return guidance.bearingToNext;
  }, [guidance, heading]);

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const pts = parseGPX(text);
    if (!pts.length) {
      alert("No se han podido leer puntos de este GPX.");
      return;
    }
    onGpxUpload(pts);
  };

  return (
    <div>
      <div className="cs-map" ref={mapDivRef} />
      <div className="cs-row" style={{ marginBottom: 10 }}>
        {!tracking ? (
          <button className="cs-btn" onClick={startTracking}>📡 Activar GPS en vivo</button>
        ) : (
          <button className="cs-btn secondary" onClick={stopTracking}>⏸️ Pausar GPS</button>
        )}
        {!compassOn && (
          <button className="cs-btn secondary" onClick={enableCompass}>🧭 Activar brújula</button>
        )}
        <label className="cs-btn secondary" style={{ cursor: "pointer" }}>
          🗺️ Subir track GPX
          <input type="file" accept=".gpx" onChange={handleFile} style={{ display: "none" }} />
        </label>
      </div>
      {geoError && <div className="cs-empty">{geoError}</div>}
      {!gpxPoints?.length && (
        <div className="cs-empty">
          Sin GPX real cargado: la línea del mapa es aproximada (recta entre pueblos). Para indicaciones precisas
          descarga gratis el track de esta etapa en Wikiloc o Gronze y súbelo aquí — funciona sin conexión después.
        </div>
      )}
      {pos && guidance && (
        <div className="cs-gpsbox">
          <div className="cs-row" style={{ justifyContent: "space-between" }}>
            <div
              className="cs-compass"
              style={{ transform: `rotate(${arrowRotation}deg)` }}
              title="Dirección hacia el siguiente punto del camino"
            >
              ⬆️
            </div>
            <div style={{ flex: 1, marginLeft: 12 }}>
              <div>
                Rumbo al siguiente punto: <b>{compassLabel(guidance.bearingToNext)}</b> ({Math.round(guidance.bearingToNext)}°)
                {heading == null && <span> — activa la brújula para ver la flecha relativa a hacia dónde miras</span>}
              </div>
            </div>
          </div>
          <div className="cs-gpsgrid">
            <div>Distancia recorrida hoy<b>{formatDist(walkStat?.distanceM || 0)}</b></div>
            <div>Quedan hasta el final<b>{formatDist(guidance.remaining)}</b></div>
            <div>Precisión GPS<b>{Math.round(pos.accuracy || 0)} m</b></div>
            <div>Velocidad<b>{pos.speed ? (pos.speed * 3.6).toFixed(1) + " km/h" : "—"}</b></div>
          </div>
          {guidance.usingGpx && guidance.distToTrack > 60 && (
            <div style={{ marginTop: 8, color: "var(--cs-danger)", fontWeight: 700 }}>
              ⚠️ Estás a {formatDist(guidance.distToTrack)} del track — puede que te hayas desviado.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Sección de albergues / restaurantes
// ───────────────────────────────────────────────────────────────────────────
function albergueBadgeClass(type) {
  const t = (type || "").toLowerCase();
  if (t.includes("público")) return "public";
  if (t.includes("parroquial") || t.includes("monástico") || t.includes("monastico")) return "parish";
  return "private";
}

function AlberguesSection({ items, extra }) {
  const all = extra ? [extra, ...items] : items;
  if (!all.length) return <div className="cs-empty">Añadiendo albergues verificados de esta etapa…</div>;
  return (
    <div>
      {all.map((a, i) => (
        <div className={"cs-alb" + (a.closed ? " closed" : "")} key={i}>
          {a.closed && <div className="cs-alb-warning-badge">⚠️ CERRADO EN 2026</div>}
          <h4>{a.name}</h4>
          <div className="meta">
            <span className={"cs-badge " + albergueBadgeClass(a.type)}>{a.type}</span>
            {a.price && <span className="cs-badge price">{a.price}</span>}
            <div>{a.town}</div>
            {a.address ? <div>{a.address}</div> : null}
            {a.reserva ? <div>{a.reserva}</div> : null}
            {a.note ? <div className="note">{a.note}</div> : null}
          </div>
          <div className="actions">
            <a className="cs-link primary" href={mapsUrl(a.address ? `${a.name}, ${a.address}` : `${a.name}, ${a.town}`)} target="_blank" rel="noreferrer">📍 Cómo llegar</a>
            {a.phone && <a className="cs-link" href={`tel:${a.phone.replace(/\s+/g, "")}`}>📞 Llamar</a>}
            {a.link && <a className="cs-link" href={a.link} target="_blank" rel="noreferrer">🔗 Reservar</a>}
          </div>
        </div>
      ))}
    </div>
  );
}

function RestaurantsSection({ items }) {
  if (!items.length) return <div className="cs-empty">Añadiendo restaurantes recomendados de esta etapa…</div>;
  return (
    <div>
      {items.map((r, i) => (
        <div className="cs-alb" key={i}>
          <h4>{r.name}</h4>
          <div className="meta">
            {r.town} {r.note ? `— ${r.note}` : ""}
          </div>
          <div className="actions">
            <a className="cs-link primary" href={mapsUrl(`${r.name}, ${r.town}`)} target="_blank" rel="noreferrer">📍 Cómo llegar</a>
            {r.phone && <a className="cs-link" href={`tel:${r.phone.replace(/\s+/g, "")}`}>📞 Llamar</a>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Diario de bitácora por etapa
// ───────────────────────────────────────────────────────────────────────────
function DiarySection({ stage, entry, onChange }) {
  const text = entry?.text || "";
  const photos = entry?.photos || [];
  const weather = entry?.weather || "";

  const handlePhotos = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const newPhotos = [];
    for (const f of files) {
      try {
        const dataUrl = await resizeImageFile(f);
        newPhotos.push({ id: Date.now() + "-" + Math.random().toString(36).slice(2), dataUrl });
      } catch {
        // ignora archivo si falla
      }
    }
    onChange({ ...entry, text, weather, photos: [...photos, ...newPhotos] });
    e.target.value = "";
  };

  const removePhoto = (id) => {
    onChange({ ...entry, text, weather, photos: photos.filter((p) => p.id !== id) });
  };

  return (
    <div className="cs-diary">
      <div className="cs-row" style={{ marginBottom: 8 }}>
        {["☀️", "⛅", "🌦️", "🌧️", "🥵", "🥶"].map((w) => (
          <button
            key={w}
            className="cs-sec-btn"
            style={{ padding: "6px 10px" }}
            onClick={() => onChange({ ...entry, text, photos, weather: w })}
          >
            <span style={{ opacity: weather === w ? 1 : 0.4 }}>{w}</span>
          </button>
        ))}
      </div>
      <textarea
        placeholder={`Escribe aquí el resumen del día: cómo te has sentido, con quién has caminado, anécdotas, paisajes, dolores... (Etapa ${stage.id}: ${stage.from} → ${stage.to})`}
        value={text}
        onChange={(e) => onChange({ ...entry, weather, photos, text: e.target.value })}
      />
      <div className="cs-row" style={{ marginTop: 10 }}>
        <label className="cs-btn secondary" style={{ cursor: "pointer" }}>
          📷 Añadir fotos del carrete
          <input type="file" accept="image/*" multiple onChange={handlePhotos} style={{ display: "none" }} />
        </label>
        <span style={{ fontSize: 12, color: "var(--cs-text-2)" }}>{photos.length} foto(s) guardada(s)</span>
      </div>
      {photos.length > 0 && (
        <div className="cs-photos">
          {photos.map((p) => (
            <div className="cs-photo-wrap" key={p.id}>
              <img src={p.dataUrl} alt="" />
              <button className="cs-photo-del" onClick={() => removePhoto(p.id)}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Vista de una etapa completa (con sub-secciones)
// ───────────────────────────────────────────────────────────────────────────
const SECTIONS = [
  { key: "info", label: "📋 Descripción" },
  { key: "mapa", label: "🗺️ Mapa y GPS" },
  { key: "albergues", label: "🛏️ Albergues" },
  { key: "restaurantes", label: "🍽️ Restaurantes" },
  { key: "diario", label: "📔 Mi diario" },
];

function StageView({ stage, diaryEntry, onDiaryChange, gpxPoints, onGpxUpload, walkStat, onWalkUpdate, completed, onToggleCompleted }) {
  const [section, setSection] = useState("info");
  return (
    <div>
      <div className="cs-card">
        <div className="cs-row" style={{ marginBottom: 8 }}>
          <span className="cs-badge private" style={{ background: "var(--cs-secondary-soft)", color: "var(--cs-secondary)" }}>{stage.km} km</span>
          <span className="cs-badge" style={{ background: "var(--cs-warm-soft)", color: "var(--cs-warm)" }}>{stage.difficulty}</span>
        </div>
        <h2 style={{ margin: "2px 0", fontSize: 20 }}>Etapa {stage.id}: {stage.from} → {stage.to}</h2>
        <div style={{ fontSize: 12.5, color: "var(--cs-text-2)", marginBottom: 10 }}>{stage.date}</div>
        <button className={"cs-btn" + (completed ? " done" : " secondary")} onClick={onToggleCompleted}>
          {completed ? "✅ Etapa completada" : "☐ Marcar etapa como completada"}
        </button>
      </div>

      <div className="cs-sections">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            className={"cs-sec-btn" + (section === s.key ? " active" : "")}
            onClick={() => setSection(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === "info" && (
        <div className="cs-card">
          <p style={{ lineHeight: 1.55 }}>{stage.description}</p>
          <p style={{ fontSize: 12.5, color: "var(--cs-text-2)" }}><b>Desnivel:</b> {stage.desnivel}</p>
          {stage.variants?.length > 0 && (
            <div>
              <b style={{ fontSize: 13 }}>Variantes:</b>
              <ul style={{ paddingLeft: 18, fontSize: 13, lineHeight: 1.5 }}>
                {stage.variants.map((v, i) => (
                  <li key={i}><b>{v.name}:</b> {v.note}</li>
                ))}
              </ul>
            </div>
          )}
          {stage.tips?.length > 0 && (
            <div className="cs-tips">
              <b style={{ fontSize: 13 }}>💡 Consejos de la etapa</b>
              <ul>
                {stage.tips.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>
          )}
          <b style={{ fontSize: 13 }}>Pueblos de la etapa:</b>
          <div style={{ fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>
            {stage.waypoints.map((w) => w.name).join(" → ")}
          </div>
          <WeatherButton stage={stage} />
        </div>
      )}

      {section === "mapa" && (
        <div className="cs-card">
          <StageMap
            stage={stage}
            gpxPoints={gpxPoints}
            onGpxUpload={onGpxUpload}
            walkStat={walkStat}
            onWalkUpdate={onWalkUpdate}
          />
        </div>
      )}

      {section === "albergues" && (
        <div className="cs-card">
          <AlberguesSection items={stage.albergues} extra={stage.id === 1 ? OURENSE_ALBERGUE_SALIDA : null} />
          {stage.id === STAGES.length && (
            <div className="cs-alb" style={{ background: "var(--cs-accent-soft)" }}>
              <h4>🎓 Oficina del Peregrino — recoger la Compostela</h4>
              <div className="meta">
                {OFICINA_PEREGRINO.address}
                <br />Horario: {OFICINA_PEREGRINO.horario}
              </div>
              <div className="actions">
                <a className="cs-link primary" href={mapsUrl("Oficina del Peregrino, " + OFICINA_PEREGRINO.address)} target="_blank" rel="noreferrer">📍 Cómo llegar</a>
                <a className="cs-link" href={`tel:${OFICINA_PEREGRINO.phone.replace(/\s+/g, "")}`}>📞 Llamar</a>
              </div>
            </div>
          )}
        </div>
      )}

      {section === "restaurantes" && (
        <div className="cs-card">
          <RestaurantsSection items={stage.restaurants} />
        </div>
      )}

      {section === "diario" && (
        <div className="cs-card">
          <DiarySection stage={stage} entry={diaryEntry} onChange={onDiaryChange} />
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Etapas — selector de pills + StageView
// ───────────────────────────────────────────────────────────────────────────
function EtapasView({ activeStageId, onSelectStage, completed, diary, onDiaryChange, gpx, onGpxUpload, walk, onWalkUpdate, onToggleCompleted }) {
  const stage = STAGES.find((s) => s.id === activeStageId) || STAGES[0];
  return (
    <div>
      <div className="cs-stage-pills">
        {STAGES.map((s) => (
          <button
            key={s.id}
            className={"cs-stage-pill" + (s.id === activeStageId ? " active" : "") + (completed[s.id] ? " done" : "")}
            onClick={() => onSelectStage(s.id)}
          >
            <span className="num">{completed[s.id] ? "✅" : s.id}</span>
            <span className="lbl">{s.to.split(" ")[0]}</span>
          </button>
        ))}
      </div>
      <StageView
        stage={stage}
        diaryEntry={diary[stage.id]}
        onDiaryChange={(entry) => onDiaryChange(stage.id, entry)}
        gpxPoints={gpx[stage.id]}
        onGpxUpload={(points) => onGpxUpload(stage.id, points)}
        walkStat={walk[stage.id]}
        onWalkUpdate={(fix) => onWalkUpdate(stage.id, fix)}
        completed={!!completed[stage.id]}
        onToggleCompleted={() => onToggleCompleted(stage.id)}
      />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Inicio — dashboard de progreso + resumen del Camino
// ───────────────────────────────────────────────────────────────────────────
function InicioView({ onGoStage, completed, diary, walk }) {
  const totalKm = STAGES.reduce((s, e) => s + e.km, 0);
  const doneKm = STAGES.filter((s) => completed[s.id]).reduce((s, e) => s + e.km, 0);
  const pct = totalKm ? Math.min(100, Math.round((doneKm / totalKm) * 100)) : 0;
  const stagesDone = STAGES.filter((s) => completed[s.id]).length;
  const daysWithDiary = STAGES.filter((s) => diary[s.id]?.text).length;
  const lastStage = STAGES[STAGES.length - 1];
  const lastDate = parseStageDate(lastStage.date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysLeft = lastDate ? Math.ceil((lastDate.getTime() - today.getTime()) / 86400000) : null;

  const achievements = [
    { key: "first", emoji: "🥾", label: "Primeros pasos", earned: stagesDone > 0 || Object.values(walk || {}).some((w) => (w?.distanceM || 0) > 0) },
    { key: "diary3", emoji: "✍️", label: "Diario fiel", earned: daysWithDiary >= 3 },
    { key: "half", emoji: "🌗", label: "Mitad del Camino", earned: doneKm >= totalKm / 2 },
    { key: "santiago", emoji: "🏆", label: "¡Llegaste a Santiago!", earned: !!completed[lastStage.id] },
  ];

  const mapDivRef = useRef(null);

  useEffect(() => {
    const map = L.map(mapDivRef.current).setView([42.6, -8.25], 9);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: "© OpenStreetMap",
    }).addTo(map);
    const colors = [MAP_COLORS.primary, MAP_COLORS.secondary, MAP_COLORS.warm, "#8a5cf6", "#178A55"];
    let allPts = [];
    STAGES.forEach((s, i) => {
      const latlngs = s.waypoints.map((w) => [w.lat, w.lon]);
      allPts = allPts.concat(latlngs);
      L.polyline(latlngs, { color: colors[i % colors.length], weight: 4, dashArray: "6 6" }).addTo(map);
      L.marker(latlngs[0], { icon: emojiIcon("🥾", 18) }).addTo(map);
    });
    const finalWp = STAGES[STAGES.length - 1].waypoints.slice(-1)[0];
    L.marker([finalWp.lat, finalWp.lon], { icon: emojiIcon("🏆", 22) }).addTo(map);
    map.fitBounds(L.latLngBounds(allPts), { padding: [20, 20] });
    return () => map.remove();
  }, []);

  return (
    <div>
      <div className="cs-card cs-progress-card">
        <div className="cs-progress-head">
          <div>
            <div className="cs-progress-title">Tu Camino Sanabrés</div>
            <div className="cs-progress-sub">{doneKm.toFixed(1)} / {totalKm.toFixed(1)} km · {stagesDone}/{STAGES.length} etapas</div>
          </div>
          {daysLeft != null && (
            <div className="cs-countdown">
              {daysLeft > 0 ? daysLeft : daysLeft === 0 ? "¡Hoy!" : "🎉"}
              <span>{daysLeft > 0 ? "días a Santiago" : daysLeft === 0 ? "es el día" : "¡completado!"}</span>
            </div>
          )}
        </div>
        <div className="cs-progress-bar"><div className="cs-progress-fill" style={{ width: pct + "%" }} /></div>
        <div className="cs-badges-row">
          {achievements.map((a) => (
            <div key={a.key} className={"cs-badge-pill" + (a.earned ? " earned" : "")} title={a.label}>
              <span>{a.emoji}</span>{a.label}
            </div>
          ))}
        </div>
      </div>

      <div className="cs-card">
        <h2 style={{ marginTop: 0 }}>🐚 Ourense → Santiago</h2>
        <p style={{ fontSize: 13.5, lineHeight: 1.55 }}>
          {totalKm.toFixed(1)} km en {STAGES.length} etapas, del <b>martes 18</b> al <b>sábado 22 de agosto de 2026</b>.
          Al superar los 100 km hasta Santiago, esta ruta da derecho a la <b>Compostela</b> — recuerda sellar la
          credencial al menos dos veces al día desde Ourense (contador en "Más → Credencial y sellos").
        </p>
        <div className="cs-map" ref={mapDivRef} />
      </div>

      <div className="cs-card">
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Antes de salir — noche del lunes en Ourense</h3>
        <AlberguesSection items={[]} extra={OURENSE_ALBERGUE_SALIDA} />
      </div>

      <div className="cs-card">
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Las {STAGES.length} etapas</h3>
        {STAGES.map((s) => (
          <div
            key={s.id}
            className="cs-row"
            style={{ justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--cs-border)", cursor: "pointer" }}
            onClick={() => onGoStage(s.id)}
          >
            <div>
              <b>{completed[s.id] ? "✅" : `Etapa ${s.id}`}</b> · {s.from} → {s.to}
              <div style={{ fontSize: 11.5, color: "var(--cs-text-2)" }}>{s.date}</div>
            </div>
            <div style={{ fontWeight: 800, color: "var(--cs-primary)" }}>{s.km} km ›</div>
          </div>
        ))}
      </div>

      <div className="cs-card" style={{ borderColor: "var(--cs-danger)", borderWidth: 2 }}>
        <h3 style={{ marginTop: 0, fontSize: 15, color: "var(--cs-danger)" }}>⚠️ Aviso importante — Etapa 2 (miércoles 19)</h3>
        <p style={{ fontSize: 13, lineHeight: 1.5 }}>
          El albergue municipal de <b>Castro Dozón está cerrado</b> desde 2023/24 y no reabrirá hasta el Xacobeo 2027
          (está en obras). Antes de salir el martes, confirma por teléfono alguna alternativa: el albergue del
          <b> Monasterio de Oseira</b> (variante larga, +4,3 km), <b>O Refugio</b> en Cotelas, o una casa rural en
          Dozón. Todo el detalle y teléfonos están en la etapa 2 → Albergues.
        </p>
      </div>

      <div className="cs-card">
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Consejos rápidos</h3>
        <ul style={{ fontSize: 13, lineHeight: 1.6, paddingLeft: 18 }}>
          <li>Botas rotas, calcetines nuevos: ¡nunca al revés! Usa calzado ya probado.</li>
          <li>Sal temprano (antes de las 8h) en agosto para evitar el calor, sobre todo en la etapa 1 y la larga etapa 3.</li>
          <li>Los albergues públicos de la Xunta no se reservan: llegar pronto en temporada alta.</li>
          <li>Descarga los tracks GPX de cada etapa antes de salir (dentro de cada etapa → Mapa y GPS) para que funcionen sin cobertura.</li>
          <li>Guarda agua para los tramos de pista forestal entre pueblos, especialmente las etapas 4 y 5.</li>
          <li>Sella la credencial al menos dos veces al día desde Ourense para que la Compostela sea válida.</li>
        </ul>
        <button className="cs-btn secondary" onClick={shareApp} style={{ marginTop: 6 }}>📤 Compartir esta app</button>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Diario completo + exportación a PDF
// ───────────────────────────────────────────────────────────────────────────
async function generateDiaryPDF(diary) {
  const docPdf = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = 210, pageH = 297, margin = 18;

  docPdf.setFillColor(23, 138, 85);
  docPdf.rect(0, 0, pageW, pageH, "F");
  docPdf.setTextColor(255, 255, 255);
  docPdf.setFontSize(26);
  docPdf.text("Diario del", pageW / 2, 120, { align: "center" });
  docPdf.text("Camino Sanabrés", pageW / 2, 132, { align: "center" });
  docPdf.setFontSize(13);
  docPdf.text("Ourense → Santiago de Compostela", pageW / 2, 145, { align: "center" });
  docPdf.setFontSize(11);
  docPdf.text("18 – 22 de agosto de 2026", pageW / 2, 155, { align: "center" });
  docPdf.setFontSize(30);
  docPdf.text("🐚", pageW / 2, 90, { align: "center" });

  for (const stage of STAGES) {
    const entry = diary[stage.id];
    if (!entry || (!entry.text && (!entry.photos || !entry.photos.length))) continue;

    docPdf.addPage();
    let y = margin;
    docPdf.setTextColor(23, 138, 85);
    docPdf.setFontSize(16);
    docPdf.text(`Etapa ${stage.id}: ${stage.from} → ${stage.to}`, margin, y);
    y += 7;
    docPdf.setFontSize(10);
    docPdf.setTextColor(110, 100, 85);
    docPdf.text(`${stage.date}  ·  ${stage.km} km  ${entry.weather ? " · " + entry.weather : ""}`, margin, y);
    y += 8;
    docPdf.setDrawColor(220, 205, 180);
    docPdf.line(margin, y, pageW - margin, y);
    y += 8;

    if (entry.text) {
      docPdf.setTextColor(36, 28, 20);
      docPdf.setFontSize(11.5);
      const lines = docPdf.splitTextToSize(entry.text, pageW - margin * 2);
      for (const line of lines) {
        if (y > pageH - margin) {
          docPdf.addPage();
          y = margin;
        }
        docPdf.text(line, margin, y);
        y += 5.5;
      }
      y += 6;
    }

    const photos = entry.photos || [];
    if (photos.length) {
      const cols = 2;
      const gap = 6;
      const cellW = (pageW - margin * 2 - gap) / cols;
      const cellH = cellW * 0.75;
      let col = 0;
      for (const p of photos) {
        if (y + cellH > pageH - margin) {
          docPdf.addPage();
          y = margin;
          col = 0;
        }
        const x = margin + col * (cellW + gap);
        try {
          docPdf.addImage(p.dataUrl, "JPEG", x, y, cellW, cellH, undefined, "FAST");
        } catch {
          // ignora imagen corrupta
        }
        col++;
        if (col >= cols) {
          col = 0;
          y += cellH + gap;
        }
      }
      if (col !== 0) y += cellH + gap;
    }
  }

  docPdf.save("diario-camino-sanabres.pdf");
}

function DiarioView({ diary, onExport, onImportFile }) {
  const daysWithContent = STAGES.filter(
    (s) => diary[s.id] && (diary[s.id].text || (diary[s.id].photos || []).length)
  );

  const handleImportChange = (e) => {
    const file = e.target.files[0];
    if (file) onImportFile(file);
    e.target.value = "";
  };

  return (
    <div>
      <div className="cs-card">
        <h2 style={{ marginTop: 0 }}>📔 Diario de bitácora</h2>
        <p style={{ fontSize: 13, color: "var(--cs-text-2)" }}>
          Todo lo que escribas y las fotos que añadas en cada etapa (pestaña "Mi diario") aparecen aquí compiladas.
          Cuando termines el Camino, expórtalo a PDF para imprimirlo o guardarlo de recuerdo.
        </p>
        <button className="cs-btn" onClick={() => generateDiaryPDF(diary)}>
          📄 Exportar diario completo a PDF
        </button>
      </div>

      <div className="cs-card">
        <h3 style={{ marginTop: 0, fontSize: 15 }}>☁️ Copia de seguridad</h3>
        <p style={{ fontSize: 13, color: "var(--cs-text-2)", lineHeight: 1.5 }}>
          Descarga aquí una copia de todo lo tuyo (diario, fotos, tracks GPX, equipo, sellos...) en un único archivo.
          Guárdala donde quieras — por ejemplo tu carpeta de OneDrive del móvil, eligiéndolo al guardar — para no
          depender solo de este navegador. Si cambias de móvil, borras datos o quieres recuperarlo, usa
          "Cargar copia" y elige ese mismo archivo.
        </p>
        <div className="cs-row">
          <button className="cs-btn" onClick={onExport}>⬇️ Descargar copia (JSON)</button>
          <label className="cs-btn secondary" style={{ cursor: "pointer" }}>
            ⬆️ Cargar copia desde archivo
            <input type="file" accept="application/json" onChange={handleImportChange} style={{ display: "none" }} />
          </label>
        </div>
      </div>

      {daysWithContent.length === 0 && (
        <div className="cs-card"><div className="cs-empty">Aún no has escrito nada — ve a una etapa y abre "Mi diario".</div></div>
      )}
      {daysWithContent.map((s) => {
        const e = diary[s.id];
        return (
          <div className="cs-card" key={s.id}>
            <h3 style={{ margin: "0 0 4px" }}>Etapa {s.id}: {s.from} → {s.to} {e.weather}</h3>
            <div style={{ fontSize: 11.5, color: "var(--cs-text-2)", marginBottom: 8 }}>{s.date}</div>
            {e.text && <p style={{ whiteSpace: "pre-wrap", fontSize: 13.5, lineHeight: 1.5 }}>{e.text}</p>}
            {(e.photos || []).length > 0 && (
              <div className="cs-photos">
                {e.photos.map((p) => <img src={p.dataUrl} alt="" key={p.id} />)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Más — ajustes, equipo, credencial y sellos, ficha de emergencia
// ───────────────────────────────────────────────────────────────────────────
function MasView({ themePref, onThemeChange, checklist, onChecklistChange, stamps, onStampsChange, emergency, onEmergencyChange }) {
  const [newItem, setNewItem] = useState("");

  const toggleItem = (id) => {
    onChecklistChange(checklist.map((it) => (it.id === id ? { ...it, done: !it.done } : it)));
  };
  const removeItem = (id) => {
    onChecklistChange(checklist.filter((it) => it.id !== id));
  };
  const addItem = () => {
    const label = newItem.trim();
    if (!label) return;
    onChecklistChange([...checklist, { id: "c" + Date.now(), label, done: false, custom: true }]);
    setNewItem("");
  };

  const setStamp = (stageId, delta) => {
    const cur = stamps[stageId] || 0;
    onStampsChange({ ...stamps, [stageId]: Math.max(0, cur + delta) });
  };

  const setEmergencyField = (field, value) => {
    onEmergencyChange({ ...emergency, [field]: value });
  };

  return (
    <div>
      <div className="cs-card">
        <h3 style={{ marginTop: 0, fontSize: 15 }}>🌓 Apariencia</h3>
        <div className="cs-segmented">
          {[
            { v: "auto", label: "☀️/🌙 Auto" },
            { v: "light", label: "☀️ Claro" },
            { v: "dark", label: "🌙 Oscuro" },
          ].map((o) => (
            <button key={o.v} className={"cs-seg-btn" + (themePref === o.v ? " active" : "")} onClick={() => onThemeChange(o.v)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="cs-card">
        <h3 style={{ marginTop: 0, fontSize: 15 }}>🎒 Mi equipo</h3>
        {checklist.map((item) => (
          <label className="cs-check-item" key={item.id}>
            <input type="checkbox" checked={item.done} onChange={() => toggleItem(item.id)} />
            <span className={item.done ? "done" : ""}>{item.label}</span>
            {item.custom && <button onClick={() => removeItem(item.id)} aria-label="Eliminar">✕</button>}
          </label>
        ))}
        <div className="cs-row" style={{ marginTop: 10 }}>
          <input
            className="cs-input"
            style={{ flex: 1, marginBottom: 0 }}
            placeholder="Añadir algo más a la lista..."
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addItem(); }}
          />
          <button className="cs-btn secondary" onClick={addItem}>➕</button>
        </div>
      </div>

      <div className="cs-card">
        <h3 style={{ marginTop: 0, fontSize: 15 }}>🪪 Credencial y sellos</h3>
        <p style={{ fontSize: 12.5, color: "var(--cs-text-2)", lineHeight: 1.5 }}>
          Sella al menos 2 veces al día (albergue + bar/iglesia) desde Ourense — con más de 100 km hasta Santiago
          tienes derecho a la Compostela. Lleva la cuenta aquí día a día.
        </p>
        {STAGES.map((s) => (
          <div className="cs-stamp-row" key={s.id}>
            <span>Etapa {s.id}: {s.from} → {s.to}</span>
            <div className="cs-stamp-counter">
              <button onClick={() => setStamp(s.id, -1)}>−</button>
              <b>{stamps[s.id] || 0}</b>
              <button onClick={() => setStamp(s.id, 1)}>+</button>
            </div>
          </div>
        ))}
      </div>

      <div className="cs-card">
        <h3 style={{ marginTop: 0, fontSize: 15 }}>🚨 Ficha de emergencia</h3>
        <div className="cs-sos-banner"><a href="tel:112">📞 Llamar al 112 (emergencias)</a></div>
        <input className="cs-input" placeholder="Grupo sanguíneo" value={emergency.bloodType || ""} onChange={(e) => setEmergencyField("bloodType", e.target.value)} />
        <input className="cs-input" placeholder="Seguro de viaje / nº de póliza" value={emergency.insurance || ""} onChange={(e) => setEmergencyField("insurance", e.target.value)} />
        <input className="cs-input" placeholder="Contacto de emergencia (nombre)" value={emergency.contactName || ""} onChange={(e) => setEmergencyField("contactName", e.target.value)} />
        <input className="cs-input" placeholder="Teléfono de contacto" value={emergency.contactPhone || ""} onChange={(e) => setEmergencyField("contactPhone", e.target.value)} style={{ marginBottom: 0 }} />
        {emergency.contactPhone && (
          <a className="cs-link" style={{ marginTop: 10, display: "inline-block" }} href={`tel:${emergency.contactPhone.replace(/\s+/g, "")}`}>📞 Llamar a {emergency.contactName || "tu contacto"}</a>
        )}
      </div>

      <div className="cs-card">
        <h3 style={{ marginTop: 0, fontSize: 15 }}>ℹ️ Acerca de esta app</h3>
        <p style={{ fontSize: 12.5, color: "var(--cs-text-2)", lineHeight: 1.6 }}>
          App creada a medida para el Camino Sanabrés (Ourense → Santiago), 18–22 de agosto de 2026. Datos de
          albergues y restaurantes verificados en agosto de 2026 — confirma siempre por teléfono antes de salir,
          especialmente en temporada alta.
        </p>
        <button className="cs-btn secondary" onClick={shareApp}>📤 Compartir esta app</button>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Panel de Ayuda IA (geolocalizado)
// ───────────────────────────────────────────────────────────────────────────
function AiHelpPanel({ open, onClose, currentStage }) {
  const [apiKey, setApiKey] = useState(loadAiKey());
  const [keyInput, setKeyInput] = useState("");
  const [showKeyForm, setShowKeyForm] = useState(!loadAiKey());
  const [pos, setPos] = useState(null);
  const [locStatus, setLocStatus] = useState("idle");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef(null);

  const refreshLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocStatus("error");
      return;
    }
    setLocStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPos({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy });
        setLocStatus("ok");
      },
      () => setLocStatus("error"),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }, []);

  useEffect(() => {
    if (open) refreshLocation();
  }, [open, refreshLocation]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const saveKey = () => {
    if (!keyInput.trim()) return;
    saveAiKey(keyInput.trim());
    setApiKey(keyInput.trim());
    setShowKeyForm(false);
    setKeyInput("");
  };

  const send = async (text) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    if (!apiKey) {
      setShowKeyForm(true);
      return;
    }
    setError("");
    setInput("");
    const history = messages.slice(-6);
    setMessages((m) => [...m, { role: "user", content: msg }]);
    setLoading(true);
    try {
      const sys = buildAiSystemPrompt(currentStage, pos);
      const reply = await askAi(apiKey, sys, history, msg);
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    } catch (e) {
      setError(e.message || "Error al preguntar a la IA.");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="cs-ai-overlay" onClick={onClose}>
      <div className="cs-ai-panel" onClick={(e) => e.stopPropagation()}>
        <div className="cs-ai-header">
          <div>
            <b>🤖 Ayuda IA</b>
            <div style={{ fontSize: 11.5, opacity: 0.85 }}>
              {locStatus === "ok" && pos
                ? `📍 Ubicación OK (±${Math.round(pos.accuracy)} m)`
                : locStatus === "loading"
                ? "📍 Obteniendo tu ubicación…"
                : locStatus === "error"
                ? "📍 Sin ubicación (puedes preguntar igualmente)"
                : ""}
            </div>
          </div>
          <div className="cs-row" style={{ gap: 6 }}>
            <button className="cs-btn secondary" style={{ padding: "5px 9px", fontSize: 11.5 }} onClick={refreshLocation}>📍</button>
            <button className="cs-btn secondary" style={{ padding: "5px 9px", fontSize: 11.5 }} onClick={() => setShowKeyForm((v) => !v)}>⚙️</button>
            <button className="cs-btn secondary" style={{ padding: "5px 9px", fontSize: 11.5 }} onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="cs-ai-emergency">
          🆘 Si es una urgencia real, llama primero al <a href="tel:112">112</a>
        </div>

        {showKeyForm && (
          <div className="cs-ai-keyform">
            <p style={{ fontSize: 12.5, margin: "0 0 6px" }}>
              Para usar la IA necesitas una clave gratuita de Groq: entra en{" "}
              <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer">console.groq.com/keys</a>,
              crea una cuenta gratis y copia tu clave (empieza por "gsk_"). Se guarda solo en este móvil y solo se
              envía a Groq para responderte, nunca a ningún otro sitio.
            </p>
            <div className="cs-row">
              <input className="cs-ai-keyinput" placeholder="gsk_..." value={keyInput} onChange={(e) => setKeyInput(e.target.value)} />
              <button className="cs-btn" onClick={saveKey}>Guardar</button>
              {apiKey && (
                <button className="cs-btn secondary" onClick={() => setShowKeyForm(false)}>Cancelar</button>
              )}
            </div>
          </div>
        )}

        <div className="cs-ai-messages" ref={scrollRef}>
          {messages.length === 0 && !showKeyForm && (
            <div className="cs-ai-chips">
              {AI_SUGGESTIONS.map((s) => (
                <button key={s} className="cs-sec-btn" onClick={() => send(s.replace(/^\S+\s/, ""))}>{s}</button>
              ))}
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={"cs-ai-bubble " + (m.role === "user" ? "me" : "ai")}>{m.content}</div>
          ))}
          {loading && <div className="cs-ai-bubble ai">Pensando…</div>}
          {error && <div className="cs-ai-bubble error">{error}</div>}
        </div>

        <div className="cs-ai-inputrow">
          <input
            placeholder="Escribe tu pregunta…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
            }}
          />
          <button className="cs-btn" onClick={() => send()} disabled={loading}>➤</button>
        </div>
      </div>
    </div>
  );
}

function AiHelpButton({ onClick }) {
  return (
    <button className="cs-ai-fab" onClick={onClick} aria-label="Ayuda IA">🤖</button>
  );
}

function SosButton() {
  return (
    <a href="tel:112" className="cs-sos-fab" aria-label="Llamar al 112">🆘</a>
  );
}

function OfflineBanner() {
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  if (online) return null;
  return (
    <div className="cs-offline-banner">
      📴 Sin conexión — el mapa nuevo, la Ayuda IA y la sincronización no funcionarán hasta que recuperes cobertura.
    </div>
  );
}

function BottomNav({ active, onChange }) {
  const items = [
    { key: "inicio", icon: "🏠", label: "Inicio" },
    { key: "etapas", icon: "🥾", label: "Etapas" },
    { key: "diario", icon: "📔", label: "Diario" },
    { key: "mas", icon: "⋯", label: "Más" },
  ];
  return (
    <nav className="cs-bottomnav">
      {items.map((it) => (
        <button
          key={it.key}
          className={"cs-bn-item" + (active === it.key ? " active" : "")}
          onClick={() => onChange(it.key)}
        >
          <span className="ic">{it.icon}</span>
          <span className="lb">{it.label}</span>
        </button>
      ))}
    </nav>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// App principal
// ───────────────────────────────────────────────────────────────────────────
export default function App() {
  const [activeSection, setActiveSection] = useState("inicio");
  const [activeStageId, setActiveStageId] = useState(getTodayStageId());
  const [diary, setDiary] = useState({});
  const [gpx, setGpx] = useState({});
  const [walk, setWalk] = useState({});
  const [completed, setCompleted] = useState({});
  const [checklist, setChecklist] = useState(defaultChecklist());
  const [stamps, setStamps] = useState({});
  const [emergency, setEmergency] = useState({});
  const [syncedOnce, setSyncedOnce] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [themePref, setThemePref] = useState(loadThemePref());

  useEffect(() => {
    injectGlobalStyles();
    const local = loadLocal();
    setDiary(local.diary || {});
    setGpx(local.gpx || {});
    setWalk(local.walk || {});
    setCompleted(local.completed || {});
    setChecklist(local.checklist?.length ? local.checklist : defaultChecklist());
    setStamps(local.stamps || {});
    setEmergency(local.emergency || {});

    const unsub = onSnapshot(
      TRIP_DOC,
      (snap) => {
        if (snap.exists() && !syncedOnce) {
          const data = snap.data();
          if (data.diary) setDiary(data.diary);
          if (data.gpx) setGpx(data.gpx);
          if (data.walk) setWalk(data.walk);
          if (data.completed) setCompleted(data.completed);
          if (data.checklist?.length) setChecklist(data.checklist);
          if (data.stamps) setStamps(data.stamps);
          if (data.emergency) setEmergency(data.emergency);
        }
        setSyncedOnce(true);
      },
      () => setSyncedOnce(true)
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const apply = () => root.setAttribute("data-theme", resolveTheme(themePref));
    apply();
    saveThemePref(themePref);
    if (themePref === "auto" && window.matchMedia) {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const listener = () => apply();
      mq.addEventListener ? mq.addEventListener("change", listener) : mq.addListener(listener);
      return () => {
        mq.removeEventListener ? mq.removeEventListener("change", listener) : mq.removeListener(listener);
      };
    }
  }, [themePref]);

  useEffect(() => {
    const data = { diary, gpx, walk, completed, checklist, stamps, emergency };
    saveLocal(data);
    setDoc(TRIP_DOC, { ...data, updatedAt: Date.now() }, { merge: true }).catch(() => {});
  }, [diary, gpx, walk, completed, checklist, stamps, emergency]);

  const updateDiary = (stageId, entry) => {
    setDiary((prev) => ({ ...prev, [stageId]: entry }));
  };
  const updateGpx = (stageId, points) => {
    setGpx((prev) => ({ ...prev, [stageId]: points }));
  };
  const updateWalk = (stageId, fix) => {
    setWalk((prev) => {
      const cur = prev[stageId] || { distanceM: 0, lastFix: null };
      let add = 0;
      if (cur.lastFix) {
        const d = haversine(cur.lastFix.lat, cur.lastFix.lon, fix.lat, fix.lon);
        if (d > 3 && d < 200) add = d;
      }
      return { ...prev, [stageId]: { distanceM: cur.distanceM + add, lastFix: fix } };
    });
  };
  const toggleCompleted = (stageId) => {
    setCompleted((prev) => ({ ...prev, [stageId]: !prev[stageId] }));
  };

  const handleExportClick = () => {
    exportBackupFile({ diary, gpx, walk, completed, checklist, stamps, emergency });
  };

  const importBackup = async (file) => {
    let data;
    try {
      data = await parseBackupFile(file);
    } catch (e) {
      alert(e.message || "No se ha podido leer la copia.");
      return;
    }
    const ok = window.confirm(
      "Esto sustituirá el diario, las fotos, los tracks y el resto de datos guardados ahora en este dispositivo por el contenido del archivo. ¿Continuar?"
    );
    if (!ok) return;
    setDiary(data.diary || {});
    setGpx(data.gpx || {});
    setWalk(data.walk || {});
    setCompleted(data.completed || {});
    setChecklist(data.checklist?.length ? data.checklist : defaultChecklist());
    setStamps(data.stamps || {});
    setEmergency(data.emergency || {});
  };

  const goStage = (stageId) => {
    setActiveStageId(stageId);
    setActiveSection("etapas");
  };

  const currentStageForAi = activeSection === "etapas" ? STAGES.find((s) => s.id === activeStageId) : null;

  return (
    <div className="cs-app">
      <div className="cs-header">
        <h1>🐚 Camino Sanabrés</h1>
        <p>Ourense → Santiago de Compostela · 18–22 agosto 2026</p>
      </div>
      <OfflineBanner />
      <div className="cs-content">
        {activeSection === "inicio" && <InicioView onGoStage={goStage} completed={completed} diary={diary} walk={walk} />}
        {activeSection === "etapas" && (
          <EtapasView
            activeStageId={activeStageId}
            onSelectStage={setActiveStageId}
            completed={completed}
            diary={diary}
            onDiaryChange={updateDiary}
            gpx={gpx}
            onGpxUpload={updateGpx}
            walk={walk}
            onWalkUpdate={updateWalk}
            onToggleCompleted={toggleCompleted}
          />
        )}
        {activeSection === "diario" && <DiarioView diary={diary} onExport={handleExportClick} onImportFile={importBackup} />}
        {activeSection === "mas" && (
          <MasView
            themePref={themePref}
            onThemeChange={setThemePref}
            checklist={checklist}
            onChecklistChange={setChecklist}
            stamps={stamps}
            onStampsChange={setStamps}
            emergency={emergency}
            onEmergencyChange={setEmergency}
          />
        )}
      </div>
      <SosButton />
      <AiHelpButton onClick={() => setAiOpen(true)} />
      <AiHelpPanel open={aiOpen} onClose={() => setAiOpen(false)} currentStage={currentStageForAi} />
      <BottomNav active={activeSection} onChange={setActiveSection} />
    </div>
  );
}
