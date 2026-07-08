const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ExcelJS = require('exceljs');
const JSZip = require('jszip');

const calc = require('../pnCalculator.js');
const { generateRecipeXlsx } = require('../xlsxGenerator.js');
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const scriptJs = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
const styleCss = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
const embeddedAssetsJs = fs.readFileSync(path.join(__dirname, '..', 'embeddedAssets.js'), 'utf8');
const standaloneHtmlPath = path.join(__dirname, '..', 'standalone.html');
const standaloneHtml = fs.existsSync(standaloneHtmlPath)
  ? fs.readFileSync(standaloneHtmlPath, 'utf8')
  : '';

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

test('calculateTotalVolume includes selected bag volume and ml additives', () => {
  assert.equal(calc.calculateTotalVolume({
    bagConfig: cfg.bagConfig,
    bag: 'SmofKabiven Peripheral',
    volume: 1206,
    additiveConfig: cfg.additiveConfig,
    additives: {
      add1: '10,5',
      add2: '10',
      add3: '1',
      add4: '10',
      add6: '50',
      add8: '25',
      add10: '10',
      add17: '10'
    }
  }), 1331.5);
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

test('validatePesel validates checksum and encoded birth date', () => {
  assert.equal(calc.validatePesel('44051401458'), true);
  assert.equal(calc.validatePesel('44051401459'), false);
  assert.equal(calc.validatePesel('99023112340'), false);
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

test('validateRecipe allows missing patient identity and dates', () => {
  const result = calc.validateRecipe({
    cfg,
    productType: 'SmofKabiven',
    nutritionType: 'obwodowe',
    bag: 'SmofKabiven Peripheral',
    volume: 1206,
    weight: 65,
    name: '',
    pesel: '',
    dateFrom: '',
    dateTo: '',
    additivesById: {}
  });

  assert.equal(result.valid, true);
});

test('validateRecipe still catches malformed PESEL when provided', () => {
  const result = calc.validateRecipe({
    cfg,
    productType: 'SmofKabiven',
    nutritionType: 'obwodowe',
    bag: 'SmofKabiven Peripheral',
    volume: 1206,
    weight: 65,
    name: '',
    pesel: '123',
    dateFrom: '',
    dateTo: '',
    additivesById: {}
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /PESEL/);
});

test('validateRecipe warns when selected bag volume exceeds weight-based maximum', () => {
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
    dateTo: '2026-06-05',
    additivesById: {}
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /Objętość worka \(1206 ml\) przekracza maksymalną wartość 1200 ml\/dobę/);
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

test('validateRecipe keeps collecting field warnings when patient data has warnings', () => {
  const result = calc.validateRecipe({
    cfg,
    productType: 'SmofKabiven',
    nutritionType: 'obwodowe',
    bag: 'SmofKabiven Peripheral',
    volume: 1206,
    weight: 65,
    name: '',
    pesel: '123',
    dateFrom: '',
    dateTo: '',
    additivesById: { add10: '100' }
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /PESEL/);
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


test('patient electrolyte inline fields use compact sizing', () => {
  assert.match(styleCss, /\.form-group\.inline label\{[\s\S]*flex:0 0 5\.15rem;/);
  assert.match(styleCss, /\.form-group\.inline input\{[\s\S]*flex:0 0 3\.25rem;/);
  assert.match(styleCss, /#weight,[\s\S]*#sodium,[\s\S]*#potassium \{[\s\S]*width:3\.25rem;/);
  assert.match(styleCss, /\.form-group\.inline \.unit\{[\s\S]*font-size:0\.9rem;/);
});

test('page keeps wide three-panel layout horizontally scrollable on narrow viewports', () => {
  assert.match(styleCss, /html\{[\s\S]*overflow-x:auto;[\s\S]*\}/);
  assert.match(styleCss, /body\{[\s\S]*min-width:max-content;[\s\S]*\}/);
  assert.match(indexHtml, /<link rel="stylesheet" href="style\.css\?v=20260621-4">/);
});

test('application includes standalone assets before startup scripts', () => {
  const embeddedIndex = indexHtml.indexOf('<script src="embeddedAssets.js?v=20260708-1"></script>');
  const calculatorIndex = indexHtml.indexOf('<script src="pnCalculator.js?v=20260621-2" defer></script>');
  const appIndex = indexHtml.indexOf('<script src="script.js?v=20260621-7" defer></script>');

  assert.ok(embeddedIndex > -1);
  assert.ok(calculatorIndex > embeddedIndex);
  assert.ok(appIndex > embeddedIndex);
  assert.match(scriptJs, /window\.location\.protocol === "file:" && embeddedConfig/);
  assert.match(scriptJs, /Używam konfiguracji wbudowanej/);
});

test('standalone assets embed the current config and XLSX template', () => {
  const sandbox = {};
  vm.runInNewContext(embeddedAssetsJs, sandbox);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.PN_APP_CONFIG)), cfg);
  assert.deepEqual(
    Buffer.from(sandbox.PN_TEMPLATE_XLSX_BASE64, 'base64'),
    fs.readFileSync(path.join(__dirname, '..', 'szablon.xlsx'))
  );
});

test('single-file HTML build inlines the application assets', () => {
  assert.ok(standaloneHtml.length > 0);
  [
    'vendor/jszip/jszip.min.js',
    'vendor/exceljs/exceljs.min.js',
    'vendor/file-saver/FileSaver.min.js',
    'embeddedAssets.js',
    'pnCalculator.js',
    'script.js',
    'xlsxGenerator.js',
    'style.css'
  ].forEach(source => {
    assert.match(standaloneHtml, new RegExp(`data-inline-source="${source.replace(/\//g, '\\/')}"`));
  });

  const htmlShell = standaloneHtml
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '<script></script>')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '<style></style>');
  assert.doesNotMatch(htmlShell, /<script src="(?:vendor\/|embeddedAssets\.js|pnCalculator\.js|script\.js|xlsxGenerator\.js)/);
  assert.doesNotMatch(htmlShell, /<link rel="stylesheet" href="style\.css/);
});

test('application starts with default patient weight of 65 kg', () => {
  assert.match(scriptJs, /weightInp\.value\s*=\s*"65"/);
});

test('application focuses the patient full name field on startup', () => {
  assert.match(indexHtml, /<input type="text" id="fullname" autofocus>/);
  assert.match(scriptJs, /const fullnameInp = \$\("fullname"\);[\s\S]*fullnameInp\.focus\(\)/);
});

test('form uses the application validation panel instead of native browser bubbles', () => {
  assert.match(indexHtml, /<form[^>]*id="daneForm"[^>]*novalidate/);
});

test('submit asks for confirmation before generating with warnings', () => {
  assert.match(scriptJs, /const validation = refreshValidationWarnings\(\);/);
  assert.match(scriptJs, /if \(validation\.errors\.length\) \{[\s\S]*showValidationWarnings\(validation\.errors, \{ showPanel: true \}\);/);
  assert.match(scriptJs, /const shouldGenerateWithWarnings = window\.confirm\(/);
  assert.match(scriptJs, /Recepta zawiera ostrzeżenia\. Czy na pewno chcesz wygenerować receptę\?/);
  assert.match(scriptJs, /if \(!shouldGenerateWithWarnings\) return;/);
});

test('generation warning panel is shown below the download button', () => {
  const buttonIndex = indexHtml.indexOf('<button type="submit" form="daneForm">Pobierz receptę</button>');
  const panelIndex = indexHtml.indexOf('id="generationMessage"');
  assert.ok(buttonIndex > -1);
  assert.ok(panelIndex > buttonIndex);
  assert.match(scriptJs, /generationMessage/);
  assert.match(scriptJs, /Recepta została wygenerowana z ostrzeżeniami/);
});

test('validation warnings refresh while editing recipe fields', () => {
  assert.match(scriptJs, /function refreshValidationWarnings/);
  assert.match(scriptJs, /\["fullname", "pesel", "dateFrom", "dateTo", \.\.\.additiveInputIds\]\.forEach/);
  assert.match(scriptJs, /weightInp \.addEventListener\("input"[\s\S]*refreshValidationWarnings\(\);/);
  assert.match(scriptJs, /const normalizedMessage = message\.toLowerCase\(\);/);
  assert.match(scriptJs, /normalizedMessage\.includes\("objętość worka"\)/);
});

test('additive warnings are shown below the whole ingredient row', () => {
  assert.match(scriptJs, /const tableRow = field\.closest\("\.extras-table tr"\);/);
  assert.match(scriptJs, /const inputCell = field\.closest\("td\.input"\);/);
  assert.match(scriptJs, /warningRow\.className = "field-warning ingredient-warning-row";/);
  assert.match(scriptJs, /warningCell\.colSpan = tableRow\.cells\.length;/);
  assert.match(scriptJs, /tableRow\.after\(warningRow\);/);
  assert.match(styleCss, /\.extras-table tr\.ingredient-warning-row td\{[\s\S]*border-top:none;[\s\S]*\}/);
});

test('bag selector warnings are shown below the whole selector row', () => {
  assert.match(scriptJs, /const bagSelectRow = field\.closest\("\.bag-select-row"\);/);
  assert.match(scriptJs, /warning\.className = "field-warning bag-row-warning";/);
  assert.match(scriptJs, /bagSelectRow\.after\(warning\);/);
  assert.match(styleCss, /\.bag-row-warning\{[\s\S]*width:100%;[\s\S]*\}/);
});

test('field warnings are inserted before patient form dividers', () => {
  assert.match(indexHtml, /id="pesel"[\s\S]*<hr class="divider">/);
  assert.match(scriptJs, /field\.nextElementSibling\?\.classList\.contains\("divider"\)/);
  assert.match(scriptJs, /container\.insertBefore\(warning, field\.nextElementSibling\);/);
});

test('field warnings include an exclamation icon', () => {
  assert.match(scriptJs, /function createWarningContent \(message\)/);
  assert.match(scriptJs, /icon\.className = "field-warning-icon";/);
  assert.match(scriptJs, /icon\.textContent = "!";/);
  assert.match(scriptJs, /warning\.appendChild\(createWarningContent\(message\)\);/);
  assert.match(styleCss, /\.field-warning-icon\{[\s\S]*border:1px solid currentColor;[\s\S]*border-radius:50%;[\s\S]*\}/);
  assert.match(styleCss, /\.field-warning-content \+ \.field-warning-content\{[\s\S]*margin-top:0\.35rem;/);
});

test('additive inputs use package-size stepper buttons', () => {
  assert.equal(cfg.additiveConfig.add1.stepSize, 20);
  assert.equal(cfg.additiveConfig.add3.stepSize, 1);
  assert.equal(cfg.additiveConfig.add6.stepSize, 50);
  assert.equal(cfg.additiveConfig.add10.stepSize, 10);
  assert.equal(cfg.additiveConfig.add15.stepSize, 2);
  assert.equal(cfg.additiveConfig.add16.stepSize, 5);
  assert.match(scriptJs, /function setupAdditiveSteppers \(\)/);
  assert.match(scriptJs, /const step = Number\(additive\?\.stepSize\);/);
  assert.match(scriptJs, /button\.textContent = direction > 0 \? "▲" : "▼";/);
  assert.match(scriptJs, /button\.addEventListener\("click", \(\) => adjustAdditiveByStep\(input, direction\)\);/);
  assert.match(scriptJs, /input\.dispatchEvent\(new Event\("input", \{ bubbles: true \}\)\);/);
  assert.match(scriptJs, /setupAdditiveSteppers\(\);/);
  assert.match(styleCss, /\.additive-stepper\{[\s\S]*grid-template-columns:minmax\(0,1fr\) 1\.35rem;/);
  assert.match(styleCss, /\.additive-stepper-button\{[\s\S]*width:1\.35rem;[\s\S]*height:1\.15rem;/);
});

test('recipe import maps template date cells to the correct form fields', () => {
  assert.match(scriptJs, /C8 = Data podania, C9 = Data wystawienia/);
  assert.match(scriptJs, /const importedDateTo = toDateInputValue\(getCellPlainValue\(ws, "C8"\)\);/);
  assert.match(scriptJs, /const importedDateFrom = toDateInputValue\(getCellPlainValue\(ws, "C9"\)\);/);
  assert.match(scriptJs, /\$\("dateTo"\)\.value = importedDateTo;/);
  assert.match(scriptJs, /\$\("dateFrom"\)\.value = importedDateFrom;/);
});

test('recipe import shows previous mixture parameters for comparison', () => {
  assert.match(indexHtml, /<th class="imported-recipe-col" hidden>We wgranej recepcie<\/th>/);
  [
    'importedBagCalories',
    'importedTotalMixtureVolume',
    'importedNaTotal',
    'importedKTotal',
    'importedCaTotal',
    'importedPhosphateTotal',
    'importedMgTotal',
    'importedClTotal',
    'importedAminoAcidsTotal',
    'importedCarbohydratesTotal',
    'importedFatTotal'
  ].forEach(id => assert.match(indexHtml, new RegExp(`id="${id}"`)));
  assert.match(scriptJs, /const importedMixtureParamSpans = \{/);
  assert.match(scriptJs, /function calculateMixtureParameterValues \(\{ bag, volume, additives \}\)/);
  assert.match(scriptJs, /function showImportedMixtureComparison \(\{ bag, volume, additives \}\)/);
  assert.match(scriptJs, /document\.querySelectorAll\("\.imported-recipe-col"\)\.forEach/);
  assert.match(scriptJs, /document\.querySelector\("\.mix-params"\)\?\.classList\.add\("has-imported-comparison"\);/);
  assert.match(styleCss, /\.wrapper > \.container\.mix-params\.has-imported-comparison\{[\s\S]*max-width:42rem;/);
  assert.match(styleCss, /\.mix-params\.has-imported-comparison \.mix-params-table\{[\s\S]*max-width:none;/);
  assert.match(scriptJs, /showImportedMixtureComparison\(\{[\s\S]*bag: importedBag\.bag,[\s\S]*volume: importedBag\.vol,[\s\S]*additives[\s\S]*\}\);/);
});

test('recipe import asks before replacing old issue and administration dates with today', () => {
  assert.match(scriptJs, /function confirmTodayForImportedDates \(importedDateFrom\)/);
  assert.match(scriptJs, /importedDateFrom === currentToday/);
  assert.match(scriptJs, /window\.confirm\(/);
  assert.match(scriptJs, /Czy ustawić datę wystawienia i datę podania na dzisiaj\?/);
  assert.match(scriptJs, /\$\("dateFrom"\)\.value = currentToday;/);
  assert.match(scriptJs, /\$\("dateTo"\)\.value = currentToday;/);
  assert.match(scriptJs, /confirmTodayForImportedDates\(importedDateFrom\);/);
});

test('weekend administration date change asks before removing Omegaven from the recipe', () => {
  assert.match(scriptJs, /function isWeekendDateInput \(value\)/);
  assert.match(scriptJs, /weekDay === 0 \|\| weekDay === 6/);
  assert.match(scriptJs, /function confirmRemoveOmegavenAfterDateChange \(\)/);
  assert.match(scriptJs, /if \(isImportingRecipe \|\| !getWeekendOmegavenWarning\(\)\) return;/);
  assert.match(scriptJs, /Czy usunąć Omegaven z recepty, ponieważ jest to recepta weekendowa\?/);
  assert.match(scriptJs, /omegavenInp\.value = "";/);
  assert.match(scriptJs, /\$\("dateTo"\)\?\.addEventListener\("input", confirmRemoveOmegavenAfterDateChange\);/);
  assert.doesNotMatch(scriptJs, /\$\("add8"\)\?\.addEventListener\("input", confirmRemoveOmegavenAfterDateChange\);/);
  assert.doesNotMatch(scriptJs, /isImportingRecipe = false;\s+confirmRemoveOmegavenAfterDateChange\(\);/);
});

test('weekend Omegaven after import or manual entry is shown as a field warning', () => {
  assert.match(scriptJs, /function getWeekendOmegavenWarning \(\)/);
  assert.match(scriptJs, /parseNum\(\$\("add8"\)\?\.value\)/);
  assert.match(scriptJs, /return "Recepta weekendowa: Omegaven jest dodany do worka\.";/);
  assert.match(scriptJs, /const weekendOmegavenWarning = getWeekendOmegavenWarning\(\);/);
  assert.match(scriptJs, /if \(weekendOmegavenWarning\) errors\.push\(weekendOmegavenWarning\);/);
  assert.match(scriptJs, /\["fullname", "pesel", "dateFrom", "dateTo", \.\.\.additiveInputIds\]\.forEach/);
  assert.match(scriptJs, /refreshValidationWarnings\(\);[\s\S]*const fileName = file\.name/);
});

test('application does not persist form data in browser storage', () => {
  assert.doesNotMatch(scriptJs, /localStorage/);
  assert.doesNotMatch(scriptJs, /sessionStorage/);
  assert.doesNotMatch(scriptJs, /draftStorageKey/);
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


test('application footer shows author and loads main branch version date automatically', () => {
  assert.match(indexHtml, /<footer class="app-footer"[^>]*>/);
  assert.match(indexHtml, /Autor: Maciej Piekarski/);
  assert.match(indexHtml, /Wersja: <span id="appVersion">ładowanie\.\.\.<\/span>/);
  assert.match(indexHtml, /<script src="pnCalculator\.js\?v=20260621-2" defer><\/script>/);
  assert.match(indexHtml, /<script src="script\.js\?v=20260621-7" defer><\/script>/);
  assert.equal(cfg.versionConfig.githubRepository, 'macpiek/parenteral_nutrition_generator');
  assert.equal(cfg.versionConfig.branch, 'main');
  assert.match(scriptJs, /api\.github\.com\/repos/);
  assert.match(scriptJs, /commits\/\$\{encodeURIComponent\(branch\)\}/);
  assert.match(scriptJs, /commitData\?\.commit\?\.committer\?\.date/);
});

test('mixture parameters table includes extended composition rows and total volume', () => {
  [
    'totalMixtureVolume',
    'caTotal',
    'phosphateTotal',
    'mgTotal',
    'clTotal',
    'aminoAcidsTotal',
    'carbohydratesTotal',
    'fatTotal'
  ].forEach(id => assert.match(indexHtml, new RegExp(`id="${id}"`)));
  assert.match(styleCss, /\.mix-params-table td:not\(:first-child\)\{[\s\S]*text-align:right;/);
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
  assert.equal(ws.getCell('C8').value, '2026-06-06');
  assert.equal(ws.getCell('C9').value, '2026-06-05');
  assert.equal(ws.getCell('C11').value, 'Obwodowa X');
  assert.equal(ws.getCell('C12').value, 'Centralna');
  assert.equal(ws.getCell('C26').value, 800);
  assert.equal(ws.getCell('D26').value, 1206);
  assert.equal(ws.getCell('D30').value, '');
  assert.equal(ws.getCell('H30').value, 1);
  assert.equal(ws.getCell('D33').value, 50);
  assert.equal(ws.getCell('D35').value, 25);
  assert.deepEqual(ws.getCell('B66').value, { formula: 'SUM(D23:D44)', result: 1321 });
  assert.deepEqual(ws.getCell('B52').value, { formula: 'CONCATENATE(B66,C66)', result: '1321ml' });

  const zip = await JSZip.loadAsync(result.buffer);
  const workbookXml = await zip.file('xl/workbook.xml').async('text');
  assert.match(workbookXml, /name="_xlnm\.Print_Area"/);
  assert.match(workbookXml, /\$A\$1:\$M\$56/);
  assert.match(workbookXml, /<calcPr[^>]*calcMode="auto"/);
  assert.match(workbookXml, /<calcPr[^>]*fullCalcOnLoad="1"/);
  assert.match(workbookXml, /<calcPr[^>]*forceFullCalc="1"/);
});

test('generateRecipeXlsx can use embedded template when local fetch is unavailable', async () => {
  const originalTemplate = globalThis.PN_TEMPLATE_XLSX_BASE64;
  const originalWarn = console.warn;
  const additives = Array.from({ length: 17 }, () => '');

  globalThis.PN_TEMPLATE_XLSX_BASE64 = fs.readFileSync(path.join(__dirname, '..', 'szablon.xlsx')).toString('base64');
  console.warn = () => {};

  try {
    const result = await generateRecipeXlsx({
      data: {
        name: 'Jan Lokalny',
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
      fetchImpl: async () => {
        throw new Error('fetch blocked for local file');
      },
      ExcelJSImpl: ExcelJS,
      JSZipImpl: JSZip,
      returnBuffer: true
    });

    assert.equal(result.fileName, 'Jan Lokalny SmofKabiven obwodowe.xlsx');
    assert.ok(Buffer.isBuffer(result.buffer));
  } finally {
    console.warn = originalWarn;
    if (originalTemplate === undefined) {
      delete globalThis.PN_TEMPLATE_XLSX_BASE64;
    } else {
      globalThis.PN_TEMPLATE_XLSX_BASE64 = originalTemplate;
    }
  }
});
