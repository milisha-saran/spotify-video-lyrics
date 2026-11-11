# videoLyrics

A Spicetify extension. It keeps a Spotify music video in the middle of the window and adds a Lyrics tab next to Queue and Recently played in the right sidebar.

Built for macOS, Spotify 1.3.8.620 (auto-updated from 1.3.4.258) and Spicetify CLI 2.46.4 (installed with Homebrew).

## What it does

The extension waits until you are idle before it moves things into the middle. You are idle after 30 seconds without a click, scroll, key press or page change in Spotify. You are also idle as soon as the Spotify window is not in front.

- **A song plays as a video.** If lyrics fill the middle, the video replaces them right away. Otherwise the video moves to the middle once you are idle. Either way, the sidebar opens the Queue panel on the Lyrics tab.
- **A song plays without a video.** If the video was in the middle, its lyrics replace it right away. Otherwise the middle shows the lyrics once you are idle. If the sidebar shows the Lyrics tab, it flips to Queue. If you are reading Recently played, it stays there.
- It waits for idle before it moves the video or the lyrics into the middle. Swapping between a video and lyrics in the middle does not wait, because you were watching, not browsing.
- It acts only when a video actually plays. Many songs have a video but play as audio. The extension treats them as songs without a video. Switch one song to its video once. In testing, Spotify then played the video for later songs that have one, for the rest of that session.
- A tab you pick by hand stays until the next song.
- Click a lyric line to jump to that point in the song.

## Install

Spicetify must already patch Spotify. If you have never done that, run `spicetify backup apply` once first.

Build the extension, copy it to Spicetify, turn it on and apply:

```bash
node build.mjs && cp dist/videoLyrics.js ~/.config/spicetify/Extensions/ && spicetify config extensions videoLyrics.js && spicetify apply
```

## Uninstall

Turn the extension off:

```bash
spicetify config extensions videoLyrics.js-
```

```bash
spicetify apply
```

The file stays in `~/.config/spicetify/Extensions/`. Delete `videoLyrics.js` there if you no longer want it.

Or go back to stock Spotify:

```bash
spicetify restore
```

## After a Spotify update

Spotify replaces the patched app when it updates itself. It did this once during development. Patch it again:

```bash
spicetify backup apply
```

## Develop

Build to `dist/videoLyrics.js`:

```bash
node build.mjs
```

Run the tests. No `npm install` needed:

```bash
node --test
```

## Known limits

- The extension relies on Spotify's internal page structure, such as the `#queue-tab` id. A Spotify UI update can break the Lyrics tab.
- Only songs with a Spotify music video get video. YouTube videos are not supported.
- Lyrics come from Spotify. A song with no Spotify lyrics shows "No lyrics for this song".
