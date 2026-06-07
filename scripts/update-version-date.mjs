import { readFile, writeFile } from "node:fs/promises";

const now = new Date();
const pad = value => String(value).padStart(2, "0");
const VERSION_DATE = [
  now.getFullYear(),
  pad(now.getMonth() + 1),
  pad(now.getDate())
].join("-");
const VERSION_TIME = [
  pad(now.getHours()),
  pad(now.getMinutes())
].join(":");
const VERSION_TIMESTAMP = `${VERSION_DATE} ${VERSION_TIME}`;
const CACHE_BUSTER = `${VERSION_DATE.replaceAll("-", "")}${VERSION_TIME.replace(":", "")}`;

async function updateTextFile (path, updater) {
  const raw = await readFile(path, "utf8");
  const updated = updater(raw);
  if (updated !== raw) {
    await writeFile(path, updated, "utf8");
  }
}

await updateTextFile("config.json", json => json.replace(
  /    "versionConfig": \{[\s\S]*?    \},\n\n    "constants":/,
  `    "versionConfig": {\n      "updatedAt": "${VERSION_TIMESTAMP}",\n      "date": "${VERSION_DATE}",\n      "fallbackDate": "${VERSION_TIMESTAMP}"\n    },\n\n    "constants":`
));

await updateTextFile("index.html", html => html
  .replace(/(src="pnCalculator\.js\?v=)[^"]+"/, `$1${CACHE_BUSTER}"`)
  .replace(/(src="script\.js\?v=)[^"]+"/, `$1${CACHE_BUSTER}"`)
  .replace(/(src="xlsxGenerator\.js\?v=)[^"]+"/, `$1${CACHE_BUSTER}"`)
  .replace(/<span id="appVersion"(?: data-version-updated-at="[^"]*")?(?: data-version-date="[^"]*")?>[^<]*<\/span>/,
    `<span id="appVersion" data-version-updated-at="${VERSION_TIMESTAMP}">${VERSION_TIMESTAMP}</span>`));

console.log(`Ustawiono datę i godzinę wersji aplikacji: ${VERSION_TIMESTAMP}`);
