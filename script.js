/* script.js – dynamiczne zakresy dodatków
 * Dipeptiven  ≤ 2.5 ml/kg  |  Omegaven ≤ 2 ml/kg (tylko Kabiven)
 * ostatnia aktualizacja: 2025-05-03
 */

//////////////////// 1. WORKI ////////////////////
const bagConfig = {
  "SmofKabiven":[
    {vol:493 ,kcal:Math.round(493 *1.2)},
    {vol:986 ,kcal:Math.round(986 *1.2)},
    {vol:1477,kcal:Math.round(1477*1.2)},
    {vol:1970,kcal:Math.round(1970*1.2)},
    {vol:2463,kcal:Math.round(2463*1.2)}
  ],
  "SmofKabiven Peripheral":[
    {vol:1206,kcal:Math.round(1206*1.2)},
    {vol:1448,kcal:Math.round(1448*1.2)},
    {vol:1904,kcal:Math.round(1904*1.2)}
  ],
  "Kabiven":[
    {vol:1026,kcal:Math.round(1026*1.1)},
    {vol:1540,kcal:Math.round(1540*1.1)},
    {vol:2053,kcal:Math.round(2053*1.1)},
    {vol:2566,kcal:Math.round(2566*1.1)}
  ],
  "Kabiven Peripheral":[
    {vol:1440,kcal:Math.round(1440*1.1)},
    {vol:1920,kcal:Math.round(1920*1.1)},
    {vol:2400,kcal:Math.round(2400*1.1)}
  ]
};

//////////////////// 2. ZGODNOŚĆ Z CHPL ////////////////////
/* di = Dipeptiven, so = Soluvit, vi = Vitalipid, om = Omegaven */
const additiveRangeConfig = {
  "Kabiven":{                          // ma tabelę Omegaven
    1026:{di:[0,100], so:[0,1], vi:[0,10], om:[0,50]},
    1540:{di:[0,200], so:[0,1], vi:[0,10], om:[0,100]},
    2053:{di:[0,300], so:[0,2], vi:[0,20], om:[0,100]},
    2566:{di:[0,300], so:[0,2], vi:[0,20], om:[0,100]}
  },
  "Kabiven Peripheral":{               // brak Omegaven
    1440:{di:[0,300], so:[0,1], vi:[0,10]},
    1920:{di:[0,300], so:[0,1], vi:[0,10]},
    2400:{di:[0,300], so:[0,1], vi:[0,10]}
  },
  "SmofKabiven":{
    493 :{di:[0,100], so:[0,1], vi:[0,10]},
    986 :{di:[0,300], so:[0,1], vi:[0,10]},
    1477:{di:[0,300], so:[0,1], vi:[0,10]},
    1970:{di:[0,300], so:[0,1], vi:[0,10]},
    2463:{di:[0,300], so:[0,1], vi:[0,10]}
  },
  "SmofKabiven Peripheral":{
    1206:{di:[0,300], so:[0,1], vi:[0,10]},
    1448:{di:[0,300], so:[0,1], vi:[0,10]},
    1904:{di:[0,300], so:[0,1], vi:[0,10]}
  }
};

//////////////////// 3. STAŁE ////////////////////
const DIPEPTIVEN_PER_KG = 2.5;   // ml/kg
const OMEGAVEN_PER_KG   = 2.0;   // ml/kg
const VIT_B1_RANGE      = "0 – 6 ml";
const VIT_C_RANGE       = "0 – 20 ml (max. 30 ml)";

const dosageConfig = {
  "SmofKabiven"           :{min:13,max:31,maxDaily:35},
  "Kabiven"               :{min:19,max:38,maxDaily:40},
  "SmofKabiven Peripheral":{min:20,max:40,maxDaily:40},
  "Kabiven Peripheral"    :{min:27,max:40,maxDaily:40}
};

const TEMPLATE_FILE = "szablon.xlsx";

