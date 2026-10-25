(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.ForjaFinanceNote=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  function rows(page){
    const grouped=new Map();
    for(const item of page.items||[]){
      if(!item?.str||!Number.isFinite(item.transform?.[4])||!Number.isFinite(item.transform?.[5]))continue;
      const y=Math.round(item.transform[5]);
      grouped.set(y,[...(grouped.get(y)||[]),{x:item.transform[4],text:item.str}]);
    }
    return [...grouped].sort((a,b)=>b[0]-a[0]).map(([,parts])=>parts.sort((a,b)=>a.x-b.x).map(part=>part.text).join(' ').replace(/\s+/g,' ').trim());
  }
  const decimal=text=>Number(String(text).replace(/\./g,'').replace(',','.'));
  function parsePages(pages){
    if(!pages?.length||pages.length>30)throw Error('Nota de negociação inválida ou grande demais.');
    const lines=pages.flatMap(rows),full=lines.join(' ');
    if(!/nota de negocia[çc][ãa]o/i.test(full)||!/data preg[ãa]o/i.test(full))throw Error('O PDF não é uma nota de negociação XP reconhecida.');
    const references=[...full.matchAll(/\b(\d{2})\/(\d{2})\/(\d{4})\s+(\d{6,12})\b/g)];
    const unique=new Set(references.map(match=>`${match[1]}/${match[2]}/${match[3]}-${match[4]}`));
    if(unique.size!==1)throw Error('Não encontrei uma única data e número de nota. Importe uma nota por vez.');
    const match=references[0],date=`${match[3]}-${match[2]}-${match[1]}`,noteNumber=match[4];
    const check=new Date(`${date}T12:00:00Z`);
    if(check.getUTCFullYear()!==Number(match[3])||check.getUTCMonth()+1!==Number(match[2])||check.getUTCDate()!==Number(match[1]))throw Error('Data da nota inválida.');
    const trades=[];
    for(const line of lines){
      if(!/^\d+-BOVESPA\b/i.test(line))continue;
      const action=/^\d+-BOVESPA\s+([CV])\s+(VISTA|FRACIONARIO)\b/i.exec(line);
      if(!action)throw Error('A nota tem uma operação que o Forja ainda não reconhece. Nenhum dado foi alterado.');
      const tail=/\b(\d{1,8})\s+([\d.]+,\d{2,4})\s+([\d.]+,\d{2})\s+[CD]\s*$/i.exec(line);
      const ticker=/\b([A-Z]{4}\d{1,2})F?\b/.exec(line.slice(action[0].length));
      if(!tail||!ticker)throw Error('Não consegui ler ativo, quantidade ou valor em uma operação. Nenhum dado foi alterado.');
      const quantity=Number(tail[1]),priceCents=Math.round(decimal(tail[2])*100),amountCents=Math.round(decimal(tail[3])*100);
      if(!Number.isSafeInteger(quantity)||quantity<=0||!Number.isSafeInteger(priceCents)||priceCents<=0||!Number.isSafeInteger(amountCents)||amountCents<=0)throw Error('Uma operação da nota contém valores inválidos.');
      const symbol=ticker[1],type=action[1]==='C'?'compra':'venda';
      const category=/\bFII\b/i.test(line)?'fii':symbol==='IVVB11'?'international':'stocks';
      trades.push({id:`xp-note-${noteNumber}-${trades.length+1}`,name:symbol,type,date,quantity,amountCents,priceCents,category,note:`Nota XP ${noteNumber}`});
    }
    if(!trades.length)throw Error('Não encontrei operações de compra ou venda nesta nota.');
    if(trades.length>300)throw Error('Nota grande demais para importar com segurança.');
    return {date,noteNumber,trades};
  }
  async function parse(buffer){
    if(!root.ForjaFinancePdf?.readPages)throw Error('Leitor local de PDF indisponível.');
    return parsePages(await root.ForjaFinancePdf.readPages(buffer));
  }
  return {rows,parsePages,parse};
});
