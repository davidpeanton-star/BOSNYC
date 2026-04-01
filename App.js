import { useState, useEffect, useMemo } from "react";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, doc, onSnapshot, setDoc } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import html2canvas from "html2canvas";

// =========================
// CONFIG
// =========================
// Para GitHub/Vite usa .env:
//
// VITE_FIREBASE_API_KEY=...
// VITE_FIREBASE_AUTH_DOMAIN=...
// VITE_FIREBASE_PROJECT_ID=...
// VITE_FIREBASE_STORAGE_BUCKET=...
// VITE_FIREBASE_MESSAGING_SENDER_ID=...
// VITE_FIREBASE_APP_ID=...
// VITE_FIREBASE_MEASUREMENT_ID=...
// VITE_GEMINI_API_KEY=...

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "PON_AQUI_TU_API_KEY",
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ||
    "PON_AQUI_TU_AUTH_DOMAIN",
  projectId:
    import.meta.env.VITE_FIREBASE_PROJECT_ID || "PON_AQUI_TU_PROJECT_ID",
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ||
    "PON_AQUI_TU_STORAGE_BUCKET",
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ||
    "PON_AQUI_TU_MESSAGING_SENDER_ID",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "PON_AQUI_TU_APP_ID",
  measurementId:
    import.meta.env.VITE_FIREBASE_MEASUREMENT_ID ||
    "PON_AQUI_TU_MEASUREMENT_ID",
};

const AI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const storage = getStorage(app);
const TRIP_DOC = doc(db, "viajes", "boston_ny_2025");

// =========================
// DATA
// =========================
const ICONS = [
  "🏨", "✈️", "🚗", "🗺️", "🍽️", "🍕", "🦞", "🏀", "🗽", "🔭", "🎓", "🌳",
  "🌊", "🎭", "🛒", "🌅", "🏛️", "🚶", "🛍️", "🎨", "🌃", "🌉", "🏙️", "📸",
  "🥩", "☕", "🎵", "🎬", "🏆", "🚇", "🎉", "🌆", "🍣", "🎪", "⛵", "🏟️",
  "🌇", "🍜", "🥗", "🖼️", "🎠", "🍦", "🎡", "🧁", "🥐", "⚾", "🦁", "🍺",
  "🚢", "🎻", "🌮", "🔬", "🏡", "🌉", "🎯",
];

const CAT = {
  activity: { label: "Actividad", bg: "#e8f4fd", col: "#1a73e8" },
  restaurant: { label: "Restaurante", bg: "#fef6e4", col: "#e67e22" },
  hotel: { label: "Alojamiento", bg: "#e8f8f5", col: "#27ae60" },
  transport: { label: "Transporte", bg: "#fde8e8", col: "#e74c3c" },
};

const parseTime = (t) => {
  if (!t) return 9999;
  const str = String(t).toLowerCase().trim();

  if (str.includes("mañana")) return 800;
  if (str.includes("mediodía") || str.includes("mediodia")) return 1300;
  if (str.includes("tarde")) return 1700;
  if (str.includes("noche")) return 2000;

  const match = str.match(/(\d{1,2})[:h\.]?(\d{2})?/);
  if (match) {
    let h = parseInt(match[1], 10);
    const m = parseInt(match[2] || "0", 10);
    if (str.includes("pm") && h < 12) h += 12;
    return h * 100 + m;
  }
  return 9999;
};

const getDayColor = (city, label) => {
  if (label.includes("Vuelta")) return "#e74c3c";
  if (city === "Boston") return "#27ae60";
  if (city === "New York") return "#1a365d";
  if (city.includes("Boston → New York")) return "#e67e22";
  return "#1a73e8";
};

const INIT_CHECKLIST = [
  { id: 1, text: "Pasaportes y ESTA impresos", done: false },
  { id: 2, text: "Adaptadores de enchufe (Clavija plana)", done: false },
  { id: 3, text: "Abrigos / Chubasqueros (Clima Boston)", done: false },
  { id: 4, text: "Entradas Celtics en el móvil", done: false },
  { id: 5, text: "Billetes de avión confirmados", done: false },
];

