const LYRICS_TAB_ID = "vl-lyrics-tab";
const LYRICS_PANEL_ID = "vl-lyrics-panel";
const SPOTIFY_TABS = { "queue-tab": "queue", "history-tab": "history" };

function queuePanelOpen() {
  const peek = document.querySelector(".Root__right-sidebar-peekContent");
  // The Queue button is pressed exactly when the Queue panel shows (NOTES.md section 3).
  if (!peek) return !!document.querySelector('[data-testid="control-button-queue"][aria-pressed="true"]');
  return peek.getAttribute("aria-hidden") === "false" && !!document.getElementById("queue-tab");
}

// `uri` is the track to fetch lyrics for: the audio track, even while its video plays.
export function currentTrackInfo() {
  try {
    const item = Spicetify.Player.data?.item;
    if (!item || typeof item.uri !== "string" || !item.uri.startsWith("spotify:track:")) {
      return { uri: null, hasVideo: false };
    }
    const hasVideo = item.mediaType === "video";
    const uri = hasVideo ? item.metadata?.audio_association : item.uri;
    return { uri: typeof uri === "string" && uri.startsWith("spotify:track:") ? uri : null, hasVideo };
  } catch (err) {
    console.warn("[videoLyrics]", err);
    return { uri: null, hasVideo: false };
  }
}

export async function fetchLyrics(uri) {
  try {
    if (!uri) return null;
    const id = uri.split(":")[2];
    const body = await Spicetify.CosmosAsync.get(
      `https://spclient.wg.spotify.com/color-lyrics/v2/track/${id}?format=json&vocalRemoval=false&market=from_token`,
    );
    return body && body.lyrics ? body : null;
  } catch (err) {
    console.warn("[videoLyrics]", err);
    return null;
  }
}

export function moveVideoToMiddle() {
  if (!currentTrackInfo().hasVideo) return;
  const history = Spicetify.Platform.History;
  const location = history.location;
  if (location.state?.cinemaState === "nowPlayingView") return;
  // History.push drops or ignores cinemaState; only replace works (NOTES.md section 9).
  history.replace({
    pathname: location.pathname,
    search: location.search,
    state: { ...(location.state || {}), cinemaState: "nowPlayingView" },
  });
}

// Spotify keeps cinema mode across tracks; with no video it shows its own
// full-window lyrics there, hiding the page and the playbar (NOTES.md section 9).
export function exitCinemaIfOpen() {
  const history = Spicetify.Platform.History;
  const location = history.location;
  if (location.state?.cinemaState !== "nowPlayingView") return false;
  history.replace({
    pathname: location.pathname,
    search: location.search,
    state: { ...location.state, cinemaState: "closed" },
  });
  return true;
}

export function showLyricsInMiddle() {
  const info = currentTrackInfo();
  if (!info.uri || info.hasVideo) return;
  const history = Spicetify.Platform.History;
  if (history.location.pathname !== "/lyrics") history.push("/lyrics");
}

