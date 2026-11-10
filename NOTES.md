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
- Test track: "Fairytale of New York" (The Pogues).
  Audio `spotify:track:3VTNVsTTu05dmTsVFrmGpK`, video `spotify:track:5AXDr9AJoUSXH80BBaBE7Y`.

## Summary for Task 6

| # | Need | Status | Recipe |
|---|------|--------|--------|
| 1 | Open Queue panel | CONFIRMED (fallback) | No panel API. Click `[data-testid="control-button-queue"]` only when its `aria-pressed` is `"false"`. |
| 1b | Is Queue open? | CONFIRMED | `#Desktop_PanelContainer_Id[aria-label="Queue"]` exists AND sidebar is expanded (see 8). The button's `aria-pressed="true"` agrees. |
| 2 | Tab row, content, active tab | CONFIRMED | Tab row `#Desktop_PanelContainer_Id [role="tablist"]`. Tabs `#queue-tab`, `#history-tab`. Panels `#queue-panel`, `#history-panel`. Active tab has `aria-selected="true"`. |
| 3 | Select Recently played | CONFIRMED | `document.getElementById('history-tab').click()` |
| 4 | Detect video | CONFIRMED | `Spicetify.Player.data.item.mediaType === "video"` |
| 5 | Cinema mode in / detect | CONFIRMED (`replace`, not `push`) | `History.replace({...location, state: {...location.state, cinemaState: "nowPlayingView"}})`. Detect with `History.location.state?.cinemaState === "nowPlayingView"`. |
| 6 | Video keeps playing in middle with Queue open | CONFIRMED | Video moves to the middle area and keeps playing. |
| 7 | Navigate to `/lyrics` | CONFIRMED | `Spicetify.Platform.History.push('/lyrics')`. This exits cinema mode. |
| 8 | Right sidebar container, shown/hidden | CONFIRMED, but not the planned attribute | Container `#Desktop_PanelContainer_Id`. Hidden when `.Root__right-sidebar-peek` lacks class `Root__right-sidebar-expanded`, and `.Root__right-sidebar-peekContent` has `aria-hidden="true"`. `[data-right-sidebar-hidden]` does NOT exist. |
| 9 | Lyrics endpoint | CONFIRMED with the **audio** track id | `syncType: "LINE_SYNCED"` for the audio id. The video id returns `{code: 404, message: "Failed to fetch"}`. |

## Step 3.1: Panel API

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

Result: **NOT FOUND** (no panel API). Use the button fallback from 3.2.

## Step 3.2: Queue button and opening the Queue panel

Selector `[data-testid="control-button-queue"]`: **CONFIRMED**. `aria-label="Queue"`.
It has `aria-pressed` and `data-active`, both `"true"` when the Queue panel shows.

The button toggles. Observed sequence (JS `click()` each step):

| Start state | Action | Result: `#Desktop_PanelContainer_Id` `aria-label` | `aria-pressed` |
|---|---|---|---|
| Queue open | click Queue button | `Now playing view` | `false` |
| NPV open | click Queue button | `Queue` | `true` |
| Queue open | click `[data-testid="PanelHeader_CloseButton"] button` | `Now playing view` | `false` |
| Sidebar hidden | click Queue button | `Queue` (sidebar expands) | `true` |

Closing the Queue panel shows the Now Playing view; it does not hide the sidebar.
NPV's own close button is `button[aria-label="Hide Now Playing view"]` (no testid).
That hides the sidebar.

Recipe:

```js
const btn = document.querySelector('[data-testid="control-button-queue"]');
if (btn && btn.getAttribute('aria-pressed') !== 'true') btn.click();
```

## Step 3.3: Tab row, active tab, content area

With the Queue panel open, the only `[role="tablist"]` in the document is inside the panel:

```
aside#Desktop_PanelContainer_Id[aria-label="Queue"]
  div > div > div
    div[data-encore-id="tabs"]
      div.e-101040-tab-list__container      (3 kids: overflow-button--start, tablist, overflow-button--end)
        div[data-encore-id="tabList"][role="tablist"][aria-label=""]
          button#queue-tab  [role="tab"][aria-controls="queue-panel"]  [aria-selected="true"]  [data-encore-tab-id="queue-tab"]  "Queue"
          button#history-tab[role="tab"][aria-controls="history-panel"][aria-selected="false"] [data-encore-tab-id="history-tab"] "Recently played"
    span > div[data-testid="PanelHeader_CloseButton"] > button
  div[data-overlayscrollbars="host"] > div[data-overlayscrollbars-viewport] > div > div
    div#queue-panel  [role="tabpanel"][aria-labelledby="queue-tab"]   [data-encore-id="tabPanel"]
    div#history-panel[role="tabpanel"][aria-labelledby="history-tab"] [data-encore-id="tabPanel"]
```

