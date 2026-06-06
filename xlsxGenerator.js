/* xlsxGenerator.js
 * Eksport recepty do pliku XLSX na podstawie danych z formularza.
 * Wymaga w przeglądarce: ExcelJS, JSZip, FileSaver.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PNXlsxGenerator = api;
  root.generateRecipeXlsx = api.generateRecipeXlsx;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  const BAG_ROW_MAP = {
    SmofKabiven: 24,
    "SmofKabiven Peripheral": 26,
    Kabiven: 23,
    "Kabiven Peripheral": 25
  };

  const PATIENT_CELL_MAP = {
    name: "C2",
    pesel: "C6",
    weight: "C7",
    dateFrom: "C8",
    dateTo: "C9"
  };

  function getDependency (explicitDependency, globalName) {
    if (explicitDependency) return explicitDependency;
    if (typeof globalThis !== "undefined" && globalThis[globalName]) return globalThis[globalName];
    throw new Error(`Brak wymaganej biblioteki: ${globalName}.`);
  }

  function assertRecipeInputs ({ data, currentBag, cfg }) {
    if (!data || typeof data !== "object") throw new Error("Brak danych recepty do eksportu.");
    if (!currentBag) throw new Error("Nie wybrano typu worka do eksportu.");
    if (!cfg?.bagConfig?.[currentBag]) throw new Error(`Brak konfiguracji worka: ${currentBag}.`);
    if (!cfg?.constants?.TEMPLATE_FILE) throw new Error("Brak ścieżki do szablonu XLSX w konfiguracji.");
    if (!cfg?.constants?.PRINT_RANGE) throw new Error("Brak zakresu wydruku w konfiguracji.");
  }

  function getFirstWorksheet (workbook) {
    const worksheet = workbook?.worksheets?.[0];
    if (!worksheet) throw new Error("Szablon XLSX nie zawiera arkusza roboczego.");
    return worksheet;
  }

  function fillRecipeWorksheet ({ workbook, data, currentBag, central, cfg }) {
    assertRecipeInputs({ data, currentBag, cfg });
    const ws = getFirstWorksheet(workbook);

    ws.getCell(PATIENT_CELL_MAP.name).value = data.name;
    ws.getCell(PATIENT_CELL_MAP.pesel).value = data.pesel;
    ws.getCell(PATIENT_CELL_MAP.weight).value = data.weight;
    ws.getCell(PATIENT_CELL_MAP.dateFrom).value = data.dateFrom;
    ws.getCell(PATIENT_CELL_MAP.dateTo).value = data.dateTo;

    ws.getCell("C11").value = central ? "Obwodowa" : "Obwodowa X";
    ws.getCell("C12").value = central ? "Centralna X" : "Centralna";

    Object.values(BAG_ROW_MAP).forEach(row => {
      ws.getCell(`C${row}`).value = "";
      ws.getCell(`D${row}`).value = "";
    });

    const targetRow = BAG_ROW_MAP[currentBag];
    if (!targetRow) throw new Error(`Nieobsługiwany typ worka: ${currentBag}.`);

    const bagInfo = (cfg.bagConfig[currentBag] || []).find(bag => Number(bag.vol) === Number(data.bagVol));
    if (!bagInfo) throw new Error(`Brak objętości ${data.bagVol} ml dla worka ${currentBag}.`);
    ws.getCell(`C${targetRow}`).value = bagInfo.kcal;
    ws.getCell(`D${targetRow}`).value = data.bagVol;

    (data.additives || []).forEach((value, index) => {
      ws.getCell(28 + index, 4).value = value;
    });
    ws.getCell("D30").value = "";
    ws.getCell("H30").value = data.additives?.[2] || "";

    ws.pageSetup.orientation = "portrait";
    ws.pageSetup.fitToPage = true;
    ws.pageSetup.fitToWidth = 1;
    ws.pageSetup.fitToHeight = 1;

    return ws;
  }

  async function fetchTemplateBuffer ({ fetchFn, templateFile }) {
    if (typeof fetchFn !== "function") throw new Error("Brak funkcji fetch do pobrania szablonu XLSX.");
    const response = await fetchFn(templateFile);
    if (!response?.ok) {
      const status = response?.status ? ` HTTP ${response.status}` : "";
      throw new Error(`Nie udało się pobrać szablonu XLSX:${status}.`);
    }
    if (typeof response.arrayBuffer !== "function") {
      throw new Error("Odpowiedź szablonu XLSX nie zawiera danych binarnych.");
    }
    return response.arrayBuffer();
  }

  function buildPrintAreaNode ({ worksheetName, printRange }) {
    const safeSheetName = worksheetName.replace(/'/g, "''");
    return `<definedName function="false" hidden="false" localSheetId="0" name="_xlnm.Print_Area" vbProcedure="false">'${safeSheetName}'!${printRange}</definedName>`;
  }

  async function applyPrintArea ({ buffer, worksheetName, printRange, JSZipImpl }) {
    const zip = await JSZipImpl.loadAsync(buffer);
    const workbookXmlPath = "xl/workbook.xml";
    const workbookXmlFile = zip.file(workbookXmlPath);
    if (!workbookXmlFile) throw new Error("Szablon XLSX nie zawiera xl/workbook.xml.");

    const workbookXmlText = await workbookXmlFile.async("text");
    const clearedXml = workbookXmlText.replace(
      /<definedName[^>]*name="_xlnm\.Print_Area"[\s\S]*?<\/definedName>/g,
      ""
    );
    const printAreaNode = buildPrintAreaNode({ worksheetName, printRange });

    const finalXml = clearedXml.includes("<definedNames>")
      ? clearedXml.replace("</definedNames>", `${printAreaNode}</definedNames>`)
      : clearedXml.replace("</workbook>", `<definedNames>${printAreaNode}</definedNames></workbook>`);

    zip.file(workbookXmlPath, finalXml);
    return zip.generateAsync({ type: "blob" });
  }

  function buildRecipeFileName ({ patientName, currentBag, central }) {
    const bagLabel = currentBag.replace(" Peripheral", "");
    const routeLabel = central ? "centralne" : "obwodowe";
    const safePatient = (patientName || "pacjent")
      .replace(/[\\/:*?"<>|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "pacjent";
    return `${safePatient} ${bagLabel} ${routeLabel}.xlsx`;
  }

  async function buildRecipeXlsxBlob ({ data, currentBag, central, cfg, dependencies = {} }) {
    assertRecipeInputs({ data, currentBag, cfg });
    const ExcelJSImpl = getDependency(dependencies.ExcelJS, "ExcelJS");
    const JSZipImpl = getDependency(dependencies.JSZip, "JSZip");
    const fetchFn = dependencies.fetch || (typeof fetch !== "undefined" ? fetch : null);

    const templateBuffer = await fetchTemplateBuffer({
      fetchFn,
      templateFile: cfg.constants.TEMPLATE_FILE
    });

    const workbook = new ExcelJSImpl.Workbook();
    await workbook.xlsx.load(templateBuffer);
    const worksheet = fillRecipeWorksheet({ workbook, data, currentBag, central, cfg });
    const workbookBuffer = await workbook.xlsx.writeBuffer();
    const blob = await applyPrintArea({
      buffer: workbookBuffer,
      worksheetName: worksheet.name,
      printRange: cfg.constants.PRINT_RANGE,
      JSZipImpl
    });

    return {
      blob,
      fileName: buildRecipeFileName({ patientName: data.name, currentBag, central })
    };
  }

  async function generateRecipeXlsx ({ data, currentBag, central, cfg, dependencies = {} }) {
    const saveAsFn = dependencies.saveAs || (typeof saveAs !== "undefined" ? saveAs : null);
    if (typeof saveAsFn !== "function") throw new Error("Brak funkcji saveAs do zapisania pliku XLSX.");
    const { blob, fileName } = await buildRecipeXlsxBlob({ data, currentBag, central, cfg, dependencies });
    saveAsFn(blob, fileName);
    return { blob, fileName };
  }

  return {
    BAG_ROW_MAP,
    PATIENT_CELL_MAP,
    fillRecipeWorksheet,
    fetchTemplateBuffer,
    buildPrintAreaNode,
    applyPrintArea,
    buildRecipeFileName,
    buildRecipeXlsxBlob,
    generateRecipeXlsx
  };
});
