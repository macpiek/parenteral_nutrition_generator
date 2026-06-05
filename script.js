/* script.js  –  logika UI + pobranie config.json
 * 2025-05-20
 *  ⤷ generowanie pliku XLSX przeniesione do xlsxGenerator.js
 */

document.addEventListener("DOMContentLoaded", async () => {
  /* ---------- 1. Pobranie konfiguracji ---------- */
  let cfg;
  try {
    const resp = await fetch("config.json");
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    cfg = await resp.json();
  } catch (err) {
    console.error(err);
    alert("Błąd wczytywania pliku konfiguracyjnego (config.json).");
    return;
  }

  /* Rozpakowanie */
  const {
    bagConfig,
    additiveRangeConfig,
    additiveDefaultConfig,
    dosageConfig,
    constants: {
      DIPEPTIVEN_PER_KG,
      OMEGAVEN_PER_KG,
      ADDAMEL_RANGE,
      VIT_B1_RANGE,
      VIT_C_RANGE
    }
  } = cfg;

  /* ---------- 2. Cache elementów DOM ---------- */
  const $ = id => document.getElementById(id);

  const productSel = $("productType");
  const nutritSel  = $("nutritionType");
  const weightInp  = $("weight");
  const volSel     = $("bagVolume");

  const {
    parseNumber: parseNum,
    calculateTotalKcal,
    calculateAdditiveRanges,
    calculateElectrolyteSummary,
    calculateRequirements,
    validateRecipe
  } = PNCalculator;

  const kcalSpan = $("bagCalories");
  const additiveKcalPerMl = {
    add6: 0.8,   // Dipeptiven: 80 kcal/100 ml
    add8: 1.12   // Omegaven: 112 kcal/100 ml
  };
  const reqMin   = $("reqMin");
  const reqMax   = $("reqMax");
  const reqAbs   = $("reqAbsMax");
  const calReqMin = $("calReqMin");
  const calReqMax = $("calReqMax");

  const rangeDi  = $("rangeAdd6");
  const rangeSo  = $("rangeAdd3");
  const rangeVi  = $("rangeAdd4");
  const rangeOm  = $("rangeAdd8");
  const rangeAd  = $("rangeAdd2");
  const rangeVb1 = $("rangeAdd15");
  const rangeVc  = $("rangeAdd16");

  const naTotal = $("naTotal");
  const naMaxSpan = $("naMax");
  const kTotal = $("kTotal");
  const kMaxSpan = $("kMax");
  const naReqMin = $("naReqMin");
  const naReqMax = $("naReqMax");
  const kReqMin  = $("kReqMin");
  const kReqMax  = $("kReqMax");

  const updateKcal = () => {
    const additives = Object.fromEntries(Object.keys(additiveKcalPerMl).map(id => [id, $(id)?.value]));
    const total = calculateTotalKcal({
      bagConfig,
      bag: currentBag(),
      volume: volSel.value,
      additives
    });
    kcalSpan.textContent = total || "";
  };


  const additiveInputs = {
    "Soluvit N": $("add3"),
    "Vitalipid N Adult": $("add4"),
    "Addamel N": $("add2"),
    "Vit. B1": $("add15"),
    "Vit. C": $("add16")
  };

  const manualAdditives = new Set();

  for (const el of Object.values(additiveInputs)) {
    if (el) {
      el.addEventListener("input", () => manualAdditives.add(el.id));
    }
  }

  ["add10", "add17"].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener("input", updateElectrolyteSummary);
  });

  ["add6", "add8"].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener("input", updateKcal);
  });

  /* ---------- 3. Inicjalizacja dat ---------- */
  const today = new Date().toISOString().slice(0, 10);
  $("dateFrom").value = today;
  $("dateTo").value   = today;

  /* ---------- 4. Funkcje pomocnicze ---------- */
  const currentBag = () =>
    nutritSel.value === "obwodowe"
      ? `${productSel.value} Peripheral`
      : productSel.value;

  /* --- zakresy dodatków --- */
  function updateAdditiveRanges () {
    const bag = currentBag();
    const vol = parseInt(volSel.value, 10);
    const ranges = calculateAdditiveRanges({
      additiveRangeConfig,
      constants: { DIPEPTIVEN_PER_KG, OMEGAVEN_PER_KG, ADDAMEL_RANGE, VIT_B1_RANGE, VIT_C_RANGE },
      bag,
      volume: vol,
      weight: weightInp.value
    });

    rangeDi.textContent  = ranges.di.label;
    rangeOm.textContent  = ranges.om.label;
    rangeAd.textContent  = ranges.ad.label;
    rangeSo.textContent  = ranges.so.label;
    rangeVi.textContent  = ranges.vi.label;
    rangeVb1.textContent = ranges.vb1.label;
    rangeVc.textContent  = ranges.vc.label;
  }

  function applyDefaultAdditives () {
    const defaults = additiveDefaultConfig[currentBag()];
    if (!defaults) return;
    for (const [name, val] of Object.entries(defaults)) {
      const el = additiveInputs[name];
      if (el && !manualAdditives.has(el.id)) el.value = val;
    }
    updateElectrolyteSummary();
  }

  /* --- podsumowanie Na i K --- */
  function updateElectrolyteSummary () {
    const summary = calculateElectrolyteSummary({
      electrolyteConfig: cfg.electrolyteConfig,
      bag: currentBag(),
      volume: volSel.value,
      sodiumChlorideMl: $("add17").value,
      potassiumChlorideMl: $("add10").value
    });
    naTotal.textContent = summary.sodium;
    kTotal.textContent  = summary.potassium;
    naMaxSpan.textContent = summary.sodiumMax;
    kMaxSpan.textContent  = summary.potassiumMax;
  }

  /* --- worki & kcal --- */
  function renderBagOptions () {
    const bag = currentBag();

    volSel.innerHTML = "";
    (bagConfig[bag] || []).forEach(({ vol, kcal }) => {
      const opt = document.createElement("option");
      opt.value        = vol;
      opt.textContent  = `${vol} ml`;
      opt.dataset.kcal = kcal;
      volSel.appendChild(opt);
    });

    updateKcal();
    updateDosage();
    updateAdditiveRanges();
    applyDefaultAdditives();
    updateElectrolyteSummary();
  }


  const updateDosage = () => {
    const requirements = calculateRequirements({
      dosageConfig,
      bag: currentBag(),
      weight: weightInp.value
    });
    calReqMin.textContent = requirements.calories.min;
    calReqMax.textContent = requirements.calories.max;
    naReqMin.textContent = requirements.sodium.min;
    naReqMax.textContent = requirements.sodium.max;
    kReqMin.textContent  = requirements.potassium.min;
    kReqMax.textContent  = requirements.potassium.max;
    reqMin.textContent = requirements.volume.min;
    reqMax.textContent = requirements.volume.max;
    reqAbs.textContent = requirements.volume.absoluteMax;
  };

  /* --- eventy UI --- */
  productSel.addEventListener("change", renderBagOptions);
  nutritSel .addEventListener("change", renderBagOptions);
  volSel    .addEventListener("change", () => {
    updateKcal();
    updateDosage();
    updateAdditiveRanges();
    updateElectrolyteSummary();
  });
  weightInp .addEventListener("input",  () => { updateDosage(); updateAdditiveRanges(); });

  renderBagOptions();          // początkowe
  updateElectrolyteSummary();

  /* ---------- 5. Submit = przygotuj dane i wywołaj generator ---------- */
  $("daneForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    /* pobierz wartości dodatków */
    const getAdd = i => {
      const el = $(`add${i}`);
      if (!el) return "";
      const raw = el.value.trim();
      if (raw === "") return "";
      const n = parseFloat(raw.replace(/,/g, "."));
      return isNaN(n) ? raw : n;
    };

    const data = {
      name     : $("fullname").value.trim(),
      pesel    : $("pesel").value.trim(),
      dateFrom : $("dateFrom").value,
      dateTo   : $("dateTo").value,
      weight   : parseNum(weightInp.value) || 0,
      bagVol   : parseInt(volSel.value, 10) || 0,
      additives: Array.from({ length: 17 }, (_, i) => getAdd(i + 1))
    };

    /* podział objętości 50/100 i 10/20 (Dipeptiven, Omegaven, KCl) */
    const split = (iS, iL, size) => {
      const total = parseFloat(data.additives[iS]) || 0;
      const large = Math.floor(total / size) * size;
      const small = total - large;
      data.additives[iS] = small || "";
      data.additives[iL] = large || "";
    };
    split(5, 6, 100);
    split(7, 8, 100);
    split(9, 10, 20);

    const additivesById = Object.fromEntries(
      Array.from({ length: 17 }, (_, i) => [`add${i + 1}`, $(`add${i + 1}`)?.value || ""])
    );

    const validation = validateRecipe({
      cfg,
      productType: productSel.value,
      nutritionType: nutritSel.value,
      bag: currentBag(),
      volume: volSel.value,
      weight: weightInp.value,
      name: data.name,
      pesel: data.pesel,
      dateFrom: data.dateFrom,
      dateTo: data.dateTo,
      additivesById
    });

    if (!validation.valid) {
      alert(`Popraw dane przed wygenerowaniem recepty:\n\n${validation.errors.join("\n")}`);
      return;
    }

    /* flaga centralne/obwodowe */
    const central = nutritSel.value === "centralne";

    /* wywołaj zewnętrzny generator */
    await generateRecipeXlsx({
      data,
      currentBag: currentBag(),
      central,
      cfg        // przekazujemy pełny konfig, bo tam są wszystkie stałe
    });
  });
});