export async function openQueuePanel() {
  if (!queuePanelOpen()) document.querySelector('[data-testid="control-button-queue"]')?.click();
  const deadline = Date.now() + 3000;
  while (!queuePanelOpen() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

let tabs = null;

export function mountLyricsTab({ view, onPicked }) {
  let lyricsSelected = false;
  let tabEl = null;
  let spotifyScrollTop = 0;
  view.el.id = LYRICS_PANEL_ID;
  view.el.setAttribute("role", "tabpanel");
  view.el.setAttribute("aria-labelledby", LYRICS_TAB_ID);

  function setAttr(el, name, value) {
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
  }

  function setDisplay(el, value) {
    if (el && el.style.display !== value) el.style.display = value;
  }

  function makeTab(spotifyTab) {
    const tab = document.createElement("button");
    tab.className = spotifyTab.className;
    tab.id = LYRICS_TAB_ID;
    tab.type = "button";
    tab.textContent = "Lyrics";
    tab.setAttribute("role", "tab");
    tab.setAttribute("data-encore-id", "tabItem");
    tab.setAttribute("aria-controls", LYRICS_PANEL_ID);
    return tab;
  }

  // Lyrics and Spotify's panels share one scroll box, so each keeps its own position.
  function scrollBox() {
    return view.el.closest("[data-overlayscrollbars-viewport]");
  }

  function showCurrentLine() {
    const line = view.el.querySelector(".vl-current");
    if (line) line.scrollIntoView({ block: "center" });
    else if (scrollBox()) scrollBox().scrollTop = 0;
  }

  function apply() {
    const queueTab = document.getElementById("queue-tab");
    const tablist = queueTab?.closest('[role="tablist"]');
    const host = document.getElementById("queue-panel")?.parentElement;
    if (!queueTab || !tablist || !host) return;

    if (!tabEl) tabEl = makeTab(queueTab);
    if (tablist.firstElementChild !== tabEl) tablist.insertBefore(tabEl, tablist.firstElementChild);
    const remounted = view.el.parentElement !== host;
    if (remounted) host.appendChild(view.el);

    setAttr(tabEl, "aria-selected", String(lyricsSelected));
    setAttr(tabEl, "tabindex", lyricsSelected ? "0" : "-1");
    const panels = [document.getElementById("queue-panel"), document.getElementById("history-panel")];
    if (lyricsSelected) {
      for (const id of Object.keys(SPOTIFY_TABS)) {
        const tab = document.getElementById(id);
        if (tab) {
          setAttr(tab, "aria-selected", "false");
          setAttr(tab, "tabindex", "-1");
        }
      }
      panels.forEach((panel) => setDisplay(panel, "none"));
      setDisplay(view.el, "");
      if (remounted) showCurrentLine();
    } else {
      panels.forEach((panel) => setDisplay(panel, ""));
      setDisplay(view.el, "none");
    }
  }

  function safeApply() {
    try {
      apply();
    } catch (err) {
      console.warn("[videoLyrics]", err);
    }
  }

  function showLyrics() {
    const wasSelected = lyricsSelected;
    if (!wasSelected) spotifyScrollTop = scrollBox()?.scrollTop ?? 0;
    lyricsSelected = true;
    safeApply();
    if (!wasSelected) showCurrentLine();
  }

  function showSpotifyTab(clicked) {
    const wasSelected = lyricsSelected;
    lyricsSelected = false;
    // React keeps its own selected tab; if the user re-picks that tab React won't
    // re-render, so restore the attributes we overrode ourselves.
    for (const id of Object.keys(SPOTIFY_TABS)) {
      const tab = document.getElementById(id);
      if (tab) {
        setAttr(tab, "aria-selected", String(tab === clicked));
        setAttr(tab, "tabindex", tab === clicked ? "0" : "-1");
      }
    }
    safeApply();
    const box = scrollBox();
    if (wasSelected && box) box.scrollTop = spotifyScrollTop;
  }

  document.addEventListener(
    "click",
    (event) => {
      try {
        const tab = event.target?.closest?.('#Desktop_PanelContainer_Id [role="tab"]');
        if (!tab) return;
        let picked = null;
        if (tab.id === LYRICS_TAB_ID) {
          showLyrics();
          picked = "lyrics";
        } else if (SPOTIFY_TABS[tab.id]) {
          showSpotifyTab(tab);
          picked = SPOTIFY_TABS[tab.id];
        }
        if (picked && event.isTrusted) onPicked(picked);
      } catch (err) {
        console.warn("[videoLyrics]", err);
      }
    },
    true,
  );

  // apply() only writes when something is missing or wrong, so the mutations it
  // causes produce a callback that finds nothing to do: no loop.
  const observer = new MutationObserver(safeApply);
  observer.observe(document.body, { childList: true, subtree: true });
  safeApply();

  tabs = {
    select(tab) {
      if (tab === "lyrics") showLyrics();
      else document.getElementById(`${tab}-tab`)?.click();
    },
    lyricsSelected: () => lyricsSelected,
    deselectLyrics() {
      lyricsSelected = false;
      safeApply();
    },
  };
}

export function selectTab(tab) {
  if (!tabs) return;
  // "queue" only flips the sidebar away from Lyrics; a user reading Recently played keeps it.
  if (tab === "queue") {
    if (!tabs.lyricsSelected()) return;
    // With the panel closed, reopening Queue would otherwise show Lyrics next to /lyrics in the middle.
    if (!queuePanelOpen()) {
      tabs.deselectLyrics();
      return;
    }
  }
  if (!queuePanelOpen()) return;
  tabs.select(tab);
}
