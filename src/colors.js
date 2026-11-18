// Spotify's lyrics page reads dynamicColors.higherContrast for its colors (xpui-modules.js, 1.3.9.2055).
export function pickLyricsColors(response) {
  const set = response?.data?.dynamicColors?.[0]?.dark?.higherContrast;
  const toCss = (c) =>
    c && [c.red, c.green, c.blue, c.alpha].every(Number.isFinite)
      ? `rgba(${c.red}, ${c.green}, ${c.blue}, ${Math.round((c.alpha / 255) * 100) / 100})`
      : null;
  const background = toCss(set?.backgroundBase);
  const active = toCss(set?.textBase);
  const inactive = toCss(set?.textSubdued);
  return background && active && inactive ? { background, active, inactive } : null;
}
