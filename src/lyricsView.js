import { currentLineIndex } from "./lyrics.js";

const VL_CSS = `
.vl-lyrics { padding: 16px; overflow-y: auto; font-size: 18px; line-height: 1.5; }
.vl-line { padding: 6px 0; color: var(--vl-inactive, var(--text-subdued, #a7a7a7)); }
.vl-line.vl-past { color: var(--vl-inactive, var(--text-subdued, #a7a7a7)); opacity: 0.5; }
.vl-line.vl-next { color: var(--vl-inactive, var(--text-subdued, #a7a7a7)); }
.vl-line.vl-current { color: var(--vl-active, var(--text-base, #fff)); font-weight: 700; opacity: 1; }
.vl-lyrics.vl-synced .vl-line { cursor: pointer; }
.vl-empty { color: var(--vl-inactive, var(--text-subdued, #a7a7a7)); padding: 16px 0; }
.vl-lyrics.vl-colored { background: var(--vl-bg); border-radius: 8px; min-height: 100%; box-sizing: border-box; }
.vl-lyrics.vl-middle { padding: 32px 48px; font-size: 28px; font-weight: 700; line-height: 1.4; }
.vl-source { color: var(--vl-inactive, var(--text-subdued, #a7a7a7)); font-size: 12px; padding: 24px 0 8px; }
`;

export function createLyricsView(doc, onSeek) {
  if (!doc.getElementById("vl-style")) {
    const style = doc.createElement("style");
    style.id = "vl-style";
    style.textContent = VL_CSS;
    doc.head.appendChild(style);
  }

  const el = doc.createElement("div");
  el.classList.add("vl-lyrics");
  let parsed = null;
  let lineEls = [];
  let shownIndex = -1;

  function showMessage(text) {
    parsed = null;
    shownIndex = -1;
    lineEls = [];
    el.classList.remove("vl-synced");
    const empty = doc.createElement("div");
    empty.classList.add("vl-empty");
    empty.textContent = text;
    el.replaceChildren(empty);
  }

  function setLyrics(next) {
    parsed = next;
    shownIndex = -1;
    lineEls = [];
    el.classList.toggle("vl-synced", !!next && next.synced);
    if (!next) {
      showMessage("No lyrics for this song");
      return;
    }
    if (next.instrumental) {
      showMessage("Instrumental");
      return;
    }
    lineEls = next.lines.map((line) => {
      const row = doc.createElement("div");
      row.classList.add("vl-line", "vl-next");
      row.textContent = line.text;
      row.addEventListener("click", () => {
        if (line.startMs != null) onSeek(line.startMs);
      });
      return row;
    });
    const rows = [...lineEls];
    if (next.source === "LRCLIB") {
      const credit = doc.createElement("div");
      credit.classList.add("vl-source");
      credit.textContent = "Lyrics from LRCLIB";
      rows.push(credit);
    }
    el.replaceChildren(...rows);
  }

  function setPosition(ms) {
    if (!parsed || !parsed.synced) return;
    const index = currentLineIndex(parsed.lines, ms);
    lineEls.forEach((row, i) => {
      row.classList.toggle("vl-past", i < index);
      row.classList.toggle("vl-current", i === index);
      row.classList.toggle("vl-next", i > index);
    });
    if (index !== shownIndex) {
      shownIndex = index;
      if (index >= 0) lineEls[index].scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }

  function showLoading() {
    showMessage("Loading lyrics…");
  }

  const COLOR_VARS = { background: "--vl-bg", active: "--vl-active", inactive: "--vl-inactive" };
  function setColors(colors) {
    for (const [key, name] of Object.entries(COLOR_VARS)) {
      if (colors) el.style.setProperty(name, colors[key]);
      else el.style.removeProperty(name);
    }
    el.classList.toggle("vl-colored", !!colors);
  }

  return { el, setLyrics, setPosition, showLoading, setColors };
}
