# videoLyrics

A Spicetify extension. It keeps a Spotify music video in the middle of the window and adds a Lyrics tab next to Queue and Recently played in the right sidebar.

Built for macOS, Spotify 1.3.8.620 (auto-updated from 1.3.4.258) and Spicetify CLI 2.46.4 (installed with Homebrew).

## What it does

- Switch a song to its music video. After 30 seconds without using Spotify, the video moves to the middle. The sidebar opens on the Lyrics tab.
- A song without a video flips the sidebar to Recently played. After 30 seconds idle, the middle shows the lyrics.
- It never changes the middle while you use Spotify.
- A tab you pick by hand stays until the next song.
- Click a lyric line to jump to that point in the song.

## Install

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