const INIT_DAYS = [
  {
    date: "Jue 3 Abril",
    city: "Boston",
    emoji: "✈️",
    label: "Llegada a Boston",
    color: "#27ae60",
    activities: [
      {
        time: "Tarde",
        icon: "🏨",
        title: "Check-in en Cambridge",
        desc: "Hotel en Cambridge, barrio universitario con ambiente estudiantil vibrante.",
        confirmed: false,
        done: false,
        budget: 0,
        link: "",
        address: "Cambridge, Boston, MA",
        category: "hotel",
      },
      {
        time: "Tarde",
        icon: "🚶",
        title: "Paseo por Harvard Square",
        desc: "Primera toma de contacto. Tiendas, cafeterías y el icónico ambiente de la zona.",
        confirmed: false,
        done: false,
        budget: 0,
        link: "",
        address: "Harvard Square, Cambridge, MA",
        category: "activity",
      },
      {
        time: "Noche",
        icon: "🍽️",
        title: "Cena en Cambridge",
        desc: "The Harvest o algo informal en Harvard Square. Cocina americana de calidad.",
        confirmed: false,
        done: false,
        budget: 80,
        link: "https://www.harvestrestaurant.com",
        address: "44 Brattle St, Cambridge, MA",
        category: "restaurant",
      },
    ],
  },
  {
    date: "Vie 4 Abril",
    city: "Boston",
    emoji: "🏛️",
    label: "Boston histórico",
    color: "#27ae60",
    activities: [
      {
        time: "Mañana",
        icon: "🎓",
        title: "Harvard University",
        desc: "Visita al campus: Harvard Yard, Memorial Hall y museo Peabody.",
        confirmed: false,
        done: false,
        budget: 20,
        link: "https://www.harvard.edu/visitors/",
        address: "Harvard Yard, Cambridge, MA",
        category: "activity",
      },
      {
        time: "Mañana",
        icon: "🔬",
        title: "MIT – Campus rápido",
        desc: "A 10 min andando de Harvard. El Gehry Building es muy fotogénico.",
        confirmed: false,
        done: false,
        budget: 0,
        link: "https://www.mit.edu",
        address: "77 Massachusetts Ave, Cambridge, MA",
        category: "activity",
      },
      {
        time: "Tarde",
        icon: "🗺️",
        title: "Freedom Trail",
        desc: "Ruta histórica de 4 km marcada en rojo. 16 monumentos históricos.",
        confirmed: false,
        done: false,
        budget: 0,
        link: "https://www.thefreedomtrail.org",
        address: "Boston Common, Boston, MA",
        category: "activity",
      },
      {
        time: "Noche",
        icon: "🦞",
        title: "Cena en North End",
        desc: "Barrio italiano de Boston. Mariscos y pasta auténtica. Probar Mamma Maria.",
        confirmed: false,
        done: false,
        budget: 100,
        link: "",
        address: "North End, Boston, MA",
        category: "restaurant",
      },
    ],
  },
  {
    date: "Sáb 5 Abril",
    city: "Boston",
    emoji: "🏀",
    label: "Boston libre + ¡Celtics!",
    color: "#27ae60",
    activities: [
      {
        time: "Mañana",
        icon: "🌊",
        title: "New England Aquarium",
        desc: "Pingüinos, tiburones y tortugas gigantes.",
        confirmed: false,
        done: false,
        budget: 80,
        link: "https://www.neaq.org",
        address: "1 Central Wharf, Boston, MA",
        category: "activity",
      },
      {
        time: "Mediodía",
        icon: "🛒",
        title: "Faneuil Hall Marketplace",
        desc: "Mercado histórico con comida de todo el mundo.",
        confirmed: false,
        done: false,
        budget: 60,
        link: "",
        address: "4 South Market St, Boston, MA",
        category: "restaurant",
      },
      {
        time: "Tarde",
        icon: "🏡",
        title: "Paseo por Beacon Hill",
        desc: "El barrio más pintoresco de Boston.",
        confirmed: false,
        done: false,
        budget: 0,
        link: "",
        address: "Beacon Hill, Boston, MA",
        category: "activity",
      },
      {
        time: "20:00h",
        icon: "🏀",
        title: "CELTICS vs RAPTORS 🎟️",
        desc: "¡El partido! TD Garden. Llegad 45 min antes.",
        confirmed: true,
        done: false,
        budget: 300,
        link: "",
        address: "TD Garden, Boston, MA",
        category: "activity",
      },
    ],
  },
  {
    date: "Dom 6 Abril",
    city: "Boston → New York",
    emoji: "🚗",
    label: "Road Trip a NYC",
    color: "#e67e22",
    activities: [
      {
        time: "Mañana",
        icon: "🌳",
        title: "Boston Common",
        desc: "Último paseo matutino por el parque.",
        confirmed: false,
        done: false,
        budget: 0,
        link: "",
        address: "Boston Common, Boston, MA",
        category: "activity",
      },
      {
        time: "Mediodía",
        icon: "🚗",
        title: "Salida hacia New York",
        desc: "~4,5h por la I-95 South. Parada en New Haven a comer pizza.",
        confirmed: false,
        done: false,
        budget: 150,
        link: "",
        address: "New Haven, CT",
        category: "transport",
      },
      {
        time: "Tarde",
        icon: "🏨",
        title: "Check-in Manhattan",
        desc: "Hotel cerca de Central Park. Instalarse y dejar las maletas.",
        confirmed: false,
        done: false,
        budget: 0,
        link: "",
        address: "Manhattan, New York, NY",
        category: "hotel",
      },
      {
        time: "Noche",
        icon: "🌃",
        title: "Times Square",
        desc: "Paseo nocturno por Times Square y Broadway.",
        confirmed: false,
        done: false,
        budget: 40,
        link: "",
        address: "Times Square, New York, NY",
        category: "activity",
      },
    ],
  },
  {
    date: "Lun 7 Abril",
    city: "New York",
    emoji: "🗽",
    label: "Estatua de la Libertad",
    color: "#1a365d",
    activities: [
      {
        time: "7:30h",
        icon: "🗽",
        title: "Estatua Libertad + Ellis 🎟️",
        desc: "Ferry desde Battery Park. Ellis Island es muy emotiva.",
        confirmed: true,
        done: false,
        budget: 100,
        link: "",
        address: "Battery Park, New York, NY",
        category: "activity",
      },
      {
        time: "Mediodía",
        icon: "🌉",
        title: "Brooklyn Bridge",
        desc: "Cruzad el puente (1 km) hasta DUMBO.",
        confirmed: false,
        done: false,
        budget: 0,
        link: "",
        address: "Brooklyn Bridge, New York, NY",
        category: "activity",
      },
      {
        time: "Tarde",
        icon: "📸",
        title: "DUMBO, Brooklyn",
        desc: "Barrio artístico. La famosa foto del puente.",
        confirmed: false,
        done: false,
        budget: 30,
        link: "",
        address: "DUMBO, Brooklyn, NY",
        category: "activity",
      },
      {
        time: "Noche",
        icon: "🍕",
        title: "Pizza en Juliana's",
        desc: "Una de las mejores pizzas de Nueva York.",
        confirmed: false,
        done: false,
        budget: 80,
        link: "",
        address: "19 Old Fulton St, Brooklyn, NY",
        category: "restaurant",
      },
    ],
  },
  {
    date: "Mar 8 Abril",
    city: "New York",
    emoji: "🏙️",
    label: "El Bronx + Summit",
    color: "#1a365d",
    activities: [
      {
        time: "Mañana",
        icon: "🎨",
        title: "Tour por el Bronx 🎟️",
        desc: "Cuna del hip-hop y el grafiti. Yankee Stadium exterior.",
        confirmed: true,
        done: false,
        budget: 80,
        link: "",
        address: "The Bronx, New York, NY",
        category: "activity",
      },
      {
        time: "Mediodía",
        icon: "🌳",
        title: "Central Park",
        desc: "Comida en el parque o bici de alquiler para los peques.",
        confirmed: false,
        done: false,
        budget: 40,
        link: "",
        address: "Central Park, New York, NY",
        category: "activity",
      },
      {
        time: "17:30h",
        icon: "🔭",
        title: "SUMMIT One Vanderbilt 🎟️",
        desc: "Mejor mirador de NYC. Experiencia inmersiva.",
        confirmed: true,
        done: false,
        budget: 120,
        link: "",
        address: "45 E 42nd St, New York, NY",
        category: "activity",
      },
    ],
  },
  {
    date: "Mié 9 Abril",
    city: "New York",
    emoji: "🎭",
    label: "Central Park & Cultura",
    color: "#1a365d",
    activities: [
      {
        time: "Mañana",
        icon: "🌳",
        title: "Central Park en profundidad",
        desc: "Strawberry Fields, Castillo Belvedere, carrusel.",
        confirmed: false,
        done: false,
        budget: 30,
        link: "",
        address: "Central Park, New York, NY",
        category: "activity",
      },
      {
        time: "Mediodía",
        icon: "🖼️",
        title: "Museo MET",
        desc: "El museo más grande de EE.UU. Colección egipcia.",
        confirmed: false,
        done: false,
        budget: 80,
        link: "",
        address: "1000 Fifth Ave, New York, NY",
        category: "activity",
      },
      {
        time: "Noche",
        icon: "🎭",
        title: "Broadway Show",
        desc: "El Rey León o Aladdin. Entradas en TKTS.",
        confirmed: false,
        done: false,
        budget: 300,
        link: "",
        address: "Times Square, New York, NY",
        category: "activity",
      },
    ],
  },
  {
    date: "Jue 10 Abril",
    city: "New York",
    emoji: "🌆",
    label: "Manhattan Norte & Sur",
    color: "#1a365d",
    activities: [
      {
        time: "Mañana",
        icon: "🚶",
        title: "The High Line",
        desc: "Parque elevado sobre antigua vía de tren.",
        confirmed: false,
        done: false,
        budget: 0,
        link: "",
        address: "The High Line, New York, NY",
        category: "activity",
      },
      {
        time: "Mediodía",
        icon: "🍽️",
        title: "Chelsea Market",
        desc: "Mercado gourmet bajo el High Line.",
        confirmed: false,
        done: false,
        budget: 70,
        link: "",
        address: "75 9th Ave, New York, NY",
        category: "restaurant",
      },
      {
        time: "Tarde",
        icon: "🌆",
        title: "Oculus / 11-S",
        desc: "Memorial del 11-S muy emotivo.",
        confirmed: false,
        done: false,
        budget: 40,
        link: "",
        address: "180 Greenwich St, New York, NY",
        category: "activity",
      },
    ],
  },
  {
    date: "Vie 11 Abril",
    city: "Boston ✈️",
    emoji: "✈️",
    label: "Vuelta a casa ⚠️",
    color: "#e74c3c",
    activities: [
      {
        time: "8:00h",
        icon: "🌅",
        title: "Check-out y desayuno",
        desc: "Salid del hotel antes de las 9:30h.",
        confirmed: false,
        done: false,
        budget: 30,
        link: "",
        address: "Manhattan, New York, NY",
        category: "transport",
      },
      {
        time: "9:30h",
        icon: "🚗",
        title: "Salida hacia Boston ⚠️",
        desc: "¡4,5h de trayecto + tráfico de viernes!",
        confirmed: true,
        done: false,
        budget: 150,
        link: "",
        address: "Boston Logan International Airport, Boston, MA",
        category: "transport",
      },
      {
        time: "14:30h",
        icon: "🏁",
        title: "Boston Logan – Vuelo",
        desc: "Devolved el coche. ¡Vuelo a las 17:30h!",
        confirmed: true,
        done: false,
        budget: 0,
        link: "",
        address: "Boston Logan International Airport, Boston, MA",
        category: "transport",
      },
    ],
  },
];

