import { test } from "node:test";
import assert from "node:assert/strict";
import { alignFrames, alignAudioToVideo, shiftLyricTimes, lyricsForPlayback } from "../src/align.js";

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

const synced = (source) => ({ synced: true, source, lines: [{ startMs: 10000, text: "a" }] });
const plus50 = (sec) => sec + 50;
function playback({ spotify = null, fallback = null, hasVideo = true, audioUri = "spotify:track:a" } = {}) {
  return {
    fetchSpotify: async () => spotify,
    fetchFallback: async () => fallback,
    trackInfo: () => ({ uri: audioUri, hasVideo, videoUri: hasVideo ? "spotify:track:v" : null }),
    timeMap: async () => plus50,
  };
}

test("lyricsForPlayback shifts Spotify lyrics on a video", async () => {
  const out = await lyricsForPlayback("spotify:track:a", playback({ spotify: synced("Spotify") }));
  assert.equal(out.lines[0].startMs, 60000);
});
test("lyricsForPlayback shifts LRCLIB lyrics on a video: they are timed to the audio track", async () => {
  const out = await lyricsForPlayback("spotify:track:a", playback({ fallback: synced("LRCLIB") }));
  assert.equal(out.source, "LRCLIB");
  assert.equal(out.lines[0].startMs, 60000);
});
test("lyricsForPlayback leaves audio-only songs and unsynced lyrics alone", async () => {
  const audio = await lyricsForPlayback("spotify:track:a", playback({ fallback: synced("LRCLIB"), hasVideo: false }));
  assert.equal(audio.lines[0].startMs, 10000);
  const plain = { synced: false, source: "LRCLIB", lines: [{ startMs: null, text: "p" }] };
  assert.equal(await lyricsForPlayback("spotify:track:a", playback({ fallback: plain })), plain);
});
test("lyricsForPlayback does not shift when the track changed mid-fetch, or with no map", async () => {
  const moved = await lyricsForPlayback("spotify:track:a", playback({ spotify: synced("Spotify"), audioUri: "spotify:track:other" }));
  assert.equal(moved.lines[0].startMs, 10000);
  const deps = { ...playback({ spotify: synced("Spotify") }), timeMap: async () => null };
  assert.equal((await lyricsForPlayback("spotify:track:a", deps)).lines[0].startMs, 10000);
});
test("lyricsForPlayback: a failed Spotify fetch skips LRCLIB; no lyrics at all is null", async () => {
  let asked = false;
  const failed = { ...playback(), fetchSpotify: async () => { throw new Error("offline"); }, fetchFallback: async () => { asked = true; } };
  assert.equal(await lyricsForPlayback("spotify:track:a", failed), null);
  assert.equal(asked, false);
  assert.equal(await lyricsForPlayback("spotify:track:a", playback()), null);
});
