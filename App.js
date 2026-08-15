import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, doc, onSnapshot, setDoc } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import jsPDF from "jspdf";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// ───────────────────────────────────────────────────────────────────────────
// Firebase (mismo proyecto que el resto de apps del usuario; se usa un
// documento y una carpeta de Storage propios para no mezclar datos)
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
const storage = getStorage(app);
const TRIP_DOC = doc(db, "caminos", "sanabres_ourense_santiago_2026");
const LS_KEY = "camino_sanabres_2026_v1";

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

function loadLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : { diary: {}, gpx: {}, walk: {} };
  } catch {
    return { diary: {}, gpx: {}, walk: {} };
  }
}
function saveLocal(data) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("No se pudo guardar en localStorage (quizá lleno):", e);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Copia de seguridad manual: descargar/cargar todo (diario, fotos, tracks)
// como un único archivo .json que el usuario guarda donde quiera (p. ej. su
// carpeta de OneDrive) — no depende del navegador ni de ninguna cuenta.
// ───────────────────────────────────────────────────────────────────────────
function exportBackupFile({ diary, gpx, walk }) {
  const payload = {
    version: 1,
    app: "camino-sanabres-2026",
    exportedAt: new Date().toISOString(),
    diary,
    gpx,
    walk,
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
// Datos del Camino Sanabrés — Ourense → Santiago de Compostela (6 etapas, ~109 km)
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
      "La etapa más corta de las seis y una de las más bonitas del Sanabrés: mayoritariamente bosque y monte, pistas y sendas, con muy poco asfalto. Dos variantes que confluyen en Castro Dozón: la oficial/corta por Piñor-Cotelas (~14,5 km), o la más larga por el Monasterio de Santa María de Oseira (+4,3 km, ~19 km total) — uno de los cistercienses más bellos de Galicia, con posibilidad de dormir en su propio albergue si se hace tarde. Castro Dozón (O Castro) es la capital del municipio de Dozón.",
    variants: [
      { name: "Oficial por Piñor (Cotelas)", note: "~14,5 km, más directa. Bar-tienda O Refugio en Cotelas (km ~5)." },
      { name: "Por Monasterio de Oseira", note: "~19 km. Pasa por Silvaboa y Pieles (subida dura, 1,3 km al 6%) hasta el monasterio; posibilidad de alojarse allí." },
    ],
    waypoints: [
      { name: "San Cristovo de Cea", lat: 42.43, lon: -8.07, type: "start" },
      { name: "Cotelas", lat: 42.463, lon: -8.075, type: "town" },
      { name: "Castro Dozón (O Castro)", lat: 42.5835, lon: -8.0464, type: "end" },
    ],
    albergues: [
      {
        name: "⚠️ Albergue Municipal de Castro Dozón — CERRADO en 2026",
        type: "Público (Concello de Dozón)",
        town: "O Castro, Dozón",
        address: "Ctra. N-525, s/n (junto a las piscinas municipales)",
        phone: "986 780 471",
        price: "—",
        reserva:
          "Cerrado desde 2023/2024. La Xunta confirmó su reconstrucción en la antigua casa rectoral, con apertura prevista para el Xacobeo 2027 — NO disponible en agosto 2026.",
        link: "",
        note: "IMPORTANTE: confirma alojamiento alternativo antes de salir (ver opciones abajo) — llama con antelación, quedan pocos días.",
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
    to: "Lalín (vía A Laxe)",
    km: 17,
    difficulty: "Media",
    desnivel: "Sube al Alto de Santo Domingo y a Puxallos (~658 m), luego desciende hasta el valle del Pontiñas",
    description:
      "Sale de Castro Dozón junto a la N-525, sube al Alto de Santo Domingo (cruceiro y ermita) y sigue hasta Puxallos, el punto más alto de la etapa. Baja por Pontenoufe (río Asneiro) hasta Botos, la 'Estación de Lalín', donde hay un bar-hostal muy usado por peregrinos. El trazado oficial del Sanabrés termina en A Laxe (parroquia de Bendoiro), donde está el único albergue público de la etapa. Muchos peregrinos alargan ~3 km más para dormir en el centro de Lalín y aprovechar sus servicios y su famoso cocido — indicado en la app como destino final.",
    variants: [
      { name: "Final en A Laxe (oficial)", note: "Aquí está el albergue de la Xunta, sin reserva posible. Sin apenas más servicios alrededor." },
      { name: "Desvío a Lalín centro (recomendado)", note: "+3 km desde Botos o A Laxe. Todos los servicios, más opciones de alojamiento y el cocido gallego." },
    ],
    waypoints: [
      { name: "Castro Dozón", lat: 42.5735, lon: -8.1580, type: "start" },
      { name: "Alto de Santo Domingo", lat: 42.6000, lon: -8.0800, type: "town" },
      { name: "Puxallos", lat: 42.6150, lon: -8.0900, type: "town" },
      { name: "Botos (Estación de Lalín)", lat: 42.6400, lon: -8.1100, type: "town" },
      { name: "A Laxe (Bendoiro)", lat: 42.6350, lon: -8.1300, type: "town" },
      { name: "Lalín", lat: 42.6603, lon: -8.1131, type: "end" },
    ],
    albergues: [
      { name: "Albergue de peregrinos de A Laxe", type: "Público (Xunta)", town: "A Laxe, Bendoiro", address: "C/ A Laxe, 21", phone: "658 038 042", price: "10 € (sábanas y manta desechables incl.)", reserva: "No admite reserva — orden de llegada", link: "" },
      { name: "A Taberna do Vento (bar + hostal)", type: "Privado", town: "Botos, Estación de Lalín", address: "Estación de Botos, 38", phone: "629 306 679", price: "Consultar", reserva: "Reserva por teléfono/WhatsApp", link: "https://www.booking.com/hotel/es/a-taberna-de-vento.html" },
      { name: "Albergue-Pensión Lalín Centro", type: "Privado", town: "Lalín centro", address: "Rúa Observatorio, 8 - 2º", phone: "610 207 992", price: "Consultar", reserva: "Admite reserva (temporada Semana Santa–2 octubre)", link: "https://www.facebook.com/alberguelalincentro/" },
      { name: "Hostal Caracas", type: "Privado", town: "Lalín, salida hacia el camino", address: "Rúa da Corredoira, 32", phone: "680 176 205", price: "Individual desde 30 € / Doble desde 50 €", reserva: "Reserva vía Booking", link: "https://www.booking.com/hotel/es/hostal-caracas.html" },
    ],
    restaurants: [
      { name: "A Taberna do Vento", town: "Botos", note: "Cocido, raciones, tostas, desayunos; cerrado domingos; guarda bicis", phone: "629 306 679" },
      { name: "Pazo de Bendoiro (Mesón)", town: "Bendoiro, km 297 N-525", note: "Pazo del s. XIX, cocina gallega tradicional", phone: "986 794 289" },
      { name: "Cabanas", town: "Lalín (Rúa Pintor Laxeiro, 3)", note: "El clásico para probar el auténtico cocido de Lalín", phone: "986 782 317" },
      { name: "Casa Currás", town: "Lalín (Plaza de la Iglesia)", note: "+80 años de tradición, cocido gallego", phone: "" },
      { name: "Casa Pablo", town: "Lalín", note: "Parrillada y menú del día, cocido casero", phone: "" },
    ],
  },
  {
    id: 4,
    date: "Viernes 21 agosto 2026",
    from: "Lalín",
    to: "Silleda",
    km: 15.7,
    difficulty: "Baja",
    desnivel: "+278 m / −345 m — corta, con subidas y bajadas suaves sin dificultad relevante",
    description:
      "Etapa corta y agradecida. Baja desde Lalín por el paseo fluvial del río Pontiñas (antiguos molinos) hasta O Espiño, donde hay una capilla dedicada a la Virgen de Fátima y huertas en terraza. Cruza zona industrial y pasa por A Ponte Taboada, Carral y Prado antes de un túnel bajo la AP-53 y la última subida hacia Trasfontao, ya con Silleda a la vista. Silleda es la capital de la comarca de Trasdeza y tiene todos los servicios.",
    variants: [],
    waypoints: [
      { name: "Lalín", lat: 42.6603, lon: -8.1131, type: "start" },
      { name: "O Espiño", lat: 42.6650, lon: -8.1450, type: "town" },
      { name: "A Ponte Taboada", lat: 42.6720, lon: -8.1750, type: "town" },
      { name: "Prado", lat: 42.6850, lon: -8.2100, type: "town" },
      { name: "Silleda", lat: 42.7015, lon: -8.2481, type: "end" },
    ],
    albergues: [
      { name: "El Gran Albergue Silleda", type: "Privado", town: "Silleda", address: "Rúa Antón Alonso Ríos, 18", phone: "611 286 757", price: "Desde 10 €", reserva: "Admite reserva", link: "" },
      { name: "Albergue Santa Olaia", type: "Privado", town: "Silleda", address: "Avenida do Parque, 17", phone: "626 405 652", price: "10 € (ropa de cama desechable incl.)", reserva: "Admite reserva — check-in 12:00, cierre 22:00, 60 plazas", link: "https://www.booking.com/hotel/es/albergue-santa-olaia-silleda.html" },
      { name: "Albergue Turístico Silleda", type: "Privado", town: "Silleda", address: "Rúa Venezuela, 38, 3º-4º izq.", phone: "643 898 693", price: "Consultar", reserva: "Admite reserva — check-in 12:00, cierre 22:00", link: "" },
      { name: "Hotel Ramos", type: "Privado (hotel)", town: "Silleda, céntrico", address: "Rúa Antón Alonso Ríos, 24", phone: "986 581 212", price: "Individual desde 34 € / Doble desde 55 €", reserva: "Consultar disponibilidad", link: "" },
      { name: "Hostal Toxa", type: "Privado (hostal)", town: "Silleda, céntrico", address: "Rúa Trasdeza, 88", phone: "986 580 111", price: "Consultar", reserva: "Consultar", link: "" },
    ],
    restaurants: [
      { name: "O Camiño", town: "Silleda", note: "Menú del día, churrasco a la brasa viernes noche y sábados", phone: "689 180 928" },
      { name: "Camiño De Ferro", town: "Silleda", note: "En la antigua estación de tren; raciones y churrasco, buena relación calidad-precio", phone: "" },
      { name: "Restaurante Puente Taboada", town: "Silleda", note: "Muy frecuentado por peregrinos del Sanabrés; menú churrasco ~17,50 €", phone: "" },
      { name: "Panadería Luis Mella", town: "Silleda", note: "Empanadas muy recomendadas por peregrinos", phone: "" },
    ],
  },
  {
    id: 5,
    date: "Sábado 22 agosto 2026",
    from: "Silleda",
    to: "Ponte Ulla",
    km: 19.7,
    difficulty: "Media",
    desnivel: "Perfil descendente en general, con un tramo final pronunciado (~10%, 2,5 km en zigzag) hacia Ponte Ulla",
    description:
      "Tras salir de Silleda en paralelo a la N-640, el camino cruza O Foxo y San Fiz hasta A Bandeira (todos los servicios). Después continúa entre campos y bosques por Piñeiro, Vilariño, Besteiro y San Martiño de Dornelas — merece la pena parar en su iglesia románica del s. XII, ligada a la donación de la reina Urraca a la Catedral de Santiago en 1115. Tras O Seixo baja con fuerte pendiente hasta Ponte Ulla, en el límite entre Pontevedra y A Coruña, cruzando el río Ulla por el puente histórico junto al mirador de Gundián.",
    variants: [
      { name: "Fin de etapa alternativo en Outeiro", note: "Algunos peregrinos alargan hasta Outeiro (unos km más) para dejar la última etapa más corta; solo hay un albergue público de la Xunta, sin más servicios." },
    ],
    waypoints: [
      { name: "Silleda", lat: 42.7015, lon: -8.2481, type: "start" },
      { name: "A Bandeira", lat: 42.726, lon: -8.289, type: "town" },
      { name: "San Martiño de Dornelas", lat: 42.754, lon: -8.337, type: "town" },
      { name: "Ponte Ulla", lat: 42.7825, lon: -8.385, type: "end" },
    ],
    albergues: [
      { name: "Albergue-Pensión O Cruceiro da Ulla", type: "Privado (albergue + pensión)", town: "Ponte Ulla", address: "Vista Alegre, s/n", phone: "981 512 099", price: "16 €/persona (albergue); menú 14 €; desayuno 4,50 €", reserva: "Admite reserva", link: "https://www.ocruceiro.es/" },
      { name: "Hostal Ríos", type: "Privado (hostal)", town: "Ponte Ulla, cruzando el puente", address: "A pie de camino", phone: "981 512 305", price: "Desde 12 €/persona", reserva: "Consultar", link: "" },
      { name: "Pensión A Taberna de Gundián", type: "Privado", town: "Ponte Ulla", address: "", phone: "", price: "Consultar", reserva: "Consultar", link: "" },
      { name: "Pensión Juanito", type: "Privado", town: "Ponte Ulla", address: "", phone: "", price: "Consultar", reserva: "Consultar", link: "" },
      { name: "Albergue de peregrinos de Bandeira (opción intermedia)", type: "Público (Xunta)", town: "A Bandeira", address: "Rúa Lourás, s/n", phone: "670 502 356", price: "10 € (sábanas/mantas desechables incl.)", reserva: "No admite reserva", link: "", note: "Útil si prefieres acortar esta etapa y alargar la siguiente." },
    ],
    restaurants: [
      { name: "Trécola Bar", town: "A Bandeira", note: "Bar de peregrinos en pleno camino: pizzas, hamburguesas, tortilla, tapas; pulpo los días 14 y 29 (mercado)", phone: "986 181 634" },
      { name: "O Cruceiro da Ulla (bar-restaurante)", town: "Ponte Ulla", note: "Menú del día 14 €, desayuno 4,50 €", phone: "981 512 099" },
    ],
  },
  {
    id: 6,
    date: "Domingo 23 agosto 2026",
    from: "Ponte Ulla",
    to: "Santiago de Compostela",
    km: 20.4,
    difficulty: "Media — última etapa, con fuerzas de sobra por la emoción de llegar",
    desnivel: "Subida pronunciada inicial, luego perfil suave hasta la entrada en Santiago",
    description:
      "¡Última etapa! Sale de Ponte Ulla y sube (algunos itinerarios pasan primero por Outeiro, en Vedra, con albergue de la Xunta) atravesando bosques hasta Lestedo, en Boqueixón — desde aquí hay un desvío opcional al Pico Sacro. Sigue por Susana, ya en el municipio de Santiago, con pocos servicios en este tramo (lleva agua y algo de comida). La entrada a la ciudad es por el barrio de Sar, junto a la Colegiata románica de Santa María a Real do Sar, cruzando el puente románico y subiendo por Castrón Douro hasta el casco histórico por la Porta de Mazarelos. De ahí a la Praza da Quintana, Praza das Praterías y, por fin, la Praza do Obradoiro frente a la Catedral. Guarda fuerzas (y algo de emoción) para el abrazo al Apóstol.",
    variants: [],
    waypoints: [
      { name: "Ponte Ulla", lat: 42.7825, lon: -8.385, type: "start" },
      { name: "Outeiro (Vedra)", lat: 42.8, lon: -8.4165, type: "town" },
      { name: "Lestedo (Boqueixón)", lat: 42.822, lon: -8.4558, type: "town" },
      { name: "Susana", lat: 42.849, lon: -8.503, type: "town" },
      { name: "Sar (Colegiata)", lat: 42.8708, lon: -8.5423, type: "town" },
      { name: "Santiago de Compostela (Catedral)", lat: 42.8805, lon: -8.5456, type: "end" },
    ],
    albergues: [
      { name: "Albergue de peregrinos de Outeiro (opción intermedia)", type: "Público (Xunta)", town: "Outeiro, Vedra", address: "O Outeiro, s/n", phone: "630 941 288", price: "8–10 € (sábanas/mantas desechables incl. según fuente)", reserva: "Normalmente sin reserva — fuentes contradictorias, llamar para confirmar", link: "", note: "Útil solo si divides la última etapa en dos días más cortos." },
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

function normalizeTxt(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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

  return `Eres el asistente de una app para un peregrino que está caminando ahora mismo el Camino Sanabrés (Ourense → Santiago de Compostela), del 18 al 23 de agosto de 2026.
${stageText}
${loc}
${poiText}

Instrucciones:
- Responde siempre en español, breve (máximo 4-5 frases salvo que de verdad haga falta más), cercano y práctico, como un compañero de camino con experiencia.
- Si el peregrino describe una urgencia médica seria, un accidente o un peligro real, dile PRIMERO que llame al 112 (emergencias en España) antes de nada más.
- Si pregunta dónde ir, qué hay cerca, o busca un albergue/bar/restaurante, usa exclusivamente los puntos de interés listados arriba (nombre, distancia, rumbo, teléfono). Si ninguno encaja con lo que pide, dilo con honestidad en vez de inventar un sitio.
- No tienes acceso a datos meteorológicos ni de tráfico en tiempo real: si preguntan por el tiempo actual, dilo claramente y sugiere consultar AEMET o una app de tiempo.
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
// Estilos globales (inyectados una vez)
// ───────────────────────────────────────────────────────────────────────────
const GLOBAL_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; background: #f4ede2; color: #2c2116; }
  .cs-app { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; max-width: 640px; margin: 0 auto; min-height: 100vh; background: #f4ede2; padding-bottom: 40px; }
  .cs-header { background: linear-gradient(135deg,#7a4b2a,#a86a3d); color: #fff; padding: 18px 16px 14px; position: sticky; top: 0; z-index: 20; box-shadow: 0 2px 8px rgba(0,0,0,.15); }
  .cs-header h1 { margin: 0; font-size: 19px; display:flex; align-items:center; gap:8px; }
  .cs-header p { margin: 4px 0 0; font-size: 12.5px; opacity: .9; }
  .cs-tabs { display: flex; overflow-x: auto; gap: 6px; padding: 10px 10px 0; background: #7a4b2a; position: sticky; top: 62px; z-index: 19; scrollbar-width: none; }
  .cs-tabs::-webkit-scrollbar { display: none; }
  .cs-tab { flex: 0 0 auto; padding: 8px 12px; border-radius: 10px 10px 0 0; background: rgba(255,255,255,.12); color: #fff; font-size: 12.5px; font-weight: 600; border: none; cursor: pointer; white-space: nowrap; }
  .cs-tab.active { background: #f4ede2; color: #7a4b2a; }
  .cs-content { padding: 14px; }
  .cs-card { background: #fff; border-radius: 14px; padding: 14px; margin-bottom: 12px; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
  .cs-badge { display: inline-block; padding: 3px 9px; border-radius: 20px; font-size: 11.5px; font-weight: 700; margin-right: 6px; margin-bottom: 4px; }
  .cs-sections { display: flex; gap: 6px; overflow-x: auto; margin-bottom: 12px; scrollbar-width: none; }
  .cs-sections::-webkit-scrollbar { display: none; }
  .cs-sec-btn { flex: 0 0 auto; padding: 7px 12px; border-radius: 20px; border: 1.5px solid #c9a878; background: #fff; color: #7a4b2a; font-size: 12.5px; font-weight: 600; cursor: pointer; }
  .cs-sec-btn.active { background: #7a4b2a; color: #fff; border-color: #7a4b2a; }
  .cs-map { width: 100%; height: 320px; border-radius: 12px; overflow: hidden; margin-bottom: 10px; z-index: 1; }
  .cs-btn { background: #7a4b2a; color: #fff; border: none; padding: 9px 14px; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .cs-btn.secondary { background: #fff; color: #7a4b2a; border: 1.5px solid #7a4b2a; }
  .cs-btn:disabled { opacity: .5; }
  .cs-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .cs-alb { border: 1px solid #eee1cf; border-radius: 12px; padding: 10px 12px; margin-bottom: 8px; }
  .cs-alb h4 { margin: 0 0 4px; font-size: 14.5px; }
  .cs-alb .meta { font-size: 12.5px; color: #6b5c48; margin-bottom: 6px; }
  .cs-alb .actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .cs-link { display: inline-block; font-size: 12.5px; padding: 6px 10px; border-radius: 8px; background: #f4ede2; color: #7a4b2a; text-decoration: none; font-weight: 600; }
  .cs-empty { color: #96876f; font-size: 13px; font-style: italic; padding: 8px 0; }
  .cs-diary textarea { width: 100%; min-height: 140px; border-radius: 10px; border: 1.5px solid #e4d5bd; padding: 10px; font-size: 14px; font-family: inherit; resize: vertical; }
  .cs-photos { display: grid; grid-template-columns: repeat(3,1fr); gap: 6px; margin-top: 10px; }
  .cs-photos img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 8px; }
  .cs-photo-wrap { position: relative; }
  .cs-photo-del { position: absolute; top: 2px; right: 2px; background: rgba(0,0,0,.6); color:#fff; border:none; border-radius: 50%; width: 20px; height: 20px; font-size: 12px; cursor: pointer; line-height:1; }
  .gps-dot { width: 14px; height: 14px; border-radius: 50%; background: #1a73e8; border: 2px solid #fff; box-shadow: 0 0 0 2px #1a73e8; }
  .gps-pulse { position:absolute; top:-8px; left:-8px; width: 30px; height: 30px; border-radius: 50%; background: rgba(26,115,232,.35); animation: cspulse 1.6s ease-out infinite; }
  @keyframes cspulse { 0% { transform: scale(.4); opacity: .8;} 100% { transform: scale(1.6); opacity: 0; } }
  .cs-compass { width: 64px; height: 64px; border-radius: 50%; border: 3px solid #7a4b2a; display:flex; align-items:center; justify-content:center; margin: 0 auto; transition: transform .2s linear; font-size: 26px; }
  .cs-gpsbox { background: #fbf5ea; border-radius: 12px; padding: 10px 12px; margin-bottom: 10px; font-size: 13px; }
  .cs-gpsgrid { display:grid; grid-template-columns: 1fr 1fr; gap: 6px 10px; margin-top:6px; }
  .cs-gpsgrid div b { display:block; font-size:15px; }
  .emoji-marker { text-align:center; }

  .cs-ai-fab { position: fixed; right: 18px; bottom: 22px; width: 56px; height: 56px; border-radius: 50%; background: #1a73e8; color: #fff; border: none; font-size: 26px; box-shadow: 0 3px 10px rgba(0,0,0,.3); cursor: pointer; z-index: 50; }
  .cs-ai-overlay { position: fixed; inset: 0; background: rgba(30,20,10,.45); z-index: 60; display: flex; align-items: flex-end; justify-content: center; }
  .cs-ai-panel { width: 100%; max-width: 640px; height: 82vh; background: #fdf9f2; border-radius: 18px 18px 0 0; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 -4px 20px rgba(0,0,0,.25); }
  .cs-ai-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; background: #7a4b2a; color: #fff; }
  .cs-ai-emergency { background: #fdecea; color: #c0392b; font-size: 12.5px; font-weight: 600; padding: 7px 14px; }
  .cs-ai-emergency a { color: #c0392b; }
  .cs-ai-keyform { background: #fff8e8; padding: 10px 14px; border-bottom: 1px solid #eee1cf; }
  .cs-ai-keyinput { flex: 1; padding: 8px 10px; border-radius: 8px; border: 1.5px solid #e4d5bd; font-size: 13px; min-width: 0; }
  .cs-ai-messages { flex: 1; overflow-y: auto; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }
  .cs-ai-chips { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
  .cs-ai-bubble { max-width: 85%; padding: 9px 12px; border-radius: 14px; font-size: 13.5px; line-height: 1.45; white-space: pre-wrap; }
  .cs-ai-bubble.me { align-self: flex-end; background: #7a4b2a; color: #fff; border-bottom-right-radius: 3px; }
  .cs-ai-bubble.ai { align-self: flex-start; background: #fff; border: 1px solid #eee1cf; border-bottom-left-radius: 3px; }
  .cs-ai-bubble.error { align-self: center; background: #fdecea; color: #c0392b; }
  .cs-ai-inputrow { display: flex; gap: 8px; padding: 10px 12px; border-top: 1px solid #eee1cf; background: #fff; }
  .cs-ai-inputrow input { flex: 1; padding: 10px 12px; border-radius: 20px; border: 1.5px solid #e4d5bd; font-size: 14px; min-width: 0; }
`;

function injectGlobalStyles() {
  if (document.getElementById("cs-global-style")) return;
  const style = document.createElement("style");
  style.id = "cs-global-style";
  style.textContent = GLOBAL_CSS;
  document.head.appendChild(style);
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

  // init map
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

  // draw route + markers whenever gpx / stage changes
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
      color: hasGpx ? "#e63946" : "#7a4b2a",
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

  // live position marker
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
          color: "#1a73e8",
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

  // navigation guidance
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
            <div style={{ marginTop: 6, color: "#c0392b", fontWeight: 600 }}>
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
function AlberguesSection({ items, extra }) {
  const all = extra ? [extra, ...items] : items;
  if (!all.length) return <div className="cs-empty">Añadiendo albergues verificados de esta etapa…</div>;
  return (
    <div>
      {all.map((a, i) => (
        <div className="cs-alb" key={i}>
          <h4>{a.name}</h4>
          <div className="meta">
            <span className="cs-badge" style={{ background: "#f4ede2", color: "#7a4b2a" }}>{a.type}</span>
            {a.town} {a.price ? `· ${a.price}` : ""}
            {a.address ? <><br />{a.address}</> : null}
            {a.reserva ? <><br />{a.reserva}</> : null}
            {a.note ? <><br /><i>{a.note}</i></> : null}
          </div>
          <div className="actions">
            {a.phone && <a className="cs-link" href={`tel:${a.phone.replace(/\s+/g, "")}`}>📞 {a.phone}</a>}
            {a.link && <a className="cs-link" href={a.link} target="_blank" rel="noreferrer">🔗 Ver / reservar</a>}
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
          {r.phone && (
            <div className="actions">
              <a className="cs-link" href={`tel:${r.phone.replace(/\s+/g, "")}`}>📞 {r.phone}</a>
            </div>
          )}
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
            style={{ padding: "5px 9px" }}
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
      <div className="cs-row" style={{ marginTop: 8 }}>
        <label className="cs-btn secondary" style={{ cursor: "pointer" }}>
          📷 Añadir fotos del carrete
          <input type="file" accept="image/*" multiple onChange={handlePhotos} style={{ display: "none" }} />
        </label>
        <span style={{ fontSize: 12, color: "#96876f" }}>{photos.length} foto(s) guardada(s)</span>
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

function StageView({ stage, diaryEntry, onDiaryChange, gpxPoints, onGpxUpload, walkStat, onWalkUpdate }) {
  const [section, setSection] = useState("info");
  return (
    <div>
      <div className="cs-card">
        <div className="cs-row" style={{ marginBottom: 6 }}>
          <span className="cs-badge" style={{ background: "#e8f4fd", color: "#1a73e8" }}>{stage.km} km</span>
          <span className="cs-badge" style={{ background: "#fef6e4", color: "#a86a3d" }}>{stage.difficulty}</span>
        </div>
        <h2 style={{ margin: "2px 0" }}>Etapa {stage.id}: {stage.from} → {stage.to}</h2>
        <div style={{ fontSize: 12.5, color: "#6b5c48" }}>{stage.date}</div>
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
          <p style={{ lineHeight: 1.5 }}>{stage.description}</p>
          <p style={{ fontSize: 12.5, color: "#6b5c48" }}><b>Desnivel:</b> {stage.desnivel}</p>
          {stage.variants?.length > 0 && (
            <div>
              <b style={{ fontSize: 13 }}>Variantes:</b>
              <ul style={{ paddingLeft: 18, fontSize: 13 }}>
                {stage.variants.map((v, i) => (
                  <li key={i}><b>{v.name}:</b> {v.note}</li>
                ))}
              </ul>
            </div>
          )}
          <b style={{ fontSize: 13 }}>Pueblos de la etapa:</b>
          <div style={{ fontSize: 13, marginTop: 4 }}>
            {stage.waypoints.map((w) => w.name).join(" → ")}
          </div>
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
          {stage.id === 6 && (
            <div className="cs-alb" style={{ background: "#fbf5ea" }}>
              <h4>🎓 Oficina del Peregrino — recoger la Compostela</h4>
              <div className="meta">
                {OFICINA_PEREGRINO.address}
                <br />Horario: {OFICINA_PEREGRINO.horario}
              </div>
              <div className="actions">
                <a className="cs-link" href={`tel:${OFICINA_PEREGRINO.phone.replace(/\s+/g, "")}`}>📞 {OFICINA_PEREGRINO.phone}</a>
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
// Resumen / overview
// ───────────────────────────────────────────────────────────────────────────
function ResumenView({ onGoStage }) {
  const totalKm = STAGES.reduce((s, e) => s + e.km, 0);
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    const map = L.map(mapDivRef.current).setView([42.6, -8.25], 9);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: "© OpenStreetMap",
    }).addTo(map);
    mapRef.current = map;
    const colors = ["#7a4b2a", "#a86a3d", "#c9a878", "#588157", "#1a73e8", "#e63946"];
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
      <div className="cs-card">
        <h2 style={{ marginTop: 0 }}>🐚 Camino Sanabrés — Ourense → Santiago</h2>
        <p style={{ fontSize: 13.5, lineHeight: 1.5 }}>
          {totalKm.toFixed(1)} km en 6 etapas, del <b>martes 18</b> al <b>domingo 23 de agosto de 2026</b>.
          Al superar los 100 km hasta Santiago, esta ruta da derecho a la <b>Compostela</b> — recuerda sellar la
          credencial al menos dos veces al día (albergue + bar/iglesia) desde Ourense.
        </p>
        <div className="cs-map" ref={mapDivRef} />
      </div>

      <div className="cs-card">
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Antes de salir — noche del lunes en Ourense</h3>
        <AlberguesSection items={[]} extra={OURENSE_ALBERGUE_SALIDA} />
      </div>

      <div className="cs-card">
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Las 6 etapas</h3>
        {STAGES.map((s) => (
          <div
            key={s.id}
            className="cs-row"
            style={{ justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f1e8d8", cursor: "pointer" }}
            onClick={() => onGoStage(`stage-${s.id}`)}
          >
            <div>
              <b>Etapa {s.id}</b> · {s.from} → {s.to}
              <div style={{ fontSize: 11.5, color: "#96876f" }}>{s.date}</div>
            </div>
            <div style={{ fontWeight: 700, color: "#7a4b2a" }}>{s.km} km ›</div>
          </div>
        ))}
      </div>

      <div className="cs-card" style={{ border: "2px solid #e63946" }}>
        <h3 style={{ marginTop: 0, fontSize: 15, color: "#c0392b" }}>⚠️ Aviso importante — Etapa 2 (miércoles 19)</h3>
        <p style={{ fontSize: 13, lineHeight: 1.5 }}>
          El albergue municipal de <b>Castro Dozón está cerrado</b> desde 2023/24 y no reabrirá hasta el Xacobeo 2027
          (está en obras). Antes de salir el martes, confirma por teléfono alguna alternativa: el albergue del
          <b> Monasterio de Oseira</b> (variante larga, +4,3 km), <b>O Refugio</b> en Cotelas, o una casa rural en
          Dozón. Todo el detalle y teléfonos están en la pestaña "2. Castro" → Albergues.
        </p>
      </div>

      <div className="cs-card">
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Consejos rápidos</h3>
        <ul style={{ fontSize: 13, lineHeight: 1.6, paddingLeft: 18 }}>
          <li>Botas rotas, calcetines nuevos: ¡nunca al revés! Usa calzado ya probado.</li>
          <li>Sal temprano (antes de las 8h) en agosto para evitar el calor en las subidas de la etapa 1 y 3.</li>
          <li>Los albergues públicos de la Xunta no se reservan: llegar pronto en temporada alta.</li>
          <li>Descarga los tracks GPX de cada etapa antes de salir (dentro de cada etapa → Mapa y GPS) para que funcionen sin cobertura.</li>
          <li>Guarda agua para los tramos de pista forestal entre pueblos, especialmente etapas 5 y 6.</li>
          <li>Sella la credencial al menos dos veces al día desde Ourense para que la Compostela sea válida.</li>
        </ul>
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

  docPdf.setFillColor(122, 75, 42);
  docPdf.rect(0, 0, pageW, pageH, "F");
  docPdf.setTextColor(255, 255, 255);
  docPdf.setFontSize(26);
  docPdf.text("Diario del", pageW / 2, 120, { align: "center" });
  docPdf.text("Camino Sanabrés", pageW / 2, 132, { align: "center" });
  docPdf.setFontSize(13);
  docPdf.text("Ourense → Santiago de Compostela", pageW / 2, 145, { align: "center" });
  docPdf.setFontSize(11);
  docPdf.text("18 – 23 de agosto de 2026", pageW / 2, 155, { align: "center" });
  docPdf.setFontSize(30);
  docPdf.text("🐚", pageW / 2, 90, { align: "center" });

  for (const stage of STAGES) {
    const entry = diary[stage.id];
    if (!entry || (!entry.text && (!entry.photos || !entry.photos.length))) continue;

    docPdf.addPage();
    let y = margin;
    docPdf.setTextColor(122, 75, 42);
    docPdf.setFontSize(16);
    docPdf.text(`Etapa ${stage.id}: ${stage.from} → ${stage.to}`, margin, y);
    y += 7;
    docPdf.setFontSize(10);
    docPdf.setTextColor(120, 110, 95);
    docPdf.text(`${stage.date}  ·  ${stage.km} km  ${entry.weather ? " · " + entry.weather : ""}`, margin, y);
    y += 8;
    docPdf.setDrawColor(220, 205, 180);
    docPdf.line(margin, y, pageW - margin, y);
    y += 8;

    if (entry.text) {
      docPdf.setTextColor(40, 30, 20);
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
        <p style={{ fontSize: 13, color: "#6b5c48" }}>
          Todo lo que escribas y las fotos que añadas en cada etapa (pestaña "Mi diario") aparecen aquí compiladas.
          Cuando termines el Camino, expórtalo a PDF para imprimirlo o guardarlo de recuerdo.
        </p>
        <button className="cs-btn" onClick={() => generateDiaryPDF(diary)}>
          📄 Exportar diario completo a PDF
        </button>
      </div>

      <div className="cs-card">
        <h3 style={{ marginTop: 0, fontSize: 15 }}>☁️ Copia de seguridad</h3>
        <p style={{ fontSize: 13, color: "#6b5c48", lineHeight: 1.5 }}>
          Descarga aquí una copia de todo lo tuyo (diario, fotos y tracks GPX) en un único archivo. Guárdala donde
          quieras — por ejemplo tu carpeta de OneDrive del móvil, eligiéndolo al guardar — para no depender solo de
          este navegador. Si cambias de móvil, borras datos o quieres recuperarlo, usa "Cargar copia" y elige ese
          mismo archivo.
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
            <div style={{ fontSize: 11.5, color: "#96876f", marginBottom: 8 }}>{s.date}</div>
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

// ───────────────────────────────────────────────────────────────────────────
// App principal
// ───────────────────────────────────────────────────────────────────────────
export default function App() {
  const [activeTab, setActiveTab] = useState("resumen");
  const [diary, setDiary] = useState({});
  const [gpx, setGpx] = useState({});
  const [walk, setWalk] = useState({});
  const [syncedOnce, setSyncedOnce] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  useEffect(() => {
    injectGlobalStyles();
    const local = loadLocal();
    setDiary(local.diary || {});
    setGpx(local.gpx || {});
    setWalk(local.walk || {});

    const unsub = onSnapshot(
      TRIP_DOC,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setDiary((prev) => ({ ...(data.diary || {}), ...prev }));
          if (!syncedOnce) {
            if (data.diary) setDiary(data.diary);
            if (data.gpx) setGpx(data.gpx);
          }
        }
        setSyncedOnce(true);
      },
      () => setSyncedOnce(true)
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    saveLocal({ diary, gpx, walk });
    setDoc(TRIP_DOC, { diary, gpx, updatedAt: Date.now() }, { merge: true }).catch(() => {});
  }, [diary, gpx, walk]);

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

  const handleExportClick = () => {
    exportBackupFile({ diary, gpx, walk });
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
      "Esto sustituirá el diario, las fotos y los tracks guardados ahora en este dispositivo por el contenido del archivo. ¿Continuar?"
    );
    if (!ok) return;
    setDiary(data.diary || {});
    setGpx(data.gpx || {});
    setWalk(data.walk || {});
  };

  const tabs = [
    { key: "resumen", label: "🏠 Resumen" },
    ...STAGES.map((s) => ({ key: `stage-${s.id}`, label: `${s.id}. ${s.to.split(" ")[0]}` })),
    { key: "diario", label: "📔 Diario" },
  ];

  const currentStageForAi = STAGES.find((s) => activeTab === `stage-${s.id}`) || null;

  return (
    <div className="cs-app">
      <div className="cs-header">
        <h1>🐚 Camino Sanabrés</h1>
        <p>Ourense → Santiago de Compostela · 18–23 agosto 2026</p>
      </div>
      <div className="cs-tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={"cs-tab" + (activeTab === t.key ? " active" : "")}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="cs-content">
        {activeTab === "resumen" && <ResumenView onGoStage={setActiveTab} />}
        {activeTab === "diario" && <DiarioView diary={diary} onExport={handleExportClick} onImportFile={importBackup} />}
        {STAGES.filter((s) => activeTab === `stage-${s.id}`).map((stage) => (
          <StageView
            key={stage.id}
            stage={stage}
            diaryEntry={diary[stage.id]}
            onDiaryChange={(entry) => updateDiary(stage.id, entry)}
            gpxPoints={gpx[stage.id]}
            onGpxUpload={(points) => updateGpx(stage.id, points)}
            walkStat={walk[stage.id]}
            onWalkUpdate={(fix) => updateWalk(stage.id, fix)}
          />
        ))}
      </div>
      <AiHelpButton onClick={() => setAiOpen(true)} />
      <AiHelpPanel open={aiOpen} onClose={() => setAiOpen(false)} currentStage={currentStageForAi} />
    </div>
  );
}
