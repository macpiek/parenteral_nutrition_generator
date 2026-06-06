const fs = require('node:fs');

const vendorFiles = [
  'vendor/exceljs/exceljs.min.js',
  'vendor/file-saver/FileSaver.min.js'
];

for (const file of vendorFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const stripped = content
    .split(/\r?\n/)
    .filter(line => !line.startsWith('//# sourceMappingURL='))
    .join('\n')
    .replace(/\n+$/u, '') + '\n';
  fs.writeFileSync(file, stripped);
}
