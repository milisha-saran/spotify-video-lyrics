# Runtime findings: Spotify internals

- Date: 2026-11-10
- Spotify: **1.3.8.620** (macOS, arm64). The plan assumed 1.3.4.258, but Spotify
  installed a pending update when it restarted during this task. Every finding
  below was observed on 1.3.8.620.
- Spicetify CLI 2.46.4, `spicetify backup apply enable-devtools`.
- Method: Spotify started with `--remote-debugging-port=9222 --remote-debugging-address=127.0.0.1`.
  JS ran in the `https://xpui.app.spotify.com/index.html` page through the Chrome
  DevTools Protocol (`Runtime.evaluate`, `awaitPromise`, `userGesture: true`).
  Clicks were `element.click()` from JS.
- Test tracks: "Fairytale of New York" (The Pogues), audio
  `spotify:track:3VTNVsTTu05dmTsVFrmGpK`, video `spotify:track:5AXDr9AJoUSXH80BBaBE7Y`.
  Audio-only track: "Please Come Home for Christmas - 2013 Remaster" (Eagles),
  `spotify:track:3QIoEi8Enr9uHffwInGIsC` (no `video_association`).
- "Pressed" below always means the attribute `aria-pressed="true"` on the button.
- Anything marked **untested** was not observed. Do not treat it as known.

## Summary for Task 6

| # | Need | Status | Canonical recipe |
|---|------|--------|------------------|
| 1 | Is the sidebar shown? | CONFIRMED | `document.querySelector('.Root__right-sidebar-peekContent')?.getAttribute('aria-hidden') === 'false'` |
| 2 | Is the Queue panel open? | CONFIRMED | `!!document.getElementById('queue-tab') && <sidebar shown>` |
| 3 | Open the Queue panel | CONFIRMED (no API) | If not open, click `[data-testid="control-button-queue"]`. |
| 4 | Tab row, content, active tab | CONFIRMED | Tablist `#Desktop_PanelContainer_Id [role="tablist"]`. Tabs `#queue-tab`, `#history-tab`. Active tab has `aria-selected="true"`. |
| 5 | Node to show Lyrics in | CONFIRMED | `document.getElementById('queue-panel').parentElement` (holds `#queue-panel` and `#history-panel`). Hide both panels, show the Lyrics node there. |
| 6 | Select Recently played | CONFIRMED | `document.getElementById('history-tab').click()` |
| 7 | Detect video (`hasVideo`) | CONFIRMED | `Spicetify.Player.data?.item?.mediaType === "video"` |
| 8 | Put video in cinema mode | CONFIRMED | `History.replace({...location, state: {...location.state, cinemaState: "nowPlayingView"}})`. **Only call when `hasVideo`.** `History.push` does not work. |
| 9 | Detect cinema mode | CONFIRMED | `Spicetify.Platform.History.location.state?.cinemaState === "nowPlayingView"` |
| 10 | Video keeps playing in middle with Queue open | CONFIRMED | Video rect `[8, 8, 1026, 903]`, `currentTime` advancing. |
| 11 | Native lyrics route | CONFIRMED | `Spicetify.Platform.History.push('/lyrics')`. It exits cinema mode, so use it **only for songs without a video**. |
| 12 | Lyrics endpoint | CONFIRMED with the **audio** track id | `syncType: "LINE_SYNCED"`. While a video plays, use `item.metadata.audio_association`. The video id returns `{code: 404}`. |

Not found: a panel API, `associated_video_id`, `[data-right-sidebar-hidden]`,
`.NowPlayingView`, `[data-testid="NPV_Panel_OpenDiv"]`.

Injected DOM (details in "Injected nodes"):
- A node added next to the tabpanels survives tab switches but is removed when the panel closes.
- A node added to the tablist is removed on every tab switch.
- Task 6 must re-inject with a `MutationObserver`.

## 1. Panel API (brief Step 3.1)

