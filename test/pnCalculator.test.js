const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ExcelJS = require('exceljs');
const JSZip = require('jszip');

const calc = require('../pnCalculator.js');
const { generateRecipeXlsx } = require('../xlsxGenerator.js');
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const scriptJs = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');

test('parseNumber accepts Polish decimal comma and rejects malformed values', () => {
  assert.equal(calc.parseNumber('3,5'), 3.5);
  assert.equal(calc.parseNumber(' 12.25 '), 12.25);
  assert.equal(Number.isNaN(calc.parseNumber('12abc')), true);
});

test('getCurrentBag maps peripheral nutrition to Peripheral product variant', () => {
  assert.equal(calc.getCurrentBag('SmofKabiven', 'obwodowe'), 'SmofKabiven Peripheral');
  assert.equal(calc.getCurrentBag('Kabiven', 'centralne'), 'Kabiven');
});

test('calculateTotalKcal includes bag calories plus Dipeptiven and Omegaven calories', () => {
  assert.equal(calc.calculateTotalKcal({
    bagConfig: cfg.bagConfig,
    bag: 'SmofKabiven Peripheral',
    volume: 1206,
    additives: { add6: '50', add8: '25' }
  }), 868);
});

test('calculateAdditiveRanges limits Dipeptiven and Omegaven by both bag and patient weight', () => {
  const ranges = calc.calculateAdditiveRanges({
    additiveRangeConfig: cfg.additiveRangeConfig,
    constants: cfg.constants,
    bag: 'Kabiven',
    volume: 1026,
    weight: 30
  });
  assert.equal(ranges.di.max, 75);
  assert.equal(ranges.om.max, 50);
  assert.equal(ranges.so.label, '0 – 1 fiol.');
});

test('calculateElectrolyteSummary adds NaCl and KCl in mmol from ml', () => {
  assert.deepEqual(calc.calculateElectrolyteSummary({
    electrolyteConfig: cfg.electrolyteConfig,
    additiveElectrolyteConfig: cfg.additiveElectrolyteConfig,
    bag: 'Kabiven',
    volume: 1026,
    additives: {
      add10: 10,
      add17: 10
    }
  }), {
    sodium: 47,
    potassium: 44,
    sodiumMax: 154,
    potassiumMax: 154
  });
});

test('calculateElectrolyteSummary includes sodium from Glycophos', () => {
  assert.deepEqual(calc.calculateElectrolyteSummary({
    electrolyteConfig: cfg.electrolyteConfig,
    additiveElectrolyteConfig: cfg.additiveElectrolyteConfig,
    bag: 'Kabiven',
    volume: 1026,
    additives: {
      add1: 20,
      add10: 0,
      add17: 0
    }
  }), {
    sodium: 72,
    potassium: 24,
    sodiumMax: 154,
    potassiumMax: 154
  });
});

test('calculateMixtureSummary totals electrolytes and macronutrients from bag and additives', () => {
  assert.deepEqual(calc.calculateMixtureSummary({
    mixtureCompositionConfig: cfg.mixtureCompositionConfig,
    additiveConfig: cfg.additiveConfig,
    bag: 'SmofKabiven Peripheral',
    volume: 1206,
    additives: {
      add1: 10,
      add6: 50,
      add8: 25,
      add10: 10,
      add12: 10,
      add13: 10,
      add14: 10,
      add17: 10
    }
  }), {
    Na: 65.4,
    K: 43,
    Ca: 8.8,
    phosphate: 19.9,
    Mg: 11.9,
    Cl: 71.6,
    aminoAcids: 48,
    carbohydrates: 85,
    fat: 36.5
  });
});

test('calculateElectrolyteSummary can use full mixture composition data for sodium and potassium', () => {
  assert.deepEqual(calc.calculateElectrolyteSummary({
    electrolyteConfig: cfg.electrolyteConfig,
    additiveConfig: cfg.additiveConfig,
    mixtureCompositionConfig: cfg.mixtureCompositionConfig,
    bag: 'SmofKabiven Peripheral',
    volume: 1206,
    additives: {
      add1: 10,
      add10: 10,
      add17: 10
    }
  }), {
    sodium: 65,
    potassium: 43,
    sodiumMax: 181,
    potassiumMax: 181
  });
});

test('calculateRequirements returns clinical daily ranges based on weight', () => {
  assert.deepEqual(calc.calculateRequirements({
    dosageConfig: cfg.dosageConfig,
    bag: 'SmofKabiven Peripheral',
    weight: 70
  }), {
    calories: { min: 1750, max: 2450 },
    sodium: { min: 35, max: 140 },
    potassium: { min: 35, max: 140 },
    volume: { min: 1400, max: 2800, absoluteMax: 2800 }
  });
});

test('validatePesel validates checksum', () => {
  assert.equal(calc.validatePesel('44051401458'), true);
  assert.equal(calc.validatePesel('44051401459'), false);
});

