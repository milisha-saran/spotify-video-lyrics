import { parseLyrics, latestOnly } from "./lyrics.js";
import { createIdleTracker } from "./idle.js";
import { createDirector } from "./director.js";
import { createLyricsView } from "./lyricsView.js";
import { currentTrackInfo, fetchLyrics, moveVideoToMiddle, exitCinemaIfOpen, showLyricsInMiddle, openQueuePanel, mountLyricsTab, selectTab } from "./spotify.js";

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
  const view = createLyricsView(document, (ms) => {
    try {
      Spicetify.Player.seek(ms);
    } catch (err) {
      warn(err);
    }
  });
  const fetchLatest = latestOnly(fetchLyrics);
  let acting = 0;
  let actionQueue = Promise.resolve();

  async function runAction(action) {
    if (action === "exitCinema") exitCinemaIfOpen();
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
      const body = await fetchLatest(uri);
      if (body === undefined) return;
      if (currentTrackInfo().uri !== uri) return;
      view.setLyrics(parseLyrics(body));
      view.setPosition(Spicetify.Player.getProgress());
    } catch (err) {
      warn(err);
    }
  }

  let trackSeq = 0;

  async function onTrack() {
    try {
      const seq = ++trackSeq;
      let info = currentTrackInfo();
      // Clear old lines now: clicking one would seek the new song to the old song's time.
      view.showLoading();
      if (!info.hasVideo) run(["exitCinema"]);
      handle({ type: "track", hasVideo: info.hasVideo, idle: idle.isIdle() });
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
      view.setPosition(event?.data ?? Spicetify.Player.getProgress());
    } catch (err) {
      warn(err);
    }
  });
  setInterval(() => handle({ type: "tick", idle: idle.isIdle() }), 1000);
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
