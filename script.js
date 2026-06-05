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
  const importInp  = $("recipeImport");
  const importStatus = $("importStatus");

  const parseNum = val => parseFloat(String(val).replace(/,/g, '.'));

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

  const additiveInputIds = Array.from({ length: 17 }, (_, i) => `add${i + 1}`);

  const updateKcal = () => {
    const vol = parseInt(volSel.value, 10);
    const bagInfo = (bagConfig[currentBag()] || []).find(b => b.vol === vol);
    const bagKcal = bagInfo ? bagInfo.kcal : parseFloat(volSel.selectedOptions[0]?.dataset.kcal) || 0;
    let total = bagKcal;
    for (const [id, perMl] of Object.entries(additiveKcalPerMl)) {
      const el = $(id);
      if (el) total += (parseNum(el.value) || 0) * perMl;
    }
    kcalSpan.textContent = total ? Math.round(total) : "";
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
      $("dateFrom").value = toDateInputValue(getCellPlainValue(ws, "C8"));
      $("dateTo").value = toDateInputValue(getCellPlainValue(ws, "C9"));

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
    const cfgRange = additiveRangeConfig[bag]?.[vol];
    const w = parseNum(weightInp.value) || 0;

    const diMax = Math.min(
      cfgRange?.di ? cfgRange.di[1] : Infinity,
        w ? Math.round(DIPEPTIVEN_PER_KG * w) : Infinity
    );
    rangeDi.textContent = diMax === Infinity ? "Brak danych" : `0 – ${diMax} ml`;

    if (cfgRange?.om) {
      const omMax = Math.min(
        cfgRange.om[1],
        w ? Math.round(OMEGAVEN_PER_KG * w) : Infinity
      );
      rangeOm.textContent = `0 – ${omMax} ml`;
    } else {
      const omMax = w ? Math.round(OMEGAVEN_PER_KG * w) : Infinity;
      rangeOm.textContent = omMax === Infinity ? "Brak danych" : `0 – ${omMax} ml`;
    }

    rangeAd.textContent  = ADDAMEL_RANGE;
    rangeSo.textContent  = cfgRange ? `${cfgRange.so[0]} – ${cfgRange.so[1]} fiol.` : "Brak danych";
    rangeVi.textContent  = cfgRange ? `${cfgRange.vi[0]} – ${cfgRange.vi[1]} ml`   : "Brak danych";
    rangeVb1.textContent = VIT_B1_RANGE;
    rangeVc.textContent  = VIT_C_RANGE;
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
    const bag = currentBag();
    const vol = parseInt(volSel.value, 10);
    const eCfg = cfg.electrolyteConfig?.[bag]?.[vol] || {};
    let na = eCfg.Na || 0;
    let k  = eCfg.K  || 0;
    const addNa = parseNum($("add17").value) || 0; // NaCl
    const addK  = parseNum($("add10").value) || 0; // KCl
    na += addNa * 1.54;
    k  += addK  * 2;
    naTotal.textContent = Math.round(na);
    kTotal.textContent  = Math.round(k);
    naMaxSpan.textContent = eCfg.NaMax || 0;
    kMaxSpan.textContent  = eCfg.KMax || 0;
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
    const cfgDose = dosageConfig[currentBag()];
    const w = parseNum(weightInp.value) || 0;
    if (w) {
      calReqMin.textContent = Math.round(25 * w);
      calReqMax.textContent = Math.round(35 * w);
      naReqMin.textContent = Math.round(0.5 * w);
      naReqMax.textContent = Math.round(2 * w);
      kReqMin.textContent  = Math.round(0.5 * w);
      kReqMax.textContent  = Math.round(2 * w);
    } else {
      calReqMin.textContent = calReqMax.textContent = "0";
      naReqMin.textContent = naReqMax.textContent = "0";
      kReqMin.textContent  = kReqMax.textContent  = "0";
    }

    if (cfgDose && w) {
      reqMin.textContent = Math.round(cfgDose.min * w);
      reqMax.textContent = Math.round(cfgDose.max * w);
      reqAbs.textContent = Math.round(cfgDose.maxDaily * w);
    } else {
      reqMin.textContent = reqMax.textContent = reqAbs.textContent = "0";
    }
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
  importInp?.addEventListener("change", event => importRecipeFile(event.target.files[0]));

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