`Object.keys(Spicetify.Platform)`: no key contains `Panel` or `RightSidebar`.
Nearby keys: `History`, `PlayerAPI`, `PlaybackAPI`, `VideoAPI`, `BuddyFeedAPI`,
`RecentlyPlayedAPI`, `PlayHistoryAPI`. `Spicetify.Panel` is `undefined`.
`Spicetify.Platform.Registry._map` has no key matching `/panel|sidebar|queue/i`.

`Spicetify._reservedPanelIds` exists:

```
{ NowPlayingView: "now_playing_view", BuddyFeed: "buddy_feed", Birdhouse: "birdhouse",
  Puffin: "puffin", PuffinOverlay: "puffin_overlay", PuffinActivation: "puffin_activation",
  PuffinActivationOverlay: "puffin_activation_overlay", Queue: "queue",
  DevicePicker: "device_picker", Disabled: "disabled", EditTransition: "edit_transition",
  AssistedCuration: "assisted_curation", Messaging: "messaging" }
```

Result: **NOT FOUND** (no panel API). Use the Queue button (section 3).

## 2. Right sidebar: container and shown/hidden (brief item 8)

- Panel container: `aside#Desktop_PanelContainer_Id`. It is always in the DOM,
  420px wide, and keeps its id for every panel.
- Ancestors: `div.Root__right-sidebar-peekContent` < `div.Root__right-sidebar-overlayWrapper`.
  Sibling root: `div.Root__right-sidebar-peek`.

Observed in 8 states (open Queue, switch tab, close, hide, reopen):

| | Shown | Hidden (after `Hide Now Playing view`) |
|---|---|---|
| `.Root__right-sidebar-peekContent` `aria-hidden` | `"false"` | `"true"` |
| `.Root__right-sidebar-peekContent` `inert` attribute | absent | present |
| `.Root__right-sidebar-peekContent` children | 1 | 1 (still mounted) |
| `.Root__right-sidebar-peek` has class `Root__right-sidebar-expanded` | yes (width 420) | no (width 40) |
| `aside#Desktop_PanelContainer_Id` width | 420 | 420 (still mounted, clipped) |

**Primary detector:** `.Root__right-sidebar-peekContent[aria-hidden="false"]`.
**Secondary:** `.Root__right-sidebar-peek.Root__right-sidebar-expanded`.

When hidden, the sidebar content is **hidden, not unmounted**: the `aside` and its
child stay in the DOM, and the wrapper gets `aria-hidden="true"` and `inert`.

Class-name stability: in 1.3.8.620 the `Root__*` names are plain, readable names.
Hashed classes in the same nodes look like `qoHJpiLKBxdnA85Ezk8q`. Whether
`Root__*` names stay the same across Spotify versions is **untested**.

`[data-right-sidebar-hidden]` does **NOT** exist in any state.
`.NowPlayingView` and `[data-testid="NPV_Panel_OpenDiv"]`: **NOT FOUND**.
`[data-testid="PanelHeader_CloseButton"]` exists only on the Queue panel.

## 3. Opening the Queue panel and knowing it is open (brief Step 3.2)

Button: `[data-testid="control-button-queue"]`. It is pressed (and `data-active="true"`)
exactly when the Queue panel shows.

**Canonical "Queue open" detector (locale-proof):**

```js
const sidebarShown = document.querySelector('.Root__right-sidebar-peekContent')
  ?.getAttribute('aria-hidden') === 'false';
const queueOpen = sidebarShown && !!document.getElementById('queue-tab');
```

Checked in 8 states. `#queue-tab` existed in every state where the Queue panel
showed, and in no other state. The Queue button was pressed in exactly the same
states, so it is an equivalent check.

The `aside`'s `aria-label` (`"Queue"`, `"Now playing view"`) also names the panel.
It is localized text. Do not use it as the detector.

Observed transitions (JS `click()`):