test('validateRecipe blocks invalid clinical and production inputs', () => {
  const result = calc.validateRecipe({
    cfg,
    productType: 'SmofKabiven',
    nutritionType: 'obwodowe',
    bag: 'SmofKabiven Peripheral',
    volume: 1206,
    weight: 30,
    name: 'Jan Testowy',
    pesel: '44051401458',
    dateFrom: '2026-06-05',
    dateTo: '2026-06-04',
    additivesById: { add6: '100', add8: '500', add10: '100', add17: '200' }
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /Data podania/);
});

test('validateRecipe catches exceeded potassium bag limit', () => {
  const result = calc.validateRecipe({
    cfg,
    productType: 'Kabiven',
    nutritionType: 'centralne',
    bag: 'Kabiven',
    volume: 1026,
    weight: 70,
    name: 'Jan Testowy',
    pesel: '44051401458',
    dateFrom: '2026-06-05',
    dateTo: '2026-06-05',
    additivesById: { add10: '100', add17: '0' }
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /Potas w mieszaninie/);
});

test('configuration has complete electrolyte, additive range and dosage data for every selectable bag', () => {
  for (const [bag, bags] of Object.entries(cfg.bagConfig)) {
    assert.ok(cfg.electrolyteConfig[bag], `missing electrolyte config for ${bag}`);
    assert.ok(cfg.additiveRangeConfig[bag], `missing additive range config for ${bag}`);
    assert.ok(cfg.dosageConfig[bag], `missing dosage config for ${bag}`);
    for (const { vol } of bags) {
      assert.ok(cfg.electrolyteConfig[bag][vol], `missing electrolyte config for ${bag} ${vol}`);
      assert.ok(cfg.additiveRangeConfig[bag][vol], `missing additive ranges for ${bag} ${vol}`);
      assert.ok(cfg.mixtureCompositionConfig[bag][vol], `missing mixture composition for ${bag} ${vol}`);
    }
  }
});

test('configuration keeps additive calculation metadata in additiveConfig', () => {
  assert.equal(cfg.additiveConfig.add6.energyKcalPerMl, 0.8);
  assert.equal(cfg.additiveConfig.add8.energyKcalPerMl, 1.12);
  assert.deepEqual(calc.getAdditiveEnergyConfig(cfg.additiveConfig), {
    add6: 0.8,
    add8: 1.12
  });
  assert.deepEqual(calc.getAdditiveElectrolyteConfig(cfg.additiveConfig), {
    add1: { Na: 2 },
    add10: { K: 2 },
    add17: { Na: 1.54 }
  });
});

test('NaCl and KCl rows are visible in the additive table', () => {
  assert.match(indexHtml, /KCl 15% amp\. 10\/20 ml/);
  assert.match(indexHtml, /NaCl 0,9% amp\. 10 ml/);
  assert.doesNotMatch(indexHtml, /<tr[^>]*display\s*:\s*none[^>]*>[\s\S]*id="add10"/);
  assert.doesNotMatch(indexHtml, /<tr[^>]*display\s*:\s*none[^>]*>[\s\S]*id="add17"/);
});

test('Vit B1 and Vit C rows are hidden in the additive table', () => {
  assert.match(indexHtml, /<tr[^>]*display\s*:\s*none[^>]*>[\s\S]*id="add15"/);
  assert.match(indexHtml, /<tr[^>]*display\s*:\s*none[^>]*>[\s\S]*id="add16"/);
});

test('application starts with default patient weight of 65 kg', () => {
  assert.match(scriptJs, /weightInp\.value\s*=\s*"65"/);
});

test('safety note is shown in the right parameters panel', () => {
  const patientPanelIndex = indexHtml.indexOf('<div class="container patient-data">');
  const mixParamsIndex = indexHtml.indexOf('<div class="container mix-params">');
  const safetyNoteIndex = indexHtml.indexOf('<p class="safety-note">');

  assert.ok(patientPanelIndex > -1);
  assert.ok(mixParamsIndex > -1);
  assert.ok(safetyNoteIndex > -1);
  assert.ok(safetyNoteIndex > mixParamsIndex);
  assert.ok(safetyNoteIndex > patientPanelIndex);
});

test('mixture parameters table includes extended composition rows', () => {
  [
    'caTotal',
    'phosphateTotal',
    'mgTotal',
    'clTotal',
    'aminoAcidsTotal',
    'carbohydratesTotal',
    'fatTotal'
  ].forEach(id => assert.match(indexHtml, new RegExp(`id="${id}"`)));
});

test('generateRecipeXlsx fills template cells and print area', async () => {
  const template = fs.readFileSync(path.join(__dirname, '..', 'szablon.xlsx'));
  const additives = Array.from({ length: 17 }, () => '');
  additives[0] = 20;
  additives[1] = 10;
  additives[2] = 1;
  additives[3] = 10;
  additives[5] = 50;
  additives[7] = 25;

  const result = await generateRecipeXlsx({
    data: {
      name: 'Jan Testowy',
      pesel: '44051401458',
      dateFrom: '2026-06-05',
      dateTo: '2026-06-06',
      weight: 70,
      bagVol: 1206,
      additives
    },
    currentBag: 'SmofKabiven Peripheral',
    central: false,
    cfg,
    workbookBuffer: template,
    ExcelJSImpl: ExcelJS,
    JSZipImpl: JSZip,
    returnBuffer: true
  });

  assert.equal(result.fileName, 'Jan Testowy SmofKabiven obwodowe.xlsx');

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(result.buffer);
  const ws = wb.worksheets[0];

  assert.equal(ws.getCell('C2').value, 'Jan Testowy');
  assert.equal(ws.getCell('C6').value, '44051401458');
  assert.equal(ws.getCell('C7').value, 70);
  assert.equal(ws.getCell('C11').value, 'Obwodowa X');
  assert.equal(ws.getCell('C12').value, 'Centralna');
  assert.equal(ws.getCell('C26').value, 800);
  assert.equal(ws.getCell('D26').value, 1206);
  assert.equal(ws.getCell('D30').value, '');
  assert.equal(ws.getCell('H30').value, 1);
  assert.equal(ws.getCell('D33').value, 50);
  assert.equal(ws.getCell('D35').value, 25);

  const zip = await JSZip.loadAsync(result.buffer);
  const workbookXml = await zip.file('xl/workbook.xml').async('text');
  assert.match(workbookXml, /name="_xlnm\.Print_Area"/);
  assert.match(workbookXml, /\$A\$1:\$M\$56/);
});