//////////////////// 4. UI ////////////////////
document.addEventListener("DOMContentLoaded",()=>{
  /* elementy formularza */
  const productSel=document.getElementById("productType");
  const nutritSel =document.getElementById("nutritionType");
  const weightInp =document.getElementById("weight");
  const volSel    =document.getElementById("bagVolume");

  const kcalSpan  =document.getElementById("bagCalories");
  const bagCell   =document.getElementById("selectedBagCell");
  const reqMinSpan=document.getElementById("reqMin");
  const reqMaxSpan=document.getElementById("reqMax");
  const reqAbsSpan=document.getElementById("reqAbsMax");

  const rangeDi  =document.getElementById("rangeAdd6");
  const rangeSo  =document.getElementById("rangeAdd3");
  const rangeVi  =document.getElementById("rangeAdd4");
  const rangeOm  =document.getElementById("rangeAdd8");
  const rangeVb1 =document.getElementById("rangeAdd15");
  const rangeVc  =document.getElementById("rangeAdd16");

  const form =document.getElementById("daneForm");

  /* domyślna data */
  const today=new Date().toISOString().slice(0,10);
  document.getElementById("dateFrom").value=today;
  document.getElementById("dateTo").value  =today;

  /* bag name helper */
  const currentBag=()=>nutritSel.value==="obwodowe"
      ?`${productSel.value} Peripheral`
      :productSel.value;

  /* --- aktualizacja zakresów --- */
  function updateAdditiveRanges(){
    const bag=currentBag();
    const vol=parseInt(volSel.value,10);
    const cfg=additiveRangeConfig[bag]?.[vol];
    const w=parseFloat(weightInp.value)||0;

    /* Dipeptiven */
    const diMax=Math.min(cfg?.di?cfg.di[1]:Infinity, w?Math.round(DIPEPTIVEN_PER_KG*w):Infinity);
    rangeDi.textContent=diMax===Infinity?"Brak danych":`0 – ${diMax} ml`;

    /* Omegaven – tylko jeśli w cfg istnieje klucz om */
    if(cfg?.om){
      const omMax=Math.min(cfg.om[1], w?Math.round(OMEGAVEN_PER_KG*w):Infinity);
      rangeOm.textContent=`0 – ${omMax} ml`;
    }else{
      rangeOm.textContent="Brak danych";
    }

    /* pozostałe */
    rangeSo.textContent=cfg?`${cfg.so[0]} – ${cfg.so[1]} fiol.`:"Brak danych";
    rangeVi.textContent=cfg?`${cfg.vi[0]} – ${cfg.vi[1]} ml`   :"Brak danych";
    rangeVb1.textContent=VIT_B1_RANGE;
    rangeVc.textContent =VIT_C_RANGE;
  }

  /* --- render worka i dawki --- */
  function renderBagOptions(){
    const bag=currentBag();
    bagCell.textContent=bag;
    volSel.innerHTML="";
    (bagConfig[bag]||[]).forEach(({vol,kcal})=>{
      const o=document.createElement("option");
      o.value=vol; o.textContent=`${vol} ml`; o.dataset.kcal=kcal;
      volSel.appendChild(o);
    });
    updateKcal(); updateDosage(); updateAdditiveRanges();
  }

  const updateKcal = ()=>{ kcalSpan.textContent=volSel.selectedOptions[0]?.dataset.kcal||""; };

  const updateDosage = ()=>{
    const cfg=dosageConfig[currentBag()];
    const w=parseFloat(weightInp.value)||0;
    if(cfg&&w){
      reqMinSpan.textContent=Math.round(cfg.min*w);
      reqMaxSpan.textContent=Math.round(cfg.max*w);
      reqAbsSpan.textContent=Math.round(cfg.maxDaily*w);
    }else{
      reqMinSpan.textContent=reqMaxSpan.textContent=reqAbsSpan.textContent="0";
    }
  };

  /* --- eventy --- */
  productSel.addEventListener("change",renderBagOptions);
  nutritSel .addEventListener("change",renderBagOptions);
  volSel    .addEventListener("change",()=>{updateKcal();updateAdditiveRanges();});
  weightInp .addEventListener("input", ()=>{updateDosage();updateAdditiveRanges();});

  renderBagOptions(); // init

  /////////////////// 5.  GENEROWANIE XLSX ///////////////////
  form.addEventListener("submit",async e=>{
    e.preventDefault();

    /* zbierz dane */
    const data={
      name   :document.getElementById("fullname").value.trim(),
      pesel  :document.getElementById("pesel").value.trim(),
      dateFrom:document.getElementById("dateFrom").value,
      dateTo  :document.getElementById("dateTo").value,
      weight :parseFloat(weightInp.value)||0,
      bagVol :parseInt(volSel.value,10)||0,
      additives:Array.from({length:17},(_,i)=>{
        const el=document.getElementById(`add${i+1}`);
        if(!el)return "";
        const raw=el.value.trim();
        if(raw==="")return "";
        const n=parseFloat(raw.replace(/,/g,"."));
        return isNaN(n)?raw:n;
      })
    };

    /* pomocnicza funkcja podziału 50/100 oraz 10/20 */
    const split=(idxSmall,idxLarge,size)=>{
      const tot=parseFloat(data.additives[idxSmall])||0;
      const large=Math.floor(tot/size)*size;
      const small=tot-large;
      data.additives[idxSmall]=small||"";
      data.additives[idxLarge]=large||"";
    };
    split(5,6,100);   // Dipeptiven
    split(7,8,100);   // Omegaven
    split(9,10,20);   // Kalium

    const solVials=data.additives[2];

    /* Excel */
    const resp=await fetch(TEMPLATE_FILE);
    if(!resp.ok){alert("Błąd pobierania szablonu");return;}
    const wb=new ExcelJS.Workbook();
    await wb.xlsx.load(await resp.arrayBuffer());
    const ws=wb.worksheets[0];

    ws.getCell("C2").value=data.name;
    ws.getCell("C6").value=data.pesel;
    ws.getCell("C7").value=data.weight;
    ws.getCell("C8").value=data.dateFrom;
    ws.getCell("C9").value=data.dateTo;

    const central=nutritSel.value==="centralne";
    ws.getCell("C11").value=central?"Obwodowa":"Obwodowa X";
    ws.getCell("C12").value=central?"Centralna X":"Centralna";

    const rowMap={"SmofKabiven":24,"SmofKabiven Peripheral":26,"Kabiven":23,"Kabiven Peripheral":25};
    [23,24,25,26].forEach(r=>{ws.getCell(`C${r}`).value=""; ws.getCell(`D${r}`).value="";});
    const tr=rowMap[currentBag()];
    if(tr){
      const info=(bagConfig[currentBag()]||[]).find(b=>b.vol===data.bagVol);
      ws.getCell(`C${tr}`).value=info?info.kcal:"";
      ws.getCell(`D${tr}`).value=data.bagVol;
    }

    data.additives.forEach((v,i)=>ws.getCell(28+i,4).value=v);

    ws.getCell("D30").value="";
    ws.getCell("H30").value=solVials===""?"":solVials;

    const out=await wb.xlsx.writeBuffer();
    saveAs(
      new Blob([out],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),
      `Recepta_${data.name.replace(/ /g,"_")}.xlsx`
    );
  });
});
