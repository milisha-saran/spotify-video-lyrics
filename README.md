# videoLyrics

A Spicetify extension. It keeps a Spotify music video in the middle of the window and adds a Lyrics tab next to Queue and Recently played in the right sidebar.

Built for macOS, Spotify 1.3.9.2055 (auto-updated from 1.3.4.258 and 1.3.8.620) and Spicetify CLI 2.46.4 (installed with Homebrew).

## What it does

The extension waits until you are idle before it moves things into the middle. You are idle after 30 seconds without a click, scroll, key press or page change in Spotify. You are also idle as soon as the Spotify window is not in front.

- **A song plays as a video.** If lyrics fill the middle, the video replaces them right away. Otherwise the video moves to the middle once you are idle. Either way, the sidebar opens the Queue panel on the Lyrics tab.
- **A song plays without a video.** If the video was in the middle, its lyrics replace it right away. Otherwise the middle shows the lyrics once you are idle. If the sidebar shows the Lyrics tab, it flips to Queue. If you are reading Recently played, it stays there.
- It waits for idle before it moves the video or the lyrics into the middle. Swapping between a video and lyrics in the middle does not wait, because you were watching, not browsing.
- It acts only when a video actually plays. Many songs have a video but play as audio. The extension treats them as songs without a video. Switch one song to its video once. In testing, Spotify then played the video for later songs that have one, for the rest of that session.
- A tab you pick by hand stays until the next song.
- Click a lyric line to jump to that point in the song.
- **Lyrics follow the video.** Lyrics, from Spotify or LRCLIB, are timed to a song's audio, but a music video often has its own intro, cuts or ending. For a video, the extension lines up the video with the audio using Spotify's own audio analysis, then moves each lyric line to its time in the video. If you switch a song between its video and audio versions mid-play, the lyrics retime to match. If the analysis is missing or takes over 5 seconds, lyrics show at their audio times.
- **A song Spotify has no lyrics for.** The extension looks it up on [LRCLIB](https://lrclib.net), a free lyrics database. It shows those lyrics in the sidebar Lyrics tab, and over Spotify's empty lyrics page ("You'll have to guess the lyrics for this one") in the middle. A "Lyrics from LRCLIB" line marks them. Timed lyrics highlight and scroll like Spotify's. Untimed lyrics show as plain text, and instrumentals say "Instrumental". If LRCLIB has nothing either, you see Spotify's message.

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

Spotify replaces the patched app when it updates itself. It did this twice during development. Patch it again from the macOS Terminal app (newer macOS versions may block other apps from changing Spotify):

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
- Lyrics come from Spotify, then LRCLIB. A song neither has shows "No lyrics for this song".
- For songs Spotify has no lyrics for, the extension sends the song's title, artist, album and length to lrclib.net. Nothing else.
- An LRCLIB result more than 3 seconds longer or shorter than the song is ignored, so a song with an unusual length may get no lyrics.
- Lyrics are not moved onto the video's timeline for a video or audio track over 10 minutes long. They show at their audio times.
- Where a video cuts part of the song, the lyric lines from that part all show at the same moment.
