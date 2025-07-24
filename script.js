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

  const parseNum = val => parseFloat(String(val).replace(/,/g, '.'));

  const kcalSpan = $("bagCalories");
  const bagCell  = $("selectedBagCell");
  const reqMin   = $("reqMin");
  const reqMax   = $("reqMax");
  const reqAbs   = $("reqAbsMax");

  const rangeDi  = $("rangeAdd6");
  const rangeSo  = $("rangeAdd3");
  const rangeVi  = $("rangeAdd4");
  const rangeOm  = $("rangeAdd8");
  const rangeAd  = $("rangeAdd2");
  const rangeVb1 = $("rangeAdd15");
  const rangeVc  = $("rangeAdd16");

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
      rangeOm.textContent = "Brak danych";
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
  }

  /* --- worki & kcal --- */
  function renderBagOptions () {
    const bag = currentBag();
    bagCell.textContent = bag;

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
  }

  const updateKcal = () =>
    kcalSpan.textContent = volSel.selectedOptions[0]?.dataset.kcal || "";

  const updateDosage = () => {
    const cfgDose = dosageConfig[currentBag()];
    const w = parseNum(weightInp.value) || 0;
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
  volSel    .addEventListener("change", () => { updateKcal(); updateAdditiveRanges(); });
  weightInp .addEventListener("input",  () => { updateDosage(); updateAdditiveRanges(); });

  renderBagOptions();          // początkowe

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
