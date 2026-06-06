const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ExcelJS = require('exceljs');
const JSZip = require('jszip');

const generator = require('../xlsxGenerator.js');
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));

function createWorkbook () {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Recepta');
  return workbook;
}

const sampleData = {
  name: 'Anna / Testowa',
  pesel: '44051401458',
  weight: 70,
  dateFrom: '2026-06-06',
  dateTo: '2026-06-06',
  bagVol: 1206,
  additives: Array.from({ length: 17 }, (_, index) => index + 1)
};

test('fillRecipeWorksheet writes patient, bag, route and additive cells', () => {
  const workbook = createWorkbook();
  const worksheet = generator.fillRecipeWorksheet({
    workbook,
    data: sampleData,
    currentBag: 'SmofKabiven Peripheral',
    central: false,
    cfg
  });

  assert.equal(worksheet.getCell('C2').value, sampleData.name);
  assert.equal(worksheet.getCell('C6').value, sampleData.pesel);
  assert.equal(worksheet.getCell('C7').value, sampleData.weight);
  assert.equal(worksheet.getCell('C11').value, 'Obwodowa X');
  assert.equal(worksheet.getCell('C12').value, 'Centralna');
  assert.equal(worksheet.getCell('C26').value, 800);
  assert.equal(worksheet.getCell('D26').value, 1206);
  assert.equal(worksheet.getCell('D30').value, '');
  assert.equal(worksheet.getCell('H30').value, 3);
  assert.equal(worksheet.pageSetup.orientation, 'portrait');
  assert.equal(worksheet.pageSetup.fitToPage, true);
});

test('buildRecipeFileName sanitizes patient name and includes bag and route', () => {
  assert.equal(
    generator.buildRecipeFileName({
      patientName: 'Anna / Testowa:*?',
      currentBag: 'SmofKabiven Peripheral',
      central: false
    }),
    'Anna Testowa SmofKabiven obwodowe.xlsx'
  );
});

test('applyPrintArea replaces previous XLSX print area definition', async () => {
  const workbook = createWorkbook();
  const worksheet = workbook.worksheets[0];
  workbook.definedNames.add(`${worksheet.name}!$A$1:$B$2`, '_xlnm.Print_Area');
  const buffer = await workbook.xlsx.writeBuffer();

  const finalBlob = await generator.applyPrintArea({
    buffer,
    worksheetName: worksheet.name,
    printRange: '$A$1:$M$56',
    JSZipImpl: JSZip
  });
  const finalBuffer = Buffer.from(await finalBlob.arrayBuffer());
  const zip = await JSZip.loadAsync(finalBuffer);
  const workbookXml = await zip.file('xl/workbook.xml').async('text');

  assert.match(workbookXml, /name="_xlnm\.Print_Area"/);
  assert.match(workbookXml, /'Recepta'!\$A\$1:\$M\$56/);
  assert.doesNotMatch(workbookXml, /\$A\$1:\$B\$2/);
});

test('buildRecipeXlsxBlob loads template, fills workbook and returns export metadata', async () => {
  const workbook = createWorkbook();
  const templateBuffer = await workbook.xlsx.writeBuffer();
  const calls = [];

  const result = await generator.buildRecipeXlsxBlob({
    data: sampleData,
    currentBag: 'SmofKabiven Peripheral',
    central: false,
    cfg,
    dependencies: {
      ExcelJS,
      JSZip,
      fetch: async url => {
        calls.push(url);
        return {
          ok: true,
          arrayBuffer: async () => templateBuffer
        };
      }
    }
  });

  assert.deepEqual(calls, [cfg.constants.TEMPLATE_FILE]);
  assert.equal(result.fileName, 'Anna Testowa SmofKabiven obwodowe.xlsx');

  const exportedBuffer = Buffer.from(await result.blob.arrayBuffer());
  const zip = await JSZip.loadAsync(exportedBuffer);
  const workbookXml = await zip.file('xl/workbook.xml').async('text');
  assert.match(workbookXml, /'Recepta'!\$A\$1:\$M\$56/);
});

test('fetchTemplateBuffer reports HTTP status and rejects non-binary responses', async () => {
  await assert.rejects(
    generator.fetchTemplateBuffer({
      fetchFn: async () => ({ ok: false, status: 404, statusText: 'Not Found' }),
      templateFile: 'missing.xlsx'
    }),
    /HTTP 404 Not Found/
  );

  await assert.rejects(
    generator.fetchTemplateBuffer({
      fetchFn: async () => ({ ok: true }),
      templateFile: 'broken.xlsx'
    }),
    /danych binarnych/
  );
});

test('generateRecipeXlsx calls injected saveAs with generated blob and filename', async () => {
  const workbook = createWorkbook();
  const templateBuffer = await workbook.xlsx.writeBuffer();
  const saved = [];

  const result = await generator.generateRecipeXlsx({
    data: sampleData,
    currentBag: 'SmofKabiven Peripheral',
    central: false,
    cfg,
    dependencies: {
      ExcelJS,
      JSZip,
      fetch: async () => ({ ok: true, arrayBuffer: async () => templateBuffer }),
      saveAs: (blob, fileName) => saved.push({ blob, fileName })
    }
  });

  assert.equal(saved.length, 1);
  assert.equal(saved[0].fileName, result.fileName);
  assert.equal(saved[0].blob, result.blob);
});
