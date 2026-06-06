(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PNCalculator = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  const ADDITIVE_KCAL_PER_ML = {
    add6: 0.8,
    add8: 1.12
  };
  const MIXTURE_SUMMARY_KEYS = ["Na", "K", "Ca", "phosphate", "Mg", "Cl", "aminoAcids", "carbohydrates", "fat"];

  function parseNumber (value) {
    if (value === null || value === undefined) return NaN;
    if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
    const normalized = String(value).trim().replace(/,/g, ".");
    if (normalized === "") return NaN;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  function formatRange (min, max, unit) {
    return `${min} – ${max} ${unit}`;
  }

  function getCurrentBag (productType, nutritionType) {
    return nutritionType === "obwodowe" ? `${productType} Peripheral` : productType;
  }

  function getBagInfo (bagConfig, bag, volume) {
    const numericVolume = Number(volume);
    return (bagConfig[bag] || []).find(item => Number(item.vol) === numericVolume) || null;
  }

  function getAdditiveEnergyConfig (additiveConfig) {
    if (!additiveConfig) return ADDITIVE_KCAL_PER_ML;
    return Object.fromEntries(
      Object.entries(additiveConfig)
        .filter(([, additive]) => Number.isFinite(Number(additive.energyKcalPerMl)))
        .map(([id, additive]) => [id, Number(additive.energyKcalPerMl)])
    );
  }

  function getAdditiveElectrolyteConfig (additiveConfig, additiveElectrolyteConfig) {
    if (!additiveConfig) {
      return additiveElectrolyteConfig || {
        add1: { Na: 2 },
        add10: { K: 2 },
        add17: { Na: 1.54 }
      };
    }
    return Object.fromEntries(
      Object.entries(additiveConfig)
        .filter(([, additive]) => additive.compositionPerMl || additive.electrolytes)
        .map(([id, additive]) => {
          const composition = additive.compositionPerMl || additive.electrolytes;
          return [id, Object.fromEntries(
            Object.entries(composition).filter(([key]) => key === "Na" || key === "K")
          )];
        })
        .filter(([, composition]) => Object.keys(composition).length)
    );
  }

  function normalizeSummaryNumber (value) {
    const rounded = Math.round((value + Number.EPSILON) * 10) / 10;
    return Number.isInteger(rounded) ? rounded : rounded;
  }

  function calculateMixtureSummary ({ mixtureCompositionConfig, additiveConfig, bag, volume, additives = {} }) {
    const base = mixtureCompositionConfig?.[bag]?.[Number(volume)] || {};
    const summary = Object.fromEntries(MIXTURE_SUMMARY_KEYS.map(key => [key, Number(base[key]) || 0]));

    for (const [id, additive] of Object.entries(additiveConfig || {})) {
      const composition = additive.compositionPerMl || additive.electrolytes;
      if (!composition) continue;
      const amount = parseNumber(additives[id]) || 0;
      for (const [key, perMl] of Object.entries(composition)) {
        if (!MIXTURE_SUMMARY_KEYS.includes(key)) continue;
        summary[key] += amount * (Number(perMl) || 0);
      }
    }

    return Object.fromEntries(
      Object.entries(summary).map(([key, value]) => [key, normalizeSummaryNumber(value)])
    );
  }

  function calculateTotalKcal ({ bagConfig, bag, volume, additives = {}, additiveConfig }) {
    const info = getBagInfo(bagConfig, bag, volume);
    let total = info ? Number(info.kcal) : 0;
    for (const [id, kcalPerMl] of Object.entries(getAdditiveEnergyConfig(additiveConfig))) {
      total += (parseNumber(additives[id]) || 0) * kcalPerMl;
    }
    return total ? Math.round(total) : 0;
  }

  function calculateAdditiveRanges ({ additiveRangeConfig, constants, bag, volume, weight }) {
    const cfgRange = additiveRangeConfig[bag]?.[Number(volume)];
    const numericWeight = parseNumber(weight) || 0;
    const weightLimited = (perKg, fallbackMax = Infinity) => Math.min(
      fallbackMax,
      numericWeight ? Math.round(perKg * numericWeight) : Infinity
    );

    const diMax = weightLimited(constants.DIPEPTIVEN_PER_KG, cfgRange?.di?.[1] ?? Infinity);
    const omMax = weightLimited(constants.OMEGAVEN_PER_KG, cfgRange?.om?.[1] ?? Infinity);

    return {
      di: { min: 0, max: diMax, label: diMax === Infinity ? "Brak danych" : formatRange(0, diMax, "ml") },
      om: { min: 0, max: omMax, label: omMax === Infinity ? "Brak danych" : formatRange(0, omMax, "ml") },
      so: cfgRange?.so
        ? { min: cfgRange.so[0], max: cfgRange.so[1], label: formatRange(cfgRange.so[0], cfgRange.so[1], "fiol.") }
        : { min: null, max: null, label: "Brak danych" },
      vi: cfgRange?.vi
        ? { min: cfgRange.vi[0], max: cfgRange.vi[1], label: formatRange(cfgRange.vi[0], cfgRange.vi[1], "ml") }
        : { min: null, max: null, label: "Brak danych" },
      ad: { min: 0, max: 10, label: constants.ADDAMEL_RANGE },
      vb1: { min: 0, max: 6, label: constants.VIT_B1_RANGE },
      vc: { min: 0, max: 20, hardMax: 30, label: constants.VIT_C_RANGE }
    };
  }

  function calculateElectrolyteSummary ({
    electrolyteConfig,
    additiveElectrolyteConfig,
    additiveConfig,
    mixtureCompositionConfig,
    bag,
    volume,
    additives,
    sodiumChlorideMl,
    potassiumChlorideMl
  }) {
    const eCfg = electrolyteConfig?.[bag]?.[Number(volume)] || {};
    const additiveValues = additives || {
      add10: potassiumChlorideMl,
      add17: sodiumChlorideMl
    };
    const summary = mixtureCompositionConfig
      ? calculateMixtureSummary({ mixtureCompositionConfig, additiveConfig, bag, volume, additives: additiveValues })
      : (() => {
          let sodium = eCfg.Na || 0;
          let potassium = eCfg.K || 0;
          const configuredAdditives = getAdditiveElectrolyteConfig(additiveConfig, additiveElectrolyteConfig);
          for (const [id, electrolytePerMl] of Object.entries(configuredAdditives)) {
            const amount = parseNumber(additiveValues[id]) || 0;
            sodium += amount * (electrolytePerMl.Na || 0);
            potassium += amount * (electrolytePerMl.K || 0);
          }
          return { Na: sodium, K: potassium };
        })();

    return {
      sodium: Math.round(summary.Na || 0),
      potassium: Math.round(summary.K || 0),
      sodiumMax: eCfg.NaMax || 0,
      potassiumMax: eCfg.KMax || 0
    };
  }

  function calculateRequirements ({ dosageConfig, bag, weight }) {
    const cfgDose = dosageConfig[bag];
    const numericWeight = parseNumber(weight) || 0;
    if (!numericWeight) {
      return {
        calories: { min: 0, max: 0 },
        sodium: { min: 0, max: 0 },
        potassium: { min: 0, max: 0 },
        volume: { min: 0, max: 0, absoluteMax: 0 }
      };
    }
    return {
      calories: { min: Math.round(25 * numericWeight), max: Math.round(35 * numericWeight) },
      sodium: { min: Math.round(0.5 * numericWeight), max: Math.round(2 * numericWeight) },
      potassium: { min: Math.round(0.5 * numericWeight), max: Math.round(2 * numericWeight) },
      volume: {
        min: cfgDose ? Math.round(cfgDose.min * numericWeight) : 0,
        max: cfgDose ? Math.round(cfgDose.max * numericWeight) : 0,
        absoluteMax: cfgDose ? Math.round(cfgDose.maxDaily * numericWeight) : 0
      }
    };
  }

  function validatePesel (pesel) {
    const value = String(pesel || "").trim();
    if (!/^\d{11}$/.test(value)) return false;
    const weights = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
    const sum = weights.reduce((acc, weight, index) => acc + (Number(value[index]) * weight), 0);
    return ((10 - (sum % 10)) % 10) === Number(value[10]);
  }

  function collectRangeErrors (errors, additivesById, ranges) {
    const checks = [
      ["add6", "Dipeptiven", ranges.di.max],
      ["add8", "Omegaven", ranges.om.max],
      ["add3", "Soluvit N", ranges.so.max],
      ["add4", "Vitalipid N Adult", ranges.vi.max],
      ["add2", "Addamel N", ranges.ad.max],
      ["add15", "Vit. B1", ranges.vb1.max],
      ["add16", "Vit. C", ranges.vc.hardMax]
    ];

    checks.forEach(([id, label, max]) => {
      const value = parseNumber(additivesById[id]);
      if (!Number.isNaN(value) && max !== null && max !== Infinity && value > max) {
        errors.push(`${label}: przekroczono maksymalną wartość ${max}.`);
      }
    });
  }

  function validateRecipe ({ cfg, productType, nutritionType, bag, volume, weight, name, pesel, dateFrom, dateTo, additivesById = {} }) {
    const errors = [];
    const numericWeight = parseNumber(weight);
    if (!String(name || "").trim()) errors.push("Uzupełnij imię i nazwisko pacjenta.");
    if (!validatePesel(pesel)) errors.push("PESEL ma nieprawidłowy format lub sumę kontrolną.");
    if (!dateFrom) errors.push("Uzupełnij datę wystawienia.");
    if (!dateTo) errors.push("Uzupełnij datę podania.");
    if (dateFrom && dateTo && dateTo < dateFrom) errors.push("Data podania nie może być wcześniejsza niż data wystawienia.");
    if (!Number.isFinite(numericWeight) || numericWeight <= 0) errors.push("Masa ciała musi być dodatnią liczbą.");
    if (!cfg.bagConfig[bag]) errors.push("Wybrano nieobsługiwany typ worka.");
    if (!getBagInfo(cfg.bagConfig, bag, volume)) errors.push("Wybrano nieobsługiwaną objętość worka.");

    Object.entries(additivesById).forEach(([id, value]) => {
      const raw = String(value ?? "").trim();
      if (raw && !Number.isFinite(parseNumber(raw))) errors.push(`Dodatek ${id} musi być liczbą.`);
      if (Number.isFinite(parseNumber(raw)) && parseNumber(raw) < 0) errors.push(`Dodatek ${id} nie może być ujemny.`);
    });

    if (errors.length === 0) {
      const ranges = calculateAdditiveRanges({
        additiveRangeConfig: cfg.additiveRangeConfig,
        constants: cfg.constants,
        bag,
        volume,
        weight: numericWeight
      });
      collectRangeErrors(errors, additivesById, ranges);

      const electrolytes = calculateElectrolyteSummary({
        electrolyteConfig: cfg.electrolyteConfig,
        additiveElectrolyteConfig: cfg.additiveElectrolyteConfig,
        additiveConfig: cfg.additiveConfig,
        mixtureCompositionConfig: cfg.mixtureCompositionConfig,
        bag,
        volume,
        additives: additivesById
      });
      if (electrolytes.sodiumMax && electrolytes.sodium > electrolytes.sodiumMax) {
        errors.push(`Sód w mieszaninie (${electrolytes.sodium} mmol) przekracza limit worka ${electrolytes.sodiumMax} mmol.`);
      }
      if (electrolytes.potassiumMax && electrolytes.potassium > electrolytes.potassiumMax) {
        errors.push(`Potas w mieszaninie (${electrolytes.potassium} mmol) przekracza limit worka ${electrolytes.potassiumMax} mmol.`);
      }
    }

    return { valid: errors.length === 0, errors, productType, nutritionType };
  }

  return {
    ADDITIVE_KCAL_PER_ML,
    MIXTURE_SUMMARY_KEYS,
    parseNumber,
    getCurrentBag,
    getBagInfo,
    getAdditiveEnergyConfig,
    getAdditiveElectrolyteConfig,
    calculateTotalKcal,
    calculateMixtureSummary,
    calculateAdditiveRanges,
    calculateElectrolyteSummary,
    calculateRequirements,
    validatePesel,
    validateRecipe
  };
});
