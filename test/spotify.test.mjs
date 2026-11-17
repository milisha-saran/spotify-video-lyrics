import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchLyrics, LYRICS_FETCH_FAILED } from "../src/spotify.js";

function withCosmos(get) {
  globalThis.Spicetify = { CosmosAsync: { get } };
}

test("fetchLyrics: lyrics body is returned", async () => {
  withCosmos(async () => ({ lyrics: { lines: [] } }));
  assert.deepEqual(await fetchLyrics("spotify:track:x"), { lyrics: { lines: [] } });
});
test("fetchLyrics: empty body or 404 means no lyrics", async () => {
  withCosmos(async () => ({}));
  assert.equal(await fetchLyrics("spotify:track:x"), null);
  withCosmos(async () => ({ code: 404, message: "Failed to fetch" }));
  assert.equal(await fetchLyrics("spotify:track:x"), null);
});
test("fetchLyrics: a thrown or non-404 error is a failure, not 'no lyrics'", async () => {
  withCosmos(async () => { throw new Error("offline"); });
  assert.equal(await fetchLyrics("spotify:track:x"), LYRICS_FETCH_FAILED);
  withCosmos(async () => ({ code: 503, message: "busy" }));
  assert.equal(await fetchLyrics("spotify:track:x"), LYRICS_FETCH_FAILED);
});
