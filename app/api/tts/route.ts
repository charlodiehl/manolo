const XI_API_KEY  = process.env.ELEVENLABS_API_KEY  ?? "";
const XI_VOICE_ID = process.env.ELEVENLABS_VOICE_ID ?? "KbF1j9Cpz7K9isgR5uF9";

/* ── Número entero → palabras en español rioplatense ── */
function numToEs(n: number): string {
  if (n === 0) return "cero";
  if (n < 0) return "menos " + numToEs(-n);

  const ones = ["", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve",
                "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete",
                "dieciocho", "diecinueve", "veinte"];
  const veintiX = ["", "veintiuno", "veintidós", "veintitrés", "veinticuatro", "veinticinco",
                   "veintiséis", "veintisiete", "veintiocho", "veintinueve"];
  const tens =   ["", "", "veinte", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
  const hundreds = ["", "cien", "doscientos", "trescientos", "cuatrocientos", "quinientos",
                    "seiscientos", "setecientos", "ochocientos", "novecientos"];

  if (n <= 20) return ones[n];
  if (n <= 29) return veintiX[n - 20];
  if (n < 100) {
    const t = Math.floor(n / 10), o = n % 10;
    return o === 0 ? tens[t] : `${tens[t]} y ${ones[o]}`;
  }
  if (n < 1000) {
    const h = Math.floor(n / 100), rest = n % 100;
    if (h === 1 && rest === 0) return "cien";
    if (h === 1) return `ciento ${numToEs(rest)}`;
    return rest === 0 ? hundreds[h] : `${hundreds[h]} ${numToEs(rest)}`;
  }
  if (n < 1_000_000) {
    const th = Math.floor(n / 1000), rest = n % 1000;
    const prefix = th === 1 ? "mil" : `${numToEs(th)} mil`;
    return rest === 0 ? prefix : `${prefix} ${numToEs(rest)}`;
  }
  // millones (por si aparece precio en pesos)
  const m = Math.floor(n / 1_000_000), rest = n % 1_000_000;
  const prefix = m === 1 ? "un millón" : `${numToEs(m)} millones`;
  return rest === 0 ? prefix : `${prefix} ${numToEs(rest)}`;
}

/** Convierte número (con o sin separador de miles) a palabras + unidad */
function convertNum(raw: string, unit: string): string {
  const n = parseInt(raw.replace(/\./g, "").replace(/,/g, ""), 10);
  if (isNaN(n)) return raw + (unit ? " " + unit : "");
  const words = numToEs(n);
  return unit ? `${words} ${unit}` : words;
}

/** Limpia y naturaliza el texto antes de mandarlo a ElevenLabs */
function cleanForTTS(raw: string): string {
  return raw
    // ── Quitar markdown ──
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/#{1,6}\s+/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\|[^\n]*\|/g, "")
    .replace(/[-|:]{3,}/g, "")

    // ── km / kilómetros → palabras ──
    // "47.000 km" | "47000 km" | "47.000 kilómetros"
    .replace(/(\d{1,3}(?:\.\d{3})*|\d+)\s*(?:km|kilómetros?)\b/gi,
      (_, n) => convertNum(n, "kilómetros"))

    // ── USD / dólares → palabras ──
    .replace(/[Uu][Ss]?\$[Ss]?\s*([\d\.]+)/g,
      (_, n) => convertNum(n, "dólares"))
    .replace(/US\$\s*([\d\.]+)/gi,
      (_, n) => convertNum(n, "dólares"))
    .replace(/\$\s*([\d\.]+)\s*(?:USD|usd)/gi,
      (_, n) => convertNum(n, "dólares"))
    .replace(/\bUSD\b/gi, "dólares")
    .replace(/\bARS\b/gi, "pesos")

    // ── Xk → X mil (para casos que no tienen unidad explícita) ──
    .replace(/(\d+(?:\.\d+)?)k\b/gi,
      (_, n) => numToEs(Math.round(parseFloat(n))) + " mil")

    // ── Números grandes sueltos con separador de miles → palabras ──
    // Solo convierte si son >= 1.000 (evita fechas tipo "2021")
    .replace(/\b(\d{1,3}(?:\.\d{3})+)\b/g, (_, n) => {
      const val = parseInt(n.replace(/\./g, ""), 10);
      return val >= 1000 ? numToEs(val) : n;
    })

    // ── Porcentajes ──
    .replace(/(\d+)\s*%/g, (_, n) => numToEs(parseInt(n)) + " por ciento")

    // ── Bullets / listas ──
    .replace(/[•·►▶]\s*/g, ". ")
    .replace(/^\s*[-–—]\s+/gm, ". ")

    // ── Saltos de línea ──
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, ", ")

    // ── Limpiar ──
    .replace(/\.\s*\.\s*/g, ". ")
    .replace(/,\s*,/g, ",")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(req: Request) {
  const { text } = await req.json();
  if (!text) return Response.json({ error: "no text" }, { status: 400 });

  const cleaned = cleanForTTS(text);

  const r = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${XI_VOICE_ID}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": XI_API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: cleaned.slice(0, 1200),
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.22,
          similarity_boost: 0.85,
          style: 0.17,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!r.ok) {
    const err = await r.text();
    return Response.json({ error: err }, { status: 502 });
  }

  const audio = await r.arrayBuffer();
  return new Response(audio, {
    headers: { "Content-Type": "audio/mpeg" },
  });
}
