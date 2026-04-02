import { useState, useEffect } from "react";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, doc, onSnapshot, setDoc } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import html2canvas from "html2canvas";

// 👇 TUS DATOS DE FIREBASE CONFIGURADOS 👇
const firebaseConfig = {
  apiKey: "AIzaSyDfjxzkymYvxK6Dtuu_OTAHB3Cj3Z8iRlk",
  authDomain: "viaje-usa-54b2f.firebaseapp.com",
  projectId: "viaje-usa-54b2f",
  storageBucket: "viaje-usa-54b2f.firebasestorage.app",
  messagingSenderId: "461014107533",
  appId: "1:461014107533:web:71a90887305c64d425e9c4",
  measurementId: "G-DBRNDPWLPB",
};

// 👇 TU CLAVE DE GEMINI 👇
const AI_API_KEY = "AIzaSyC9k6-Lf7lVZujVSYXNYBhGoApp-gyf-sQ";

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const storage = getStorage(app);
const TRIP_DOC = doc(db, "viajes", "boston_ny_2025");

const ICONS = [
  "🏨",
  "✈️",
  "🚗",
  "🗺️",
  "🍽️",
  "🍕",
  "🦞",
  "🏀",
  "🗽",
  "🔭",
  "🎓",
  "🌳",
  "🌊",
  "🎭",
  "🛒",
  "🌅",
  "🏛️",
  "🚶",
  "🛍️",
  "🎨",
  "🌃",
  "🌉",
  "🏙️",
  "📸",
  "🥩",
  "☕",
  "🎵",
  "🎬",
  "🏆",
  "🚇",
  "🎉",
  "🌆",
  "🍣",
  "🎪",
  "⛵",
  "🏟️",
  "🌇",
  "🍜",
  "🥗",
  "🖼️",
  "🎠",
  "🍦",
  "🎡",
  "🧁",
  "🥐",
  "⚾",
  "🦁",
  "🍺",
  "🚢",
  "🎻",
  "🌮",
  "🔬",
  "🏡",
  "🌉",
  "🎯",
];

const CAT = {
  activity: { label: "Actividad", bg: "#e8f4fd", col: "#1a73e8" },
  restaurant: { label: "Restaurante", bg: "#fef6e4", col: "#e67e22" },
  hotel: { label: "Alojamiento", bg: "#e8f8f5", col: "#27ae60" },
  transport: { label: "Transporte", bg: "#fde8e8", col: "#e74c3c" },
};

const parseTime = (t) => {
  if (!t) return 9999;
  const str = t.toLowerCase();
  if (str.includes("mañana")) return 800;
  if (str.includes("mediodía") || str.includes("mediodia")) return 1300;
  if (str.includes("tarde")) return 1700;
  if (str.includes("noche")) return 2000;
  const match = str.match(/(\d{1,2})[:h\.]?(\d{2})?/);
  if (match) {
    let h = parseInt(match[1]);
    let m = parseInt(match[2] || 0);
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
        address: "77 Massachusetts Ave, Cambridge",
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
        address: "Manhattan, New York",
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
        address: "Times Square, New York",
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
        address: "Battery Park, New York",
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
        address: "Brooklyn Bridge, New York",
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
        address: "The Bronx, New York",
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
        address: "Central Park, New York",
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
        address: "45 E 42nd St, New York",
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
        address: "Central Park, New York",
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
        address: "1000 Fifth Ave, New York",
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
        address: "Times Square, New York",
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
        address: "The High Line, New York",
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
        address: "75 9th Ave, New York",
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
        address: "180 Greenwich St, New York",
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
        address: "Manhattan, New York",
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
        address: "I-95 North",
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
        address: "Boston Logan International Airport",
        category: "transport",
      },
    ],
  },
];