// =========================
// HELPERS
// =========================
function cleanLocation(value) {
  if (!value) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function openExternalUrl(url) {
  try {
    const newWindow = window.open(url, "_blank", "noopener,noreferrer");
    if (!newWindow) {
      window.location.href = url;
    }
  } catch {
    window.location.href = url;
  }
}

function buildGoogleMapsSearchUrl(query) {
  const cleanQuery = cleanLocation(query);
  if (!cleanQuery) return "";
  const params = new URLSearchParams({
    api: "1",
    query: cleanQuery,
  });
  return `https://www.google.com/maps/search/?${params.toString()}`;
}

function buildGoogleMapsDirectionsUrl(activities) {
  const locations = activities
    .map((a) => cleanLocation(a.address || a.title))
    .filter(Boolean);

  if (locations.length === 0) return "";
  if (locations.length === 1) return buildGoogleMapsSearchUrl(locations[0]);

  const params = new URLSearchParams({
    api: "1",
    origin: locations[0],
    destination: locations[locations.length - 1],
    travelmode: "walking",
  });

  const midPoints = locations.slice(1, -1);
  if (midPoints.length > 0) {
    params.set("waypoints", midPoints.join("|"));
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function SuggCard({ act, col, onAdd }) {
  const [added, setAdded] = useState(false);

  return (
    <div
      style={{
        background: "white",
        borderRadius: 16,
        marginBottom: 10,
        padding: 16,
        border: "1.5px solid #eee",
        boxShadow: "0 3px 10px rgba(0,0,0,0.06)",
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <span style={{ fontSize: 32, flexShrink: 0 }}>{act.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>
            {act.title}
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              marginBottom: 8,
              flexWrap: "wrap",
            }}
          >
            {act.time && (
              <span style={{ fontSize: 16, color: "#888", fontWeight: "bold" }}>
                ⏰ {act.time}
              </span>
            )}

            {Number(act.budget) > 0 && (
              <span
                style={{
                  fontSize: 14,
                  background: "#e8f4fd",
                  color: "#1a73e8",
                  padding: "2px 8px",
                  borderRadius: 6,
                  fontWeight: 700,
                }}
              >
                💰 ~{act.budget}€
              </span>
            )}
          </div>

          <p
            style={{
              margin: "0 0 10px",
              fontSize: 16,
              color: "#555",
              lineHeight: 1.5,
            }}
          >
            {act.desc}
          </p>
        </div>
      </div>

      <button
        onClick={() => {
          if (!added) {
            onAdd();
            setAdded(true);
          }
        }}
        style={{
          marginTop: 10,
          width: "100%",
          background: added ? "#27ae60" : col,
          color: "white",
          border: "none",
          borderRadius: 12,
          padding: "14px",
          fontSize: 16,
          fontWeight: 800,
          cursor: added ? "default" : "pointer",
          transition: "0.2s",
        }}
      >
        {added ? "✅ Añadido al plan" : "➕ Añadir al plan"}
      </button>
    </div>
  );
}

export default function App() {
  const [data, setData] = useState(null);
  const [sel, setSel] = useState(0);
  const [exp, setExp] = useState(null);
  const [view, setView] = useState("plan");
  const [editModal, setEditModal] = useState(null);
  const [form, setForm] = useState({});
  const [iconPicker, setIconPicker] = useState(false);
  const [sugg, setSugg] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [delConfirm, setDelConfirm] = useState(null);
  const [saveStatus, setSaveStatus] = useState("");
  const [weatherData, setWeatherData] = useState({});
  const [uploading, setUploading] = useState(null);
  const [newCheckItem, setNewCheckItem] = useState("");

  useEffect(() => {
    const unsubscribe = onSnapshot(
      TRIP_DOC,
      (docSnap) => {
        if (docSnap.exists()) {
          const fetchedData = docSnap.data();
          if (!fetchedData.checklist) fetchedData.checklist = INIT_CHECKLIST;
          if (!fetchedData.dias) fetchedData.dias = INIT_DAYS;
          setData(fetchedData);
          setSaveStatus("cloud");
        } else {
          const initial = { dias: INIT_DAYS, checklist: INIT_CHECKLIST };
          setDoc(TRIP_DOC, initial);
          setData(initial);
          setSaveStatus("cloud");
        }
      },
      (error) => {
        console.error("Firebase error:", error);
        if (!data) {
          setData({ dias: INIT_DAYS, checklist: INIT_CHECKLIST });
        }
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const resB = await fetch(
          "https://api.open-meteo.com/v1/forecast?latitude=42.3601&longitude=-71.0589&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=America%2FNew_York&forecast_days=16"
        );
        const dataB = await resB.json();

        const resNY = await fetch(
          "https://api.open-meteo.com/v1/forecast?latitude=40.7128&longitude=-74.0060&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=America%2FNew_York&forecast_days=16"
        );
        const dataNY = await resNY.json();

        const WMO = {
          0: "☀️",
          1: "🌤️",
          2: "⛅",
          3: "☁️",
          45: "🌫️",
          48: "🌫️",
          51: "🌧️",
          53: "🌧️",
          55: "🌧️",
          61: "☔",
          63: "☔",
          65: "☔",
          71: "🌨️",
          73: "🌨️",
          75: "🌨️",
          80: "🌦️",
          81: "🌦️",
          82: "🌦️",
          95: "⛈️",
          96: "⛈️",
          99: "⛈️",
        };

        const wMap = {};

        const process = (d, prefix) => {
          d.daily.time.forEach((dt, i) => {
            const dayNumber = parseInt(dt.split("-")[2], 10);
            wMap[`${prefix}-${dayNumber}`] = {
              icon: WMO[d.daily.weather_code[i]] || "🌤️",
              max: Math.round(d.daily.temperature_2m_max[i]),
              min: Math.round(d.daily.temperature_2m_min[i]),
            };
          });
        };

        process(dataB, "Boston");
        process(dataNY, "New York");
        setWeatherData(wMap);
      } catch (e) {
        console.error("Weather error:", e);
      }
    };

    fetchWeather();
  }, []);

  const persist = async (newData) => {
    setData(newData);
    setSaveStatus("saving");

    try {
      await setDoc(TRIP_DOC, newData);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("cloud"), 2200);
    } catch (e) {
      console.error("Save error:", e);
      setSaveStatus("err");
      setTimeout(() => setSaveStatus(""), 2200);
    }
  };

  const openAdd = () => {
    setForm({
      time: "",
      icon: "🎯",
      title: "",
      desc: "",
      budget: "",
      link: "",
      address: "",
      confirmed: false,
      category: "activity",
    });
    setEditModal({ di: sel, ai: -1 });
    setIconPicker(false);
  };

  const openEdit = (di, ai) => {
    setForm({ ...data.dias[di].activities[ai] });
    setEditModal({ di, ai });
    setIconPicker(false);
  };

  const saveAct = () => {
    if (!form.title?.trim()) return;

    const nDias = data.dias.map((d, i) => {
      if (i !== editModal.di) return d;

      const activities = [...d.activities];
      const payload = {
        ...form,
        title: form.title?.trim() || "",
        desc: form.desc?.trim() || "",
        address: form.address?.trim() || "",
        link: form.link?.trim() || "",
        budget: form.budget === "" ? "" : Number(form.budget),
      };

      if (editModal.ai === -1) {
        activities.push({ ...payload, done: false });
      } else {
        activities[editModal.ai] = payload;
      }

      return { ...d, activities };
    });

    persist({ ...data, dias: nDias });
    setEditModal(null);
  };

  const toggleDone = (di, ai) => {
    const nDias = structuredClone(data.dias);
    nDias[di].activities[ai].done = !nDias[di].activities[ai].done;
    persist({ ...data, dias: nDias });
  };

  const updateComments = (text) => {
    const nDias = structuredClone(data.dias);
    nDias[sel].comments = text;
    setData({ ...data, dias: nDias });
  };

  const delAct = (di, ai) => {
    const nDias = data.dias.map((d, i) =>
      i !== di
        ? d
        : { ...d, activities: d.activities.filter((_, j) => j !== ai) }
    );

    persist({ ...data, dias: nDias });
    setDelConfirm(null);
  };

  const toggleCheck = (idx) => {
    if (!data.checklist) return;
    const nCheck = structuredClone(data.checklist);
    nCheck[idx].done = !nCheck[idx].done;
    persist({ ...data, checklist: nCheck });
  };

  const addCheck = () => {
    if (!newCheckItem.trim()) return;
    const nCheck = data.checklist ? [...data.checklist] : [];
    nCheck.push({ id: Date.now(), text: newCheckItem.trim(), done: false });
    persist({ ...data, checklist: nCheck });
    setNewCheckItem("");
  };

  const handlePhotoUpload = async (e, di, ai) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(ai);

    try {
      const fileRef = ref(storage, `foto_actividad_${di}_${ai}_${Date.now()}`);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);

      const nDias = structuredClone(data.dias);
      nDias[di].activities[ai].photo = url;
      await persist({ ...data, dias: nDias });
    } catch (err) {
      console.error("Photo upload error:", err);
      alert(
        "Error al subir foto. Revisa las reglas de Firebase Storage y el bucket."
      );
    }

    setUploading(null);
  };

  const days = data?.dias || [];
  const day = days[sel];
  const col = day ? getDayColor(day.city, day.label) : "#1a73e8";

  const sortedActivities = useMemo(() => {
    if (!day?.activities) return [];
    return day.activities
      .map((act, index) => ({ ...act, originalIndex: index }))
      .sort((a, b) => parseTime(a.time) - parseTime(b.time));
  }, [day]);

  const total = useMemo(() => {
    return days.reduce(
      (s, d) =>
        s +
        d.activities.reduce((ss, a) => ss + (parseFloat(a.budget) || 0), 0),
      0
    );
  }, [days]);

  const openSuperMap = () => {
    if (!day?.activities?.length) return;

    const acts = sortedActivities.filter((a) => cleanLocation(a.address));
    if (acts.length === 0) {
      alert("No hay actividades con dirección guardada hoy.");
      return;
    }

    const url = buildGoogleMapsDirectionsUrl(acts);
    if (!url) {
      alert("No se ha podido generar la ruta de Google Maps.");
      return;
    }

    openExternalUrl(url);
  };

  const handleWeatherClick = () => {
    if (!day) return;

    const now = new Date();
    const currTime = now.getHours() * 100 + now.getMinutes();

    let targetAct = sortedActivities.find((a) => parseTime(a.time) >= currTime);
    if (!targetAct) targetAct = sortedActivities[0];

    const loc = cleanLocation(targetAct?.address || targetAct?.title || day.city);
    if (!loc) return;

    const url =
      "https://www.google.com/search?q=" +
      encodeURIComponent(`el tiempo por horas en ${loc}`);

    openExternalUrl(url);
  };

  const exportDayImage = () => {
    const el = document.getElementById("export-area");
    if (!el) return;

    html2canvas(el, { scale: 2, useCORS: true }).then((canvas) => {
      const link = document.createElement("a");
      link.download = `Plan_${day.date.replace(/ /g, "_")}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    });
  };

  const fetchSugg = async () => {
    if (!AI_API_KEY) {
      alert("Falta VITE_GEMINI_API_KEY en tu .env");
      return;
    }

    setAiLoading(true);
    setSugg(null);

    try {
      const d = data.dias[sel];
      const list = d.activities.map((a) => `${a.time}: ${a.title}`).join("; ");

      const prompt = `Viaje familiar (2 adultos, adolescentes 16 y niño 9) a ${
        d.city
      }. Agenda: ${
        list || "nada"
      }. Sugiere 3 planes y 2 restaurantes familiares baratos. Responde SOLO en JSON válido sin markdown: {"activities":[{"icon":"emoji","title":"nombre","time":"hora","desc":"breve","budget":numero,"address":"lugar","link":""}],"restaurants":[{"icon":"🍽️","title":"nombre","time":"hora","desc":"breve","budget":numero,"address":"lugar","link":""}]}`;

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${AI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        }
      );

      const json = await res.json();
      const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text || "";

      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      setSugg(parsed);
    } catch (e) {
      console.error("AI suggestions error:", e);
      setSugg({ error: true });
    } finally {
      setAiLoading(false);
    }
  };

  if (!data || !day) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          fontSize: 24,
        }}
      >
        Cargando viaje...
      </div>
    );
  }

  const inp = {
    width: "100%",
    padding: "14px 16px",
    borderRadius: 12,
    border: "2px solid #ddd",
    fontSize: 18,
    boxSizing: "border-box",
    outline: "none",
    fontFamily: "inherit",
  };

  const dayNumMatch = day.date.match(/\b(\d{1,2})\b/);
  const dayNum = dayNumMatch ? parseInt(dayNumMatch[1], 10) : null;
  const cityKey = day.city.includes("New York") ? "New York" : "Boston";
  const todayWeather = dayNum ? weatherData[`${cityKey}-${dayNum}`] : null;

  return (
    <div
      style={{
        fontFamily: "'Segoe UI',sans-serif",
        background: "#f4f7f9",
        minHeight: "100vh",
        maxWidth: 550,
        margin: "0 auto",
        paddingBottom: 80,
      }}
    >
      <div
        className="app-header-nav"
        style={{
          background: "linear-gradient(135deg,#111827,#1f2937)",
          padding: "26px 20px 20px",
          color: "white",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>
              🇺🇸 Boston & NY
            </h1>
            <p style={{ margin: "6px 0 0", opacity: 0.8, fontSize: 16 }}>
              3–11 Abril · Viaje David, Sandra, Inés y Álvaro
            </p>
          </div>

          <div style={{ textAlign: "right" }}>
            <div
              style={{
                background:
                  saveStatus === "saved"
                    ? "#27ae60"
                    : saveStatus === "saving"
                    ? "#e67e22"
                    : saveStatus === "cloud"
                    ? "#1a73e8"
                    : "rgba(255,255,255,0.15)",
                padding: "6px 14px",
                borderRadius: 12,
                fontSize: 16,
                fontWeight: 700,
                transition: "background 0.3s",
                marginBottom: 8,
              }}
            >
              {saveStatus === "saving"
                ? "💾..."
                : saveStatus === "saved"
                ? "✅ Guardado"
                : saveStatus === "cloud"
                ? "☁️ En vivo"
                : saveStatus === "err"
                ? "❌ Error"
                : "..."}
            </div>

            <div style={{ fontSize: 18, fontWeight: 800 }}>
              💰 {total.toFixed(0)}€
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: 20,
            overflowX: "auto",
            paddingBottom: 6,
          }}
        >
          {[
            ["plan", "📅 Plan"],
            ["logbook", "📖 Bitácora"],
            ["checklist", "🎒 Maleta"],
            ["budget", "💰 Gastos"],
            ["suggestions", "✨ Ideas"],
            ["summary", "🏁 Resumen"],
          ].map(([v, l]) => (
            <button
              key={v}
              onClick={() => {
                setView(v);
                if (v === "suggestions" && !sugg) fetchSugg();
              }}
              style={{
                flexShrink: 0,
                background: view === v ? "white" : "rgba(255,255,255,0.15)",
                color: view === v ? "#111827" : "white",
                border: "none",
                borderRadius: 12,
                padding: "10px 16px",
                fontSize: 16,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {view !== "checklist" && view !== "budget" && view !== "summary" && (
        <div
          className="day-selector-nav"
          style={{
            display: "flex",
            gap: 10,
            overflowX: "auto",
            padding: "16px 20px",
            background: "white",
            boxShadow: "0 3px 10px rgba(0,0,0,0.06)",
          }}
        >
          {days.map((d, i) => {
            const dCol = getDayColor(d.city, d.label);
            return (
              <button
                key={i}
                onClick={() => {
                  setSel(i);
                  setExp(null);
                  setSugg(null);
                }}
                style={{
                  flexShrink: 0,
                  background: sel === i ? dCol : "#f5f7fa",
                  color: sel === i ? "white" : "#4b5563",
                  border: "none",
                  borderRadius: 16,
                  padding: "10px 16px",
                  cursor: "pointer",
                  fontSize: 15,
                  fontWeight: 800,
                  boxShadow: sel === i ? `0 4px 12px ${dCol}55` : "none",
                }}
              >
                <div style={{ fontSize: 20, marginBottom: 4 }}>{d.emoji}</div>
                <div>{d.date.split(" ").slice(1, 3).join(" ")}</div>
              </button>
            );
          })}
        </div>
      )}

      <div style={{ padding: "20px 20px 0" }}>
        {view === "plan" && (
          <>
            <div id="export-area" style={{ background: "#f4f7f9", paddingBottom: 10 }}>
              <div
                style={{
                  background: `linear-gradient(135deg,${col},${col}dd)`,
                  borderRadius: 20,
                  padding: "24px",
                  color: "white",
                  marginBottom: 20,
                  boxShadow: `0 6px 16px ${col}44`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 40, marginBottom: 8 }}>{day.emoji}</div>
                    <h2
                      style={{
                        margin: "0 0 6px",
                        fontSize: 28,
                        fontWeight: 900,
                      }}
                    >
                      {day.date}
                    </h2>
                    <div style={{ fontSize: 18, opacity: 0.95, fontWeight: 700 }}>
                      📍 {day.city}
                    </div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div
                      onClick={handleWeatherClick}
                      title="Haz clic para ver la previsión por horas"
                      style={{
                        background: "rgba(255,255,255,0.25)",
                        borderRadius: 16,
                        padding: "12px 16px",
                        marginBottom: 12,
                        backdropFilter: "blur(5px)",
                        cursor: "pointer",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                        transition: "transform 0.2s",
                      }}
                    >
                      {todayWeather ? (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                          }}
                        >
                          <span style={{ fontSize: 28 }}>{todayWeather.icon}</span>
                          <div
                            style={{
                              fontSize: 16,
                              lineHeight: 1.3,
                              fontWeight: 800,
                              textAlign: "left",
                            }}
                          >
                            <div style={{ color: "#fef08a" }}>
                              {todayWeather.max}º Máx
                            </div>
                            <div style={{ color: "#bae6fd" }}>
                              {todayWeather.min}º Mín
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: 16, fontWeight: 700 }}>
                          Cargando clima...
                        </div>
                      )}
                    </div>

                    <div style={{ fontSize: 16, fontWeight: 800, opacity: 0.9 }}>
                      {day.activities.length} planes hoy
                    </div>
                  </div>
                </div>
              </div>

              <div
                data-html2canvas-ignore="true"
                style={{ display: "flex", gap: 10, marginBottom: 20 }}
              >
                <button
                  onClick={openSuperMap}
                  style={{
                    flex: 1,
                    background: "#111827",
                    color: "white",
                    border: "none",
                    borderRadius: 14,
                    padding: "14px",
                    fontSize: 16,
                    fontWeight: 800,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  🗺️ Súper Mapa
                </button>

                <button
                  onClick={exportDayImage}
                  style={{
                    flex: 1,
                    background: "white",
                    color: col,
                    border: `2px solid ${col}`,
                    borderRadius: 14,
                    padding: "14px",
                    fontSize: 16,
                    fontWeight: 800,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  📴 Descargar
                </button>
              </div>

              {sortedActivities.map((a, i) => {
                const ci = CAT[a.category] || CAT.activity;
                const isExp = exp === i;
                const isUploadingThis = uploading === a.originalIndex;
                const mapsUrl = a.address ? buildGoogleMapsSearchUrl(a.address) : "";

                return (
                  <div
                    key={`${a.title}-${i}`}
                    style={{
                      background: "white",
                      borderRadius: 20,
                      marginBottom: 14,
                      overflow: "hidden",
                      border: `2px solid ${
                        a.done
                          ? "#27ae60"
                          : a.confirmed
                          ? `${col}66`
                          : "transparent"
                      }`,
                      opacity: a.done ? 0.75 : 1,
                      boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 14,
                        padding: "18px 20px",
                        cursor: "pointer",
                      }}
                      onClick={() => setExp(isExp ? null : i)}
                    >
                      <span style={{ fontSize: 34, flexShrink: 0 }}>{a.icon}</span>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            flexWrap: "wrap",
                            marginBottom: 6,
                          }}
                        >
                          <span
                            style={{
                              fontWeight: 900,
                              fontSize: 20,
                              color: "#111827",
                              textDecoration: a.done ? "line-through" : "none",
                            }}
                          >
                            {a.title}
                          </span>

                          {a.confirmed && !a.done && (
                            <span
                              style={{
                                background: col,
                                color: "white",
                                fontSize: 14,
                                padding: "4px 8px",
                                borderRadius: 8,
                                fontWeight: 800,
                              }}
                            >
                              Reserva OK
                            </span>
                          )}

                          {a.photo && !isExp && <span style={{ fontSize: 16 }}>📸</span>}
                        </div>

                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            flexWrap: "wrap",
                          }}
                        >
                          <span
                            style={{
                              fontSize: 22,
                              color: "#111827",
                              fontWeight: 900,
                              background: "#f3f4f6",
                              padding: "4px 10px",
                              borderRadius: 8,
                            }}
                          >
                            ⏰ {a.time}
                          </span>

                          <span
                            style={{
                              fontSize: 16,
                              background: ci.bg,
                              color: ci.col,
                              padding: "4px 10px",
                              borderRadius: 8,
                              fontWeight: 800,
                            }}
                          >
                            {ci.label}
                          </span>
                        </div>
                      </div>

                      <div
                        data-html2canvas-ignore="true"
                        style={{
                          display: "flex",
                          gap: 4,
                          flexShrink: 0,
                          flexDirection: "column",
                          alignItems: "flex-end",
                        }}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleDone(sel, a.originalIndex);
                          }}
                          style={{
                            background: a.done ? "#27ae60" : "#f3f4f6",
                            color: a.done ? "white" : "#374151",
                            border: "none",
                            borderRadius: 10,
                            padding: "8px 14px",
                            cursor: "pointer",
                            fontSize: 15,
                            fontWeight: 800,
                          }}
                        >
                          {a.done ? "✅ Lista" : "Hecha"}
                        </button>
                      </div>
                    </div>

                    {isExp && (
                      <div
                        style={{
                          padding: "0 20px 20px 68px",
                          borderTop: "2px solid #f3f4f6",
                        }}
                      >
                        <p
                          style={{
                            fontSize: 18,
                            color: "#4b5563",
                            margin: "14px 0 12px",
                            lineHeight: 1.5,
                            fontWeight: 500,
                          }}
                        >
                          {a.desc}
                        </p>

                        <div
                          data-html2canvas-ignore="true"
                          style={{ margin: "14px 0" }}
                        >
                          {a.photo ? (
                            <div style={{ position: "relative" }}>
                              <img
                                src={a.photo}
                                alt={a.title}
                                style={{
                                  width: "100%",
                                  maxHeight: 250,
                                  objectFit: "cover",
                                  borderRadius: 14,
                                  border: "1px solid #eee",
                                }}
                              />

                              <label
                                style={{
                                  position: "absolute",
                                  bottom: 10,
                                  right: 10,
                                  background: "rgba(0,0,0,0.7)",
                                  color: "white",
                                  padding: "8px 16px",
                                  borderRadius: 10,
                                  fontSize: 15,
                                  cursor: "pointer",
                                  fontWeight: 800,
                                }}
                              >
                                {isUploadingThis ? "⏳..." : "🔄 Cambiar"}
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) =>
                                    handlePhotoUpload(e, sel, a.originalIndex)
                                  }
                                  style={{ display: "none" }}
                                  disabled={uploading !== null}
                                />
                              </label>
                            </div>
                          ) : (
                            <label
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 10,
                                background: "#f9fafb",
                                padding: "16px",
                                borderRadius: 14,
                                cursor: "pointer",
                                color: "#4b5563",
                                fontWeight: 800,
                                fontSize: 16,
                                border: "3px dashed #d1d5db",
                              }}
                            >
                              {isUploadingThis
                                ? "⏳ Subiendo..."
                                : "📸 Añadir foto de este momento"}
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) =>
                                  handlePhotoUpload(e, sel, a.originalIndex)
                                }
                                style={{ display: "none" }}
                                disabled={uploading !== null}
                              />
                            </label>
                          )}
                        </div>

                        {a.address && (
                          <div style={{ marginBottom: 14 }}>
                            <a
                              data-html2canvas-ignore="true"
                              href={mapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 8,
                                fontSize: 16,
                                color: col,
                                fontWeight: 800,
                                textDecoration: "none",
                                background: `${col}15`,
                                padding: "8px 16px",
                                borderRadius: 10,
                              }}
                            >
                              📍 Ir a: {a.address} ↗
                            </a>

                            <div style={{ display: "none" }} className="show-on-export">
                              📍 {a.address}
                            </div>
                          </div>
                        )}

                        <div
                          data-html2canvas-ignore="true"
                          style={{ display: "flex", gap: 10, marginTop: 16 }}
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openEdit(sel, a.originalIndex);
                            }}
                            style={{
                              background: "#f3f4f6",
                              border: "none",
                              borderRadius: 10,
                              padding: "10px 18px",
                              fontSize: 16,
                              fontWeight: 800,
                              color: "#374151",
                            }}
                          >
                            ✏️ Editar
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDelConfirm({ di: sel, ai: a.originalIndex });
                            }}
                            style={{
                              background: "#fee2e2",
                              color: "#b91c1c",
                              border: "none",
                              borderRadius: 10,
                              padding: "10px 18px",
                              fontSize: 16,
                              fontWeight: 800,
                            }}
                          >
                            🗑️ Borrar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              onClick={openAdd}
              style={{
                width: "100%",
                background: `${col}12`,
                border: `3px dashed ${col}66`,
                borderRadius: 20,
                padding: "20px",
                color: col,
                fontSize: 18,
                fontWeight: 900,
                cursor: "pointer",
                marginTop: 10,
              }}
            >
              ＋ Añadir nueva actividad
            </button>
          </>
        )}

        {view === "logbook" && (
          <div
            style={{
              background: "white",
              borderRadius: 20,
              padding: "24px",
              marginBottom: 16,
              boxShadow: "0 4px 12px rgba(0,0,0,0.04)",
            }}
          >
            <h3
              style={{
                margin: "0 0 20px",
                fontSize: 22,
                color: "#111827",
                fontWeight: 900,
              }}
            >
              📖 Diario del día
            </h3>

            <p
              style={{
                fontSize: 16,
                color: "#6b7280",
                marginBottom: 20,
                lineHeight: 1.5,
              }}
            >
              Escribe aquí cómo ha ido el día. Para guardar fotos, hazlo
              directamente en las actividades de la pestaña 📅 Plan.
            </p>

            <textarea
              value={day.comments || ""}
              onChange={(e) => updateComments(e.target.value)}
              placeholder="Ej: Hoy nos hemos reído mucho en el parque..."
              style={{
                ...inp,
                minHeight: 200,
                resize: "vertical",
                marginBottom: 16,
                fontSize: 18,
                lineHeight: 1.6,
              }}
            />

            <button
              onClick={() => persist(data)}
              style={{
                width: "100%",
                background: col,
                color: "white",
                border: "none",
                borderRadius: 14,
                padding: "18px",
                fontSize: 18,
                fontWeight: 900,
                cursor: "pointer",
                marginBottom: 30,
              }}
            >
              💾 Guardar notas
            </button>

            <h4
              style={{
                fontSize: 18,
                color: "#374151",
                borderBottom: "3px solid #f3f4f6",
                paddingBottom: 10,
                marginBottom: 16,
                fontWeight: 900,
              }}
            >
              🏆 Hitos completados hoy
            </h4>

            {sortedActivities
              .filter((a) => a.done)
              .map((a, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    marginBottom: 12,
                    background: "#f0fdf4",
                    padding: "14px 18px",
                    borderRadius: 14,
                    borderLeft: "6px solid #27ae60",
                  }}
                >
                  <span style={{ fontSize: 26 }}>{a.icon}</span>
                  <span
                    style={{ fontSize: 18, fontWeight: 800, color: "#166534" }}
                  >
                    {a.title}
                  </span>
                </div>
              ))}
          </div>
        )}

        {view === "checklist" && (
          <div
            style={{
              background: "white",
              borderRadius: 20,
              padding: "24px",
              marginBottom: 16,
              boxShadow: "0 4px 12px rgba(0,0,0,0.04)",
            }}
          >
            <h3
              style={{
                margin: "0 0 20px",
                fontSize: 22,
                fontWeight: 900,
                color: "#111827",
              }}
            >
              🎒 Lista de preparativos
            </h3>

            <div style={{ marginBottom: 24 }}>
              {data.checklist?.map((item, idx) => (
                <div
                  key={item.id}
                  onClick={() => toggleCheck(idx)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "16px 20px",
                    background: item.done ? "#f0fdf4" : "#f9fafb",
                    borderRadius: 14,
                    marginBottom: 10,
                    cursor: "pointer",
                    border: `2px solid ${item.done ? "#bbf7d0" : "#e5e7eb"}`,
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 10,
                      background: item.done ? "#27ae60" : "white",
                      border: `3px solid ${item.done ? "#27ae60" : "#d1d5db"}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "white",
                      fontWeight: 900,
                      fontSize: 18,
                    }}
                  >
                    {item.done && "✓"}
                  </div>

                  <span
                    style={{
                      fontSize: 18,
                      fontWeight: item.done ? 600 : 800,
                      color: item.done ? "#166534" : "#374151",
                      textDecoration: item.done ? "line-through" : "none",
                    }}
                  >
                    {item.text}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <input
                value={newCheckItem}
                onChange={(e) => setNewCheckItem(e.target.value)}
                placeholder="Ej: Comprar medicinas..."
                style={{ ...inp, flex: 1 }}
                onKeyDown={(e) => e.key === "Enter" && addCheck()}
              />

              <button
                onClick={addCheck}
                style={{
                  background: "#111827",
                  color: "white",
                  border: "none",
                  borderRadius: 14,
                  padding: "0 22px",
                  fontSize: 18,
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                Añadir
              </button>
            </div>
          </div>
        )}

        {view === "budget" && (
          <div
            style={{
              background: "white",
              borderRadius: 20,
              padding: "24px",
              marginBottom: 16,
              boxShadow: "0 4px 12px rgba(0,0,0,0.04)",
            }}
          >
            <h3
              style={{
                margin: "0 0 20px",
                fontSize: 22,
                fontWeight: 900,
                color: "#111827",
              }}
            >
              💰 Resumen de gastos
            </h3>

            {days.map((d, di) => {
              const t = d.activities.reduce(
                (s, a) => s + (parseFloat(a.budget) || 0),
                0
              );

              return (
                <div
                  key={di}
                  onClick={() => {
                    setSel(di);
                    setView("plan");
                  }}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "16px 0",
                    borderBottom: "2px solid #f3f4f6",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: 18 }}>
                    {d.emoji}{" "}
                    <span
                      style={{
                        color:
                          sel === di ? getDayColor(d.city, d.label) : "#4b5563",
                        fontWeight: sel === di ? 900 : 700,
                      }}
                    >
                      {d.date}
                    </span>
                  </div>

                  <span
                    style={{
                      fontWeight: 900,
                      color: t > 0 ? "#111827" : "#d1d5db",
                      fontSize: 18,
                    }}
                  >
                    {t > 0 ? `${t.toFixed(0)}€` : "—"}
                  </span>
                </div>
              );
            })}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "20px 0 0",
                fontWeight: 900,
                fontSize: 22,
              }}
            >
              <span>TOTAL ESTIMADO</span>
              <span style={{ color: "#1a73e8" }}>{total.toFixed(0)}€</span>
            </div>
          </div>
        )}

        {view === "suggestions" && (
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 20,
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 16,
                  color: "#4b5563",
                  fontWeight: 700,
                }}
              >
                Planes recomendados por IA
              </p>

              <button
                onClick={fetchSugg}
                disabled={aiLoading}
                style={{
                  background: col,
                  color: "white",
                  border: "none",
                  borderRadius: 12,
                  padding: "12px 20px",
                  fontSize: 16,
                  fontWeight: 900,
                  cursor: aiLoading ? "default" : "pointer",
                }}
              >
                {aiLoading ? "⏳ Pensando..." : "🔄 Buscar ideas"}
              </button>
            </div>

            {sugg?.error && (
              <div
                style={{
                  background: "#fff7ed",
                  color: "#9a3412",
                  border: "1px solid #fdba74",
                  borderRadius: 14,
                  padding: 16,
                  marginBottom: 16,
                  fontWeight: 700,
                }}
              >
                No se pudieron cargar sugerencias ahora mismo.
              </div>
            )}

            {sugg?.activities?.map((a, i) => (
              <SuggCard
                key={i}
                act={a}
                col={col}
                onAdd={() => {
                  const nDias = structuredClone(data.dias);
                  nDias[sel].activities.push({ ...a, category: "activity", done: false });
                  persist({ ...data, dias: nDias });
                }}
              />
            ))}

            {sugg?.restaurants?.map((r, i) => (
              <SuggCard
                key={i}
                act={r}
                col={col}
                onAdd={() => {
                  const nDias = structuredClone(data.dias);
                  nDias[sel].activities.push({
                    ...r,
                    category: "restaurant",
                    done: false,
                  });
                  persist({ ...data, dias: nDias });
                }}
              />
            ))}
          </div>
        )}

        {view === "summary" && (
          <div
            style={{
              background: "white",
              borderRadius: 20,
              padding: "28px",
              marginBottom: 16,
              boxShadow: "0 4px 12px rgba(0,0,0,0.04)",
            }}
          >
            <div
              className="hide-on-print"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 28,
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: 24,
                  fontWeight: 900,
                  color: "#111827",
                }}
              >
                📖 Gran resumen
              </h3>

              <button
                onClick={() => window.print()}
                style={{
                  background: "#1a73e8",
                  color: "white",
                  border: "none",
                  borderRadius: 12,
                  padding: "14px 20px",
                  fontSize: 16,
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                🖨️ Guardar PDF
              </button>
            </div>

            <div
              className="print-only-header"
              style={{
                display: "none",
                textAlign: "center",
                marginBottom: 40,
                paddingBottom: 20,
                borderBottom: "4px solid #111827",
              }}
            >
              <h1
                style={{
                  fontSize: 36,
                  marginBottom: 12,
                  fontWeight: 900,
                  color: "#111827",
                }}
              >
                🇺🇸 Nuestro viaje a Boston & NY
              </h1>
              <p style={{ fontSize: 20, color: "#4b5563", fontWeight: 700 }}>
                Viaje David, Sandra, Inés y Álvaro • Abril 2025
              </p>
            </div>

            {days.map((d, i) => (
              <div
                key={i}
                style={{
                  marginBottom: 40,
                  paddingBottom: 30,
                  borderBottom:
                    i < days.length - 1 ? "4px double #e5e7eb" : "none",
                  pageBreakInside: "avoid",
                }}
              >
                <h4
                  style={{
                    fontSize: 26,
                    color: getDayColor(d.city, d.label),
                    marginBottom: 20,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    fontWeight: 900,
                  }}
                >
                  <span style={{ fontSize: 32 }}>{d.emoji}</span> {d.date} - {d.city}
                </h4>

                {d.comments && (
                  <div
                    style={{
                      background: "#f9fafb",
                      padding: "20px 24px",
                      borderRadius: 16,
                      borderLeft: `6px solid ${getDayColor(d.city, d.label)}`,
                      marginBottom: 28,
                    }}
                  >
                    <p
                      style={{
                        margin: 0,
                        fontSize: 18,
                        lineHeight: 1.6,
                        color: "#374151",
                        fontStyle: "italic",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      "{d.comments}"
                    </p>
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                  {d.activities.map((act, actIdx) => (
                    <div key={actIdx} style={{ pageBreakInside: "avoid" }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          marginBottom: 10,
                        }}
                      >
                        <span style={{ fontSize: 28 }}>{act.icon}</span>
                        <div>
                          <div
                            style={{
                              fontWeight: 900,
                              fontSize: 20,
                              color: "#111827",
                            }}
                          >
                            {act.title}
                          </div>

                          {act.time && (
                            <div
                              style={{
                                fontSize: 16,
                                color: "#6b7280",
                                fontWeight: 800,
                              }}
                            >
                              {act.time}
                            </div>
                          )}
                        </div>
                      </div>

                      {act.photo && (
                        <div style={{ marginTop: 14 }}>
                          <img
                            src={act.photo}
                            alt={act.title}
                            style={{
                              width: "100%",
                              maxHeight: 400,
                              objectFit: "cover",
                              borderRadius: 16,
                              boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
                            }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div
              style={{
                marginTop: 40,
                textAlign: "center",
                padding: 28,
                background: "#f0fdf4",
                borderRadius: 20,
                border: "3px solid #bbf7d0",
                pageBreakInside: "avoid",
              }}
            >
              <h3
                style={{
                  margin: 0,
                  color: "#166534",
                  fontSize: 26,
                  fontWeight: 900,
                }}
              >
                💰 Presupuesto final del viaje: {total.toFixed(0)}€
              </h3>
            </div>
          </div>
        )}
      </div>

      {editModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            zIndex: 100,
            display: "flex",
            alignItems: "flex-end",
          }}
          onClick={() => setEditModal(null)}
        >
          <div
            style={{
              background: "white",
              borderRadius: "28px 28px 0 0",
              padding: "28px 24px",
              width: "100%",
              maxWidth: 550,
              margin: "0 auto",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 24,
              }}
            >
              <h3 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>
                {editModal.ai === -1 ? "➕ Añadir actividad" : "✏️ Editar actividad"}
              </h3>

              <button
                onClick={() => setEditModal(null)}
                style={{
                  background: "#f3f4f6",
                  border: "none",
                  borderRadius: 12,
                  padding: "10px 16px",
                  fontSize: 18,
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: 20 }}>
              <button
                onClick={() => setIconPicker(!iconPicker)}
                style={{
                  fontSize: 36,
                  background: "#f9fafb",
                  border: "3px solid #e5e7eb",
                  borderRadius: 16,
                  padding: "10px 22px",
                  cursor: "pointer",
                }}
              >
                {form.icon || "🎯"}
              </button>

              {iconPicker && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                    marginTop: 14,
                    background: "#f9fafb",
                    borderRadius: 16,
                    padding: 16,
                    maxHeight: 200,
                    overflowY: "auto",
                  }}
                >
                  {ICONS.map((ic) => (
                    <button
                      key={ic}
                      onClick={() => {
                        setForm((f) => ({ ...f, icon: ic }));
                        setIconPicker(false);
                      }}
                      style={{
                        background: form.icon === ic ? "#1a73e8" : "white",
                        border: "none",
                        borderRadius: 10,
                        padding: "8px",
                        cursor: "pointer",
                        fontSize: 26,
                      }}
                    >
                      {ic}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
                marginBottom: 16,
              }}
            >
              <div>
                <label
                  style={{
                    fontSize: 15,
                    color: "#6b7280",
                    fontWeight: 800,
                    marginBottom: 6,
                    display: "block",
                  }}
                >
                  Título *
                </label>

                <input
                  value={form.title || ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, title: e.target.value }))
                  }
                  style={inp}
                />
              </div>

              <div>
                <label
                  style={{
                    fontSize: 15,
                    color: "#6b7280",
                    fontWeight: 800,
                    marginBottom: 6,
                    display: "block",
                  }}
                >
                  Hora
                </label>

                <input
                  value={form.time || ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, time: e.target.value }))
                  }
                  style={inp}
                  placeholder="10:00, Mañana..."
                />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  fontSize: 15,
                  color: "#6b7280",
                  fontWeight: 800,
                  marginBottom: 6,
                  display: "block",
                }}
              >
                Descripción
              </label>

              <textarea
                value={form.desc || ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, desc: e.target.value }))
                }
                style={{ ...inp, minHeight: 100, resize: "vertical" }}
              />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
                marginBottom: 16,
              }}
            >
              <div>
                <label
                  style={{
                    fontSize: 15,
                    color: "#6b7280",
                    fontWeight: 800,
                    marginBottom: 6,
                    display: "block",
                  }}
                >
                  Presupuesto (€)
                </label>

                <input
                  type="number"
                  value={form.budget ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, budget: e.target.value }))
                  }
                  style={inp}
                />
              </div>

              <div>
                <label
                  style={{
                    fontSize: 15,
                    color: "#6b7280",
                    fontWeight: 800,
                    marginBottom: 6,
                    display: "block",
                  }}
                >
                  Categoría
                </label>

                <select
                  value={form.category || "activity"}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, category: e.target.value }))
                  }
                  style={{ ...inp, background: "white" }}
                >
                  <option value="activity">🎯 Actividad</option>
                  <option value="restaurant">🍽️ Restaurante</option>
                  <option value="hotel">🏨 Alojamiento</option>
                  <option value="transport">🚗 Transporte</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  fontSize: 15,
                  color: "#6b7280",
                  fontWeight: 800,
                  marginBottom: 6,
                  display: "block",
                }}
              >
                Dirección (se abrirá en Maps)
              </label>

              <input
                value={form.address || ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, address: e.target.value }))
                }
                style={inp}
                placeholder="Dirección exacta o lugar"
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label
                style={{
                  fontSize: 15,
                  color: "#6b7280",
                  fontWeight: 800,
                  marginBottom: 6,
                  display: "block",
                }}
              >
                Enlace externo opcional
              </label>

              <input
                value={form.link || ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, link: e.target.value }))
                }
                style={inp}
                placeholder="https://..."
              />
            </div>

            <button
              onClick={saveAct}
              style={{
                width: "100%",
                background: "#1a73e8",
                color: "white",
                border: "none",
                borderRadius: 16,
                padding: "18px",
                fontSize: 18,
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              Guardar cambios
            </button>
          </div>
        </div>
      )}

      {delConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={() => setDelConfirm(null)}
        >
          <div
            style={{
              background: "white",
              borderRadius: 24,
              padding: "28px",
              maxWidth: 350,
              width: "100%",
              textAlign: "center",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 12px", fontSize: 22, fontWeight: 900 }}>
              ¿Eliminar actividad?
            </h3>

            <p style={{ color: "#4b5563", fontSize: 16, margin: "0 0 24px" }}>
              Esto no se puede deshacer.
            </p>

            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={() => setDelConfirm(null)}
                style={{
                  flex: 1,
                  background: "#f3f4f6",
                  color: "#374151",
                  border: "none",
                  borderRadius: 14,
                  padding: "14px",
                  cursor: "pointer",
                  fontSize: 16,
                  fontWeight: 900,
                }}
              >
                Cancelar
              </button>

              <button
                onClick={() => delAct(delConfirm.di, delConfirm.ai)}
                style={{
                  flex: 1,
                  background: "#ef4444",
                  color: "white",
                  border: "none",
                  borderRadius: 14,
                  padding: "14px",
                  cursor: "pointer",
                  fontSize: 16,
                  fontWeight: 900,
                }}
              >
                Sí, borrar
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          body {
            background: white !important;
            margin: 0;
            padding: 0;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .hide-on-print,
          .app-header-nav,
          .day-selector-nav {
            display: none !important;
          }

          .print-only-header {
            display: block !important;
          }

          .show-on-export {
            display: block !important;
            color: #4b5563;
            font-size: 15px;
            font-weight: 800;
            margin-top: 6px;
          }

          @page {
            margin: 1.5cm;
          }
        }
      `}</style>
    </div>
  );
}
