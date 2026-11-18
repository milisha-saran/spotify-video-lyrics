import { parseLyrics, latestOnly } from "./lyrics.js";
import { fetchLrclib } from "./lrclib.js";
import { alignAudioToVideo, lyricsForPlayback } from "./align.js";
import { createIdleTracker } from "./idle.js";
import { createDirector } from "./director.js";
import { createLyricsView } from "./lyricsView.js";
import { currentImageUri, fetchLyricsColors, currentTrackInfo, currentTrackMeta, fetchLyrics, fetchAudioAnalysis, LYRICS_FETCH_FAILED, moveVideoToMiddle, exitCinemaIfOpen, showLyricsInMiddle, middleShowsLyrics, mountMiddleOverlay, openQueuePanel, mountLyricsTab, selectTab } from "./spotify.js";

function warn(err) {
  console.warn("[videoLyrics]", err);
}

function ready() {
  return !!(
    window.Spicetify?.Player?.data &&
    Spicetify.Player.addEventListener &&
    Spicetify.Platform?.History &&
    Spicetify.CosmosAsync &&
    document.body
  );
}

function start() {
  const idle = createIdleTracker({ idleMs: 30000 });
  const director = createDirector();
  function seek(ms) {
    try {
      Spicetify.Player.seek(ms);
    } catch (err) {
      warn(err);
    }
  }
  const view = createLyricsView(document, seek);
  const middleView = createLyricsView(document, seek);
  const overlay = mountMiddleOverlay(middleView);
  // Spotify first; LRCLIB only when Spotify has nothing. One call, so latestOnly drops both together.
  function fetchAny(uri) {
    return lyricsForPlayback(uri, {
      async fetchSpotify(id) {
        const body = await fetchLyrics(id);
        if (body === LYRICS_FETCH_FAILED) throw new Error("Spotify lyrics fetch failed");
        return parseLyrics(body);
      },
      fetchFallback: () => fetchLrclib(currentTrackMeta()),
      trackInfo: currentTrackInfo,
      timeMap: videoTimeMap,
    });
  }
  // Spotify's lyrics for a video are timed to its audio track; the video has its own intro and edits.
  const videoMaps = new Map();
  async function videoTimeMap(audioUri, videoUri) {
    if (!videoMaps.has(videoUri)) {
      const [audioSegs, videoSegs] = await Promise.all([fetchAudioAnalysis(audioUri), fetchAudioAnalysis(videoUri)]);
      const map = audioSegs && videoSegs ? alignAudioToVideo(audioSegs, videoSegs) : null;
      if (!map) return null;
      videoMaps.set(videoUri, map);
    }
    return videoMaps.get(videoUri);
  }
  const fetchLatest = latestOnly(fetchAny);
  let fallbackLyrics = null;

  function updateOverlay() {
    overlay.update(!!fallbackLyrics && !currentTrackInfo().hasVideo && middleShowsLyrics());
  }
  let acting = 0;
  let actionQueue = Promise.resolve();

  async function runAction(action) {
    // The middle was showing the video, not a page the user was browsing,
    // so lyrics can take its place without waiting for idle.
    if (action === "exitCinema") {
      if (exitCinemaIfOpen()) showLyricsInMiddle();
    }
    else if (action === "moveVideoToMiddle") moveVideoToMiddle();
    else if (action === "showLyricsInMiddle") showLyricsInMiddle();
    else if (action === "openQueuePanel") await openQueuePanel();
    else if (action && action.selectTab) selectTab(action.selectTab);
  }

  function run(actions) {
    if (!actions.length) return;
    actionQueue = actionQueue.then(async () => {
      acting++;
      try {
        for (const action of actions) {
          try {
            await runAction(action);
          } catch (err) {
            warn(err);
          }
        }
      } finally {
        // History listeners may fire just after our call returns.
        setTimeout(() => acting--, 0);
      }
    });
  }

  function handle(event) {
    try {
      run(director.handle(event));
    } catch (err) {
      warn(err);
    }
  }

  async function loadLyrics(uri) {
    try {
      const lyrics = await fetchLatest(uri);
      if (lyrics === undefined) return;
      if (currentTrackInfo().uri !== uri) return;
      fallbackLyrics = lyrics?.source === "LRCLIB" ? lyrics : null;
      view.setLyrics(lyrics);
      middleView.setLyrics(lyrics);
      view.setPosition(Spicetify.Player.getProgress());
      middleView.setPosition(Spicetify.Player.getProgress());
      updateOverlay();
    } catch (err) {
      warn(err);
    }
  }

  let trackSeq = 0;

  // Old colors stay until the new song's arrive, so the view does not flash grey between songs.
  async function loadColors(seq) {
    try {
      const colors = await fetchLyricsColors(currentImageUri());
      if (seq !== trackSeq) return;
      view.setColors(colors);
      middleView.setColors(colors);
    } catch (err) {
      warn(err);
    }
  }

  async function onTrack() {
    try {
      const seq = ++trackSeq;
      let info = currentTrackInfo();
      loadColors(seq);
      // Clear old lines now: clicking one would seek the new song to the old song's time.
      view.showLoading();
      fallbackLyrics = null;
      updateOverlay();
      if (!info.hasVideo) run(["exitCinema"]);
      // Lyrics filling the middle means the user is watching, not browsing,
      // so a video can take their place without waiting for idle.
      const watchingLyrics = info.hasVideo && middleShowsLyrics();
      handle({ type: "track", hasVideo: info.hasVideo, idle: idle.isIdle() || watchingLyrics });
      // When skipping fast, songchange for a video fires before audio_association is loaded.
      for (let i = 0; info.hasVideo && !info.uri && i < 20 && seq === trackSeq; i++) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        info = currentTrackInfo();
      }
      if (seq === trackSeq) loadLyrics(info.uri);
    } catch (err) {
      warn(err);
    }
  }

  function onUserInput(event) {
    if (event.isTrusted) idle.markActive();
  }
  for (const type of ["click", "wheel", "keydown"]) {
    document.addEventListener(type, onUserInput, true);
  }
  window.addEventListener("focus", () => idle.setFocused(true));
  window.addEventListener("blur", () => idle.setFocused(false));
  idle.setFocused(document.hasFocus());

  try {
    Spicetify.Platform.History.listen(() => {
      if (!acting) idle.markActive();
      updateOverlay();
    });
  } catch (err) {
    warn(err);
  }

  try {
    mountLyricsTab({ view, onPicked: (tab) => handle({ type: "tabPicked", tab }) });
  } catch (err) {
    warn(err);
  }

  Spicetify.Player.addEventListener("songchange", onTrack);
  Spicetify.Player.addEventListener("onprogress", (event) => {
    try {
      const ms = event?.data ?? Spicetify.Player.getProgress();
      view.setPosition(ms);
      middleView.setPosition(ms);
    } catch (err) {
      warn(err);
    }
  });
  setInterval(() => {
    handle({ type: "tick", idle: idle.isIdle() });
    updateOverlay();
  }, 1000);
  onTrack();
}

function waitAndStart() {
  if (!ready()) {
    setTimeout(waitAndStart, 300);
    return;
  }
  try {
    start();
  } catch (err) {
    warn(err);
  }
}

waitAndStart();
