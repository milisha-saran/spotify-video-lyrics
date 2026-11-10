export function parseLyrics(body) {
  const lyrics = body && body.lyrics;
  if (!lyrics || !Array.isArray(lyrics.lines) || lyrics.lines.length === 0) return null;
  const synced = lyrics.syncType === "LINE_SYNCED";
  return {
    synced,
    lines: lyrics.lines.map(line => ({
      startMs: synced ? Number(line.startTimeMs) : null,
      text: line.words,
    })),
  };
}

export function currentLineIndex(lines, positionMs) {
  if (!lines.length || lines[0].startMs == null) return -1;
  let low = 0;
  let high = lines.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (lines[mid].startMs <= positionMs) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}

export function latestOnly(fetcher) {
  let latestCall = 0;
  return async function fetchLatest(uri) {
    const thisCall = ++latestCall;
    try {
      const result = await fetcher(uri);
      return thisCall === latestCall ? result : undefined;
    } catch (error) {
      if (thisCall !== latestCall) return undefined;
      throw error;
    }
  };
}
