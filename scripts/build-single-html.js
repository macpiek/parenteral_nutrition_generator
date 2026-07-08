const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.join(__dirname, "..");
const outputPath = path.join(rootDir, "standalone.html");

const scriptReplacements = [
  {
    pattern: /<script src="vendor\/jszip\/jszip\.min\.js"><\/script>/,
    source: "vendor/jszip/jszip.min.js",
    isolateModuleGlobals: true
  },
  {
    pattern: /<script src="vendor\/exceljs\/exceljs\.min\.js"><\/script>/,
    source: "vendor/exceljs/exceljs.min.js",
    isolateModuleGlobals: true
  },
  {
    pattern: /<script src="vendor\/file-saver\/FileSaver\.min\.js"><\/script>/,
    source: "vendor/file-saver/FileSaver.min.js",
    isolateModuleGlobals: true
  },
  {
    pattern: /<script src="embeddedAssets\.js\?v=[^"]+"><\/script>/,
    source: "embeddedAssets.js"
  },
  {
    pattern: /<script src="pnCalculator\.js\?v=[^"]+" defer><\/script>/,
    source: "pnCalculator.js"
  },
  {
    pattern: /<script src="script\.js\?v=[^"]+" defer><\/script>/,
    source: "script.js"
  },
  {
    pattern: /<script src="xlsxGenerator\.js\?v=[^"]+" defer><\/script>/,
    source: "xlsxGenerator.js"
  }
];

const styleReplacement = {
  pattern: /<link rel="stylesheet" href="style\.css\?v=[^"]+">/,
  source: "style.css"
};

function readSource (filePath) {
  return fs.readFileSync(path.join(rootDir, filePath), "utf8");
}

function inlineScript (source, content, options = {}) {
  const { isolateModuleGlobals = false } = options;
  const safeContent = content.replace(/<\/script/gi, "<\\/script");
  if (isolateModuleGlobals) {
    return `<script data-inline-source="${source}">\n(function () {\n  var module = undefined;\n  var exports = undefined;\n  var define = undefined;\n${safeContent}\n}).call(window);\n</script>`;
  }

  return `<script data-inline-source="${source}">\n${safeContent}\n</script>`;
}

function inlineStyle (source, content) {
  const safeContent = content.replace(/<\/style/gi, "<\\/style");
  return `<style data-inline-source="${source}">\n${safeContent}\n</style>`;
}

let html = readSource("index.html");

if (!styleReplacement.pattern.test(html)) {
  throw new Error(`Nie znaleziono znacznika do podmiany: ${styleReplacement.source}`);
}

html = html.replace(
  styleReplacement.pattern,
  inlineStyle(styleReplacement.source, readSource(styleReplacement.source))
);

const inlineScripts = [];
for (const { pattern, source, isolateModuleGlobals } of scriptReplacements) {
  const content = readSource(source);

  if (!pattern.test(html)) {
    throw new Error(`Nie znaleziono znacznika do podmiany: ${source}`);
  }

  html = html.replace(pattern, "");
  inlineScripts.push(inlineScript(source, content, { isolateModuleGlobals }));
}

html = html.replace("</body>", `${inlineScripts.join("\n")}\n</body>`);

fs.writeFileSync(outputPath, html);
console.log(`Wygenerowano ${path.relative(rootDir, outputPath)}`);