| Start | Action | Panel after | `#queue-tab` | Button pressed | Sidebar shown |
|---|---|---|---|---|---|
| Queue | Queue button | Now playing view | no | no | yes |
| Now playing view | Queue button | Queue | yes | yes | yes |
| Queue | `[data-testid="PanelHeader_CloseButton"] button` | Now playing view | no | no | yes |
| Now playing view | `button[aria-label="Hide Now Playing view"]` | (NPV, hidden) | no | no | no |
| Hidden | Queue button | Queue | yes | yes | yes |
| Queue (opened from hidden) | Queue button | Now playing view, hidden | no | no | no |

Closing the Queue panel always switched the panel to the Now Playing view. In every
hidden state the hidden panel was the Now Playing view, not Queue. I found no way
to reach "sidebar hidden with Queue as the current panel". So `#queue-tab` was
never present while hidden. Other ways to hide the sidebar (keyboard shortcut,
dragging the edge): **untested**.

Recipe:

```js
if (!queueOpen) document.querySelector('[data-testid="control-button-queue"]')?.click();
```

## 4. Queue panel: tab row, content area, active tab (brief Step 3.3)

With the Queue panel open, the only `[role="tablist"]` in the document is inside it:

```
aside#Desktop_PanelContainer_Id
  div > div > div
    div[data-encore-id="tabs"]
      div.e-101040-tab-list__container      (overflow-button--start, tablist, overflow-button--end)
        div[data-encore-id="tabList"][role="tablist"][aria-label=""]
          button#queue-tab  [role="tab"][aria-controls="queue-panel"]  [aria-selected="true"]  [data-encore-tab-id="queue-tab"]
          button#history-tab[role="tab"][aria-controls="history-panel"][aria-selected="false"] [data-encore-tab-id="history-tab"]
    span > div[data-testid="PanelHeader_CloseButton"] > button
  div[data-overlayscrollbars="host"] > div[data-overlayscrollbars-viewport] > div
    div  <- CONTENT HOST = document.getElementById('queue-panel').parentElement
      div#queue-panel  [role="tabpanel"][aria-labelledby="queue-tab"]   [data-encore-id="tabPanel"]
      div#history-panel[role="tabpanel"][aria-labelledby="history-tab"] [data-encore-id="tabPanel"]
```

- Active tab: `aria-selected="true"`, `tabIndex === 0`. Inactive: `"false"`, `-1`.
- Both tabpanels are always in the DOM. Neither has `hidden`; both are `display: block`.
  The inactive panel is **empty** (0 children, height 0).
- **Lyrics view host (one line):** `document.getElementById('queue-panel').parentElement`.
  To show Lyrics: append the Lyrics node there and hide `#queue-panel` and `#history-panel`.
  To leave Lyrics: remove or hide the Lyrics node and un-hide both panels.
  Hiding the panels with inline style while React owns them: **untested**.
- The content host sits inside an OverlayScrollbars viewport, so it scrolls.
- Class names like `e-101040-tab-item` carry an Encore version prefix. Use ids,
  roles and `data-encore-id` instead.

## 5. Selecting Recently played, and tab persistence (brief Step 3.3)

```js
document.getElementById('history-tab').click();
```

Result: `history-tab` selected, `#history-panel` filled, `#queue-panel` emptied.
`document.getElementById('queue-tab').click()` switches back. **CONFIRMED.**

Persistence: with Recently played selected, closing the Queue panel (Queue button
or the close button) and reopening it **resets to the Queue tab**. Seen twice.
This also held when the panel was reopened from the hidden sidebar.

## 6. Injected nodes vs. React re-renders

Test: inject `div#probe-content` into the content host (next to the tabpanels) and
`button#probe-tab[role="tab"]` into the tablist. Then switch tabs and close/reopen.

| Step | `#probe-content` (content host) | `#probe-tab` (tablist) |
|---|---|---|
| After inject | present | present |
| Switch to Recently played | **present** | **removed** |
| Switch back to Queue | present | removed |
| 3 s idle (queue list updating) | present | removed |
| Close panel (Queue button) | **removed** | removed |
| Reopen panel | absent | absent |

