const fs = require('node:fs');
const path = require('node:path');

const SKIPPED_DIRS = new Set(['.git', 'node_modules']);
const SKIPPED_EXTENSIONS = new Set(['.xlsx', '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp']);
const CONFLICT_MARKER_RE = /^(<<<<<<<|=======|>>>>>>>)(?:\s|$)/m;

function walk (dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIPPED_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
    } else if (!SKIPPED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }
  return files;
}

const conflictedFiles = walk(process.cwd()).filter(file => {
  const content = fs.readFileSync(file, 'utf8');
  return CONFLICT_MARKER_RE.test(content);
});

if (conflictedFiles.length) {
  console.error('Found unresolved merge conflict markers:');
  conflictedFiles.forEach(file => console.error(`- ${path.relative(process.cwd(), file)}`));
  process.exit(1);
}
