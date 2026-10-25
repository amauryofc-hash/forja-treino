(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.ForjaFinancePdf=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const clean=text=>String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
  const joined=items=>items.slice().sort((a,b)=>a.x-b.x).map(item=>item.text).join('').replace(/\s+/g,' ').trim();
  const money=text=>{
    const match=/^(-?)\s*R\$\s*([\d.]+,\d{2})$/.exec(text);
    if(!match)return null;
    const cents=Math.round(Number(match[2].replace(/\./g,'').replace(',','.'))*100);
    return Number.isSafeInteger(cents)&&cents>0?(match[1]?-cents:cents):null;
  };
  const isoDate=text=>{
    const match=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
    if(!match)return null;
    const value=`${match[3]}-${match[2]}-${match[1]}`;
    const date=new Date(`${value}T12:00:00Z`);
    return date.getUTCFullYear()===Number(match[3])&&date.getUTCMonth()+1===Number(match[2])&&date.getUTCDate()===Number(match[1])?value:null;
  };
  function classify(description,amountCents){
    const text=clean(description);
    if(amountCents>0&&(/transferencia recebida da conta digital/.test(text)||/ted.*recebimento de.*ted/.test(text)))return {type:'aporte',note:'Transferência recebida · Extrato XP'};
    if(amountCents<0&&(/transferencia enviada (para|a) conta digital/.test(text)||/ted.*(envio|transferencia enviada)/.test(text)))return {type:'retirada',note:'Transferência enviada · Extrato XP'};
    return null;
  }
  function hash(text){
    let value=2166136261;
    for(let i=0;i<text.length;i++){value^=text.charCodeAt(i);value=Math.imul(value,16777619);}
    return (value>>>0).toString(36);
  }
  function pageRows(items,width){
    const rows=new Map();
    for(const item of items){
      if(!item?.str||!Number.isFinite(item.transform?.[4])||!Number.isFinite(item.transform?.[5]))continue;
      const y=Math.round(item.transform[5]),list=rows.get(y)||[];
      list.push({x:item.transform[4],text:item.str});rows.set(y,list);
    }
    const anchors=[];
    for(const [y,list] of rows){
      const date=isoDate(joined(list.filter(item=>item.x<width*.17)));
      const movementDate=isoDate(joined(list.filter(item=>item.x>=width*.17&&item.x<width*.31)));
      const amountCents=money(joined(list.filter(item=>item.x>=width*.69&&item.x<width*.83)));
      if(date&&movementDate&&amountCents!=null)anchors.push({y,date,amountCents,description:''});
    }
    for(const [y,list] of rows){
      const description=joined(list.filter(item=>item.x>=width*.31&&item.x<width*.69));
      if(!description||!anchors.length)continue;
      const nearest=anchors.reduce((best,row)=>Math.abs(row.y-y)<Math.abs(best.y-y)?row:best);
      if(Math.abs(nearest.y-y)<=15)nearest.description+=` ${description}`;
    }
    return anchors;
  }
  function parsePages(pages){
    const fullText=pages.flatMap(page=>page.items.map(item=>item.str||'')).join(' ');
    if(!/xp investimentos/i.test(clean(fullText))||!/extrato da conta/i.test(clean(fullText)))throw Error('Este PDF não é um extrato da conta XP reconhecido. Nenhum dado foi alterado.');
    const seen=new Map(),flows=[];let ignored=0;
    for(const page of pages){
      for(const row of pageRows(page.items,page.width)){
        const match=classify(row.description,row.amountCents);
        if(!match){ignored++;continue;}
        const signature=`${row.date}|${match.type}|${Math.abs(row.amountCents)}|${clean(row.description)}`;
        const occurrence=seen.get(signature)||0;seen.set(signature,occurrence+1);
        flows.push({id:`xp-extrato-${hash(signature)}-${occurrence}`,type:match.type,date:row.date,amountCents:Math.abs(row.amountCents),note:match.note});
      }
    }
    if(!flows.length)throw Error('Não encontrei aportes ou retiradas externos reconhecíveis neste extrato. Nenhum dado foi alterado.');
    if(flows.length>1000)throw Error('Extrato grande demais para importar com segurança.');
    return {flows,ignored};
  }
  let enginePromise;
  function loadScript(path){
    return new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src=new URL(path,document.baseURI).href;
      script.onload=resolve;
      script.onerror=()=>reject(Error('Não foi possível carregar o leitor local de PDF.'));
      document.head.appendChild(script);
    });
  }
  function loadEngine(){
    if(globalThis.pdfjsLib&&globalThis.pdfjsWorker)return Promise.resolve(globalThis.pdfjsLib);
    if(!enginePromise)enginePromise=(async()=>{
      await loadScript('./vendor/pdfjs/pdf.worker.bundle.js');
      await loadScript('./vendor/pdfjs/pdf.bundle.js');
      if(!globalThis.pdfjsLib||!globalThis.pdfjsWorker)throw Error('Leitor de PDF indisponível neste aparelho.');
      return globalThis.pdfjsLib;
    })().catch(error=>{enginePromise=null;throw error;});
    return enginePromise;
  }
  async function readPages(buffer){
    if(!buffer||buffer.byteLength>12e6)throw Error('O PDF deve ter até 12 MB.');
    const header=new Uint8Array(buffer,0,Math.min(8,buffer.byteLength));
    if(new TextDecoder().decode(header).slice(0,5)!=='%PDF-')throw Error('Selecione um arquivo PDF válido.');
    const pdfjs=await loadEngine();
    pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs/pdf.worker.bundle.js',document.baseURI).href;
    let documentTask;
    try{
      documentTask=pdfjs.getDocument({data:new Uint8Array(buffer),useSystemFonts:true,disableFontFace:true});
      const pdf=await documentTask.promise;
      if(pdf.numPages>30)throw Error('O PDF tem páginas demais para importar com segurança.');
      const pages=[];
      for(let number=1;number<=pdf.numPages;number++){
        const page=await pdf.getPage(number),content=await page.getTextContent();
        pages.push({width:page.view[2]-page.view[0],items:content.items});
      }
      return pages;
    }catch(error){
      if(/password/i.test(error?.name||'')||/password/i.test(error?.message||''))throw Error('PDF protegido por senha. Exporte uma cópia sem senha para importar.');
      throw error;
    }finally{if(documentTask)await documentTask.destroy();}
  }
  async function parse(buffer){return parsePages(await readPages(buffer));}
  return {parse,readPages,parsePages,pageRows,classify};
});
