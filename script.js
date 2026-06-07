/* script.js  –  logika UI + pobranie config.json
 * 2025-05-20
 *  ⤷ generowanie pliku XLSX przeniesione do xlsxGenerator.js
 */

document.addEventListener("DOMContentLoaded", async () => {
  const $ = id => document.getElementById(id);
  const messagePanel = $("messagePanel");
  const generationMessage = $("generationMessage");

  function showMessage (panel, type, title, messages = []) {
    if (!panel) return;
    const list = Array.isArray(messages) ? messages : [messages];
    const baseClass = panel.classList.contains("generation-message")
      ? "message-panel generation-message"
      : "message-panel";
    panel.hidden = false;
    panel.className = `${baseClass} ${type}`;
    panel.innerHTML = "";

    const strong = document.createElement("strong");
    strong.textContent = title;
    panel.appendChild(strong);

    if (list.length === 1) {
      const paragraph = document.createElement("p");
      paragraph.textContent = list[0];
      panel.appendChild(paragraph);
      return;
    }

    const ul = document.createElement("ul");
    list.forEach(message => {
      const li = document.createElement("li");
      li.textContent = message;
      ul.appendChild(li);
    });
    panel.appendChild(ul);
  }

  function showAppMessage (type, title, messages = []) {
    showMessage(messagePanel, type, title, messages);
  }

  function clearAppMessage () {
    if (!messagePanel) return;
    messagePanel.hidden = true;
    messagePanel.textContent = "";
  }

  function clearGenerationMessage () {
    if (!generationMessage) return;
    generationMessage.hidden = true;
    generationMessage.textContent = "";
  }

  function updateVersionFooter (versionConfig = {}) {
    const versionEl = $("appVersion");
    if (!versionEl) return;

    const hardcodedDate = versionConfig.date
      || versionConfig.fallbackDate
      || versionEl.dataset.versionDate
      || versionEl.textContent.trim();

    versionEl.textContent = hardcodedDate || "brak daty";
  }

  function clearFieldWarnings () {
    document.querySelectorAll(".field-warning").forEach(el => el.remove());
    document.querySelectorAll(".input-warning").forEach(el => el.classList.remove("input-warning"));
  }

  function targetForWarning (message) {
    const additiveLabels = {
      "Dipeptiven": "add6",
      "Omegaven": "add8",
      "Soluvit N": "add3",
      "Vitalipid N Adult": "add4",
      "Addamel N": "add2",
      "Vit. B1": "add15",
      "Vit. C": "add16"
    };
    const additiveMatch = message.match(/Dodatek (add\d+)/);
    if (additiveMatch) return additiveMatch[1];
    if (message.includes("PESEL")) return "pesel";
    if (message.includes("Data podania")) return "dateTo";
    if (message.includes("Data wystawienia")) return "dateFrom";
    if (message.includes("Masa ciała")) return "weight";
    if (message.includes("typ worka")) return "productType";
    if (message.includes("objętość worka")) return "bagVolume";
    if (message.includes("Sód w mieszaninie")) return "add17";
    if (message.includes("Potas w mieszaninie")) return "add10";
    for (const [label, id] of Object.entries(additiveLabels)) {
      if (message.includes(label)) return id;
    }
    return null;
  }

  function addFieldWarning (fieldId, message) {
    const field = $(fieldId);
    if (!field) return false;
    field.classList.add("input-warning");
    const warning = document.createElement("div");
    warning.className = "field-warning";
    warning.textContent = message;

    const container = field.closest(".form-group") || field.closest("td") || field.parentElement;
    if (!container) return false;
    container.appendChild(warning);
    return true;
  }

  function showValidationWarnings (messages, options = {}) {
    const { showPanel = false } = options;
    clearFieldWarnings();
    const generalWarnings = [];
    messages.forEach(message => {
      const target = targetForWarning(message);
      if (!target || !addFieldWarning(target, message)) generalWarnings.push(message);
    });

    if (showPanel && messages.length) {
      showMessage(generationMessage, "info", "Recepta została wygenerowana z ostrzeżeniami", generalWarnings.length
        ? generalWarnings
        : "Sprawdź oznaczone pola przed użyciem recepty.");
    }
  }

  /* ---------- 1. Pobranie konfiguracji ---------- */
  let cfg;
  try {
    const resp = await fetch("config.json", { cache: "no-store" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    cfg = await resp.json();
  } catch (err) {
    console.error(err);
    showAppMessage("error", "Błąd konfiguracji", "Nie udało się wczytać pliku config.json.");
    return;
  }

  updateVersionFooter(cfg.versionConfig);

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

  const productSel = $("productType");
  const nutritSel  = $("nutritionType");
  const weightInp  = $("weight");
  const volSel     = $("bagVolume");
  const importInp  = $("recipeImport");
  const importStatus = $("importStatus");

  const {
    parseNumber: parseNum,
    calculateTotalKcal,
    calculateAdditiveRanges,
    calculateElectrolyteSummary,
    calculateMixtureSummary,
    calculateRequirements,
    validateRecipe
  } = PNCalculator;

  const kcalSpan = $("bagCalories");
  const additiveEnergyIds = Object.keys(PNCalculator.getAdditiveEnergyConfig(cfg.additiveConfig));
  const additiveCompositionIds = Object.entries(cfg.additiveConfig || {})
    .filter(([, additive]) => additive.compositionPerMl)
    .map(([id]) => id);
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
  const caTotal = $("caTotal");
  const phosphateTotal = $("phosphateTotal");
  const mgTotal = $("mgTotal");
  const clTotal = $("clTotal");
  const aminoAcidsTotal = $("aminoAcidsTotal");
  const carbohydratesTotal = $("carbohydratesTotal");
  const fatTotal = $("fatTotal");
  const naReqMin = $("naReqMin");
  const naReqMax = $("naReqMax");
  const kReqMin  = $("kReqMin");
  const kReqMax  = $("kReqMax");

  const additiveInputIds = Array.from({ length: 17 }, (_, i) => `add${i + 1}`);

  const updateKcal = () => {
    const additives = Object.fromEntries(additiveEnergyIds.map(id => [id, $(id)?.value]));
    const total = calculateTotalKcal({
      bagConfig,
      bag: currentBag(),
      volume: volSel.value,
      additives,
      additiveConfig: cfg.additiveConfig
    });
    kcalSpan.textContent = total || "";
  };

  const readAdditiveValues = () => Object.fromEntries(
    additiveInputIds.map(id => [id, $(id)?.value || ""])
  );

  function collectValidationData () {
    return {
      cfg,
      productType: productSel.value,
      nutritionType: nutritSel.value,
      bag: currentBag(),
      volume: volSel.value,
      weight: weightInp.value,
      name: $("fullname").value.trim(),
      pesel: $("pesel").value.trim(),
      dateFrom: $("dateFrom").value,
      dateTo: $("dateTo").value,
      additivesById: readAdditiveValues()
    };
  }

  function refreshValidationWarnings (options = {}) {
    const validation = validateRecipe(collectValidationData());
    showValidationWarnings(validation.errors, options);
    return validation;
  }


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

  additiveCompositionIds.forEach(id => {
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
  weightInp.value = "65";

  /* ---------- 4. Funkcje pomocnicze ---------- */
  const currentBag = () =>
    nutritSel.value === "obwodowe"
      ? `${productSel.value} Peripheral`
      : productSel.value;

  function showImportStatus (message, type = "info") {
    if (!importStatus) return;
    importStatus.textContent = message;
    importStatus.className = `import-status ${type}`;
  }

  function getCellPlainValue (ws, address) {
    const value = ws.getCell(address).value;
    if (value && typeof value === "object") {
      if (value instanceof Date) return value;
      if ("result" in value) return value.result;
      if ("text" in value) return value.text;
      if (Array.isArray(value.richText)) return value.richText.map(part => part.text).join("");
    }
    return value;
  }

  function toInputValue (value) {
    if (value === null || value === undefined) return "";
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value).trim();
  }

  function excelSerialToDateInput (serial) {
    if (!Number.isFinite(serial)) return "";
    const utcDays = Math.floor(serial - 25569);
    const utcValue = utcDays * 86400 * 1000;
    return new Date(utcValue).toISOString().slice(0, 10);
  }

  function toDateInputValue (value) {
    if (value === null || value === undefined || value === "") return "";
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === "number") return excelSerialToDateInput(value);
    const text = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString().slice(0, 10);
  }

  function setAdditiveValue (id, value) {
    const el = $(id);
    if (!el) return;
    el.value = value === 0 ? "" : toInputValue(value);
    manualAdditives.add(id);
  }

  function chooseImportedBag (ws) {
    const rowMap = {
      "Kabiven": 23,
      "SmofKabiven": 24,
      "Kabiven Peripheral": 25,
      "SmofKabiven Peripheral": 26
    };

    for (const [bag, row] of Object.entries(rowMap)) {
      const vol = parseInt(getCellPlainValue(ws, `D${row}`), 10);
      if (vol) return { bag, vol };
    }

    return null;
  }

  function setImportedBag (bag, vol) {
    const central = !bag.endsWith(" Peripheral");
    const product = bag.replace(" Peripheral", "");

    productSel.value = product;
    nutritSel.value = central ? "centralne" : "obwodowe";
    renderBagOptions({ preserveDefaults: true });

    const importedOption = Array.from(volSel.options).find(option => Number(option.value) === vol);
    if (importedOption) {
      volSel.value = String(vol);
    }
  }

  function readImportedAdditives (ws) {
    const additives = {};
    const cellValue = cell => parseNum(getCellPlainValue(ws, cell)) || 0;

    for (let i = 1; i <= 17; i++) {
      additives[`add${i}`] = getCellPlainValue(ws, `D${27 + i}`);
    }

    additives.add3 = getCellPlainValue(ws, "H30") || getCellPlainValue(ws, "D30");
    additives.add6 = cellValue("D33") + cellValue("D34");
    additives.add8 = cellValue("D35") + cellValue("D36");
    additives.add10 = cellValue("D37") + cellValue("D38");

    return additives;
  }

  async function importRecipeFile (file) {
    if (!file) return;
    if (!window.ExcelJS) {
      showImportStatus("Nie można wczytać pliku — biblioteka ExcelJS nie jest dostępna.", "error");
      return;
    }

    showImportStatus("Wczytywanie recepty...", "info");

    try {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const ws = wb.worksheets[0];
      if (!ws) throw new Error("Brak arkusza w pliku XLSX.");

      $("fullname").value = toInputValue(getCellPlainValue(ws, "C2"));
      $("pesel").value = toInputValue(getCellPlainValue(ws, "C6"));
      weightInp.value = toInputValue(getCellPlainValue(ws, "C7"));
      // Template: C8 = Data podania, C9 = Data wystawienia.
      $("dateTo").value = toDateInputValue(getCellPlainValue(ws, "C8"));
      $("dateFrom").value = toDateInputValue(getCellPlainValue(ws, "C9"));

      manualAdditives.clear();
      const importedBag = chooseImportedBag(ws);
      if (importedBag) {
        setImportedBag(importedBag.bag, importedBag.vol);
      }

      const additives = readImportedAdditives(ws);
      for (const id of additiveInputIds) {
        setAdditiveValue(id, additives[id]);
      }

      updateKcal();
      updateDosage();
      updateAdditiveRanges();
      updateElectrolyteSummary();
      refreshValidationWarnings();

      const fileName = file.name ? `: ${file.name}` : "";
      showImportStatus(`Wczytano receptę${fileName}.`, "success");
    } catch (err) {
      console.error(err);
      showImportStatus("Nie udało się wczytać recepty. Wybierz plik XLSX wygenerowany w tym programie.", "error");
    } finally {
      importInp.value = "";
    }
  }

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
    if (!cfg.mixtureCompositionConfig) {
      showAppMessage("error", "Błąd konfiguracji", "Brakuje danych składu mieszaniny w config.json.");
      return;
    }
    const additives = Object.fromEntries(
      additiveInputIds.map(id => [id, $(id)?.value])
    );
    const mixtureSummary = calculateMixtureSummary({
      mixtureCompositionConfig: cfg.mixtureCompositionConfig,
      additiveConfig: cfg.additiveConfig,
      bag: currentBag(),
      volume: volSel.value,
      additives
    });
    const summary = calculateElectrolyteSummary({
      electrolyteConfig: cfg.electrolyteConfig,
      additiveElectrolyteConfig: cfg.additiveElectrolyteConfig,
      additiveConfig: cfg.additiveConfig,
      mixtureCompositionConfig: cfg.mixtureCompositionConfig,
      bag: currentBag(),
      volume: volSel.value,
      additives
    });
    naTotal.textContent = summary.sodium;
    kTotal.textContent  = summary.potassium;
    naMaxSpan.textContent = summary.sodiumMax;
    kMaxSpan.textContent  = summary.potassiumMax;
    caTotal.textContent = mixtureSummary.Ca;
    phosphateTotal.textContent = mixtureSummary.phosphate;
    mgTotal.textContent = mixtureSummary.Mg;
    clTotal.textContent = mixtureSummary.Cl;
    aminoAcidsTotal.textContent = mixtureSummary.aminoAcids;
    carbohydratesTotal.textContent = mixtureSummary.carbohydrates;
    fatTotal.textContent = mixtureSummary.fat;
  }

  /* --- worki & kcal --- */
  function renderBagOptions (options = {}) {
    const { preserveDefaults = false } = options;
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
    if (!preserveDefaults) applyDefaultAdditives();
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
  productSel.addEventListener("change", () => {
    renderBagOptions();
    refreshValidationWarnings();
  });
  nutritSel .addEventListener("change", () => {
    renderBagOptions();
    refreshValidationWarnings();
  });
  volSel    .addEventListener("change", () => {
    updateKcal();
    updateDosage();
    updateAdditiveRanges();
    updateElectrolyteSummary();
    refreshValidationWarnings();
  });
  weightInp .addEventListener("input",  () => {
    updateDosage();
    updateAdditiveRanges();
    refreshValidationWarnings();
  });
  ["fullname", "pesel", "dateFrom", "dateTo", ...additiveInputIds].forEach(id => {
    const el = $(id);
    if (el) {
      el.addEventListener("input", refreshValidationWarnings);
    }
  });
  importInp?.addEventListener("change", event => importRecipeFile(event.target.files[0]));

  renderBagOptions();          // początkowe
  updateElectrolyteSummary();
  refreshValidationWarnings();

  /* ---------- 5. Submit = przygotuj dane i wywołaj generator ---------- */
  $("daneForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAppMessage();
    clearGenerationMessage();
    const validation = refreshValidationWarnings();

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

    /* helper dzielący wpisaną ilość na małe i duże opakowania
       (np. 50/100 ml czy 10/20 ml) wykorzystywane w arkuszu */
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

    /* flaga centralne/obwodowe */
    const central = nutritSel.value === "centralne";

    /* wywołaj zewnętrzny generator */
    const result = await generateRecipeXlsx({
      data,
      currentBag: currentBag(),
      central,
      cfg,        // przekazujemy pełny konfig, bo tam są wszystkie stałe
      onError: message => showAppMessage("error", "Nie udało się wygenerować recepty", message)
    });

    if (result && validation.errors.length) {
      showValidationWarnings(validation.errors, { showPanel: true });
    }
  });
});
