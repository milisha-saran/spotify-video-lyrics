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
