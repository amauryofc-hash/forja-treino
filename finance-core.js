(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.ForjaFinanceCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const CATEGORIES={stocks:'Ações',fii:'Fundos imobiliários',international:'Internacional',treasury:'Tesouro Direto',cdb:'CDB',cash:'Caixa e caixinha',crypto:'Criptoativos'};
  function validCents(value){return Number.isSafeInteger(value)&&Math.abs(value)<=1e12;}
  function validate(data){
    if(!data||data.format!=='forja-finance-position'||data.version!==1||!Array.isArray(data.positions)||data.positions.length>1000)throw Error('Arquivo de posição inválido.');
    const ids=new Set();
    const positions=data.positions.map(raw=>{
      if(!raw||typeof raw.id!=='string'||!raw.id||ids.has(raw.id)||typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>100||!CATEGORIES[raw.category]||!['BRL','USD'].includes(raw.currency)||!validCents(raw.amountCents))throw Error('Há um investimento inválido ou repetido.');
      ids.add(raw.id);
      if(raw.quantity!=null&&(!Number.isFinite(raw.quantity)||raw.quantity<0))throw Error('Quantidade inválida.');
      return {id:raw.id,name:raw.name.trim(),category:raw.category,kind:raw.kind==='market'?'market':'balance',currency:raw.currency,amountCents:raw.amountCents,quantity:raw.quantity??null,unitPriceCents:validCents(raw.unitPriceCents)?raw.unitPriceCents:null,previousUnitPriceCents:validCents(raw.previousUnitPriceCents)?raw.previousUnitPriceCents:null,previousQuoteAt:Number.isFinite(Date.parse(raw.previousQuoteAt))?String(raw.previousQuoteAt).slice(0,40):'',dayChangePercent:Number.isFinite(raw.dayChangePercent)&&Math.abs(raw.dayChangePercent)<=1000?raw.dayChangePercent:null,dayChangeCents:validCents(raw.dayChangeCents)?raw.dayChangeCents:null,averagePriceCents:validCents(raw.averagePriceCents)?raw.averagePriceCents:null,investedCents:validCents(raw.investedCents)?raw.investedCents:null,source:String(raw.source||'manual').slice(0,80),quoteAt:Number.isFinite(Date.parse(raw.quoteAt))?String(raw.quoteAt).slice(0,40):'',manualAt:Number.isFinite(Date.parse(raw.manualAt))?String(raw.manualAt).slice(0,40):''};
    });
    const rate=Number(data.fx?.['USD/BRL']?.rate);
    if(positions.some(p=>p.currency==='USD')&&(!Number.isFinite(rate)||rate<=0||rate>1000))throw Error('Cotação de conversão inválida.');
    const cashFlows=(Array.isArray(data.cashFlows)?data.cashFlows:[]).map(flow=>{
      if(!flow||!['aporte','retirada'].includes(flow.type)||!/^\d{4}-\d{2}-\d{2}$/.test(flow.date)||!validCents(flow.amountCents)||flow.amountCents<=0)throw Error('Movimentação inválida.');
      return {id:String(flow.id||'').slice(0,80),type:flow.type,date:flow.date,amountCents:flow.amountCents,note:String(flow.note||'').slice(0,120)};
    });
    if(cashFlows.length>1000)throw Error('Histórico de movimentações muito grande.');
    const cryptoTrades=(Array.isArray(data.cryptoTrades)?data.cryptoTrades:[]).map(trade=>{
      if(!trade||!/^\d{4}-\d{2}-\d{2}$/.test(trade.date)||!validCents(trade.amountCents)||trade.amountCents<=0||!Number.isSafeInteger(Math.round(trade.quantity*1e8))||trade.quantity<=0||Math.abs(trade.quantity*1e8-Math.round(trade.quantity*1e8))>0.00001)throw Error('Compra de Bitcoin inválida.');
      return {id:String(trade.id||'').slice(0,80),date:trade.date,amountCents:trade.amountCents,quantity:Math.round(trade.quantity*1e8)/1e8};
    });
    if(cryptoTrades.length>1000)throw Error('Histórico de Bitcoin muito grande.');
    const eventPosition=raw=>{
      if(!raw||typeof raw!=='object')return null;
      if(typeof raw.id!=='string'||raw.id.length>100||typeof raw.name!=='string'||raw.name.length>100||!CATEGORIES[raw.category]||!['BRL','USD'].includes(raw.currency)||!validCents(raw.amountCents)||raw.quantity!=null&&(!Number.isFinite(raw.quantity)||raw.quantity<0))throw Error('Histórico de operações inválido.');
      return {id:raw.id,name:raw.name,category:raw.category,kind:raw.kind==='market'?'market':'balance',currency:raw.currency,amountCents:raw.amountCents,quantity:raw.quantity??null,unitPriceCents:validCents(raw.unitPriceCents)?raw.unitPriceCents:null,averagePriceCents:validCents(raw.averagePriceCents)?raw.averagePriceCents:null,investedCents:validCents(raw.investedCents)?raw.investedCents:null,source:String(raw.source||'manual').slice(0,80),quoteAt:String(raw.quoteAt||'').slice(0,40),manualAt:String(raw.manualAt||'').slice(0,40),dayChangePercent:Number.isFinite(raw.dayChangePercent)?raw.dayChangePercent:null,dayChangeCents:validCents(raw.dayChangeCents)?raw.dayChangeCents:null};
    };
    const assetEvents=(Array.isArray(data.assetEvents)?data.assetEvents:[]).map(event=>{
      if(!event||!['compra','venda','provento'].includes(event.type)||!/^\d{4}-\d{2}-\d{2}$/.test(event.date)||!validCents(event.amountCents)||event.amountCents<=0||!String(event.positionId||'').trim()||!String(event.name||'').trim()||event.type!=='provento'&&(!Number.isFinite(event.quantity)||event.quantity<=0))throw Error('Operação por investimento inválida.');
      return {id:String(event.id||'').slice(0,80),positionId:String(event.positionId).slice(0,100),name:String(event.name).slice(0,100),type:event.type,date:event.date,amountCents:event.amountCents,quantity:event.type==='provento'?null:event.quantity,note:String(event.note||'').slice(0,120),appliedToPosition:!!event.appliedToPosition,settledByImport:!!event.settledByImport,positionBefore:eventPosition(event.positionBefore),positionAfter:eventPosition(event.positionAfter)};
    });
    if(assetEvents.length>2000||new Set(assetEvents.map(event=>event.id)).size!==assetEvents.length)throw Error('Histórico de operações inválido.');
    const watchlist=(Array.isArray(data.watchlist)?data.watchlist:[]).map(item=>String(item||'').trim().toUpperCase()).filter(item=>/^[A-Z0-9]{4}\d{1,2}$/.test(item));
    if(watchlist.length>100||new Set(watchlist).size!==watchlist.length)throw Error('Lista de acompanhamento inválida.');
    const watchAlerts={};
    for(const code of watchlist){const alert=data.watchAlerts?.[code];if(!alert)continue;if(!['above','below'].includes(alert.type)||!validCents(alert.priceCents)||alert.priceCents<=0)throw Error('Alerta de preço inválido.');watchAlerts[code]={type:alert.type,priceCents:alert.priceCents};}
    const snapshots=(Array.isArray(data.snapshots)?data.snapshots:[]).map(item=>{
      if(!item||!/^\d{4}-\d{2}-\d{2}$/.test(item.date)||!validCents(item.totalCents)||!validCents(item.netFlowCents))throw Error('Histórico patrimonial inválido.');
      return {date:item.date,totalCents:item.totalCents,netFlowCents:item.netFlowCents};
    });
    if(snapshots.length>3660||new Set(snapshots.map(item=>item.date)).size!==snapshots.length)throw Error('Histórico patrimonial inválido.');
    const provents=(Array.isArray(data.provents)?data.provents:[]).map(item=>{
      if(!item||typeof item.id!=='string'||!item.id||!/^\d{4}-\d{2}-\d{2}$/.test(item.date)||!validCents(item.amountCents)||item.amountCents<=0||!['announced','estimated','received'].includes(item.status)||!String(item.positionId||'').trim())throw Error('Agenda de proventos inválida.');
      return {id:item.id.slice(0,80),positionId:String(item.positionId).slice(0,100),name:String(item.name||positions.find(p=>p.id===item.positionId)?.name||'Ativo').slice(0,100),date:item.date,amountCents:item.amountCents,status:item.status};
    });
    if(provents.length>1000||new Set(provents.map(item=>item.id)).size!==provents.length)throw Error('Agenda de proventos inválida.');
    return {format:'forja-finance-position',version:1,asOf:String(data.asOf||''),lastEdited:String(data.lastEdited||''),lastQuoteRefresh:Number.isFinite(Date.parse(data.lastQuoteRefresh))?String(data.lastQuoteRefresh).slice(0,40):'',fx:{'USD/BRL':{rate:Number.isFinite(rate)&&rate>0?rate:1,asOf:String(data.fx?.['USD/BRL']?.asOf||''),estimated:!!data.fx?.['USD/BRL']?.estimated,source:String(data.fx?.['USD/BRL']?.source||'manual').slice(0,30)}},positions,receivables:{amountCents:validCents(data.receivables?.amountCents)?data.receivables.amountCents:0,currency:'BRL'},cashFlows,cryptoTrades,assetEvents,watchlist,watchAlerts,snapshots,provents,provenance:String(data.provenance||'').slice(0,180)};
  }
  function quoteTicker(position){
    if(!position||position.kind!=='market'||position.currency!=='BRL'||!Number.isFinite(position.quantity)||position.quantity<=0||!['stocks','fii','international'].includes(position.category))return null;
    const ticker=String(position.name||'').trim().toUpperCase();
    return /^[A-Z0-9]{4}[0-9]{1,2}$/.test(ticker)?ticker:null;
  }
  function applyQuote(position,result,checkedAt){
    const ticker=quoteTicker(position),price=Number(result?.regularMarketPrice);
    if(!ticker||String(result?.symbol||'').toUpperCase()!==ticker||String(result?.currency||'BRL').toUpperCase()!=='BRL'||!Number.isFinite(price)||price<=0||price>1e7)throw Error('Cotação incompatível.');
    const amountCents=Math.round(price*position.quantity*100);
    if(!validCents(amountCents))throw Error('Valor calculado inválido.');
    const marketTime=Number.isFinite(Date.parse(result.regularMarketTime))?result.regularMarketTime:checkedAt;
    return {...position,amountCents,previousUnitPriceCents:position.quoteAt&&position.unitPriceCents!=null?position.unitPriceCents:position.previousUnitPriceCents??null,previousQuoteAt:position.quoteAt||position.previousQuoteAt||'',unitPriceCents:Math.round(price*100),dayChangePercent:Number.isFinite(result.regularMarketChangePercent)?result.regularMarketChangePercent:null,dayChangeCents:Number.isFinite(result.regularMarketChange)?Math.round(result.regularMarketChange*100):null,quoteAt:marketTime};
  }
  function isBitcoinPosition(position){return !!position&&position.category==='crypto'&&position.currency==='BRL'&&/^(BITCOIN|BTC)$/i.test(String(position.name||'').trim());}
  function cryptoTicker(position){return isBitcoinPosition(position)&&Number.isFinite(position.quantity)&&position.quantity>0?'BTC':null;}
  function applyCryptoQuote(position,result,checkedAt){
    const price=Number(result?.regularMarketPrice);
    if(cryptoTicker(position)!=='BTC'||String(result?.coin||'').toUpperCase()!=='BTC'||String(result?.currency||'').toUpperCase()!=='BRL'||!Number.isFinite(price)||price<=0||price>1e9)throw Error('Cotação incompatível.');
    const amountCents=Math.round(price*position.quantity*100);
    if(!validCents(amountCents))throw Error('Valor calculado inválido.');
    const marketTime=Number.isFinite(Date.parse(result.regularMarketTime))?result.regularMarketTime:checkedAt;
    return {...position,kind:'market',amountCents,previousUnitPriceCents:position.quoteAt&&position.unitPriceCents!=null?position.unitPriceCents:position.previousUnitPriceCents??null,previousQuoteAt:position.quoteAt||position.previousQuoteAt||'',unitPriceCents:Math.round(price*100),dayChangePercent:Number.isFinite(result.regularMarketChangePercent)?result.regularMarketChangePercent:null,dayChangeCents:Number.isFinite(result.regularMarketChange)?Math.round(result.regularMarketChange*100):null,quoteAt:marketTime};
  }
  function recordBtcPurchase(data,trade){
    const btc=data.positions.find(isBitcoinPosition);
    const satoshis=Number(trade?.quantity)*1e8;
    if(!btc||!/^\d{4}-\d{2}-\d{2}$/.test(String(trade?.date||''))||!validCents(trade?.amountCents)||trade.amountCents<=0||!Number.isSafeInteger(Math.round(satoshis))||satoshis<=0||Math.abs(satoshis-Math.round(satoshis))>0.00001)throw Error('Confira data, valor e quantidade da compra de Bitcoin.');
    const quantity=(Math.round(btc.quantity*1e8)+Math.round(satoshis))/1e8;
    const amountCents=btc.unitPriceCents!=null?Math.round(quantity*btc.unitPriceCents):btc.amountCents+trade.amountCents;
    const item={id:`btc-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,date:trade.date,amountCents:trade.amountCents,quantity:Math.round(satoshis)/1e8};
    return validate({...data,positions:data.positions.map(p=>p.id===btc.id?{...p,quantity,amountCents,quoteAt:'',manualAt:new Date().toISOString()}:p),cryptoTrades:[...(data.cryptoTrades||[]),item],lastQuoteRefresh:'',lastEdited:new Date().toISOString()});
  }
  function removeBtcPurchase(data,id){
    const btc=data.positions.find(isBitcoinPosition),trade=(data.cryptoTrades||[]).find(t=>t.id===id);
    if(!btc||!trade)throw Error('Compra de Bitcoin não encontrada.');
    const satoshis=Math.round(btc.quantity*1e8)-Math.round(trade.quantity*1e8);
    if(satoshis<0)throw Error('A posição atual é menor que a compra selecionada. Corrija a quantidade antes de remover.');
    const quantity=satoshis/1e8;
    const amountCents=btc.unitPriceCents!=null?Math.round(quantity*btc.unitPriceCents):Math.max(0,btc.amountCents-trade.amountCents);
    return validate({...data,positions:data.positions.map(p=>p.id===btc.id?{...p,quantity,amountCents,quoteAt:'',manualAt:new Date().toISOString()}:p),cryptoTrades:data.cryptoTrades.filter(t=>t.id!==id),lastQuoteRefresh:'',lastEdited:new Date().toISOString()});
  }
  function toBrlCents(position,fx){return position.currency==='USD'?Math.round(position.amountCents*fx['USD/BRL'].rate):position.amountCents;}
  function summarize(data){
    const byCategory=Object.fromEntries(Object.keys(CATEGORIES).map(key=>[key,0]));
    let totalCents=0;
    for(const p of data.positions){const cents=toBrlCents(p,data.fx);byCategory[p.category]+=cents;totalCents+=cents;}
    return {totalCents,byCategory,receivablesCents:data.receivables.amountCents};
  }
  function money(cents,currency='BRL'){return new Intl.NumberFormat('pt-BR',{style:'currency',currency}).format(cents/100);}
  function percent(part,total){return total>0?`${new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(part/total*100)}%`:'—';}
  function key(position){return `${position.category}:${position.name.trim().toUpperCase()}`;}
  function mergeXp(current,imported){
    if(Number.isFinite(Date.parse(current.asOf))&&Number.isFinite(Date.parse(imported.asOf))&&Date.parse(imported.asOf)<Date.parse(current.asOf))throw Error('Esta planilha XP é mais antiga que a posição atual. Nenhum dado foi alterado.');
    const latestNote=(current.assetEvents||[]).filter(event=>event.id.startsWith('xp-note-')).map(event=>event.date).sort().at(-1);
    if(latestNote&&String(imported.asOf).slice(0,10)<latestNote)throw Error('Esta posição é anterior a uma nota de negociação já aplicada. Use uma posição mais recente.');
    const previous=new Map(current.positions.filter(p=>p.source==='XP').map(p=>[key(p),p]));
    const incoming=imported.positions.map(p=>{const old=previous.get(key(p));return old?{...p,id:old.id}:p;});
    const manual=current.positions.filter(p=>p.source!=='XP');
    if(incoming.some(p=>manual.some(m=>key(m)===key(p))))throw Error('Há um ativo manual com o mesmo nome de um ativo da XP. Revise antes de importar.');
    const assetEvents=(current.assetEvents||[]).map(event=>event.appliedToPosition&&event.date<=String(imported.asOf).slice(0,10)?{...event,settledByImport:true,positionBefore:null,positionAfter:null}:event);
    return validate({...current,positions:[...incoming,...manual],assetEvents,asOf:imported.asOf,lastEdited:new Date().toISOString(),lastQuoteRefresh:'',receivables:imported.receivables,provenance:imported.provenance});
  }
  function previewXp(current,next){
    const before=new Map(current.positions.filter(p=>p.source==='XP').map(p=>[key(p),p]));
    const after=new Map(next.positions.filter(p=>p.source==='XP').map(p=>[key(p),p]));
    let added=0,removed=0,changed=0;
    for(const [k,p] of after){const old=before.get(k);if(!old)added++;else if(old.amountCents!==p.amountCents||old.quantity!==p.quantity)changed++;}
    for(const k of before.keys())if(!after.has(k))removed++;
    const quantityChanges=[];
    for(const [k,p] of after){const old=before.get(k);if(old?.quantity!==p.quantity&&p.quantity!=null)quantityChanges.push({name:p.name,before:old?.quantity??null,after:p.quantity});}
    for(const [k,p] of before)if(!after.has(k)&&p.quantity!=null)quantityChanges.push({name:p.name,before:p.quantity,after:null});
    return {added,removed,changed,quantityChanges,preserved:next.positions.filter(p=>p.source!=='XP').length,oldTotalCents:summarize(current).totalCents,newTotalCents:summarize(next).totalCents};
  }
  function applyXpNote(current,note){
    if(!current.positions.some(p=>p.source==='XP'))throw Error('Importe primeiro uma posição completa da XP para conferir as cotas anteriores.');
    if(!note||!/^\d{4}-\d{2}-\d{2}$/.test(note.date)||!Array.isArray(note.trades)||!note.trades.length)throw Error('Nota de negociação inválida.');
    const known=new Set((current.assetEvents||[]).map(event=>event.id));
    if(note.trades.some(trade=>known.has(trade.id)))throw Error('Esta nota já foi importada. Nenhum dado foi alterado.');
    const applyHoldings=note.date>String(current.asOf||'').slice(0,10);
    const positions=current.positions.map(p=>({...p}));
    const events=[];
    for(const trade of note.trades){
      if(!/^[A-Z0-9]{4}\d{1,2}$/.test(trade.name)||!['compra','venda'].includes(trade.type)||!['stocks','fii','international'].includes(trade.category)||!Number.isSafeInteger(trade.quantity)||trade.quantity<=0||!validCents(trade.amountCents)||trade.amountCents<=0||!validCents(trade.priceCents)||trade.priceCents<=0)throw Error('Operação da nota inválida. Nenhum dado foi alterado.');
      const index=positions.findIndex(p=>p.name.toUpperCase()===trade.name&&p.currency==='BRL');
      const old=index>=0?positions[index]:null;
      if(old&&old.source!=='XP')throw Error(`O ativo ${trade.name} é manual. Confira a posição antes de aplicar a nota XP.`);
      if(applyHoldings){
        if(trade.type==='venda'&&(!old||old.quantity==null||old.quantity<trade.quantity))throw Error(`A venda de ${trade.name} supera as cotas da posição. Importe uma posição XP mais recente ou confira a nota.`);
        const quantity=(old?.quantity||0)+(trade.type==='compra'?trade.quantity:-trade.quantity);
        if(quantity===0)positions.splice(index,1);
        else{
          const unitPriceCents=old?.unitPriceCents>0?old.unitPriceCents:trade.priceCents;
          const averagePriceCents=trade.type==='compra'?(old?.quantity>0?(old.averagePriceCents!=null?Math.round((old.quantity*old.averagePriceCents+trade.quantity*trade.priceCents)/quantity):null):trade.priceCents):old.averagePriceCents;
          const updated={...(old||{}),id:old?.id||`xp-${trade.category}-${trade.name.toLowerCase()}`,name:trade.name,category:old?.category||trade.category,kind:'market',currency:'BRL',source:'XP',quantity,unitPriceCents,averagePriceCents,investedCents:averagePriceCents!=null?Math.round(quantity*averagePriceCents):null,amountCents:Math.round(quantity*unitPriceCents),manualAt:`${note.date}T12:00:00-03:00`};
          if(index>=0)positions[index]=updated;else positions.push(updated);
        }
      }
      events.push({id:trade.id,positionId:old?.id||`xp-${trade.category}-${trade.name.toLowerCase()}`,name:trade.name,type:trade.type,date:note.date,quantity:trade.quantity,amountCents:trade.amountCents,note:trade.note||'Nota de negociação XP',appliedToPosition:applyHoldings});
    }
    return validate({...current,positions,assetEvents:[...(current.assetEvents||[]),...events],lastEdited:new Date().toISOString(),lastQuoteRefresh:applyHoldings?'':current.lastQuoteRefresh});
  }
  function recordAssetEvent(data,input){
    const position=data.positions.find(item=>item.id===input.positionId);
    if(!position||position.currency!=='BRL')throw Error('Selecione um investimento em reais.');
    const type=input.type,date=String(input.date||''),amountCents=input.amountCents,quantity=Number(input.quantity);
    if(!['compra','venda','provento'].includes(type)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!validCents(amountCents)||amountCents<=0||type!=='provento'&&(!Number.isFinite(quantity)||quantity<=0))throw Error('Confira os dados da operação.');
    const apply=type!=='provento'&&input.updatePosition!==false;
    if(apply&&position.source==='XP'&&date<=String(data.asOf||'').slice(0,10))throw Error('Esta operação já pode estar na posição XP importada. Use uma data posterior ou atualize a posição base.');
    const latestApplied=(data.assetEvents||[]).filter(item=>item.positionId===position.id&&item.appliedToPosition&&!item.settledByImport).map(item=>item.date).sort().at(-1);
    if(apply&&latestApplied&&date<latestApplied)throw Error('Registre primeiro as operações mais antigas deste investimento para manter o preço médio correto.');
    if(apply&&!['stocks','fii','international'].includes(position.category))throw Error('Atualização automática de cotas disponível para ações, FIIs e ativos internacionais em reais.');
    if(apply&&(!Number.isFinite(position.quantity)||position.quantity<0))throw Error('Informe primeiro a quantidade atual deste investimento.');
    if(apply&&type==='venda'&&position.quantity+1e-9<quantity)throw Error('A venda supera a quantidade disponível.');
    const id=`asset-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    let updated=position;
    if(apply){
      const nextQuantity=Math.round((position.quantity+(type==='compra'?quantity:-quantity))*1e8)/1e8;
      const price=position.unitPriceCents??(position.quantity>0?Math.round(position.amountCents/position.quantity):Math.round(amountCents/quantity));
      const previousCost=position.averagePriceCents==null?null:Math.round(position.averagePriceCents*position.quantity);
      const average=type==='compra'?(previousCost==null?(position.quantity===0?Math.round(amountCents/quantity):null):Math.round((previousCost+amountCents)/nextQuantity)):position.averagePriceCents;
      updated={...position,quantity:nextQuantity,averagePriceCents:nextQuantity?average:null,investedCents:nextQuantity&&average!=null?Math.round(nextQuantity*average):null,amountCents:Math.round(nextQuantity*price),manualAt:`${date}T12:00:00-03:00`,quoteAt:'',dayChangePercent:null,dayChangeCents:null};
    }
    const event={id,positionId:position.id,name:position.name,type,date,amountCents,quantity:type==='provento'?null:quantity,note:String(input.note||'').slice(0,120),appliedToPosition:apply,positionBefore:apply?position:null,positionAfter:apply?updated:null};
    return validate({...data,positions:apply?data.positions.map(item=>item.id===position.id?updated:item):data.positions,assetEvents:[...(data.assetEvents||[]),event],lastEdited:new Date().toISOString(),lastQuoteRefresh:apply?'':data.lastQuoteRefresh});
  }
  function removeAssetEvent(data,id){
    const event=(data.assetEvents||[]).find(item=>item.id===id);
    if(!event||event.id.startsWith('xp-note-'))throw Error('Operação não encontrada ou importada da XP.');
    if(!event.appliedToPosition)return validate({...data,assetEvents:data.assetEvents.filter(item=>item.id!==id)});
    if(event.settledByImport)throw Error('A operação já foi consolidada por uma nova posição XP. Corrija a posição atual se necessário.');
    const later=(data.assetEvents||[]).some(item=>item!==event&&item.positionId===event.positionId&&item.appliedToPosition&&item.id>event.id);
    if(later)throw Error('Remova primeiro as operações posteriores deste investimento.');
    const current=data.positions.find(item=>item.id===event.positionId),after=event.positionAfter,before=event.positionBefore;
    if(!current||!after||!before||current.quantity!==after.quantity||current.averagePriceCents!==after.averagePriceCents||current.investedCents!==after.investedCents||current.quoteAt!==after.quoteAt||current.manualAt!==after.manualAt)throw Error('A posição foi modificada depois desta operação. Confira as cotas antes de corrigir o histórico.');
    return validate({...data,positions:data.positions.map(item=>item.id===event.positionId?before:item),assetEvents:data.assetEvents.filter(item=>item.id!==id),lastEdited:new Date().toISOString(),lastQuoteRefresh:''});
  }
  function recordSnapshot(data,date){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Data do registro patrimonial inválida.');
    const item={date,totalCents:summarize(data).totalCents,netFlowCents:cashFlowSummary(data)};
    const snapshots=[...(data.snapshots||[]).filter(row=>row.date!==date),item].sort((a,b)=>a.date.localeCompare(b.date)).slice(-3660);
    return validate({...data,snapshots});
  }
  function portfolioPeriod(data,from,to){
    const points=(data.snapshots||[]).filter(item=>item.date>=from&&item.date<=to).sort((a,b)=>a.date.localeCompare(b.date));
    if(points.length<2)return null;
    const first=points[0],last=points.at(-1),flow=last.netFlowCents-first.netFlowCents;
    return {first,last,changeCents:last.totalCents-first.totalCents,netFlowCents:flow,changeExcludingFlowsCents:last.totalCents-first.totalCents-flow};
  }
  function costSummary(data){
    let currentCents=0,costCents=0,count=0;
    for(const p of data.positions){
      if(p.currency!=='BRL')continue;
      const cost=p.investedCents??(p.quantity!=null&&p.averagePriceCents!=null?Math.round(p.quantity*p.averagePriceCents):null);
      if(cost!=null&&cost>0){currentCents+=p.amountCents;costCents+=cost;count++;}
    }
    return {count,currentCents,costCents,differenceCents:currentCents-costCents,uncovered:data.positions.length-count};
  }
  function cashFlowSummary(data){return (data.cashFlows||[]).reduce((sum,f)=>sum+(f.type==='aporte'?f.amountCents:-f.amountCents),0);}
  function quotesRefreshDue(data,now=new Date()){
    const checked=Date.parse(data?.lastQuoteRefresh);
    return !Number.isFinite(checked)||now.getTime()-checked>=24*60*60*1000;
  }
  function quoteStatus(position,now=new Date()){
    if(position.quoteAt){const age=(now.getTime()-Date.parse(position.quoteAt))/864e5;return Number.isFinite(age)&&age>=0&&age<=2?{kind:'recent',label:'Cotação recente'}:{kind:'stale',label:'Cotação antiga'};}
    if(position.manualAt)return {kind:'manual',label:'Valor informado'};
    return {kind:'manual',label:'Sem cotação consultada'};
  }
  function variableTrend(position){
    const quantity=Number(position.quantity),price=Number(position.unitPriceCents);
    const costCents=position.investedCents??(Number.isFinite(quantity)&&quantity>0&&Number.isFinite(position.averagePriceCents)?Math.round(quantity*position.averagePriceCents):null);
    const cost=costCents>0?{deltaCents:position.amountCents-costCents,percent:(position.amountCents-costCents)/costCents*100}:null;
    const prior=Number(position.previousUnitPriceCents);
    const lastQuote=position.quoteAt&&position.previousQuoteAt&&Number.isFinite(price)&&Number.isFinite(prior)&&prior>0&&Number.isFinite(quantity)&&quantity>0?{deltaCents:Math.round((price-prior)*quantity),percent:(price-prior)/prior*100,at:position.previousQuoteAt}:null;
    return {cost,lastQuote};
  }
  function dayMovement(position,now=new Date()){
    const quote=new Date(position.quoteAt),today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'});
    if(!Number.isFinite(quote.getTime())||today.format(quote)!==today.format(now)||!Number.isFinite(position.dayChangePercent))return null;
    return {percent:position.dayChangePercent,cents:position.dayChangeCents};
  }
  function priceHistory(raw){
    const points=(Array.isArray(raw)?raw:[]).map(item=>({date:Number(item.date),close:Number(item.adjustedClose??item.close)})).filter(item=>Number.isFinite(item.date)&&Number.isFinite(item.close)&&item.close>0).sort((a,b)=>a.date-b.date);
    if(points.length<2)return null;
    const first=points[0],last=points[points.length-1];
    return {points,first,last,changePercent:(last.close-first.close)/first.close*100};
  }
  function diagnostics(data,now=new Date()){
    const notes=[],days=date=>{const delta=now.getTime()-new Date(date).getTime();return Number.isFinite(delta)?delta/864e5:Infinity;};
    if(!data.positions.length)return ['Nenhuma posição cadastrada.'];
    if(days(data.asOf)>7)notes.push('A posição importada tem mais de 7 dias; compras e vendas recentes podem não aparecer.');
    const eligible=data.positions.filter(p=>quoteTicker(p));
    const unsupported=data.positions.filter(p=>p.kind==='market'&&!quoteTicker(p)&&!cryptoTicker(p)).length;
    const missing=eligible.filter(p=>!p.quoteAt).length,stale=eligible.filter(p=>p.quoteAt&&days(p.quoteAt)>2).length;
    if(missing)notes.push(`${missing} ativo(s) negociado(s) sem cotação consultada no Forja.`);
    if(stale)notes.push(`${stale} cotação(ões) com mais de 2 dias.`);
    if(unsupported)notes.push(`${unsupported} ativo(s) sem atualização automática de preço; o valor informado foi mantido.`);
    if(data.positions.some(p=>p.category==='crypto'&&p.quantity==null))notes.push('Bitcoin sem quantidade: o valor não pode ser recalculado automaticamente.');
    if(data.positions.some(p=>p.currency==='USD')&&days(data.fx['USD/BRL'].asOf)>3)notes.push('Conversão do dólar sem atualização recente.');
    return notes.length?notes:['Carteira conferida: nenhuma pendência básica encontrada.'];
  }
  return {CATEGORIES,validate,quoteTicker,applyQuote,isBitcoinPosition,cryptoTicker,applyCryptoQuote,recordBtcPurchase,removeBtcPurchase,toBrlCents,summarize,money,percent,mergeXp,previewXp,applyXpNote,recordAssetEvent,removeAssetEvent,recordSnapshot,portfolioPeriod,costSummary,cashFlowSummary,quotesRefreshDue,quoteStatus,variableTrend,dayMovement,priceHistory,diagnostics};
});
