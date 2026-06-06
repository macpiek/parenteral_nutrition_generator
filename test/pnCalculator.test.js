const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const calc = require('../pnCalculator.js');
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));

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
    }
  }
});
