import { currentLineIndex } from "./lyrics.js";

const VL_CSS = `
.vl-lyrics { padding: 16px; overflow-y: auto; font-size: 18px; line-height: 1.5; }
.vl-line { padding: 6px 0; color: var(--text-subdued, #a7a7a7); }
.vl-line.vl-past { color: var(--text-subdued, #a7a7a7); opacity: 0.5; }
.vl-line.vl-next { color: var(--text-subdued, #a7a7a7); }
.vl-line.vl-current { color: var(--text-base, #fff); font-weight: 700; opacity: 1; }
.vl-lyrics.vl-synced .vl-line { cursor: pointer; }
.vl-empty { color: var(--text-subdued, #a7a7a7); padding: 16px 0; }
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

  function setLyrics(next) {
    parsed = next;
    shownIndex = -1;
    lineEls = [];
    el.classList.toggle("vl-synced", !!next && next.synced);
    if (!next) {
      const empty = doc.createElement("div");
      empty.classList.add("vl-empty");
      empty.textContent = "No lyrics for this song";
      el.replaceChildren(empty);
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
    el.replaceChildren(...lineEls);
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

  return { el, setLyrics, setPosition };
}
