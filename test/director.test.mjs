import { test } from "node:test";
import assert from "node:assert/strict";
import { createDirector } from "../src/director.js";

test("video song while idle: move video, open panel, show lyrics", () => {
  const d = createDirector();
  assert.deepEqual(d.handle({ type: "track", hasVideo: true, idle: true }),
    ["moveVideoToMiddle", "openQueuePanel", { selectTab: "lyrics" }]);
  assert.equal(d.state().pending, null);
});
test("video song while active waits for idle, and does not touch sidebar", () => {
  const d = createDirector();
  assert.deepEqual(d.handle({ type: "track", hasVideo: true, idle: false }), []);
  assert.deepEqual(d.handle({ type: "tick", idle: false }), []);
  assert.deepEqual(d.handle({ type: "tick", idle: true }),
    ["moveVideoToMiddle", "openQueuePanel", { selectTab: "lyrics" }]);
  assert.deepEqual(d.handle({ type: "tick", idle: true }), []); // fires once
});
test("no-video song flips sidebar now, middle waits for idle", () => {
  const d = createDirector();
  assert.deepEqual(d.handle({ type: "track", hasVideo: false, idle: false }), [{ selectTab: "queue" }]);
  assert.deepEqual(d.handle({ type: "tick", idle: true }), ["showLyricsInMiddle"]);
});
test("no-video song while idle does both at once, in action order", () => {
  const d = createDirector();
  assert.deepEqual(d.handle({ type: "track", hasVideo: false, idle: true }),
    ["showLyricsInMiddle", { selectTab: "queue" }]);
});
test("only the latest track counts", () => {
  const d = createDirector();
  d.handle({ type: "track", hasVideo: true, idle: false });
  d.handle({ type: "track", hasVideo: false, idle: false });
  assert.deepEqual(d.handle({ type: "tick", idle: true }), ["showLyricsInMiddle"]);
});
test("manual tab pick is respected until next track", () => {
  const d = createDirector();
  d.handle({ type: "track", hasVideo: true, idle: false });
  d.handle({ type: "tabPicked", tab: "queue" });
  assert.deepEqual(d.handle({ type: "tick", idle: true }), ["moveVideoToMiddle", "openQueuePanel"]);
  assert.deepEqual(d.handle({ type: "track", hasVideo: true, idle: true }),
    ["moveVideoToMiddle", "openQueuePanel", { selectTab: "lyrics" }]);
});
test("state() returns a copy; mutating it does not change the director", () => {
  const d = createDirector();
  d.handle({ type: "track", hasVideo: true, idle: false });
  const s = d.state();
  s.pending = null;
  s.manualTab = true;
  assert.deepEqual(d.state(), { pending: "video", manualTab: false });
});