No `console.error` output during the test.

Why the tab is lost: on a tab switch React replaced the whole tab header.
`[role="tablist"]` and `[data-encore-id="tabs"]` were new elements afterwards.
A `span` appended to `[data-encore-id="tabs"]` was also removed.
The content host kept the same element across tab switches.

So Task 6 must:
- re-insert its tab button after each tab switch and each panel open, and
- re-insert its content node after each panel open.

A `MutationObserver` on `#Desktop_PanelContainer_Id` (`childList`, `subtree`) will
see these changes. Whether re-inserting causes flicker or React errors: **untested**.

All probe nodes were removed after the test (`[id^=probe]` absent).

## 7. Music video playback and metadata (brief Step 3.4)

Before switching, the track played as audio:

```
uri: spotify:track:3VTNVsTTu05dmTsVFrmGpK, mediaType: "audio", metadata["media.type"]: "audio",
metadata.video_association: "spotify:track:5AXDr9AJoUSXH80BBaBE7Y", has_lyrics: present
```

So **a track with a video plays as audio by default** (in this session, before
any switch). `button[aria-label="Switch to video"]` shows only in the Now Playing
view. `[data-testid="cover-art-button"]` in the playbar opens that view.

After clicking "Switch to video":

```
uri: spotify:track:5AXDr9AJoUSXH80BBaBE7Y   (the URI changes to the video track)
mediaType: "video", metadata["media.type"]: "video"
metadata.audio_association: "spotify:track:3VTNVsTTu05dmTsVFrmGpK"
metadata.original_video: "<32-hex id>", metadata.video_rendering_enabled: "true"
metadata.has_lyrics: "false"   (wrong for lyrics; the audio track has lyrics)
video_association: absent
```

- `associated_video_id` does **NOT** exist. The audio item has `video_association`.
  The video item has `audio_association`.
- The button label flips to `Switch to audio`.
- Clicking "Switch to video" put the video straight into cinema mode.
- After the switch, video mode stuck. The next two tracks that had videos
  ("Do They Know It's Christmas?", "Happy Xmas (War Is Over)") started as
  `mediaType: "video"` without any click. A track with no video played as `"audio"`.
  Whether this preference survives a Spotify restart: the video track was still
  the current item after the restart, but a fresh track was **untested**.

## 8. `hasVideo` decision (brief Step 4)

A track can have a video and still play as audio. So `hasVideo` means
"a video is actually playing":

```js
const item = Spicetify.Player.data?.item;
const hasVideo = item?.mediaType === "video";
const audioUri = hasVideo ? item.metadata.audio_association : item?.uri;  // use for lyrics
```

## 9. Cinema mode (brief Step 3.5)

Observed `Spicetify.Platform.History.location`:

| State | `location.state.cinemaState` | Video element rect (window 1470x919) |
|---|---|---|
| Cinema, NPV panel | `"nowPlayingView"` | `[133, 8, 1204, 903]` |
| Cinema, Queue panel | `"nowPlayingView"` | `[8, 8, 1026, 903]` |
| Minimized, NPV panel | `"closed"` | `[1058, 128, 388, 291]` inside the `aside`; `[data-testid="video-player-npv"]` present |
| Minimized, Queue panel | `"closed"` | `[16, 844, 75, 56]` (playbar cover-art thumbnail) |

Values seen: `"nowPlayingView"`, `"closed"`, or no `cinemaState` key.

Buttons:
- In cinema: `button[aria-label="Minimize Now Playing view"]`. Minimizing fires
  `PUSH {referrer}` then `REPLACE {cinemaState: "closed", referrer}` (seen with `History.listen`).
- In the NPV panel with video: `button[aria-label="Expand Now Playing view"]`.
  Clicking it sets `cinemaState: "nowPlayingView"`. **CONFIRMED.**
  This button does not exist while the Queue panel shows.

