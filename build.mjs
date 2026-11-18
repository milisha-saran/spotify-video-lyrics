import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const modules = ["lyrics", "lrclib", "align", "colors", "idle", "director", "lyricsView", "spotify", "main"];

const body = modules
  .map((name) => {
    const source = readFileSync(new URL(`./src/${name}.js`, import.meta.url), "utf8");
    const lines = source
      .split("\n")
      .filter((line) => !line.startsWith("import "))
      .map((line) => line.replace(/^export /, ""));
    return `// ${name}.js\n${lines.join("\n")}`;
  })
  .join("\n");

mkdirSync(new URL("./dist/", import.meta.url), { recursive: true });
writeFileSync(
  new URL("./dist/videoLyrics.js", import.meta.url),
  `(function videoLyrics() {\n${body}\n})();\n`,
);
console.log("wrote dist/videoLyrics.js");
