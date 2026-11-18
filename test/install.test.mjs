import { test } from "node:test";
import assert from "node:assert/strict";
import { extensionsDir, spicetifySteps } from "../install.mjs";

test("extensionsDir builds the Windows Extensions folder from spicetify's output", () => {
  assert.equal(
    extensionsDir("C:\\Users\\ana\\AppData\\Roaming\\spicetify\r\n", "win32"),
    "C:\\Users\\ana\\AppData\\Roaming\\spicetify\\Extensions",
  );
});

test("extensionsDir builds the macOS Extensions folder from spicetify's output", () => {
  assert.equal(extensionsDir("/Users/ana/.config/spicetify\n", "darwin"), "/Users/ana/.config/spicetify/Extensions");
});

test("extensionsDir ignores extra lines spicetify may print", () => {
  assert.equal(extensionsDir("\n/Users/ana/.config/spicetify\nsome note\n", "darwin"), "/Users/ana/.config/spicetify/Extensions");
});

test("extensionsDir rejects empty output", () => {
  assert.throws(() => extensionsDir("  \n", "darwin"), /spicetify/);
});

test("spicetifySteps turns the mod on and applies", () => {
  assert.deepEqual(spicetifySteps(false), [["config", "extensions", "videoLyrics.js"], ["apply"]]);
});

test("spicetifySteps for removal turns the mod off and applies", () => {
  assert.deepEqual(spicetifySteps(true), [["config", "extensions", "videoLyrics.js-"], ["apply"]]);
});
