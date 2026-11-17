import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLrc, cleanTitle, pickMatch, toParsed, fetchLrclib } from "../src/lrclib.js";

test("parseLrc skips tags, splits multi-timestamp lines, sorts", () => {
  assert.deepEqual(parseLrc("[ar:X]\n[00:01.50] a\n[00:03.00][00:10.00] b\n"), [
    { startMs: 1500, text: "a" }, { startMs: 3000, text: "b" }, { startMs: 10000, text: "b" }]);
});
test("parseLrc of empty text is empty", () => {
  assert.deepEqual(parseLrc(""), []);
  assert.deepEqual(parseLrc(null), []);
});
test("cleanTitle strips version and feature suffixes", () => {
  assert.equal(cleanTitle("Song - Remastered 2011"), "Song");
  assert.equal(cleanTitle("Song (feat. X)"), "Song");
  assert.equal(cleanTitle("Song [feat. X]"), "Song");
  assert.equal(cleanTitle("Song - Live at Wembley"), "Song");
  assert.equal(cleanTitle("Song - Radio Version"), "Song");
  assert.equal(cleanTitle("Plain"), "Plain");
});
test("pickMatch takes the closest length within 3 s, preferring synced", () => {
  const synced = { duration: 203.5, syncedLyrics: "[00:01.00]a" };
  assert.equal(pickMatch([{ duration: 200, syncedLyrics: "" }, synced], 201), synced);
  assert.equal(pickMatch([{ duration: 210 }], 200), null);
  assert.equal(pickMatch([], 200), null);
});
test("toParsed: instrumental", () => {
  assert.deepEqual(toParsed({ instrumental: true }),
    { synced: false, lines: [], instrumental: true, source: "LRCLIB" });
});
test("toParsed: plain lyrics keep blank lines, no times", () => {
  assert.deepEqual(toParsed({ syncedLyrics: null, plainLyrics: "a\n\nb" }), {
    synced: false, source: "LRCLIB",
    lines: [{ startMs: null, text: "a" }, { startMs: null, text: "" }, { startMs: null, text: "b" }] });
});
test("toParsed: synced lyrics", () => {
  assert.deepEqual(toParsed({ syncedLyrics: "[00:02.00] hi", plainLyrics: "hi" }),
    { synced: true, source: "LRCLIB", lines: [{ startMs: 2000, text: "hi" }] });
});
test("toParsed: nothing usable is null", () => {
  assert.equal(toParsed(null), null);
  assert.equal(toParsed({ syncedLyrics: "", plainLyrics: "" }), null);
});

function fakeFetch(routes) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    for (const [prefix, reply] of routes) {
      if (url.startsWith(prefix)) return { ok: reply.status === 200, status: reply.status, json: async () => reply.body };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  fn.calls = calls;
  return fn;
}

test("fetchLrclib falls back to search with the cleaned title", async () => {
  const fetchFn = fakeFetch([
    ["https://lrclib.net/api/search", { status: 200, body: [{ duration: 180, syncedLyrics: "[00:01.00] x" }] }],
  ]);
  const meta = { title: "Tune - Remastered 2011", artist: "A", album: "B", durationSec: 181 };
  const parsed = await fetchLrclib(meta, fetchFn);
  assert.deepEqual(parsed, { synced: true, source: "LRCLIB", lines: [{ startMs: 1000, text: "x" }] });
  assert.ok(fetchFn.calls[0].startsWith("https://lrclib.net/api/get?"));
  const search = new URL(fetchFn.calls[1]);
  assert.equal(search.searchParams.get("track_name"), "Tune");
  assert.equal(search.searchParams.get("artist_name"), "A");
});
test("fetchLrclib uses an exact get hit within 3 s", async () => {
  const fetchFn = fakeFetch([
    ["https://lrclib.net/api/get", { status: 200, body: { duration: 100, plainLyrics: "p" } }],
  ]);
  const parsed = await fetchLrclib({ title: "G", artist: "A", album: "B", durationSec: 101 }, fetchFn);
  assert.equal(parsed.lines[0].text, "p");
  assert.equal(fetchFn.calls.length, 1);
});
test("fetchLrclib gives up after the timeout", async () => {
  const hang = () => new Promise(() => {});
  assert.equal(await fetchLrclib({ title: "H", artist: "A", album: "B", durationSec: 1 }, hang, 50), null);
});
test("fetchLrclib returns null on network error and on missing meta", async () => {
  const boom = async () => { throw new Error("offline"); };
  assert.equal(await fetchLrclib({ title: "E", artist: "A", album: "B", durationSec: 1 }, boom), null);
  assert.equal(await fetchLrclib(null, boom), null);
});
test("fetchLrclib caches per song", async () => {
  const fetchFn = fakeFetch([
    ["https://lrclib.net/api/get", { status: 200, body: { duration: 50, plainLyrics: "c" } }],
  ]);
  const meta = { title: "Cached", artist: "A", album: "B", durationSec: 50 };
  await fetchLrclib(meta, fetchFn);
  await fetchLrclib(meta, fetchFn);
  assert.equal(fetchFn.calls.length, 1);
});
test("fetchLrclib does not cache a server error as a miss", async () => {
  let calls = 0;
  const flaky = async () => {
    calls++;
    if (calls === 1) return { ok: false, status: 503, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ duration: 70, plainLyrics: "back" }) };
  };
  const meta = { title: "Flaky", artist: "A", album: "B", durationSec: 70 };
  assert.equal(await fetchLrclib(meta, flaky), null);
  const second = await fetchLrclib(meta, flaky);
  assert.equal(second?.lines[0].text, "back");
});
