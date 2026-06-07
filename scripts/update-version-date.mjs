import { readFile, writeFile } from "node:fs/promises";

const VERSION_DATE = new Date().toISOString().slice(0, 10);
const CACHE_BUSTER = VERSION_DATE.replaceAll("-", "");

async function updateTextFile (path, updater) {
  const raw = await readFile(path, "utf8");
  const updated = updater(raw);
  if (updated !== raw) {
    await writeFile(path, updated, "utf8");
  }
}

await updateTextFile("config.json", json => json.replace(
  /    "versionConfig": \{[\s\S]*?    \},\n\n    "constants":/,
  `    "versionConfig": {\n      "date": "${VERSION_DATE}",\n      "fallbackDate": "${VERSION_DATE}"\n    },\n\n    "constants":`
));

await updateTextFile("index.html", html => html
  .replace(/(src="pnCalculator\.js\?v=)[^"]+"/, `$1${CACHE_BUSTER}"`)
  .replace(/(src="script\.js\?v=)[^"]+"/, `$1${CACHE_BUSTER}"`)
  .replace(/(src="xlsxGenerator\.js\?v=)[^"]+"/, `$1${CACHE_BUSTER}"`)
  .replace(/<span id="appVersion"(?: data-version-date="[^"]*")?>[^<]*<\/span>/,
    `<span id="appVersion" data-version-date="${VERSION_DATE}">${VERSION_DATE}</span>`));

console.log(`Ustawiono datę wersji aplikacji: ${VERSION_DATE}`);
