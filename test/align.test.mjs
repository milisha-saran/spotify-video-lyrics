import { test } from "node:test";
import assert from "node:assert/strict";
import { alignFrames, alignAudioToVideo, shiftLyricTimes } from "../src/align.js";

function rng(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}
function randomSegs(seconds, seed, startAt = 0) {
  const rand = rng(seed), segs = [];
  for (let t = 0; t < seconds; t += 0.5) {
    segs.push({
      start: startAt + t,
      duration: 0.5,
      pitches: Array.from({ length: 12 }, rand),
      timbre: Array.from({ length: 12 }, () => (rand() - 0.5) * 200),
    });
  }
  return segs;
}
const shift = (segs, by) => segs.map((s) => ({ ...s, start: s.start + by }));

test("alignFrames samples segments every 0.25 s into unit vectors", () => {
  const frames = alignFrames(randomSegs(2, 1));
  assert.equal(frames.length, 8);
  assert.ok(Math.abs(Math.hypot(...frames[0]) - 1) < 1e-9);
  assert.equal(frames[0].length, 23);
});
test("identical recordings map to the same time", () => {
  const audio = randomSegs(120, 7);
  const map = alignAudioToVideo(audio, audio);
  for (const t of [10, 50, 100]) assert.ok(Math.abs(map(t) - t) <= 0.25, `t=${t} -> ${map(t)}`);
});
test("a 40 s unrelated intro shifts every line by 40 s", () => {
  const audio = randomSegs(120, 7);
  const video = [...randomSegs(40, 99), ...shift(audio, 40)];
  const map = alignAudioToVideo(audio, video);
  assert.ok(Math.abs(map(60) - 100) <= 0.5, `60 -> ${map(60)}`);
  assert.ok(Math.abs(map(5) - 45) <= 0.5, `5 -> ${map(5)}`);
});
test("a cut in the video pulls later lines earlier", () => {
  const audio = randomSegs(120, 7);
  const video = [...audio.filter((s) => s.start < 30), ...shift(audio.filter((s) => s.start >= 60), -30)];
  const map = alignAudioToVideo(audio, video);
  assert.ok(Math.abs(map(90) - 60) <= 0.5, `90 -> ${map(90)}`);
  assert.ok(Math.abs(map(10) - 10) <= 0.5, `10 -> ${map(10)}`);
});
test("no segments, or a recording over 10 minutes, gives null", () => {
  assert.equal(alignAudioToVideo([], randomSegs(10, 1)), null);
  assert.equal(alignAudioToVideo(randomSegs(10, 1), null), null);
  const long = [{ start: 0, duration: 601, pitches: Array(12).fill(1), timbre: Array(12).fill(1) }];
  assert.equal(alignAudioToVideo(long, randomSegs(10, 1)), null);
});
test("shiftLyricTimes maps start times, keeps text, never goes backwards", () => {
  const parsed = { synced: true, lines: [{ startMs: 1000, text: "a" }, { startMs: 5000, text: "b" }, { startMs: 9000, text: "c" }] };
  const map = (sec) => (sec === 5 ? 1 : sec + 40);
  assert.deepEqual(shiftLyricTimes(parsed, map), { synced: true, lines: [
    { startMs: 41000, text: "a" }, { startMs: 41000, text: "b" }, { startMs: 49000, text: "c" }] });
  assert.equal(parsed.lines[0].startMs, 1000);
});
test("shiftLyricTimes leaves unsynced lyrics and null alone", () => {
  const plain = { synced: false, lines: [{ startMs: null, text: "a" }] };
  assert.equal(shiftLyricTimes(plain, (s) => s + 1), plain);
  assert.equal(shiftLyricTimes(null, (s) => s + 1), null);
});
test("malformed segments give null instead of throwing", () => {
  const bad = [{ start: 0, duration: 1 }];
  assert.equal(alignAudioToVideo(bad, randomSegs(10, 1)), null);
});
