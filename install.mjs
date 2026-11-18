// Installs the mod on macOS or Windows: node install.mjs
// Removes it: node install.mjs --remove
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FILE = "videoLyrics.js";

// Spicetify's data folder differs by OS (~/.config/spicetify, %APPDATA%\spicetify), so ask it.
export function extensionsDir(userdataOutput, platform = process.platform) {
  const dir = userdataOutput.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  if (!dir) throw new Error("spicetify did not print its data folder. Is Spicetify installed?");
  const p = platform === "win32" ? path.win32 : path.posix;
  return p.join(dir, "Extensions");
}

export function spicetifySteps(remove) {
  return [["config", "extensions", remove ? `${FILE}-` : FILE], ["apply"]];
}

function spicetify(args) {
  // On Windows spicetify may be a .cmd or .ps1 shim, which only a shell can run.
  return execFileSync("spicetify", args, { encoding: "utf8", shell: process.platform === "win32" });
}

function main() {
  const remove = process.argv.includes("--remove");
  const here = path.dirname(fileURLToPath(import.meta.url));
  const target = path.join(extensionsDir(spicetify(["path", "userdata"])), FILE);
  if (remove) {
    rmSync(target, { force: true });
    console.log(`removed ${target}`);
  } else {
    execFileSync(process.execPath, [path.join(here, "build.mjs")], { stdio: "inherit" });
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(path.join(here, "dist", FILE), target);
    console.log(`copied to ${target}`);
  }
  for (const args of spicetifySteps(remove)) {
    console.log(`spicetify ${args.join(" ")}`);
    process.stdout.write(spicetify(args));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
