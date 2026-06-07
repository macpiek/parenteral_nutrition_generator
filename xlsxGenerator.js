/* xlsxGenerator.js
 * Eksport recepty do pliku XLSX na podstawie danych z formularza
 * Wymaga: ExcelJS, JSZip, FileSaver (już dodane w <head>)
 */

function numericCellValue (cell) {
  const value = cell.value;
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && typeof value.result === "number") return value.result;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function refreshVolumeFormulaCache (ws) {
  const totalVolume = Array.from({ length: 22 }, (_, i) => 23 + i)
    .reduce((sum, row) => sum + numericCellValue(ws.getCell(`D${row}`)), 0);
  const volumeUnit = ws.getCell("C66").value || "";

  ws.getCell("B66").value = {
    formula: "SUM(D23:D44)",
    result: totalVolume
  };
  ws.getCell("B52").value = {
    formula: "CONCATENATE(B66,C66)",
    result: `${totalVolume}${volumeUnit}`
  };
}

function setXmlAttribute (node, name, value) {
  const attributePattern = new RegExp(`\\s${name}="[^"]*"`, "g");
  const cleanedNode = node.replace(attributePattern, "");
  const selfClosing = /\/>$/.test(cleanedNode);
  const tagBody = cleanedNode.replace(/\s*\/?>$/, "");
  return `${tagBody} ${name}="${value}"${selfClosing ? "/>" : ">"}`;
}

function forceWorkbookRecalculation (workbookXml) {
  const recalcAttributes = [
    ["calcMode", "auto"],
    ["fullCalcOnLoad", "1"],
    ["forceFullCalc", "1"]
  ];
  const calcPrPattern = /<calcPr\b[^>]*(?:\/>|>[\s\S]*?<\/calcPr>)/;

  if (calcPrPattern.test(workbookXml)) {
    return workbookXml.replace(calcPrPattern, node => {
      const openTagMatch = node.match(/^<calcPr\b[^>]*>/);
      if (!openTagMatch) return node;

      const openTag = recalcAttributes.reduce(
        (updated, [name, value]) => setXmlAttribute(updated, name, value),
        openTagMatch[0]
      );
      return `${openTag}${node.slice(openTagMatch[0].length)}`;
    });
  }

  const calcPrNode = '<calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>';
  return workbookXml.includes("<extLst>")
    ? workbookXml.replace("<extLst>", `${calcPrNode}<extLst>`)
    : workbookXml.replace("</workbook>", `${calcPrNode}</workbook>`);
}

