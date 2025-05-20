/* script.js – wersja z zewnętrznym plikiem config.json
 * 2025-05-20
 * (wszystkie stałe oraz bagConfig / dosageConfig / additiveRangeConfig
 *   zostały przeniesione do config.json)
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

  /* Rozpakowanie: */
  const {
    bagConfig,
    additiveRangeConfig,
    dosageConfig,
    constants: {
      DIPEPTIVEN_PER_KG,
      OMEGAVEN_PER_KG,
      ADDAMEL_RANGE,
      VIT_B1_RANGE,
      VIT_C_RANGE,
      TEMPLATE_FILE,
      PRINT_RANGE
    }
  } = cfg;

  /* ---------- 2. Cache elementów DOM ---------- */
  const $ = id => document.getElementById(id);

  const productSel = $("productType");
  const nutritSel  = $("nutritionType");
  const weightInp  = $("weight");
  const volSel     = $("bagVolume");

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

  /* ---------- 3. Inicjalizacja dat „od–do” ---------- */
  const today = new Date().toISOString().slice(0, 10);
  $("dateFrom").value = today;
  $("dateTo").value   = today;

  /* ---------- 4. Funkcje pomocnicze ---------- */
  const currentBag = () =>
    nutritSel.value === "obwodowe"
      ? `${productSel.value} Peripheral`
      : productSel.value;

  /* ── Additive ranges ── */
  function updateAdditiveRanges() {
    const bag = currentBag();
    const vol = parseInt(volSel.value, 10);
    const cfgRange = additiveRangeConfig[bag]?.[vol];
    const w = parseFloat(weightInp.value) || 0;

    /* Dipeptiven */
    const diMax = Math.min(
      cfgRange?.di ? cfgRange.di[1] : Infinity,
      w ? Math.round(DIPEPTIVEN_PER_KG * w) : Infinity
    );
    rangeDi.textContent = diMax === Infinity ? "Brak danych" : `0 – ${diMax} ml`;

    /* Omegaven */
    if (cfgRange?.om) {
      const omMax = Math.min(
        cfgRange.om[1],
        w ? Math.round(OMEGAVEN_PER_KG * w) : Infinity
      );
      rangeOm.textContent = `0 – ${omMax} ml`;
    } else {
      rangeOm.textContent = "Brak danych";
    }

    /* Stałe zakresy / z ChPL */
    rangeAd.textContent  = ADDAMEL_RANGE;
    rangeSo.textContent  = cfgRange ? `${cfgRange.so[0]} – ${cfgRange.so[1]} fiol.` : "Brak danych";
    rangeVi.textContent  = cfgRange ? `${cfgRange.vi[0]} – ${cfgRange.vi[1]} ml`   : "Brak danych";
    rangeVb1.textContent = VIT_B1_RANGE;
    rangeVc.textContent  = VIT_C_RANGE;
  }

  /* ── Worki & kcal ── */
  function renderBagOptions() {
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
  }

  const updateKcal = () =>
    kcalSpan.textContent = volSel.selectedOptions[0]?.dataset.kcal || "";

  const updateDosage = () => {
    const cfgDose = dosageConfig[currentBag()];
    const w = parseFloat(weightInp.value) || 0;
    if (cfgDose && w) {
      reqMin.textContent = Math.round(cfgDose.min * w);
      reqMax.textContent = Math.round(cfgDose.max * w);
      reqAbs.textContent = Math.round(cfgDose.maxDaily * w);
    } else {
      reqMin.textContent = reqMax.textContent = reqAbs.textContent = "0";
    }
  };

  /* ── Obsługa zmian UI ── */
  productSel.addEventListener("change", renderBagOptions);
  nutritSel .addEventListener("change", renderBagOptions);
  volSel    .addEventListener("change", () => { updateKcal(); updateAdditiveRanges(); });
  weightInp .addEventListener("input",  () => { updateDosage(); updateAdditiveRanges(); });

  /* Początkowe renderowanie */
  renderBagOptions();

  /* ---------- 5. Generowanie pliku XLSX ---------- */
  $("daneForm").addEventListener("submit", async (e) => {
    e.preventDefault();

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
      weight   : parseFloat(weightInp.value) || 0,
      bagVol   : parseInt(volSel.value, 10) || 0,
      additives: Array.from({ length: 17 }, (_, i) => getAdd(i + 1))
    };

    /* podział objętości 50/100 i 10/20 */
    const split = (iS, iL, size) => {
      const total = parseFloat(data.additives[iS]) || 0;
      const large = Math.floor(total / size) * size;
      const small = total - large;
      data.additives[iS] = small || "";
      data.additives[iL] = large || "";
    };
    split(5, 6, 100);   // Dipeptiven
    split(7, 8, 100);   // Omegaven
    split(9, 10, 20);   // KCl

    const solVials = data.additives[2];

    /* wczytaj szablon */
    const resp = await fetch(TEMPLATE_FILE);
    if (!resp.ok) { alert("Błąd pobierania szablonu"); return; }

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await resp.arrayBuffer());
    const ws = wb.worksheets[0];   // pierwszy arkusz

    /* nagłówek recepty */
    ws.getCell("C2").value = data.name;
    ws.getCell("C6").value = data.pesel;
    ws.getCell("C7").value = data.weight;
    ws.getCell("C8").value = data.dateFrom;
    ws.getCell("C9").value = data.dateTo;

    const central = nutritSel.value === "centralne";
    ws.getCell("C11").value = central ? "Obwodowa"    : "Obwodowa X";
    ws.getCell("C12").value = central ? "Centralna X" : "Centralna";

    /* worek – kcal + ml */
    const rowMap = {
      "SmofKabiven":24,"SmofKabiven Peripheral":26,
      "Kabiven":23,"Kabiven Peripheral":25
    };
    [23,24,25,26].forEach(r => { ws.getCell(`C${r}`).value = ""; ws.getCell(`D${r}`).value = ""; });
    const tr = rowMap[currentBag()];
    if (tr) {
      const info = (bagConfig[currentBag()] || []).find(b => b.vol === data.bagVol);
      ws.getCell(`C${tr}`).value = info ? info.kcal : "";
      ws.getCell(`D${tr}`).value = data.bagVol;
    }

    /* dodatki → kol. D (28-44) */
    data.additives.forEach((v, i) => ws.getCell(28 + i, 4).value = v);
    ws.getCell("D30").value = "";
    ws.getCell("H30").value = solVials || "";

    /* ---------- Ustawienia strony ---------- */
    ws.pageSetup.orientation = 'portrait';
    ws.pageSetup.fitToPage   = true;
    ws.pageSetup.fitToWidth  = 1;
    ws.pageSetup.fitToHeight = 1;

    /* ---------- zapis do bufora ---------- */
    const buffer = await wb.xlsx.writeBuffer();

    /* ---------- modyfikujemy workbook.xml przez JSZip ---------- */
    const zip = await JSZip.loadAsync(buffer);
    const wbXmlPath = "xl/workbook.xml";
    const wbXmlText = await zip.file(wbXmlPath).async("text");

    /* 1) Usuń WSZYSTKO co jest Print_Area */
    const clearedXml = wbXmlText.replace(
      /<definedName[^>]*name="_xlnm\.Print_Area"[\s\S]*?<\/definedName>/g,
      ""
    );

    /* 2) Dodaj JEDEN nowy Print_Area */
    const safeSheetName = ws.name.replace(/'/g, "''"); // escape '
    const printAreaNode =
      `<definedName function="false" hidden="false" localSheetId="0" ` +
      `name="_xlnm.Print_Area" vbProcedure="false">` +
      `'${safeSheetName}'!${PRINT_RANGE}</definedName>`;

    const finalXml = clearedXml.includes("<definedNames>")
      ? clearedXml.replace("</definedNames>", `${printAreaNode}</definedNames>`)
      : clearedXml.replace("</workbook>", `<definedNames>${printAreaNode}</definedNames></workbook>`);

    zip.file(wbXmlPath, finalXml);

    /* ---------- eksport gotowego pliku ---------- */
    const finalBlob = await zip.generateAsync({ type: "blob" });
    const fileName  = `Recepta_${data.name.replace(/\s+/g, "_")}.xlsx`;
    saveAs(finalBlob, fileName);
  });
});
