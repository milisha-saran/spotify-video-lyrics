// Lines up a music video with its audio track using Spotify's audio analysis,
// so lyrics timed to the audio can follow the video (work/analysis/2026-11-17-video-lyrics-alignment).
const ALIGN_STEP = 0.25;
const ALIGN_MAX_SEC = 600;
// Cost of the video or the audio moving on while the other stands still.
// Lower values bend the path too easily; 0.3 matched two independent checks on six songs.
const ALIGN_STEP_PENALTY = 0.3;

export function alignFrames(segments, step = ALIGN_STEP) {
  const last = segments[segments.length - 1];
  const end = last.start + last.duration;
  const frames = [];
  let i = 0;
  for (let t = 0; t < end; t += step) {
    while (i < segments.length - 1 && segments[i + 1].start <= t) i++;
    const seg = segments[i];
    const feature = [...seg.pitches, ...seg.timbre.slice(1).map((x) => x / 100)];
    const norm = Math.hypot(...feature) || 1;
    frames.push(feature.map((x) => x / norm));
  }
  return frames;
}

function alignTooLong(segments) {
  const last = segments[segments.length - 1];
  return last.start + last.duration > ALIGN_MAX_SEC;
}

// Never throws: a bad analysis must fall back to unshifted lyrics, not block them.
export function alignAudioToVideo(audioSegs, videoSegs) {
  try {
    return alignOrNull(audioSegs, videoSegs);
  } catch (err) {
    console.warn("[videoLyrics]", err);
    return null;
  }
}

function alignOrNull(audioSegs, videoSegs) {
  if (!audioSegs?.length || !videoSegs?.length) return null;
  if (alignTooLong(audioSegs) || alignTooLong(videoSegs)) return null;
  const A = alignFrames(audioSegs);
  const V = alignFrames(videoSegs);
  const n = A.length;
  const m = V.length;
  const width = m + 1;
  const cost = new Float32Array((n + 1) * width).fill(Infinity);
  const back = new Uint8Array((n + 1) * width);
  cost[0] = 0;
  for (let i = 1; i <= n; i++) {
    const a = A[i - 1];
    for (let j = 1; j <= m; j++) {
      const v = V[j - 1];
      let dot = 0;
      for (let k = 0; k < a.length; k++) dot += a[k] * v[k];
      const diagonal = cost[(i - 1) * width + j - 1];
      const audioOnly = cost[(i - 1) * width + j] + ALIGN_STEP_PENALTY;
      const videoOnly = cost[i * width + j - 1] + ALIGN_STEP_PENALTY;
      let move = 0;
      let best = diagonal;
      if (audioOnly < best) { move = 1; best = audioOnly; }
      if (videoOnly < best) { move = 2; best = videoOnly; }
      cost[i * width + j] = 1 - dot + best;
      back[i * width + j] = move;
    }
  }
  // Walking back, the first video frame seen for an audio frame is the latest one.
  // After extra video material (an intro, a skit), that is where the audio resumes.
  const map = new Array(n);
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (map[i - 1] === undefined) map[i - 1] = j - 1;
    const move = back[i * width + j];
    if (move === 0) { i--; j--; } else if (move === 1) i--; else j--;
  }
  return (audioSec) => {
    const index = Math.max(0, Math.min(n - 1, Math.round(audioSec / ALIGN_STEP)));
    return (map[index] ?? 0) * ALIGN_STEP;
  };
}

export function shiftLyricTimes(parsed, mapFn) {
  if (!parsed || !parsed.synced) return parsed;
  let previous = 0;
  const lines = parsed.lines.map((line) => {
    const startMs = Math.max(previous, Math.round(mapFn(line.startMs / 1000) * 1000));
    previous = startMs;
    return { ...line, startMs };
  });
  return { ...parsed, lines };
}
