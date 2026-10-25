(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.ForjaFinanceXp=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const decoder=new TextDecoder();
  function moneyCents(value){
    const text=String(value??'').trim().replace(/[^\d,.-]/g,'');
    if(!text)throw Error('Valor ausente na planilha.');
    const number=Number(text.includes(',')?text.replace(/\./g,'').replace(',','.'):text);
    if(!Number.isFinite(number)||Math.abs(number)>1e10)throw Error('Valor inválido na planilha.');
    return Math.round(number*100);
  }
  function amount(value){const text=String(value??'').trim();const number=Number(text.includes(',')?text.replace(/\./g,'').replace(',','.'):text);if(!Number.isFinite(number)||number<0)throw Error('Quantidade inválida na planilha.');return number;}
  function optionalPrice(value){return normalized(value)==='indefinido'?null:moneyCents(value);}
  async function entries(buffer){
    const bytes=new Uint8Array(buffer),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    if(bytes.length>12e6)throw Error('Planilha muito grande.');
    let end=-1;
    for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50){end=i;break;}
    if(end<0)throw Error('O arquivo não é uma planilha XLSX válida.');
    const count=view.getUint16(end+10,true),offset=view.getUint32(end+16,true),found=new Map();
    if(count>500||offset>=bytes.length)throw Error('Planilha XLSX inválida.');
    let cursor=offset;
    for(let i=0;i<count;i++){
      if(view.getUint32(cursor,true)!==0x02014b50)throw Error('Estrutura XLSX inválida.');
      const flags=view.getUint16(cursor+8,true),method=view.getUint16(cursor+10,true),compressed=view.getUint32(cursor+20,true),uncompressed=view.getUint32(cursor+24,true),nameLength=view.getUint16(cursor+28,true),extra=view.getUint16(cursor+30,true),comment=view.getUint16(cursor+32,true),local=view.getUint32(cursor+42,true);
      const name=decoder.decode(bytes.subarray(cursor+46,cursor+46+nameLength));
      cursor+=46+nameLength+extra+comment;
      if(!['xl/sharedStrings.xml','xl/worksheets/sheet1.xml'].includes(name))continue;
      if(flags&1||![0,8].includes(method)||uncompressed>8e6||local+30>=bytes.length||view.getUint32(local,true)!==0x04034b50)throw Error('Compactação XLSX não suportada.');
      const dataStart=local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true);
      if(dataStart+compressed>bytes.length)throw Error('Arquivo XLSX incompleto.');
      const raw=bytes.subarray(dataStart,dataStart+compressed);
      if(method===0)found.set(name,decoder.decode(raw));
      else{
        if(typeof DecompressionStream==='undefined')throw Error('Este aparelho não oferece leitura de XLSX compactado.');
        const stream=new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        const expanded=await new Response(stream).arrayBuffer();
        if(expanded.byteLength!==uncompressed)throw Error('Conteúdo XLSX incompleto.');
        found.set(name,decoder.decode(expanded));
      }
    }
    if(!found.has('xl/worksheets/sheet1.xml'))throw Error('A primeira aba da planilha não foi encontrada.');
    return found;
  }
  function cellsFromXml(xml,stringsXml,Parser){
    const parser=new Parser(),sheet=parser.parseFromString(xml,'application/xml');
    if(sheet.getElementsByTagName('parsererror').length)throw Error('XML da planilha inválido.');
    const strings=[];
    if(stringsXml){const doc=parser.parseFromString(stringsXml,'application/xml');for(const item of doc.getElementsByTagName('si'))strings.push(Array.from(item.getElementsByTagName('t')).map(node=>node.textContent).join(''));}
    const rows=new Map();
    for(const row of sheet.getElementsByTagName('row')){
      const record={};
      for(const cell of row.getElementsByTagName('c')){
        const column=/^[A-Z]+/.exec(cell.getAttribute('r')||'')?.[0];if(!column)continue;
        const value=cell.getElementsByTagName('v')[0]?.textContent??'';
        record[column]=cell.getAttribute('t')==='s'?strings[Number(value)]??'':cell.getAttribute('t')==='inlineStr'?cell.getElementsByTagName('t')[0]?.textContent??'':value;
      }
      rows.set(Number(row.getAttribute('r')),record);
    }
    return rows;
  }
  function normalized(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();}
  function convert(rows){
    const header=String(rows.get(1)?.F||'');
    const date=/(\d{2})\/(\d{2})\/(\d{4})/.exec(header);
    if(!date)throw Error('Não encontrei a data da posição XP.');
    const asOf=`${date[3]}-${date[2]}-${date[1]}T12:00:00-03:00`;
    let section='',subsection='',seen={stocks:false,fii:false,treasury:false};
    const positions=[],keys=new Set();let receivables=0;
    const add=(row,category,kind='market')=>{
      const name=String(row.A||'').trim(),key=`${category}:${normalized(name)}`;
      if(!name||keys.has(key))throw Error('Ativo repetido na planilha XP.');
      keys.add(key);
      const p={id:`xp-${category}-${normalized(name).replace(/[^a-z0-9]+/g,'-')}`,name,category,kind,currency:'BRL',amountCents:moneyCents(row.B),source:'XP'};
      if(kind==='market'){
        p.quantity=amount(category==='fii'?row.F:row.G);
        p.averagePriceCents=optionalPrice(category==='fii'?row.D:row.E);
        p.unitPriceCents=moneyCents(category==='fii'?row.E:row.F);
      }else p.investedCents=moneyCents(category==='cdb'?row.D:row.D);
      positions.push(p);
    };
    for(const [index,row] of [...rows].sort((a,b)=>a[0]-b[0])){
      const label=normalized(row.A);
      if(label==='custodia remunerada'){section='ignore';continue;}
      if(label==='proventos'||label.startsWith('dividendos, proventos')){section='proventos';continue;}
      if(label==='tesouro direto'){section='treasury';seen.treasury=true;continue;}
      if(label==='fundos imobiliarios'&&section==='proventos'){subsection='fii';if(row.G)receivables+=moneyCents(row.G);continue;}
      if(label==='acoes'&&section==='proventos'){subsection='stocks';if(row.G)receivables+=moneyCents(row.G);continue;}
      if(label==='fundos imobiliarios'){section='fii';seen.fii=true;continue;}
      if(label==='renda fixa'){section='cdb';continue;}
      if(label==='acoes'&&!seen.stocks){section='stocks';seen.stocks=true;continue;}
      if(section==='ignore'||section==='proventos')continue;
      if(section==='stocks'&&/^[A-Z0-9]{4}\d{1,2}$/.test(String(row.A||'').trim())&&row.B&&amount(row.G)>0)add(row,String(row.A).trim()==='IVVB11'?'international':'stocks');
      else if(section==='fii'&&/^[A-Z0-9]{4}\d{1,2}$/.test(String(row.A||'').trim())&&row.B&&amount(row.F)>0)add(row,'fii');
      else if(section==='cdb'&&/^CDB\b/i.test(String(row.A||''))&&row.B)add(row,'cdb','balance');
      else if(section==='treasury'&&/^(LFT|LTN|NTNB)/i.test(String(row.A||''))&&row.B)add(row,'treasury','balance');
    }
    if(!seen.stocks||!seen.fii||!seen.treasury||positions.length<4)throw Error('Formato XP não reconhecido; nenhuma posição foi alterada.');
    const cash=rows.get(4)?.C;if(cash!=null&&String(cash).trim())positions.push({id:'xp-cash',name:'Saldo disponível XP',category:'cash',kind:'balance',currency:'BRL',amountCents:moneyCents(cash),source:'XP'});
    return {asOf,positions,receivables:{amountCents:receivables,currency:'BRL'},provenance:'Planilha PosicaoDetalhada da XP'};
  }
  async function parse(buffer,Parser=globalThis.DOMParser){
    if(!Parser)throw Error('Leitura de XML indisponível neste aparelho.');
    const files=await entries(buffer),rows=cellsFromXml(files.get('xl/worksheets/sheet1.xml'),files.get('xl/sharedStrings.xml'),Parser);
    return convert(rows);
  }
  return {parse,convert,moneyCents};
});
