import { test } from "node:test";
import assert from "node:assert/strict";
import { pickLyricsColors } from "../src/colors.js";

const c = (red, green, blue, alpha = 255) => ({ red, green, blue, alpha });
// Shape of a live getDynamicColorsByUris answer ("Fairytale Of New York - Live", 2026-11-17).
const live = { data: { dynamicColors: [{ bestFit: "DARK", dark: {
  highContrast: { backgroundBase: c(159, 0, 0), textBase: c(255, 255, 255), textSubdued: c(255, 190, 175) },
  higherContrast: { backgroundBase: c(101, 0, 0), textBase: c(255, 255, 255), textSubdued: c(255, 190, 175) },
} }] } };

test("pickLyricsColors takes dark higherContrast, the colors Spotify's lyrics page shows", () => {
  assert.deepEqual(pickLyricsColors(live), {
    background: "rgba(101, 0, 0, 1)",
    active: "rgba(255, 255, 255, 1)",
    inactive: "rgba(255, 190, 175, 1)",
  });
});
test("pickLyricsColors returns null when any color is missing", () => {
  assert.equal(pickLyricsColors(null), null);
  assert.equal(pickLyricsColors({ data: { dynamicColors: [] } }), null);
  const partial = structuredClone(live);
  delete partial.data.dynamicColors[0].dark.higherContrast.textSubdued;
  assert.equal(pickLyricsColors(partial), null);
});
