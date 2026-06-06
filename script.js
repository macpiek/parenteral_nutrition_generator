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
    dosageConfig
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
    getCurrentBag,
    ADDITIVE_KCAL_PER_ML,
    prepareAdditivesForWorksheet,
    validateRecipe
  } = PNCalculator;

  const kcalSpan = $("bagCalories");
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
  const validationSummary = $("validationSummary");

  function fieldForIssue (issue) {
    return issue && typeof issue === "object" ? issue.field : null;
  }

  function messageForIssue (issue) {
    return issue && typeof issue === "object" ? issue.message : issue;
  }

  function clearInvalidFields () {
    document.querySelectorAll(".is-invalid").forEach(el => {
      el.classList.remove("is-invalid");
      el.removeAttribute("aria-invalid");
    });
  }

  function showMessages (issues, title = "Popraw dane przed wygenerowaniem recepty:") {
    if (!validationSummary) return;
    clearInvalidFields();
    validationSummary.hidden = false;
    validationSummary.innerHTML = "";

    const heading = document.createElement("strong");
    heading.textContent = title;
    validationSummary.appendChild(heading);

    const list = document.createElement("ul");
    issues.forEach(issue => {
      const item = document.createElement("li");
      const fieldId = fieldForIssue(issue);
      const message = messageForIssue(issue);
      const field = fieldId ? $(fieldId) : null;

      if (field) {
        field.classList.add("is-invalid");
        field.setAttribute("aria-invalid", "true");
        const link = document.createElement("button");
        link.type = "button";
        link.className = "validation-link";
        link.textContent = message;
        link.addEventListener("click", () => field.focus());
        item.appendChild(link);
      } else {
        item.textContent = message;
      }
      list.appendChild(item);
    });
    validationSummary.appendChild(list);
    validationSummary.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function clearMessages () {
    if (!validationSummary) return;
    clearInvalidFields();
    validationSummary.hidden = true;
    validationSummary.innerHTML = "";
  }

  const updateKcal = () => {
    const additives = Object.fromEntries(Object.keys(ADDITIVE_KCAL_PER_ML).map(id => [id, $(id)?.value]));
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
      el.addEventListener("input", () => {
        manualAdditives.add(el.id);
        clearMessages();
      });
    }
  }

  ["add10", "add17"].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener("input", () => { clearMessages(); updateElectrolyteSummary(); });
  });

  ["add6", "add8"].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener("input", () => { clearMessages(); updateKcal(); });
  });

  /* ---------- 3. Inicjalizacja dat ---------- */
  const today = new Date().toISOString().slice(0, 10);
  $("dateFrom").value = today;
  $("dateTo").value   = today;

  /* ---------- 4. Funkcje pomocnicze ---------- */
  const currentBag = () => getCurrentBag(productSel.value, nutritSel.value);

  /* --- zakresy dodatków --- */
  function updateAdditiveRanges () {
    const bag = currentBag();
    const vol = parseInt(volSel.value, 10);
    const ranges = calculateAdditiveRanges({
      additiveRangeConfig,
      constants: cfg.constants,
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
  productSel.addEventListener("change", () => { clearMessages(); renderBagOptions(); });
  nutritSel .addEventListener("change", () => { clearMessages(); renderBagOptions(); });
  volSel    .addEventListener("change", () => {
    clearMessages();
    updateKcal();
    updateDosage();
    updateAdditiveRanges();
    updateElectrolyteSummary();
  });
  weightInp .addEventListener("input",  () => { clearMessages(); updateDosage(); updateAdditiveRanges(); });
  ["fullname", "pesel", "dateFrom", "dateTo", "sodium", "potassium"].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener("input", clearMessages);
  });

  renderBagOptions();          // początkowe
  updateElectrolyteSummary();

  /* ---------- 5. Submit = przygotuj dane i wywołaj generator ---------- */
  $("daneForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const additivesById = Object.fromEntries(
      Array.from({ length: PNCalculator.ADDITIVE_COUNT }, (_, i) => [`add${i + 1}`, $(`add${i + 1}`)?.value || ""])
    );

    const data = {
      name     : $("fullname").value.trim(),
      pesel    : $("pesel").value.trim(),
      dateFrom : $("dateFrom").value,
      dateTo   : $("dateTo").value,
      weight   : parseNum(weightInp.value) || 0,
      bagVol   : parseInt(volSel.value, 10) || 0,
      additives: prepareAdditivesForWorksheet(additivesById)
    };

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
      showMessages(validation.issues);
      return;
    }

    clearMessages();

    /* flaga centralne/obwodowe */
    const central = nutritSel.value === "centralne";

    /* wywołaj zewnętrzny generator */
    try {
      await generateRecipeXlsx({
        data,
        currentBag: currentBag(),
        central,
        cfg        // przekazujemy pełny konfig, bo tam są wszystkie stałe
      });
    } catch (err) {
      console.error(err);
      showMessages([err.message || "Nieznany błąd eksportu XLSX."], "Nie udało się wygenerować pliku XLSX:");
    }
  });
});
