const LRCLIB_BASE = "https://lrclib.net/api";
const LRCLIB_MAX_DIFF_SEC = 3;
// The build joins every module into one scope, so these names carry a prefix.
const lrclibCache = new Map();

export function parseLrc(text) {
  if (!text) return [];
  const lines = [];
  for (const raw of text.split("\n")) {
    const stamps = [];
    let rest = raw;
    let match;
    while ((match = /^\s*\[(\d+):(\d+(?:\.\d+)?)\]/.exec(rest))) {
      stamps.push(Math.round((Number(match[1]) * 60 + Number(match[2])) * 1000));
      rest = rest.slice(match[0].length);
    }
    for (const startMs of stamps) lines.push({ startMs, text: rest.trim() });
  }
  return lines.sort((a, b) => a.startMs - b.startMs);
}

export function cleanTitle(title) {
  return String(title)
    .replace(/\s*[([]feat\.[^)\]]*[)\]]/gi, "")
    .replace(/\s+-\s+(.*\bremaster(ed)?\b.*|.*\bversion\b.*|live\b.*)$/i, "")
    .trim();
}

export function pickMatch(records, durationSec) {
  let best = null;
  let bestScore = Infinity;
  for (const record of records || []) {
    const diff = Math.abs(Number(record.duration) - durationSec);
    if (!(diff <= LRCLIB_MAX_DIFF_SEC)) continue;
    // Any synced record beats any plain one; within each group, the closest length wins.
    const score = diff + (record.syncedLyrics ? 0 : 100);
    if (score < bestScore) {
      best = record;
      bestScore = score;
    }
  }
  return best;
}

export function toParsed(record) {
  if (!record) return null;
  if (record.instrumental) return { synced: false, lines: [], instrumental: true, source: "LRCLIB" };
  const synced = parseLrc(record.syncedLyrics);
  if (synced.length) return { synced: true, lines: synced, source: "LRCLIB" };
  if (record.plainLyrics) {
    const lines = record.plainLyrics.split("\n").map((text) => ({ startMs: null, text: text.trim() }));
    return { synced: false, lines, source: "LRCLIB" };
  }
  return null;
}

async function lrclibJson(fetchFn, url) {
  const response = await fetchFn(url);
  if (!response.ok) return null;
  return response.json();
}

async function lrclibLookup(meta, fetchFn) {
  const exact = new URLSearchParams({
    track_name: meta.title,
    artist_name: meta.artist,
    album_name: meta.album || "",
    duration: String(Math.round(meta.durationSec)),
  });
  const hit = await lrclibJson(fetchFn, `${LRCLIB_BASE}/get?${exact}`);
  const parsedHit = toParsed(pickMatch(hit ? [hit] : [], meta.durationSec));
  if (parsedHit) return parsedHit;
  const search = new URLSearchParams({ track_name: cleanTitle(meta.title), artist_name: meta.artist });
  const results = await lrclibJson(fetchFn, `${LRCLIB_BASE}/search?${search}`);
  return toParsed(pickMatch(Array.isArray(results) ? results : [], meta.durationSec));
}

export async function fetchLrclib(meta, fetchFn = fetch, timeoutMs = 5000) {
  if (!meta || !meta.title || !meta.artist || !(meta.durationSec > 0)) return null;
  const key = `${meta.artist}|${meta.title}|${Math.round(meta.durationSec)}`;
  if (lrclibCache.has(key)) return lrclibCache.get(key);
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });
  try {
    const result = await Promise.race([lrclibLookup(meta, fetchFn), timeout]);
    if (result === "timeout") return null;
    lrclibCache.set(key, result);
    return result;
  } catch (err) {
    console.warn("[videoLyrics]", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
