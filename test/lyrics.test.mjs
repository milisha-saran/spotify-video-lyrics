import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLyrics, currentLineIndex, latestOnly } from "../src/lyrics.js";

test("parses LINE_SYNCED", () => {
  const body = { lyrics: { syncType: "LINE_SYNCED", lines: [
    { startTimeMs: "1000", words: "a" }, { startTimeMs: "5000", words: "b" } ] } };
  assert.deepEqual(parseLyrics(body), { synced: true, lines: [
    { startMs: 1000, text: "a" }, { startMs: 5000, text: "b" } ] });
});
test("unsynced lyrics have null startMs", () => {
  const body = { lyrics: { syncType: "UNSYNCED", lines: [{ startTimeMs: "0", words: "a" }] } };
  assert.deepEqual(parseLyrics(body), { synced: false, lines: [{ startMs: null, text: "a" }] });
});
test("no lyrics returns null", () => {
  assert.equal(parseLyrics(null), null);
  assert.equal(parseLyrics({}), null);
  assert.equal(parseLyrics({ lyrics: { lines: [] } }), null);
});
test("current line follows position, including seeking backwards", () => {
  const lines = [{ startMs: 1000 }, { startMs: 5000 }, { startMs: 9000 }];
  assert.equal(currentLineIndex(lines, 0), -1);
  assert.equal(currentLineIndex(lines, 1000), 0);
  assert.equal(currentLineIndex(lines, 9500), 2);
  assert.equal(currentLineIndex(lines, 4999), 0); // after seeking back from 9500
});
test("unsynced lines never highlight", () => {
  assert.equal(currentLineIndex([{ startMs: null }], 5000), -1);
});
test("latestOnly drops stale results", async () => {
  let release; const slow = new Promise(r => (release = r));
  const fetcher = uri => uri === "old" ? slow.then(() => "OLD") : Promise.resolve("NEW");
  const get = latestOnly(fetcher);
  const a = get("old"); const b = get("new");
  release();
  assert.equal(await b, "NEW");
  assert.equal(await a, undefined);
});
test("latestOnly: a superseded call that rejects resolves undefined", async () => {
  let fail; const slow = new Promise((_, rej) => (fail = rej));
  const fetcher = uri => uri === "old" ? slow : Promise.resolve("NEW");
  const get = latestOnly(fetcher);
  const a = get("old"); const b = get("new");
  fail(new Error("late failure"));
  assert.equal(await b, "NEW");
  assert.equal(await a, undefined);
});
test("latestOnly: the newest call's rejection still propagates", async () => {
  const get = latestOnly(() => Promise.reject(new Error("boom")));
  await assert.rejects(get("x"), /boom/);
});