`History.push` (all from `cinemaState: "closed"`):
- `History.push({pathname: <same>, state: {cinemaState: "nowPlayingView"}})`: **no effect**.
  No PUSH event fired. `History.push('/search', {cinemaState: "nowPlayingView"})`
  while on `/search` also did nothing.
- `History.push({pathname: "/search", state: {...}})` from `/`: navigates but drops
  the state. The video stays in the playbar.

`History.replace` **works**, on `/` and on `/search`, with the Queue panel open:

```js
const H = Spicetify.Platform.History;
H.replace({
  pathname: H.location.pathname,
  search: H.location.search,
  state: { ...(H.location.state || {}), cinemaState: "nowPlayingView" },
});
// state.cinemaState === "nowPlayingView", video rect [8, 8, 1026, 903],
// "Minimize Now Playing view" present, Queue panel still open.
```

**With an audio-only track** (Eagles track above, `mediaType: "audio"`, Queue open),
the same `replace` also sets `cinemaState: "nowPlayingView"` and shows the Minimize
button. There is no `<video>`. Instead Spotify shows its own lyrics view in the
middle area, and `main` collapses to 0x0. In the screenshot the top bar and playbar
were not visible, though the playbar element still had a normal rect. Clicking
"Minimize Now Playing view" restored the normal layout (`cinemaState: "closed"`).
This is not what the extension wants. **Only call it when `hasVideo`.**

Detect: `Spicetify.Platform.History.location.state?.cinemaState === "nowPlayingView"`.
DOM check that agrees: `!!document.querySelector('[aria-label="Minimize Now Playing view"]')`.

Navigating away (`History.push('/search')` or `/lyrics`) exits cinema mode.
The video shrinks to the playbar thumbnail and keeps playing.

Fallback: when the NPV panel shows the video, click `[aria-label="Expand Now Playing view"]`.

## 10. Video in the middle while the Queue panel is open (brief Step 3.6)

From cinema mode with the NPV panel, clicking the Queue button:
- The panel becomes Queue. `cinemaState` stays `"nowPlayingView"`.
- The video rect changes from `[133, 8, 1204, 903]` to `[8, 8, 1026, 903]`: the area
  left of the 420px sidebar (the `aside` starts at x=1042).
- `video.paused === false`. After `replace` back into cinema, `currentTime` moved
  3.0 s in 3 s. A screenshot showed the video on the left and Queue/Recently played on the right.
- The left library sidebar is off-screen in cinema mode (rect x = -1026).

**CONFIRMED.**

## 11. Native lyrics route (brief item 7)

`Spicetify.Platform.History.push('/lyrics')`: `location.pathname === "/lyrics"`,
`[data-testid="lyrics-button"]` becomes pressed, lyrics render in
`main[aria-label="Spotify"]` (rect `[357, 64, 677, 767]`). **CONFIRMED.**

Side effect: cinema mode exits and the video drops to the playbar thumbnail (it
keeps playing). So use `/lyrics` **only for songs without a video**. For video
songs, show lyrics in the Queue panel instead.

## 12. Lyrics endpoint (brief item 9)

```js
await Spicetify.CosmosAsync.get(
  `https://spclient.wg.spotify.com/color-lyrics/v2/track/${id}?format=json&vocalRemoval=false&market=from_token`);
```

- Audio id `3VTNVsTTu05dmTsVFrmGpK`: top keys `lyrics, colors, hasVocalRemoval`;
  `lyrics.syncType: "LINE_SYNCED"`, provider `MusixMatch`, 44 lines.
  Line keys `startTimeMs, words, syllables, endTimeMs, transliteratedWords`.
  `startTimeMs` is a **string** (e.g. `"8160"`). **CONFIRMED.**
- Video id `5AXDr9AJoUSXH80BBaBE7Y`: the promise resolves (no throw) to
  `{code: 404, message: "Failed to fetch", error, stack}`. Check for `lyrics` in the
  response. Do not rely on a throw.

## 13. Empty lyrics page and LRCLIB (Spotify 1.3.9.2055, 2026-11-17)

- With no Spotify lyrics, `/lyrics` shows one of several messages: "You'll have to guess
  the lyrics for this one.", "You caught us, we're still working on getting lyrics for
  this one.", or (on a failed fetch) "Couldn't load the lyrics for this song. Try again
  later." All three sit in `#main-view main`. **CONFIRMED.**
