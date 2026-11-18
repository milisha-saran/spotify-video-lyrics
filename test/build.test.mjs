import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

test("build writes one wrapped script with no module syntax", () => {
  execFileSync(process.execPath, ["build.mjs"], { cwd: root });
  const code = readFileSync(new URL("../dist/videoLyrics.js", import.meta.url), "utf8");
  assert.doesNotMatch(code, /^\s*import /m);
  assert.doesNotMatch(code, /^\s*export /m);
  assert.match(code, /^\(function videoLyrics\(\) \{/);
  assert.doesNotThrow(() => new Function(code));
});

test("built script asks LRCLIB when Spotify has no lyrics", () => {
  execFileSync(process.execPath, ["build.mjs"], { cwd: root });
  const code = readFileSync(new URL("../dist/videoLyrics.js", import.meta.url), "utf8");
  assert.match(code, /https:\/\/lrclib\.net\/api/);
  assert.match(code, /fetchLrclib\(currentTrackMeta\(\)\)/);
});

test("built script aligns lyrics to music videos", () => {
  execFileSync(process.execPath, ["build.mjs"], { cwd: root });
  const code = readFileSync(new URL("../dist/videoLyrics.js", import.meta.url), "utf8");
  assert.match(code, /alignAudioToVideo\(/);
  assert.match(code, /return lyricsForPlayback\(uri, /);
});
test("built script colors lyrics like Spotify's lyrics page", () => {
  execFileSync(process.execPath, ["build.mjs"], { cwd: root });
  const code = readFileSync(new URL("../dist/videoLyrics.js", import.meta.url), "utf8");
  assert.match(code, /function pickLyricsColors\(/);
  assert.match(code, /getDynamicColorsByUris/);
  assert.match(code, /middleView\.setColors\(colors\)/);
});