async function generateRecipeXlsx ({
    data,
    currentBag,
    central,
    cfg,
    workbookBuffer,
    fetchImpl,
    ExcelJSImpl,
    JSZipImpl,
    saveAsImpl,
    onError,
    returnBuffer = false
  }) {
    const {
      bagConfig,
      constants: { TEMPLATE_FILE, PRINT_RANGE }
    } = cfg;
    const Excel = ExcelJSImpl || globalThis.ExcelJS;
    const Zip = JSZipImpl || globalThis.JSZip;
    const fetchTemplate = fetchImpl || globalThis.fetch;
  
    try {
      /* 1. Pobierz szablon XLSX */
      let templateBuffer = workbookBuffer;
      if (!templateBuffer) {
        const resp = await fetchTemplate(TEMPLATE_FILE);
        if (!resp.ok) {
          throw new Error("Błąd pobierania szablonu.");
        }
        templateBuffer = await resp.arrayBuffer();
      }
  
      /* 2. Wczytaj workbook */
      const wb = new Excel.Workbook();
      await wb.xlsx.load(templateBuffer);
      const ws = wb.worksheets[0];
  
      /* 3. Wypełnij dane pacjenta */
      ws.getCell("C2").value = data.name;
      ws.getCell("C6").value = data.pesel;
      ws.getCell("C7").value = data.weight;
      // Template: C8 = Data podania, C9 = Data wystawienia.
      ws.getCell("C8").value = data.dateTo;
      ws.getCell("C9").value = data.dateFrom;
  
      ws.getCell("C11").value = central ? "Obwodowa"    : "Obwodowa X";
      ws.getCell("C12").value = central ? "Centralna X" : "Centralna";
  
      /* 4. Worek – kcal + ml */
      const rowMap = {
        "SmofKabiven":24,"SmofKabiven Peripheral":26,
        "Kabiven":23,"Kabiven Peripheral":25
      };
      [23,24,25,26].forEach(r => {
        ws.getCell(`C${r}`).value = "";
        ws.getCell(`D${r}`).value = "";
      });
  
      const tr = rowMap[currentBag];
      if (tr) {
        const info = (bagConfig[currentBag] || []).find(b => b.vol === data.bagVol);
        ws.getCell(`C${tr}`).value = info ? info.kcal : "";
        ws.getCell(`D${tr}`).value = data.bagVol;
      }
  
      /* 5. Dodatki – kol. D (28-44) */
      data.additives.forEach((v, i) => ws.getCell(28 + i, 4).value = v);
      ws.getCell("D30").value = "";                    // Soluvit do H30
      ws.getCell("H30").value = data.additives[2] || "";

      /* 6. Odśwież cache formuł zależnych od objętości. */
      refreshVolumeFormulaCache(ws);
  
      /* 7. Ustawienia strony */
      ws.pageSetup.orientation = 'portrait';
      ws.pageSetup.fitToPage   = true;
      ws.pageSetup.fitToWidth  = 1;
      ws.pageSetup.fitToHeight = 1;
  
      /* 8. Zapis do bufora */
      const buffer = await wb.xlsx.writeBuffer();
  
      /* 9. Modyfikacja workbook.xml (Print_Area + przeliczenie formuł w Excelu) */
      const zip = await Zip.loadAsync(buffer);
      const wbXmlPath = "xl/workbook.xml";
      const wbXmlText = await zip.file(wbXmlPath).async("text");
  
      const clearedXml = wbXmlText.replace(
        /<definedName[^>]*name="_xlnm\.Print_Area"[\s\S]*?<\/definedName>/g,
        ""
      );
  
      const safeSheetName = ws.name.replace(/'/g, "''");
      const printAreaNode =
        `<definedName function="false" hidden="false" localSheetId="0" ` +
        `name="_xlnm.Print_Area" vbProcedure="false">` +
        `'${safeSheetName}'!${PRINT_RANGE}</definedName>`;
  
      const printAreaXml = clearedXml.includes("<definedNames>")
        ? clearedXml.replace("</definedNames>", `${printAreaNode}</definedNames>`)
        : clearedXml.replace("</workbook>", `<definedNames>${printAreaNode}</definedNames></workbook>`);
      const finalXml = forceWorkbookRecalculation(printAreaXml);
  
      zip.file(wbXmlPath, finalXml);
  
      /* 10. Eksport pliku */
      const bagLabel   = currentBag.replace(" Peripheral", "");
      const routeLabel = central ? "centralne" : "obwodowe";
      const safePatient = (data.name || "pacjent").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
      const fileName   = `${safePatient} ${bagLabel} ${routeLabel}.xlsx`;

      if (returnBuffer) {
        return {
          buffer: await zip.generateAsync({ type: "nodebuffer" }),
          fileName
        };
      }

      const finalBlob = await zip.generateAsync({ type: "blob" });
      const saveFile = saveAsImpl || globalThis.saveAs;
      saveFile(finalBlob, fileName);
      return { fileName };
    } catch (err) {
      console.error(err);
      const message = err?.message || "Wystąpił błąd podczas generowania pliku XLSX.";
      if (onError) onError(message);
      else if (globalThis.alert) alert(message);
      return null;
    }
  }

if (typeof module === "object" && module.exports) {
  module.exports = { generateRecipeXlsx, forceWorkbookRecalculation, refreshVolumeFormulaCache };
}
  