- `#main-view .main-view-container` is `position: relative` and covers the whole middle
  (602x771 at the test window size). An absolute `inset: 0` child covers the page. **CONFIRMED.**
- The color-lyrics endpoint returns an empty body (no `lyrics`) for songs without lyrics,
  and sometimes fails for songs that have them. A song that fails once can load later.
- `Spicetify.Player.data.item.duration.milliseconds` holds the length. `item.name`,
  `item.artists[0].name`, `item.album.name` hold title, artist, album. **CONFIRMED.**
- `fetch("https://lrclib.net/api/...")` works from the xpui page: Spotify's CSP allows
  it and LRCLIB sends `access-control-allow-origin: *`. **CONFIRMED.**

## 14. Music video vs. its audio track (Spotify 1.3.9.2055, 2026-11-17)

- A video has no offset field. `item.metadata` has `audio_association`, its own
  `original_video`, and the track metadata (`/metadata/4/track/<gid>`) shows its own
  `original_audio` and ISRC. Video and audio are separate recordings. **CONFIRMED.**
- `Spicetify.getAudioData(uri)` returns the audio analysis (`segments` with `start`,
  `duration`, 12 `pitches`, 12 `timbre`) for both the video uri and the audio uri. **CONFIRMED.**
- Offsets on seven videos ranged from -2 s to +51 s, with cut endings on some. Length
  difference does not predict them. Details: `work/analysis/2026-11-17-video-lyrics-alignment/`.
- LRCLIB lyrics follow the album audio too. All 20 LRCLIB records for "Pyramid Song"
  (Radiohead) are 289 s, the audio track's length, so they get the same shift on a video.

## 15. Lyrics page colors (Spotify 1.3.9.2055, 2026-11-17)

- The lyrics response's `colors` (`background`, `text`, `highlightText`, signed ARGB ints) is not
  what the page shows. Raw background (210, 64, 42) showed as (101, 0, 0); text is black but showed pink.
- The page sets `--lyrics-color-*` from `dynamicColors.higherContrast` (`xpui-modules.js`).
- `Spicetify.GraphQL.Request(Definitions.getDynamicColorsByUris, {imageUris: [item.images[0].url]})`
  (a `spotify:image:` uri) returns `dynamicColors[0].dark.higherContrast` with `backgroundBase`,
  `textBase`, `textSubdued` as `{red, green, blue, alpha}`. On "Fairytale Of New York - Live" these
  were (101,0,0), white, (255,190,175): exactly the page's colors. **CONFIRMED.**
- `Spicetify.colorExtractor(trackUri)` returned null for every track tried.

## Other notes

- `Spicetify.Player.data` and `Spicetify.Platform` were ready on the first poll after load.
- Spotify starts paused after a restart (seen once, with the video track current).
- `spicetify backup apply` on 1.3.8.620 warned "Could not detect Spotify build type
  in Spotify, skipping validation". Patching otherwise succeeded.
- Spotify 1.3.8.620 replaced the patched 1.3.4.258 when it restarted. Expect each
  Spotify update to remove the patch until `spicetify backup apply` runs again.
- 2026-11-17: Spotify updated to 1.3.9.2055. `spicetify backup apply` run from the Claude
  app failed at "Copying raw assets": macOS refused writes inside `Spotify.app`
  ("Operation not permitted", also outside Claude's sandbox) after the old `Apps` folder
  was removed. Running `spicetify apply` from Terminal.app worked. The stock backup is in
  `~/.local/state/spicetify/Backup`.