- Active tab: `aria-selected="true"` and `tabIndex === 0`. Inactive: `"false"` and `-1`.
- Both tabpanels are always in the DOM, neither has `hidden`, both `display: block`.
  The inactive panel is **empty** (0 children, height 0). The active one holds the content.
- The content area the Lyrics view should replace: the parent of `#queue-panel`
  (it holds both tabpanels). It sits inside an OverlayScrollbars viewport.
- Class names like `e-101040-tab-item` carry an Encore version prefix. Do not rely on them.
  Use the ids, roles and `data-encore-id`.
- The tablist's `aria-label` attribute is empty.
- The `aside` keeps `#Desktop_PanelContainer_Id` for every panel. Its `aria-label` names
  the current panel (`"Queue"`, `"Now playing view"`).

## Step 3.3b: Selecting Recently played

```js
document.getElementById('history-tab').click();
```

Result: `history-tab:true`, `queue-tab:false`. `#history-panel` filled (1 child),
`#queue-panel` emptied. `document.getElementById('queue-tab').click()` switches back.
**CONFIRMED.**

## Step 3.4: Music video playback and metadata

Before switching, the track played as audio:

```
uri: spotify:track:3VTNVsTTu05dmTsVFrmGpK, mediaType: "audio", metadata["media.type"]: "audio",
metadata.video_association: "spotify:track:5AXDr9AJoUSXH80BBaBE7Y", has_lyrics: present
```

So **a track with a video plays as audio by default.** Spotify offers
`button[aria-label="Switch to video"]` only inside the Now Playing view
(`[data-testid="cover-art-button"]` in the playbar opens NPV).

After clicking "Switch to video":

```
uri: spotify:track:5AXDr9AJoUSXH80BBaBE7Y   (the URI changes to the video track)
mediaType: "video", metadata["media.type"]: "video"
metadata.audio_association: "spotify:track:3VTNVsTTu05dmTsVFrmGpK"
metadata.original_video: "<32-hex id>", metadata.video_rendering_enabled: "true"
metadata.has_lyrics: "false"   (wrong for lyrics purposes; the audio track has lyrics)
video_association: absent
```

- `associated_video_id` does **NOT** exist. The audio item has `video_association`
  (a track URI). The video item has `audio_association` (the audio track URI).
- The button label flips to `Switch to audio`.
- On 1.3.8.620, clicking "Switch to video" immediately put the video into cinema
  mode (`cinemaState: "nowPlayingView"`), not into the sidebar.

## Step 4: `hasVideo` decision

Tracks with a video play as audio until switched. So:

```js
hasVideo = Spicetify.Player.data?.item?.mediaType === "video";
```

For lyrics while a video plays, use the audio track id:

```js
const item = Spicetify.Player.data.item;
const audioUri = item.mediaType === "video" ? item.metadata.audio_association : item.uri;
```

## Step 3.5: Cinema mode

Observed `Spicetify.Platform.History.location`:

| State | `location` | Video element rect (window 1470x919) |
|---|---|---|
| Cinema (video in middle) | `{pathname: "/", state: {cinemaState: "nowPlayingView", referrer: "home"}}` | `[8, 8, 1026, 903]` with Queue open; `[133, 8, 1204, 903]` with NPV |
| Minimized, NPV open | `state.cinemaState: "closed"` | `[1058, 128, 388, 291]`, inside `#Desktop_PanelContainer_Id`, `[data-testid="video-player-npv"]` present |
| Minimized, Queue open | `state.cinemaState: "closed"` | `[16, 844, 75, 56]` (playbar cover-art thumbnail) |

Values seen: `"nowPlayingView"` and `"closed"`.

Buttons:
- In cinema: `button[aria-label="Minimize Now Playing view"]`. Minimizing does
  `PUSH {referrer}` then `REPLACE {cinemaState: "closed", referrer}` (seen with `History.listen`).
- In NPV with video: `button[aria-label="Expand Now Playing view"]`. Click goes to
  `cinemaState: "nowPlayingView"`. **CONFIRMED.** This button is absent when the Queue panel shows.

