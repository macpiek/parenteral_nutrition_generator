const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.join(__dirname, "..");
const outputPath = path.join(rootDir, "standalone.html");

const replacements = [
  {
    pattern: /<script src="vendor\/jszip\/jszip\.min\.js"><\/script>/,
    type: "script",
    source: "vendor/jszip/jszip.min.js"
  },
  {
    pattern: /<script src="vendor\/exceljs\/exceljs\.min\.js"><\/script>/,
    type: "script",
    source: "vendor/exceljs/exceljs.min.js"
  },
  {
    pattern: /<script src="vendor\/file-saver\/FileSaver\.min\.js"><\/script>/,
    type: "script",
    source: "vendor/file-saver/FileSaver.min.js"
  },
  {
    pattern: /<script src="embeddedAssets\.js\?v=[^"]+"><\/script>/,
    type: "script",
    source: "embeddedAssets.js"
  },
  {
    pattern: /<script src="pnCalculator\.js\?v=[^"]+" defer><\/script>/,
    type: "script",
    source: "pnCalculator.js"
  },
  {
    pattern: /<script src="script\.js\?v=[^"]+" defer><\/script>/,
    type: "script",
    source: "script.js"
  },
  {
    pattern: /<script src="xlsxGenerator\.js\?v=[^"]+" defer><\/script>/,
    type: "script",
    source: "xlsxGenerator.js"
  },
  {
    pattern: /<link rel="stylesheet" href="style\.css\?v=[^"]+">/,
    type: "style",
    source: "style.css"
  }
];

function readSource (filePath) {
  return fs.readFileSync(path.join(rootDir, filePath), "utf8");
}

function inlineScript (source, content) {
  const safeContent = content.replace(/<\/script/gi, "<\\/script");
  return `<script data-inline-source="${source}">\n${safeContent}\n</script>`;
}

function inlineStyle (source, content) {
  const safeContent = content.replace(/<\/style/gi, "<\\/style");
  return `<style data-inline-source="${source}">\n${safeContent}\n</style>`;
}

let html = readSource("index.html");

for (const { pattern, type, source } of replacements) {
  const content = readSource(source);
  const replacement = type === "script"
    ? inlineScript(source, content)
    : inlineStyle(source, content);

  if (!pattern.test(html)) {
    throw new Error(`Nie znaleziono znacznika do podmiany: ${source}`);
  }

  html = html.replace(pattern, replacement);
}

fs.writeFileSync(outputPath, html);
console.log(`Wygenerowano ${path.relative(rootDir, outputPath)}`);
