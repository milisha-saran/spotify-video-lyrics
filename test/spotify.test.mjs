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

test("fetchAudioAnalysis gives up after the timeout", async () => {
  const { fetchAudioAnalysis } = await import("../src/spotify.js");
  globalThis.Spicetify = { getAudioData: () => new Promise(() => {}) };
  assert.equal(await fetchAudioAnalysis("spotify:track:x", 50), null);
});

test("fetchLyricsColors asks for the image's dynamic colors and picks the lyrics set", async () => {
  const { fetchLyricsColors } = await import("../src/spotify.js");
  const c = (red, green, blue) => ({ red, green, blue, alpha: 255 });
  const calls = [];
  globalThis.Spicetify = { GraphQL: {
    Definitions: { getDynamicColorsByUris: "def" },
    Request: async (def, vars) => {
      calls.push([def, vars]);
      return { data: { dynamicColors: [{ dark: { higherContrast: {
        backgroundBase: c(40, 72, 96), textBase: c(255, 255, 255), textSubdued: c(200, 210, 220) } } }] } };
    },
  } };
  assert.deepEqual(await fetchLyricsColors("spotify:image:abc"),
    { background: "rgba(40, 72, 96, 1)", active: "rgba(255, 255, 255, 1)", inactive: "rgba(200, 210, 220, 1)" });
  assert.deepEqual(calls, [["def", { imageUris: ["spotify:image:abc"] }]]);
});
test("fetchLyricsColors is null on error, timeout or no image", async () => {
  const { fetchLyricsColors } = await import("../src/spotify.js");
  globalThis.Spicetify = { GraphQL: { Definitions: { getDynamicColorsByUris: "d" }, Request: async () => { throw new Error("x"); } } };
  assert.equal(await fetchLyricsColors("spotify:image:err"), null);
  globalThis.Spicetify = { GraphQL: { Definitions: { getDynamicColorsByUris: "d" }, Request: () => new Promise(() => {}) } };
  assert.equal(await fetchLyricsColors("spotify:image:hang", 50), null);
  assert.equal(await fetchLyricsColors(null), null);
});
test("currentImageUri gives the item's first spotify:image uri", async () => {
  const { currentImageUri } = await import("../src/spotify.js");
  globalThis.Spicetify = { Player: { data: { item: { images: [{ url: "https://x" }, { url: "spotify:image:big" }] } } } };
  assert.equal(currentImageUri(), "spotify:image:big");
  globalThis.Spicetify = { Player: { data: { item: {} } } };
  assert.equal(currentImageUri(), null);
});
