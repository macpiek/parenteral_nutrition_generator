/* script.js – kalorie z ChPL + obszar wydruku widoczny w LibreOffice Calc
 * 2025-05-08
 */

/* =========================================================
   1.  WORKI (objętość → kcal, zgodnie z ChPL)
   ========================================================= */
   const bagConfig = {
    "SmofKabiven": [
      { vol:  493, kcal:  550 },
      { vol:  986, kcal: 1100 },
      { vol: 1477, kcal: 1600 },
      { vol: 1970, kcal: 2200 },
      { vol: 2463, kcal: 2700 }
    ],
    "SmofKabiven Peripheral": [
      { vol: 1206, kcal:  800 },
      { vol: 1448, kcal: 1000 },
      { vol: 1904, kcal: 1300 }
    ],
    "Kabiven": [
      { vol: 1026, kcal:  900 },
      { vol: 1540, kcal: 1400 },
      { vol: 2053, kcal: 1900 },
      { vol: 2566, kcal: 2300 }
    ],
    "Kabiven Peripheral": [
      { vol: 1440, kcal: 1000 },
      { vol: 1920, kcal: 1400 },
      { vol: 2400, kcal: 1700 }
    ]
  };
  
  /* =========================================================
     2.  ZAKRESY DODATKÓW (ml) WG ChPL
     ========================================================= */
  const additiveRangeConfig = {
    "Kabiven": {
      1026: { di:[0,100], so:[0,1], vi:[0,10], om:[0,50]  },
      1540: { di:[0,200], so:[0,1], vi:[0,10], om:[0,100] },
      2053: { di:[0,300], so:[0,2], vi:[0,20], om:[0,100] },
      2566: { di:[0,300], so:[0,2], vi:[0,20], om:[0,100] }
    },
    "Kabiven Peripheral": {
      1440: { di:[0,300], so:[0,1], vi:[0,10] },
      1920: { di:[0,300], so:[0,1], vi:[0,10] },
      2400: { di:[0,300], so:[0,1], vi:[0,10] }
    },
    "SmofKabiven": {
      493 : { di:[0,100], so:[0,1], vi:[0,10] },
      986 : { di:[0,300], so:[0,1], vi:[0,10] },
      1477: { di:[0,300], so:[0,1], vi:[0,10] },
      1970: { di:[0,300], so:[0,1], vi:[0,10] },
      2463: { di:[0,300], so:[0,1], vi:[0,10] }
    },
    "SmofKabiven Peripheral": {
      1206: { di:[0,300], so:[0,1], vi:[0,10] },
      1448: { di:[0,300], so:[0,1], vi:[0,10] },
      1904: { di:[0,300], so:[0,1], vi:[0,10] }
    }
  };
  
  /* =========================================================
     3.  STAŁE
     ========================================================= */
  const DIPEPTIVEN_PER_KG = 2.5;   // ml kg-1 d-1
  const OMEGAVEN_PER_KG   = 2.0;   // ml kg-1 d-1
  const ADDAMEL_RANGE     = "0 – 10 ml";
  const VIT_B1_RANGE      = "0 – 6 ml";
  const VIT_C_RANGE       = "0 – 20 ml (max. 30 ml)";
  
  const dosageConfig = {
    "SmofKabiven"           : { min: 13, max: 31, maxDaily: 35 },
    "Kabiven"               : { min: 19, max: 38, maxDaily: 40 },
    "SmofKabiven Peripheral": { min: 20, max: 40, maxDaily: 40 },
    "Kabiven Peripheral"    : { min: 27, max: 40, maxDaily: 40 }
  };
  
  const TEMPLATE_FILE = "szablon.xlsx";
  
  /* =========================================================
     4.  LOGIKA UI
     ========================================================= */
  document.addEventListener("DOMContentLoaded", () => {
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
  
    const today = new Date().toISOString().slice(0,10);
    $("dateFrom").value = today;
    $("dateTo").value   = today;
  
    const currentBag = () =>
      nutritSel.value === "obwodowe"
        ? `${productSel.value} Peripheral`
        : productSel.value;
  
    /* ---- zakresy dodatków ---- */
    function updateAdditiveRanges() {
      const bag = currentBag();
      const vol = parseInt(volSel.value, 10);
      const cfg = additiveRangeConfig[bag]?.[vol];
      const w   = parseFloat(weightInp.value) || 0;
  
      const diMax = Math.min(cfg?.di ? cfg.di[1] : Infinity,
                             w ? Math.round(DIPEPTIVEN_PER_KG * w) : Infinity);
      rangeDi.textContent = diMax === Infinity ? "Brak danych" : `0 – ${diMax} ml`;
  
      if (cfg?.om) {
        const omMax = Math.min(cfg.om[1],
                               w ? Math.round(OMEGAVEN_PER_KG * w) : Infinity);
        rangeOm.textContent = `0 – ${omMax} ml`;
      } else {
        rangeOm.textContent = "Brak danych";
      }
  
      rangeAd.textContent  = ADDAMEL_RANGE;
      rangeSo.textContent  = cfg ? `${cfg.so[0]} – ${cfg.so[1]} fiol.` : "Brak danych";
      rangeVi.textContent  = cfg ? `${cfg.vi[0]} – ${cfg.vi[1]} ml`   : "Brak danych";
      rangeVb1.textContent = VIT_B1_RANGE;
      rangeVc.textContent  = VIT_C_RANGE;
    }
  
    /* ---- worki & kcal ---- */
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
      const cfg = dosageConfig[currentBag()];
      const w   = parseFloat(weightInp.value) || 0;
      if (cfg && w) {
        reqMin.textContent = Math.round(cfg.min * w);
        reqMax.textContent = Math.round(cfg.max * w);
        reqAbs.textContent = Math.round(cfg.maxDaily * w);
      } else {
        reqMin.textContent = reqMax.textContent = reqAbs.textContent = "0";
      }
    };
  
    productSel.addEventListener("change", renderBagOptions);
    nutritSel .addEventListener("change", renderBagOptions);
    volSel    .addEventListener("change", () => { updateKcal(); updateAdditiveRanges(); });
    weightInp .addEventListener("input",  () => { updateDosage(); updateAdditiveRanges(); });
  
    renderBagOptions();
  
    /* =========================================================
       5.  GENEROWANIE XLSX
       ========================================================= */
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
      const ws = wb.worksheets[0];                 // pierwszy arkusz
      const sheetIndex = wb.worksheets.indexOf(ws); // 0-based
  
      /* ---------- Print_Area widoczne w Calc ---------- */
      const printRange = '$A$1:$M$56';
  
      wb.definedNames.remove('_xlnm.Print_Area');     // usuń stare
      const sheetRef = ws.name.includes(' ')
        ? `'${ws.name}'!${printRange}`
        : `${ws.name}!${printRange}`;
      wb.definedNames.add('_xlnm.Print_Area', sheetRef, sheetIndex);
  
      ws.pageSetup.printArea   = printRange;
      ws.pageSetup.orientation = 'portrait';
      ws.pageSetup.fitToPage   = true;
      ws.pageSetup.fitToWidth  = 1;
      ws.pageSetup.fitToHeight = 0;
  
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
  
      /* zapis pliku */
      const out = await wb.xlsx.writeBuffer();
      saveAs(
        new Blob([out], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        }),
        `Recepta_${data.name.replace(/ /g, "_")}.xlsx`
      );
    });
  });
  