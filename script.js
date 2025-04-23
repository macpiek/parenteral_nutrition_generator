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
  
  const dosageConfig = {
    "SmofKabiven": { min: 13, max: 31 },
    "SmofKabiven Peripheral": { min: 13, max: 31 },
    "Kabiven": { min: 14, max: 30 },
    "Kabiven Peripheral": { min: 15, max: 25 }
  };
  
  const TEMPLATE_FILE = "szablon.xlsx"; // jedyny plik szablonu
  
  //--------------------------------------------------
  // Logika UI
  //--------------------------------------------------
  
  document.addEventListener("DOMContentLoaded", () => {
    const productSel = document.getElementById("productType");
    const nutritSel  = document.getElementById("nutritionType");
    const weightInp  = document.getElementById("weight");
    const volSel     = document.getElementById("bagVolume");
    const kcalSpan   = document.getElementById("bagCalories");
    const bagCell    = document.getElementById("selectedBagCell");
    const reqMinSpan = document.getElementById("reqMin");
    const reqMaxSpan = document.getElementById("reqMax");
    const form       = document.getElementById("daneForm");
  
    // domyślne daty
    const today = new Date().toISOString().slice(0, 10);
    document.getElementById("dateFrom").value = today;
    document.getElementById("dateTo").value   = today;
  
    const currentBagName = () => nutritSel.value === "obwodowe" ? `${productSel.value} Peripheral` : productSel.value;
  
    function renderBagOptions() {
      const bagName = currentBagName();
      bagCell.textContent = bagName;
      volSel.innerHTML = "";
      (bagConfig[bagName] || []).forEach(({ vol, kcal }) => {
        const opt = document.createElement("option");
        opt.value = vol; // liczba jako string
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
      const d = dosageConfig[currentBagName()];
      const w = parseFloat(weightInp.value) || 0;
      if (d && w) {
        reqMinSpan.textContent = Math.round(d.min * w);
        reqMaxSpan.textContent = Math.round(d.max * w);
      } else {
        reqMinSpan.textContent = reqMaxSpan.textContent = "0";
      }
    };
  
    productSel.addEventListener("change", renderBagOptions);
    nutritSel.addEventListener("change", renderBagOptions);
    volSel.addEventListener("change", updateKcal);
    weightInp.addEventListener("input", updateDosage);
    renderBagOptions();
  
    //------------------------------------------------
    // Submit => XLSX (objętości jako liczby)
    //------------------------------------------------
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
  
      const data = {
        name: document.getElementById("fullname").value.trim(),
        pesel: document.getElementById("pesel").value.trim(),
        dateFrom: document.getElementById("dateFrom").value,
        dateTo: document.getElementById("dateTo").value,
        weight: parseFloat(weightInp.value) || 0,
        bagVol: parseInt(volSel.value, 10) || 0, // liczba
        additives: Array.from({ length: 17 }, (_, i) => {
          const v = document.getElementById(`add${i + 1}`)?.value.trim() || "";
          return v === "" ? "" : parseFloat(v.replace(/,/g, '.')) || v; // liczba albo pusty tekst
        })
      };
  
      // pobierz szablon
      const resp = await fetch(TEMPLATE_FILE);
      if (!resp.ok) return alert("Błąd pobierania szablonu: " + resp.statusText);
      const buf = await resp.arrayBuffer();
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf);
      const ws = wb.worksheets[0];
  
      // wpisz dane – adresy komórek dostosowane do szablonu
      ws.getCell("C2").value = data.name;    // imię i nazwisko
      ws.getCell("C6").value = data.pesel;   // PESEL
      ws.getCell("C7").value = data.weight;  // masa ciała
      ws.getCell("C8").value = data.dateFrom;// data od
      ws.getCell("C9").value = data.dateTo;  // data do
      ws.getCell("D26").value = data.bagVol; // objętość (number)
  
      // dodatki: od wiersza 28, kolumna 4 (D)
      data.additives.forEach((val, idx) => {
        ws.getCell(28 + idx, 4).value = val;
      });
  
      // zapis i pobieranie
      const outBuffer = await wb.xlsx.writeBuffer();
      saveAs(new Blob([outBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      }), `Recepta_${data.name.replace(/ /g, "_")}.xlsx`);
    });
  });
  