function SuggCard({ act, col, onAdd }) {
  const [added, setAdded] = useState(false);
  return (
    <div
      style={{
        background: "white",
        borderRadius: 16,
        marginBottom: 10,
        padding: 16,
        border: `1.5px solid #eee`,
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
            {act.budget > 0 && (
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
  const [aiError, setAiError] = useState(null);
  const [aiStatus, setAiStatus] = useState(""); // "", "connecting", "retrying", "parsing"
  const [suggCache, setSuggCache] = useState({}); // cache por día
  const [fetchingRef] = useState({ current: false }); // evitar llamadas duplicadas
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
          setData(fetchedData);
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
        const process = (d, prefix) =>
          d.daily.time.forEach((dt, i) => {
            wMap[`${prefix}-${parseInt(dt.split("-")[2], 10)}`] = {
              icon: WMO[d.daily.weather_code[i]] || "🌤️",
              max: Math.round(d.daily.temperature_2m_max[i]),
              min: Math.round(d.daily.temperature_2m_min[i]),
            };
          });
        process(dataB, "Boston");
        process(dataNY, "New York");
        setWeatherData(wMap);
      } catch (e) {}
    };
    fetchWeather();
  }, []);

  const persist = async (newData) => {
    setData(newData);
    setSaveStatus("saving");
    try {
      await setDoc(TRIP_DOC, newData);
      setSaveStatus("saved");
    } catch {
      setSaveStatus("err");
    }
    setTimeout(() => setSaveStatus(saveStatus === "err" ? "" : "cloud"), 2200);
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
      const a = [...d.activities];
      if (editModal.ai === -1) a.push({ ...form, done: false });
      else a[editModal.ai] = form;
      return { ...d, activities: a };
    });
    persist({ ...data, dias: nDias });
    setEditModal(null);
  };

  const toggleDone = (di, ai) => {
    const nDias = [...data.dias];
    nDias[di].activities[ai].done = !nDias[di].activities[ai].done;
    persist({ ...data, dias: nDias });
  };

  const updateComments = (text) => {
    const nDias = [...data.dias];
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
    const nCheck = [...data.checklist];
    nCheck[idx].done = !nCheck[idx].done;
    persist({ ...data, checklist: nCheck });
  };

  const addCheck = () => {
    if (!newCheckItem.trim()) return;
    const nCheck = data.checklist ? [...data.checklist] : [];
    nCheck.push({ id: Date.now(), text: newCheckItem, done: false });
    persist({ ...data, checklist: nCheck });
    setNewCheckItem("");
  };

  const handlePhotoUpload = async (e, di, ai) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(ai);
    try {
      const fileRef = ref(storage, `foto_actividad_${di}_${ai}_${Date.now()}`);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);
      const nDias = [...data.dias];
      nDias[di].activities[ai].photo = url;
      await persist({ ...data, dias: nDias });
    } catch (err) {
      alert(
        "Error al subir foto. Asegúrate de haber abierto las reglas de Firebase Storage."
      );
    }
    setUploading(null);
  };

  const openSuperMap = () => {
    const acts = data.dias[sel].activities.filter((a) => a.address);
    if (acts.length === 0)
      return alert("No hay actividades con dirección guardada hoy.");
    if (acts.length === 1) {
      const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        acts[0].address
      )}`;
      return window.open(url, "_blank", "noopener,noreferrer");
    }
    const origin = encodeURIComponent(acts[0].address);
    const dest = encodeURIComponent(acts[acts.length - 1].address);
    const waypoints = acts
      .slice(1, -1)
      .map((a) => encodeURIComponent(a.address))
      .join("%7C");
    const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&waypoints=${waypoints}&travelmode=walking`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleWeatherClick = () => {
    const now = new Date();
    const currTime = now.getHours() * 100 + now.getMinutes();
    let targetAct = sortedActivities.find((a) => parseTime(a.time) >= currTime);
    if (!targetAct) targetAct = sortedActivities[0];
    const loc = targetAct?.address || targetAct?.title || day.city;
    const url = `https://www.google.com/search?q=el+tiempo+por+horas+en+${encodeURIComponent(
      loc
    )}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const exportDayImage = () => {
    const el = document.getElementById("export-area");
    if (!el) return;
    html2canvas(el, { scale: 2, useCORS: true }).then((canvas) => {
      const link = document.createElement("a");
      link.download = `Plan_${data.dias[sel].date.replace(/ /g, "_")}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    });
  };

  // ✅ GEMINI API: retry con backoff exponencial + timeout + cache + error UI
  const callGeminiWithRetry = async (prompt, maxRetries = 3) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${AI_API_KEY}`;
    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    });

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // AbortController con timeout de 20 segundos
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      try {
        if (attempt > 0) {
          const waitMs = Math.min(1000 * Math.pow(2, attempt), 8000) + Math.random() * 1000;
          setAiStatus(`⏳ Reintentando (${attempt}/${maxRetries})... espera ${Math.ceil(waitMs / 1000)}s`);
          await new Promise((r) => setTimeout(r, waitMs));
        } else {
          setAiStatus("🔗 Conectando con Gemini...");
        }

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Si es 429 (rate limit) y quedan reintentos, esperar y reintentar
        if (res.status === 429 && attempt < maxRetries) {
          console.warn(`Gemini 429 rate limit, reintento ${attempt + 1}/${maxRetries}`);
          continue;
        }

        // Errores HTTP específicos
        if (!res.ok) {
          const errorBody = await res.text().catch(() => "");
          if (res.status === 429) {
            throw new Error("RATE_LIMIT");
          } else if (res.status === 403) {
            throw new Error("API_KEY_INVALID");
          } else if (res.status === 400) {
            throw new Error("BAD_REQUEST");
          } else if (res.status >= 500) {
            if (attempt < maxRetries) continue; // reintentar errores del servidor
            throw new Error("SERVER_ERROR");
          } else {
            throw new Error(`HTTP_${res.status}`);
          }
        }

        setAiStatus("🧠 Procesando respuesta...");
        const jsonData = await res.json();

        if (jsonData.error) {
          throw new Error(jsonData.error.message || "GEMINI_ERROR");
        }

        // Verificar que la respuesta tenga la estructura esperada
        if (!jsonData.candidates?.[0]?.content?.parts?.[0]?.text) {
          if (jsonData.candidates?.[0]?.finishReason === "SAFETY") {
            throw new Error("SAFETY_BLOCK");
          }
          throw new Error("EMPTY_RESPONSE");
        }

        return jsonData.candidates[0].content.parts[0].text;
      } catch (err) {
        clearTimeout(timeoutId);

        if (err.name === "AbortError") {
          if (attempt < maxRetries) continue;
          throw new Error("TIMEOUT");
        }

        // Si no es un error reintentable, lanzar directamente
        if (
          err.message === "RATE_LIMIT" ||
          err.message === "API_KEY_INVALID" ||
          err.message === "BAD_REQUEST" ||
          err.message === "SAFETY_BLOCK" ||
          err.message === "EMPTY_RESPONSE"
        ) {
          throw err;
        }

        // Error de red: reintentar si quedan intentos
        if (attempt < maxRetries) {
          console.warn(`Error de red, reintento ${attempt + 1}:`, err.message);
          continue;
        }
        throw new Error("NETWORK_ERROR");
      }
    }
    throw new Error("MAX_RETRIES");
  };

  const getErrorMessage = (code) => {
    const messages = {
      RATE_LIMIT: {
        title: "⏱️ Demasiadas solicitudes",
        desc: "La API de Gemini tiene un límite de peticiones. Espera 30 segundos y pulsa \"Nuevas ideas\".",
        canRetry: true,
      },
      API_KEY_INVALID: {
        title: "🔑 Clave API no válida",
        desc: "La clave de Gemini ha caducado o es incorrecta. Contacta con el desarrollador.",
        canRetry: false,
      },
      BAD_REQUEST: {
        title: "❌ Error en la petición",
        desc: "Hubo un problema con el formato de la solicitud. Inténtalo de nuevo.",
        canRetry: true,
      },
      SERVER_ERROR: {
        title: "🔧 Error del servidor de Google",
        desc: "Los servidores de Gemini están saturados. Inténtalo en unos minutos.",
        canRetry: true,
      },
      TIMEOUT: {
        title: "⏰ Tiempo de espera agotado",
        desc: "La conexión tardó demasiado. Revisa tu conexión a internet e inténtalo de nuevo.",
        canRetry: true,
      },
      NETWORK_ERROR: {
        title: "📡 Error de conexión",
        desc: "No se pudo conectar con Google. Revisa tu conexión a internet.",
        canRetry: true,
      },
      SAFETY_BLOCK: {
        title: "🛡️ Respuesta bloqueada",
        desc: "Google filtró la respuesta por seguridad. Inténtalo de nuevo.",
        canRetry: true,
      },
      EMPTY_RESPONSE: {
        title: "📭 Respuesta vacía",
        desc: "Gemini no generó sugerencias. Inténtalo de nuevo.",
        canRetry: true,
      },
      PARSE_ERROR: {
        title: "🔄 Error al leer sugerencias",
        desc: "La IA devolvió un formato inesperado. Pulsa \"Nuevas ideas\" para reintentar.",
        canRetry: true,
      },
      MAX_RETRIES: {
        title: "🔄 Reintentos agotados",
        desc: "Se intentó varias veces sin éxito. Espera un momento y vuelve a intentarlo.",
        canRetry: true,
      },
    };
    return messages[code] || {
      title: "⚠️ Error inesperado",
      desc: `Algo salió mal (${code}). Inténtalo de nuevo.`,
      canRetry: true,
    };
  };

  const fetchSugg = async (forceRefresh = false) => {
    if (!AI_API_KEY) {
      setAiError(getErrorMessage("API_KEY_INVALID"));
      return;
    }

    // Evitar llamadas duplicatas concurrentes
    if (fetchingRef.current) {
      console.log("fetchSugg: ya hay una petición en curso, ignorando");
      return;
    }

    // Comprobar caché (a menos que se fuerce refresh)
    const cacheKey = `day_${sel}`;
    if (!forceRefresh && suggCache[cacheKey]) {
      console.log("fetchSugg: usando caché para día", sel);
      setSugg(suggCache[cacheKey]);
      setAiError(null);
      return;
    }

    fetchingRef.current = true;
    setAiLoading(true);
    setSugg(null);
    setAiError(null);
    setAiStatus("🔗 Conectando con Gemini...");

    const d = data.dias[sel];
    const list = d.activities.map((a) => `${a.time}: ${a.title}`).join("; ");

    try {
      const prompt = `Viaje familiar (2 adultos, adolescente de 16 y niño de 9) a ${d.city} el ${d.date}. Agenda actual: ${list || "nada"}. Sugiere 3 actividades y 2 restaurantes familiares económicos que NO estén ya en la agenda. Responde SOLO con JSON puro sin markdown ni backticks: {"activities":[{"icon":"emoji","title":"nombre","time":"hora sugerida","desc":"descripción breve de 1 línea","budget":numero_en_euros,"address":"dirección real","link":""}],"restaurants":[{"icon":"🍽️","title":"nombre real","time":"hora sugerida","desc":"descripción breve","budget":numero_en_euros,"address":"dirección real","link":""}]}`;

      const rawText = await callGeminiWithRetry(prompt);

      setAiStatus("🧩 Interpretando sugerencias...");

      // Limpieza robusta del texto de respuesta
      let cleaned = rawText
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/g, "")
        .replace(/^\s*[\r\n]+/, "")
        .trim();

      // Intentar extraer JSON si hay texto antes/después
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleaned = jsonMatch[0];
      }

      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch (parseErr) {
        console.error("Error parsing JSON de Gemini:", parseErr, "\nTexto recibido:", rawText.substring(0, 500));
        throw new Error("PARSE_ERROR");
      }

      // Validar estructura mínima
      if (!parsed.activities && !parsed.restaurants) {
        console.error("Estructura inesperada de Gemini:", parsed);
        throw new Error("PARSE_ERROR");
      }

      // Normalizar: asegurar que activities y restaurants sean arrays
      parsed.activities = Array.isArray(parsed.activities) ? parsed.activities : [];
      parsed.restaurants = Array.isArray(parsed.restaurants) ? parsed.restaurants : [];

      // Limpiar valores de budget por si vienen como string
      [...parsed.activities, ...parsed.restaurants].forEach((item) => {
        item.budget = parseFloat(item.budget) || 0;
        item.icon = item.icon || "🎯";
        item.link = item.link || "";
        item.address = item.address || "";
      });

      setSugg(parsed);
      setAiError(null);

      // Guardar en caché
      setSuggCache((prev) => ({ ...prev, [cacheKey]: parsed }));
    } catch (err) {
      console.error("Error Gemini completo:", err);
      const errorInfo = getErrorMessage(err.message);
      setAiError(errorInfo);
      setSugg(null);
    } finally {
      setAiLoading(false);
      setAiStatus("");
      fetchingRef.current = false;
    }
  };

  if (!data)
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
        Cargando Viaje...
      </div>
    );

  const days = data.dias;
  const day = days[sel];
  const col = getDayColor(day.city, day.label);
  const total = days.reduce(
    (s, d) =>
      s + d.activities.reduce((ss, a) => ss + (parseFloat(a.budget) || 0), 0),
    0
  );
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

  const dayNum = parseInt(day.date.replace(/\D/g, ""), 10);
  const cityKey = day.city.includes("New York") ? "New York" : "Boston";
  const todayWeather = weatherData[`${cityKey}-${dayNum}`];
  const sortedActivities = day.activities
    .map((act, index) => ({ ...act, originalIndex: index }))
    .sort((a, b) => parseTime(a.time) - parseTime(b.time));

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
      {/* HEADER PRINCIPAL */}
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
                if (v === "suggestions") fetchSugg(); // usa caché si existe
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

      {/* SELECTOR DE DÍAS */}
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
                  // No resetear sugg: el caché lo maneja al cambiar de vista
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
        {/* === VISTA: PLAN === */}
        {view === "plan" && (
          <>
            <div
              id="export-area"
              style={{ background: "#f4f7f9", paddingBottom: 10 }}
            >
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
                    <div style={{ fontSize: 40, marginBottom: 8 }}>
                      {day.emoji}
                    </div>
                    <h2
                      style={{
                        margin: "0 0 6px",
                        fontSize: 28,
                        fontWeight: 900,
                      }}
                    >
                      {day.date}
                    </h2>
                    <div
                      style={{ fontSize: 18, opacity: 0.95, fontWeight: 700 }}
                    >
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
                          <span style={{ fontSize: 28 }}>
                            {todayWeather.icon}
                          </span>
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
                    <div
                      style={{ fontSize: 16, fontWeight: 800, opacity: 0.9 }}
                    >
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
                return (
                  <div
                    key={i}
                    style={{
                      background: "white",
                      borderRadius: 20,
                      marginBottom: 14,
                      overflow: "hidden",
                      border: `2px solid ${
                        a.done
                          ? "#27ae60"
                          : a.confirmed
                          ? col + "66"
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
                      <span style={{ fontSize: 34, flexShrink: 0 }}>
                        {a.icon}
                      </span>
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
                          {a.photo && !isExp && (
                            <span style={{ fontSize: 16 }}>📸</span>
                          )}
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

                    {(isExp || window.html2canvas) && (
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
                                border: `3px dashed #d1d5db`,
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
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                                a.address
                              )}`}
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
                            <div
                              style={{ display: "none" }}
                              className="show-on-export"
                            >
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

        {/* === VISTA: BITÁCORA === */}
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
              🏆 Hitos Completados Hoy
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

        {/* === VISTA: MALETA === */}
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
              🎒 Lista de Preparativos
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

        {/* === VISTA: PRESUPUESTO === */}
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

        {/* === VISTA: SUGERENCIAS === */}
        {view === "suggestions" && (
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <div>
                <h3 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 900, color: "#111827" }}>
                  ✨ Ideas para {day.city}
                </h3>
                <p style={{ margin: 0, fontSize: 14, color: "#6b7280", fontWeight: 600 }}>
                  Sugerencias personalizadas por IA
                </p>
              </div>
              <button
                onClick={() => fetchSugg(true)}
                disabled={aiLoading}
                style={{
                  background: aiLoading ? "#9ca3af" : col,
                  color: "white",
                  border: "none",
                  borderRadius: 14,
                  padding: "12px 20px",
                  fontSize: 15,
                  fontWeight: 900,
                  cursor: aiLoading ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  opacity: aiLoading ? 0.7 : 1,
                  transition: "all 0.2s",
                }}
              >
                {aiLoading ? "⏳ Pensando..." : "🔄 Nuevas ideas"}
              </button>
            </div>

            {/* Estado de carga con animación */}
            {aiLoading && (
              <div
                style={{
                  background: "linear-gradient(135deg, #eff6ff, #f0f9ff)",
                  borderRadius: 16,
                  padding: "24px",
                  marginBottom: 16,
                  marginTop: 14,
                  textAlign: "center",
                  border: "2px solid #bfdbfe",
                }}
              >
                <div style={{ fontSize: 40, marginBottom: 12, animation: "pulse 1.5s infinite" }}>🧠</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: "#1e40af", marginBottom: 8 }}>
                  Generando ideas...
                </div>
                <div style={{ fontSize: 15, color: "#3b82f6", fontWeight: 600 }}>
                  {aiStatus || "Conectando con Gemini..."}
                </div>
                <div
                  style={{
                    marginTop: 14,
                    height: 4,
                    background: "#dbeafe",
                    borderRadius: 4,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      background: "linear-gradient(90deg, #3b82f6, #1d4ed8)",
                      borderRadius: 4,
                      animation: "loading 2s ease-in-out infinite",
                    }}
                  />
                </div>
              </div>
            )}

            {/* Panel de error visual (no alert) */}
            {aiError && !aiLoading && (
              <div
                style={{
                  background: aiError.canRetry ? "#fef2f2" : "#fef9ee",
                  borderRadius: 16,
                  padding: "20px 24px",
                  marginBottom: 16,
                  marginTop: 14,
                  border: `2px solid ${aiError.canRetry ? "#fecaca" : "#fde68a"}`,
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 900, color: aiError.canRetry ? "#991b1b" : "#92400e", marginBottom: 8 }}>
                  {aiError.title}
                </div>
                <p style={{ margin: "0 0 14px", fontSize: 15, color: "#6b7280", lineHeight: 1.5 }}>
                  {aiError.desc}
                </p>
                {aiError.canRetry && (
                  <button
                    onClick={() => fetchSugg(true)}
                    style={{
                      background: col,
                      color: "white",
                      border: "none",
                      borderRadius: 12,
                      padding: "12px 24px",
                      fontSize: 16,
                      fontWeight: 900,
                      cursor: "pointer",
                      width: "100%",
                    }}
                  >
                    🔄 Reintentar
                  </button>
                )}
              </div>
            )}

            {/* Sugerencias de actividades */}
            {sugg?.activities?.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <h4 style={{ margin: "0 0 12px", fontSize: 17, fontWeight: 900, color: "#374151" }}>
                  🎯 Actividades sugeridas
                </h4>
                {sugg.activities.map((a, i) => (
                  <SuggCard
                    key={`act-${i}`}
                    act={a}
                    col={col}
                    onAdd={() => {
                      const nDias = [...data.dias];
                      nDias[sel].activities.push({ ...a, category: "activity", done: false, confirmed: false });
                      persist({ ...data, dias: nDias });
                    }}
                  />
                ))}
              </div>
            )}

            {/* Sugerencias de restaurantes */}
            {sugg?.restaurants?.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <h4 style={{ margin: "0 0 12px", fontSize: 17, fontWeight: 900, color: "#374151" }}>
                  🍽️ Restaurantes sugeridos
                </h4>
                {sugg.restaurants.map((r, i) => (
                  <SuggCard
                    key={`rest-${i}`}
                    act={r}
                    col={col}
                    onAdd={() => {
                      const nDias = [...data.dias];
                      nDias[sel].activities.push({ ...r, category: "restaurant", done: false, confirmed: false });
                      persist({ ...data, dias: nDias });
                    }}
                  />
                ))}
              </div>
            )}

            {/* Estado vacío: sin sugerencias y sin error y sin carga */}
            {!sugg && !aiError && !aiLoading && (
              <div
                style={{
                  textAlign: "center",
                  padding: "40px 20px",
                  marginTop: 14,
                  background: "#f9fafb",
                  borderRadius: 20,
                  border: "2px dashed #d1d5db",
                }}
              >
                <div style={{ fontSize: 48, marginBottom: 12 }}>✨</div>
                <p style={{ fontSize: 17, fontWeight: 800, color: "#374151", margin: "0 0 8px" }}>
                  ¿Necesitas inspiración?
                </p>
                <p style={{ fontSize: 15, color: "#6b7280", margin: "0 0 20px" }}>
                  Pulsa "Nuevas ideas" para que la IA te sugiera planes
                </p>
                <button
                  onClick={() => fetchSugg(true)}
                  style={{
                    background: col,
                    color: "white",
                    border: "none",
                    borderRadius: 14,
                    padding: "14px 32px",
                    fontSize: 17,
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  ✨ Generar ideas para {day.city}
                </button>
              </div>
            )}
          </div>
        )}

        {/* === VISTA: RESUMEN FINAL === */}
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
                📖 Gran Resumen
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
                🇺🇸 Nuestro Viaje a Boston & NY
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
                  <span style={{ fontSize: 32 }}>{d.emoji}</span> {d.date} -{" "}
                  {d.city}
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
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 24 }}
                >
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
                💰 Presupuesto Final del Viaje: {total.toFixed(0)}€
              </h3>
            </div>
          </div>
        )}
      </div>

      {/* MODALES EDITAR Y AÑADIR */}
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
                {editModal.ai === -1
                  ? "➕ Añadir actividad"
                  : "✏️ Editar actividad"}
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
                  value={form.budget || ""}
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
                Dirección (Se abrirá en Maps)
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
              Guardar Cambios
            </button>
          </div>
        </div>
      )}

      {/* CONFIRMAR BORRADO */}
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
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.15); opacity: 0.8; }
        }
        @keyframes loading {
          0% { width: 0%; margin-left: 0; }
          50% { width: 60%; margin-left: 20%; }
          100% { width: 0%; margin-left: 100%; }
        }
        @media print {
          body { background: white !important; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .hide-on-print, .app-header-nav, .day-selector-nav { display: none !important; }
          .print-only-header { display: block !important; }
          .show-on-export { display: block !important; color: #4b5563; font-size: 15px; font-weight: 800; margin-top: 6px; }
          @page { margin: 1.5cm; }
        }
      `}</style>
    </div>
  );
}