`History.push` tests (all from `cinemaState: "closed"`):
- `History.push({pathname: <same>, state: {cinemaState: "nowPlayingView"}})`: **no effect**.
  No PUSH event fired. Same for `History.push('/search', {cinemaState: "nowPlayingView"})`
  while already on `/search`.
- `History.push({pathname: "/search", state: {...}})` from `/`: navigates, but the state
  is dropped (location has no `cinemaState`). Video stays in the playbar.

`History.replace` test: **works**, on `/` and on `/search`, with Queue open:

```js
const H = Spicetify.Platform.History;
H.replace({
  pathname: H.location.pathname,
  search: H.location.search,
  state: { ...(H.location.state || {}), cinemaState: "nowPlayingView" },
});
// result: state.cinemaState === "nowPlayingView", video rect [8, 8, 1026, 903],
//         "Minimize Now Playing view" button present, Queue panel still open.
```

Detect: `Spicetify.Platform.History.location.state?.cinemaState === "nowPlayingView"`.
A DOM check that agrees: `!!document.querySelector('[aria-label="Minimize Now Playing view"]')`.

Navigation away (`History.push('/search')` or `/lyrics`) exits cinema mode.
The video shrinks to the playbar thumbnail and keeps playing.

Fallback: when NPV shows the video, click `[aria-label="Expand Now Playing view"]`.

## Step 3.6: Video in the middle while the Queue panel is open

From cinema mode with NPV, clicking the Queue button:
- `aside` label becomes `Queue`, cinema state stays `nowPlayingView`.
- Video rect shrinks from `[133, 8, 1204, 903]` to `[8, 8, 1026, 903]`, i.e. the
  middle area left of the 420px sidebar (`aside` at x=1042).
- `video.paused === false`; after `replace` back into cinema, `currentTime` moved
  3.0 s in 3 s. Screenshot showed video on the left, Queue/Recently played on the right.
- The left library sidebar is off-screen in cinema mode (rect x = -1026).

**CONFIRMED.**

## Step 3.7: Native lyrics route

`Spicetify.Platform.History.push('/lyrics')`: `location.pathname === "/lyrics"`,
`[data-testid="lyrics-button"]` gets `aria-pressed="true"`, lyrics render in
`main[aria-label="Spotify"]` (rect `[357, 64, 677, 767]`).
Side effect: cinema mode exits and the video drops to the playbar thumbnail
(it keeps playing). **CONFIRMED.**

## Step 3.8: Right sidebar container

- Panel container: `aside#Desktop_PanelContainer_Id` (always present, 420px wide).
- Ancestors: `div.Root__right-sidebar-peekContent[aria-hidden]` <
  `div.Root__right-sidebar-overlayWrapper` < ... ; sibling root
  `div.Root__right-sidebar-peek`.
- Shown: `.Root__right-sidebar-peek` has class `Root__right-sidebar-expanded`;
  `.Root__right-sidebar-peekContent[aria-hidden="false"]`.
- Hidden (after `Hide Now Playing view`): `.Root__right-sidebar-peek` loses
  `Root__right-sidebar-expanded` (width 40); `peekContent[aria-hidden="true"]`.
  The `aside` stays in the DOM with its last label.
- `[data-right-sidebar-hidden]`: **NOT FOUND** in any state.
- `.NowPlayingView` class: **NOT FOUND**. `[data-testid="NPV_Panel_OpenDiv"]`: **NOT FOUND**.
  `[data-testid="PanelHeader_CloseButton"]`: present on the Queue panel only.

Recipe:

```js
const sidebarShown = !!document.querySelector('.Root__right-sidebar-peek.Root__right-sidebar-expanded');
const queueOpen = sidebarShown &&
  document.querySelector('#Desktop_PanelContainer_Id')?.getAttribute('aria-label') === 'Queue';
```

The `aria-label` is localized text. A locale-proof alternative:
`!!document.getElementById('queue-tab')` (it exists only while the Queue panel shows),
or the Queue button's `aria-pressed="true"`.

## Step 3.9: Lyrics endpoint

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
  response; do not rely on a throw.

## Other notes

- `Spicetify.Player.data` and `Spicetify.Platform` were ready within the first poll
  after load.
- `spicetify backup apply` on 1.3.8.620 warned "Could not detect Spotify build type
  in Spotify, skipping validation". Patching otherwise succeeded.
- Spotify 1.3.8.620 auto-updated over the patched 1.3.4.258 on restart. Expect each
  Spotify update to remove the patch until `spicetify backup apply` runs again.
