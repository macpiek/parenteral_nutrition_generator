// script.js – objętości zapisywane do arkusza jako liczby, pojedynczy zapis
//--------------------------------------------------
// Konfiguracje statyczne
//--------------------------------------------------
const bagConfig = {
  "SmofKabiven": [
    { vol: 493, kcal: Math.round(493 * 1.2) },
    { vol: 986, kcal: Math.round(986 * 1.2) },
    { vol: 1477, kcal: Math.round(1477 * 1.2) },
    { vol: 1970, kcal: Math.round(1970 * 1.2) },
    { vol: 2463, kcal: Math.round(2463 * 1.2) }
  ],
  "SmofKabiven Peripheral": [
    { vol: 1206, kcal: Math.round(1206 * 1.2) },
    { vol: 1448, kcal: Math.round(1448 * 1.2) },
    { vol: 1904, kcal: Math.round(1904 * 1.2) }
  ],
  "Kabiven": [
    { vol: 1026, kcal: Math.round(1026 * 1.1) },
    { vol: 1540, kcal: Math.round(1540 * 1.1) },
    { vol: 2053, kcal: Math.round(2053 * 1.1) },
    { vol: 2566, kcal: Math.round(2566 * 1.1) }
  ],
  "Kabiven Peripheral": [
    { vol: 1440, kcal: Math.round(1440 * 1.1) },
    { vol: 1920, kcal: Math.round(1920 * 1.1) },
    { vol: 2400, kcal: Math.round(2400 * 1.1) }
  ]
};

/* --- dawkowanie dobowe (ml / kg m.c. / dobę) ------------------- */
const dosageConfig = {
  // linia centralna
  "SmofKabiven"            : { min: 13, max: 31, maxDaily: 35 },
  "Kabiven"                : { min: 19, max: 38, maxDaily: 40 },

  // linia obwodowa
  "SmofKabiven Peripheral" : { min: 20, max: 40, maxDaily: 40 },
  "Kabiven Peripheral"     : { min: 27, max: 40, maxDaily: 40 }
};
/* --------------------------------------------------------------- */

const TEMPLATE_FILE = "szablon.xlsx"; // jedyny plik szablonu

//--------------------------------------------------
// Logika UI
//--------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  const productSel       = document.getElementById("productType");
  const nutritSel        = document.getElementById("nutritionType");
  const weightInp        = document.getElementById("weight");
  const volSel           = document.getElementById("bagVolume");
  const kcalSpan         = document.getElementById("bagCalories");
  const bagCell          = document.getElementById("selectedBagCell");
  const reqMinSpan       = document.getElementById("reqMin");
  const reqMaxSpan       = document.getElementById("reqMax");
  const reqAbsMaxSpan    = document.getElementById("reqAbsMax"); // nowy element w index.html
  const form             = document.getElementById("daneForm");

  // domyślne daty
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById("dateFrom").value = today;
  document.getElementById("dateTo").value   = today;

  const currentBagName = () => nutritSel.value === "obwodowe" ? `${productSel.value} Peripheral` : productSel.value;

  // ----------------------- UI helpers ---------------------------
  function renderBagOptions() {
    const bagName = currentBagName();
    bagCell.textContent = bagName;
    volSel.innerHTML = "";
    (bagConfig[bagName] || []).forEach(({ vol, kcal }) => {
      const opt = document.createElement("option");
      opt.value = vol;
      opt.textContent = `${vol} ml`;
      opt.dataset.kcal = kcal;
      volSel.appendChild(opt);
    });
    updateKcal();
    updateDosage();
  }

  const updateKcal = () => {
    const opt = volSel.selectedOptions[0];
    kcalSpan.textContent = opt ? opt.dataset.kcal : "";
  };

  const updateDosage = () => {
    const cfg = dosageConfig[currentBagName()];
    const w = parseFloat(weightInp.value) || 0;
    if (cfg && w) {
      reqMinSpan.textContent    = Math.round(cfg.min * w);
      reqMaxSpan.textContent    = Math.round(cfg.max * w);
      reqAbsMaxSpan.textContent = Math.round(cfg.maxDaily * w);
    } else {
      reqMinSpan.textContent = reqMaxSpan.textContent = reqAbsMaxSpan.textContent = "0";
    }
  };

  // ----------------------- eventy -------------------------------
  productSel.addEventListener("change", renderBagOptions);
  nutritSel.addEventListener("change", renderBagOptions);
  volSel.addEventListener("change",  updateKcal);
  weightInp.addEventListener("input", updateDosage);
  renderBagOptions();

  //------------------------------------------------
  // Submit => XLSX
  //------------------------------------------------
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const data = {
      name: document.getElementById("fullname").value.trim(),
      pesel: document.getElementById("pesel").value.trim(),
      dateFrom: document.getElementById("dateFrom").value,
      dateTo: document.getElementById("dateTo").value,
      weight: parseFloat(weightInp.value) || 0,
      bagVol: parseInt(volSel.value, 10) || 0,
      additives: Array.from({ length: 17 }, (_, i) => {
        const v = document.getElementById(`add${i + 1}`)?.value.trim() || "";
        return v === "" ? "" : parseFloat(v.replace(/,/g, '.')) || v;
      })
    };

    const resp = await fetch(TEMPLATE_FILE);
    if (!resp.ok) return alert("Błąd pobierania szablonu: " + resp.statusText);
    const buf = await resp.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.worksheets[0];

    // stałe komórki
    ws.getCell("C2").value = data.name;
    ws.getCell("C6").value = data.pesel;
    ws.getCell("C7").value = data.weight;
    ws.getCell("C8").value = data.dateFrom;
    ws.getCell("C9").value = data.dateTo;

    /*  Dwuwierszowy zapis sposobu żywienia:
        C11 – „Obwodowa”          lub „Obwodowa X”
        C12 – „Centralna X”      lub „Centralna”
        X pojawia się przy aktualnie wybranym sposobie.
    */
    const isCentral = nutritSel.value === "centralne";

    ws.getCell("C11").value = isCentral ? "Obwodowa"     : "Obwodowa X";
    ws.getCell("C12").value = isCentral ? "Centralna X"  : "Centralna";

    // wiersze 23-26 – nowa kolejność
    const rowMap = {
      "SmofKabiven": 24,
      "SmofKabiven Peripheral": 26,
      "Kabiven": 23,
      "Kabiven Peripheral": 25
    };

    [23, 24, 25, 26].forEach(r => {
      ws.getCell(`C${r}`).value = "";
      ws.getCell(`D${r}`).value = "";
    });

    const tr = rowMap[currentBagName()];
    if (tr) {
      const info = (bagConfig[currentBagName()] || []).find(b => b.vol === data.bagVol);
      ws.getCell(`C${tr}`).value = info ? info.kcal : "";
      ws.getCell(`D${tr}`).value = data.bagVol;
    }

    // dodatki w kolumnie D od wiersza 28
    data.additives.forEach((val, idx) => {
      ws.getCell(28 + idx, 4).value = val;
    });

    const outBuffer = await wb.xlsx.writeBuffer();
    saveAs(new Blob([outBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      `Recepta_${data.name.replace(/ /g, "_")}.xlsx`);
  });
});
