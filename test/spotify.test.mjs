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

test("fetchAudioAnalysis returns segments, or null on failure", async () => {
  const { fetchAudioAnalysis } = await import("../src/spotify.js");
  globalThis.Spicetify = { getAudioData: async () => ({ segments: [{ start: 0 }] }) };
  assert.deepEqual(await fetchAudioAnalysis("spotify:track:x"), [{ start: 0 }]);
  globalThis.Spicetify = { getAudioData: async () => { throw new Error("404"); } };
  assert.equal(await fetchAudioAnalysis("spotify:track:x"), null);
  assert.equal(await fetchAudioAnalysis(null), null);
});

test("currentTrackInfo gives the video uri for a video", async () => {
  const { currentTrackInfo } = await import("../src/spotify.js");
  globalThis.Spicetify = { Player: { data: { item: { uri: "spotify:track:vid", mediaType: "video", metadata: { audio_association: "spotify:track:aud" } } } } };
  assert.deepEqual(currentTrackInfo(), { uri: "spotify:track:aud", hasVideo: true, videoUri: "spotify:track:vid" });
});
