/* xlsxGenerator.js
 * Eksport recepty do pliku XLSX na podstawie danych z formularza
 * Wymaga: ExcelJS, JSZip, FileSaver (już dodane w <head>)
 */

async function generateRecipeXlsx ({ data, currentBag, central, cfg }) {
    const {
      bagConfig,
      constants: { TEMPLATE_FILE, PRINT_RANGE }
    } = cfg;
  
    try {
      /* 1. Pobierz szablon XLSX */
      const resp = await fetch(TEMPLATE_FILE);
      if (!resp.ok) {
        alert("Błąd pobierania szablonu");
        return;
      }
  
      /* 2. Wczytaj workbook */
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await resp.arrayBuffer());
      const ws = wb.worksheets[0];
  
      /* 3. Wypełnij dane pacjenta */
      ws.getCell("C2").value = data.name;
      ws.getCell("C6").value = data.pesel;
      ws.getCell("C7").value = data.weight;
      ws.getCell("C8").value = data.dateFrom;
      ws.getCell("C9").value = data.dateTo;
  
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
  
      /* 6. Ustawienia strony */
      ws.pageSetup.orientation = 'portrait';
      ws.pageSetup.fitToPage   = true;
      ws.pageSetup.fitToWidth  = 1;
      ws.pageSetup.fitToHeight = 1;
  
      /* 7. Zapis do bufora */
      const buffer = await wb.xlsx.writeBuffer();
  
      /* 8. Modyfikacja workbook.xml (Print_Area) */
      const zip = await JSZip.loadAsync(buffer);
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
  
      const finalXml = clearedXml.includes("<definedNames>")
        ? clearedXml.replace("</definedNames>", `${printAreaNode}</definedNames>`)
        : clearedXml.replace("</workbook>", `<definedNames>${printAreaNode}</definedNames></workbook>`);
  
      zip.file(wbXmlPath, finalXml);
  
      /* 9. Eksport pliku */
      const finalBlob = await zip.generateAsync({ type: "blob" });
      const fileName  = `Recepta_${data.name.replace(/\s+/g, "_")}.xlsx`;
      saveAs(finalBlob, fileName);
    } catch (err) {
      console.error(err);
      alert("Wystąpił błąd podczas generowania pliku XLSX.");
    }
  }
  