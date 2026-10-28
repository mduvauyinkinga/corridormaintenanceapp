/**
 * test/mojibake-scan.mjs
 * ------------------------------------------------------------------
 * Finds double-encoded UTF-8 ("mojibake") in the site's text files.
 *
 * Symptom: text that should read "🛠️", "…" or "←" renders on the page
 * as garbage like "ðµ€", "â€¦" or "â†". Cause: the file was written by
 * a tool that decoded UTF-8 as CP1252/ANSI and then re-encoded it, so
 * every such character is now stored as 2-3 wrong characters.
 *
 * Run:  node test/mojibake-scan.mjs        (exit 1 when anything is found)
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = new Set(["node_modules", ".git", ".pglite-data", "archive"]);

// Decoded characters that only ever appear as the result of a
// UTF-8-read-as-CP1252 round trip in this codebase.
const MOJIBAKE = new RegExp("[âÃðÅã][€Ÿ¥»Âµ§£¢†]|ï»¿|â€", "u");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(html|css|js|mjs|md|json|webmanifest|txt|svg)$/i.test(name)) out.push(full);
  }
  return out;
}

let hits = 0;
for (const file of walk(ROOT)) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  // Ignore this file's own pattern definition.
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (file.endsWith("mojibake-scan.mjs")) return;
    if (!MOJIBAKE.test(line)) return;
    hits += 1;
    console.log(`${file.replace(ROOT, "").replace(/^[/\\]/, "")}:${i + 1}: ${JSON.stringify(line.slice(0, 200))}`);
  });
}

console.log(hits === 0 ? "\nmojibake-scan: clean" : `\nmojibake-scan: ${hits} line(s) affected`);
process.exit(hits === 0 ? 0 : 1);
