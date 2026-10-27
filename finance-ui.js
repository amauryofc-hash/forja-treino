(function(root){
  'use strict';
  const core=root.ForjaFinanceCore,KEY='finance-position-v1',TOKEN_KEY='forjatreino:brapi-token-v1',PRIVATE_KEY='forjatreino:finance-values-hidden-v1';
  if(!core||!root.document)return;
  const empty=()=>({format:'forja-finance-position',version:1,asOf:'',fx:{'USD/BRL':{rate:1,asOf:'',estimated:true}},positions:[],receivables:{amountCents:0,currency:'BRL'},provenance:''});
  let state=empty();
  let refreshing=false,savingBtc=false,savingAsset=false,savingProvent=false,savingWatch=false,lastQuoteFailures=[];
  let valuesHidden=false;
  let pendingXp=null,pendingNote=null,lastFxAttempt=0;
  const readToken=()=>{try{return root.localStorage.getItem(TOKEN_KEY)||'';}catch{return '';}};
  const $=id=>document.getElementById(id);
  const escape=s=>String(s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const num=value=>Number(String(value).replace(',','.'));
  const shortDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))?String(value).split('-').reverse().join('/'):Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(value)):'sem data';
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  function applyPrivacy(){
    document.body.classList.toggle('finance-values-hidden',valuesHidden);
    const button=$('finance-privacy-toggle');
    button.setAttribute('aria-pressed',String(valuesHidden));
    button.setAttribute('aria-label',valuesHidden?'Mostrar valores':'Ocultar valores');
    button.textContent=valuesHidden?'◉ Mostrar valores':'👁 Ocultar valores';
    for(const item of document.querySelectorAll('#finance-main .finance-sensitive'))item.setAttribute('aria-hidden',String(valuesHidden));
  }
  function togglePrivacy(){
    valuesHidden=!valuesHidden;
    try{root.localStorage.setItem(PRIVATE_KEY,valuesHidden?'1':'0');}catch{}
    applyPrivacy();
  }
  function positionLabel(p){
    if(p.quoteAt)return `Cotação brapi ${new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(p.quoteAt))}`;
    if(p.manualAt)return `Ajustado manualmente ${shortDate(p.manualAt)}`;
    if(p.source==='XP')return `Posição XP ${state.asOf?shortDate(state.asOf):'sem data'}`;
    return `${p.source||'manual'} · valor informado`;
  }
  function quantityLabel(p){
    if(p.source==='XP'&&p.manualAt&&p.manualAt.slice(0,10)>String(state.asOf||'').slice(0,10))return `posição XP + operação de ${shortDate(p.manualAt)}`;
    if(p.source==='XP')return `posição XP ${shortDate(state.asOf)}`;
    return p.manualAt?`ajuste manual ${shortDate(p.manualAt)}`:'valor informado';
  }
  function dateLabel(value){if(!value)return 'Sem posição importada';const d=new Date(value);return Number.isNaN(d.getTime())?'Data não informada':`Posição base: ${new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'}).format(d)}`;}
  async function persist(){state=core.recordSnapshot(state,today());await root.storage.set(KEY,JSON.stringify(state));render();}
  async function load(){
    await root.ForjaAppVariant?.resolve();
    try{const record=await root.storage.get(KEY);if(record?.value){
      state=core.validate(JSON.parse(record.value));
      if(document.body.dataset.forjaVariant!=='shared'){
        try{
          const response=await fetch('finance-seed.json',{cache:'no-store'});
          if(response.ok){const seed=core.validate(await response.json()),saved=state.positions.find(p=>p.id==='bitcoin'),initial=seed.positions.find(p=>p.id==='bitcoin');
            if(saved&&saved.quantity==null&&initial?.quantity>0){state=core.validate({...state,positions:state.positions.map(p=>p.id==='bitcoin'?{...p,kind:'market',quantity:initial.quantity}:p),lastQuoteRefresh:''});await persist();}
          }
        }catch{} // A posição salva permanece intacta quando o arquivo inicial não está disponível.
      }
      return;
    }}catch(error){console.warn('Finanças: posição salva inválida',error);}
    if(document.body.dataset.forjaVariant==='shared')return;
    try{
      const response=await fetch('finance-seed.json',{cache:'no-store'});
      if(!response.ok)return;
      state=core.validate(await response.json());
      await persist();
    }catch{} // A prévia em arquivo local pode importar pelo seletor, sem seed empacotado.
  }
  function render(){
    const summary=core.summarize(state),has=state.positions.length>0;
    $('finance-total').textContent=(state.positions.some(p=>p.currency==='USD')&&state.fx['USD/BRL'].estimated?'≈ ':'')+core.money(summary.totalCents);
    $('finance-receivables').textContent=core.money(summary.receivablesCents);
    $('finance-date').textContent=dateLabel(state.asOf)+(state.lastEdited?' · editada depois':'');
    const fx=state.fx['USD/BRL'];
    $('finance-value-note').textContent=has?(state.positions.some(p=>p.currency==='USD')?`Inclui dólar convertido a R$ ${new Intl.NumberFormat('pt-BR',{maximumFractionDigits:4}).format(fx.rate)} (${fx.source}, ${fx.asOf||'sem data'}). Os valores têm datas diferentes.`:'Valores informados ou atualizados em datas diferentes; confira cada posição.'):'Comece importando ou cadastrando sua posição.';
    $('finance-health-notes').innerHTML=core.diagnostics(state).map(note=>`<p>• ${escape(note)}</p>`).join('');
    const cost=core.costSummary(state);
    $('finance-cost-result').textContent=cost.count?`${cost.differenceCents>=0?'+':'−'} ${core.money(Math.abs(cost.differenceCents))}`:'—';
    $('finance-cost-note').textContent=cost.count?`Base: ${cost.count} de ${state.positions.length} posições com custo. Diferença bruta, sem proventos, impostos ou taxas; não é rentabilidade total.`:'Sem posições com custo cadastrado.';
    $('finance-flow-total').textContent=core.money(core.cashFlowSummary(state));
    $('finance-flow-list').innerHTML=(state.cashFlows||[]).slice().sort((a,b)=>b.date.localeCompare(a.date)).map(flow=>`<div class="finance-flow-row"><span>${flow.type==='aporte'?'Aporte':'Retirada'} · ${escape(flow.date.split('-').reverse().join('/'))}${flow.note?` · ${escape(flow.note)}`:''}</span><strong class="finance-sensitive">${core.money(flow.amountCents)}</strong><button type="button" data-finance-flow-remove="${escape(flow.id)}" aria-label="Remover movimentação">Remover</button></div>`).join('')||'<p>Nenhum aporte ou retirada registrado.</p>';
    const eligible=state.positions.filter(p=>core.quoteTicker(p)||core.cryptoTicker(p)).length;
    $('finance-quotes-status').textContent=(state.lastQuoteRefresh?`Última consulta: ${new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(state.lastQuoteRefresh))} · ${eligible} ativos elegíveis. Não atualiza saldos nem quantidades.`:`${eligible} ativos elegíveis. Saldos e quantidades permanecem como foram importados.`)+(lastQuoteFailures.length?` Sem atualização: ${lastQuoteFailures.join('; ')}.`:'');
    $('finance-source').textContent=has?`Origem: ${state.provenance||'cadastro manual'}. Proventos provisionados aparecem separados. Ativos em custódia remunerada não são somados novamente.`:'Nenhuma posição foi importada neste aparelho.';
    $('finance-fx-rate').value=fx.rate===1&&!has?'':String(fx.rate);
    $('finance-position-count').textContent=has?`${state.positions.length} posições · toque em Editar para corrigir um valor.`:'Nenhuma posição cadastrada.';
    $('finance-allocation').innerHTML=has?Object.entries(summary.byCategory).filter(([,cents])=>cents>0).sort((a,b)=>b[1]-a[1]).map(([category,cents])=>`<div class="finance-allocation-row"><span>${escape(core.CATEGORIES[category])}</span><div class="finance-allocation-track"><i class="finance-allocation-fill" style="width:${Math.max(0,Math.min(100,cents/Math.max(1,summary.totalCents)*100))}%"></i></div><strong>${core.percent(cents,summary.totalCents)}</strong></div>`).join(''):'<p>As classes aparecerão depois da primeira posição.</p>';
    const history=state.snapshots||[],period=core.portfolioPeriod(state,history[0]?.date||'',today());
    $('finance-history-summary').textContent=period?`De ${shortDate(period.first.date)} a ${shortDate(period.last.date)}: patrimônio ${period.changeCents>=0?'+':''}${core.money(period.changeCents)}; aportes menos retiradas ${period.netFlowCents>=0?'+':''}${core.money(period.netFlowCents)}. Diferença restante: ${period.changeExcludingFlowsCents>=0?'+':''}${core.money(period.changeExcludingFlowsCents)}. Não é rentabilidade apurada.`:history.length?'O primeiro registro foi salvo. A comparação aparecerá após um registro em outro dia.':'A evolução será registrada quando você salvar ou atualizar a carteira.';
    if(history.length>1){const values=history.map(item=>item.totalCents),min=Math.min(...values),max=Math.max(...values),span=max-min||1,path=history.map((item,i)=>`${i?'L':'M'}${(i/Math.max(1,history.length-1)*280).toFixed(1)},${(76-(item.totalCents-min)/span*68).toFixed(1)}`).join(' ');$('finance-history-chart').innerHTML=`<svg viewBox="0 0 280 84" role="img" aria-label="Evolução do patrimônio desde ${escape(shortDate(history[0].date))}"><path d="${path}" fill="none" stroke="#1b8f82" stroke-width="3" stroke-linejoin="round"/></svg><small>${escape(shortDate(history[0].date))} → ${escape(shortDate(history.at(-1).date))}</small>`;}else $('finance-history-chart').innerHTML='';
    const variable=state.positions.filter(p=>['stocks','fii','international','crypto'].includes(p.category));
    const signed=(value,currency)=>`${value>=0?'+':'−'} ${core.money(Math.abs(value),currency)}`;
    const movement=(result,label,currency)=>result?`<span class="finance-variable-movement finance-sensitive" data-direction="${result.deltaCents>0?'up':result.deltaCents<0?'down':'flat'}">${escape(label)}: ${signed(result.deltaCents,currency)} (${result.percent>=0?'+':''}${new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(result.percent)}%)</span>`:'';
    $('finance-variable-list').innerHTML=variable.length?variable.map(p=>{const trend=core.variableTrend(p),source=core.quoteStatus(p),name=escape(p.name),day=core.dayMovement(p),dayDirection=day?(day.percent>0?'up':day.percent<0?'down':'flat'):'flat',ticker=core.quoteTicker(p)||core.cryptoTicker(p);return `<details class="finance-variable-row" data-finance-variable="${escape(p.id)}"><summary><span><strong>${name}</strong><small>${escape(core.CATEGORIES[p.category])} · ${escape(source.label)} · ${escape(positionLabel(p))}</small></span><span class="finance-variable-price finance-sensitive">${p.unitPriceCents!=null?core.money(p.unitPriceCents,p.currency):'Preço indisponível'}<small>por unidade</small></span><span class="finance-variable-day" data-direction="${dayDirection}">${day?`${day.percent>=0?'+':''}${new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(day.percent)}% hoje`:'Aguardando cotação de hoje'}</span></summary><div class="finance-variable-detail"><p class="finance-sensitive">Valor da posição: <strong>${core.money(p.amountCents,p.currency)}</strong>. Variação do dia: ${day&&day.cents!=null?signed(day.cents,p.currency)+' por unidade':'aguardando cotação de hoje'}.</p><div class="finance-variable-comparisons">${movement(trend.cost,'Desde o custo informado',p.currency)}${movement(trend.lastQuote,'Desde a consulta anterior',p.currency)}</div><div class="finance-period-buttons">${[['5d','Semana'],['1mo','Mês'],['3mo','Trimestre'],['6mo','Semestre']].map(([range,label])=>`<button type="button" data-finance-period="${range}" ${ticker?'':'disabled'}>${label}</button>`).join('')}</div><div class="finance-period-result" role="status">${ticker?'Escolha um período para consultar a evolução do preço.':'Este ativo não tem código e quantidade para consultar histórico automaticamente.'}</div></div></details>`;}).join(''):'<p>Nenhuma ação, fundo imobiliário ou outro ativo de renda variável cadastrado.</p>';
    const groups=Object.keys(core.CATEGORIES).map(category=>({category,items:state.positions.filter(p=>p.category===category)})).filter(group=>group.items.length);
    $('finance-positions').innerHTML=groups.map(group=>{
      const total=group.items.reduce((sum,p)=>sum+core.toBrlCents(p,state.fx),0);
       return `<details class="finance-group"><summary><span>${escape(core.CATEGORIES[group.category])} <small>(${group.items.length})</small></span><strong class="finance-sensitive">${core.money(total)}</strong></summary><div>${group.items.map(p=>`<div class="finance-position"><div><strong>${escape(p.name)}</strong><small><span class="finance-quote-badge" data-status="${core.quoteStatus(p).kind}">${core.quoteStatus(p).label}</span> · Preço: ${escape(positionLabel(p))}</small><small>Cotas: ${p.quantity!=null?`<span class="finance-sensitive">${new Intl.NumberFormat('pt-BR',{maximumFractionDigits:p.category==='crypto'?8:4}).format(p.quantity)} ${p.category==='crypto'?'BTC':'un.'}</span> · `:''}${escape(quantityLabel(p))}</small></div><div class="finance-position-value finance-sensitive">${core.money(p.amountCents,p.currency)}${p.currency==='USD'?`<small>≈ ${core.money(core.toBrlCents(p,state.fx))}</small>`:''}</div><button type="button" data-finance-edit="${escape(p.id)}" aria-label="Editar ${escape(p.name)}">Editar</button></div>`).join('')}</div></details>`;
    }).join('')||'<p>Use “Adicionar” para criar sua primeira posição.</p>';
    const btc=state.positions.find(core.isBitcoinPosition);
    $('finance-btc-section').hidden=!btc;
    $('finance-btc-status').textContent=btc?`${new Intl.NumberFormat('pt-BR',{minimumFractionDigits:8,maximumFractionDigits:8}).format(btc.quantity)} BTC · ${core.money(btc.amountCents)}${btc.quoteAt?' · cotação consultada '+shortDate(btc.quoteAt):' · valor informado'}`:'';
    $('finance-btc-trades').innerHTML=(state.cryptoTrades||[]).slice().reverse().map(t=>`<div class="finance-flow-row"><span>Compra · ${escape(t.date.split('-').reverse().join('/'))} · <span class="finance-sensitive">${new Intl.NumberFormat('pt-BR',{minimumFractionDigits:8,maximumFractionDigits:8}).format(t.quantity)} BTC</span></span><strong class="finance-sensitive">${core.money(t.amountCents)}</strong><button type="button" data-finance-btc-remove="${escape(t.id)}" aria-label="Remover compra de Bitcoin">Remover</button></div>`).join('');
    $('finance-asset-event-position').innerHTML=state.positions.filter(p=>p.currency==='BRL'&&['stocks','fii','international'].includes(p.category)).map(p=>`<option value="${escape(p.id)}">${escape(p.name)}</option>`).join('');
    $('finance-provent-position').innerHTML=state.positions.filter(p=>p.currency==='BRL'&&['stocks','fii','international'].includes(p.category)).map(p=>`<option value="${escape(p.id)}">${escape(p.name)}</option>`).join('');
    const proventTotals=(state.provents||[]).reduce((sum,item)=>(sum[item.status]+=item.amountCents,sum),{announced:0,estimated:0,received:0});
    $('finance-provent-summary').textContent=`Recebidos ${core.money(proventTotals.received)} · anunciados ${core.money(proventTotals.announced)} · estimados ${core.money(proventTotals.estimated)}. Não somados ao patrimônio.`;
    $('finance-provent-list').innerHTML=(state.provents||[]).slice().sort((a,b)=>a.date.localeCompare(b.date)).map(item=>`<div class="finance-flow-row"><span>${escape(item.name)} · ${escape(item.date.split('-').reverse().join('/'))} · ${item.status==='received'?'Recebido':item.status==='announced'?'Anunciado':'Estimado por você'}</span><strong class="finance-sensitive">${core.money(item.amountCents)}</strong>${item.status!=='received'?`<button type="button" data-finance-provent-received="${escape(item.id)}">Marcar recebido</button>`:''}<button type="button" data-finance-provent-remove="${escape(item.id)}">Remover</button></div>`).join('')||'<p>Nenhum provento na agenda.</p>';
    $('finance-watchlist-list').innerHTML=(state.watchlist||[]).map(code=>{const alert=state.watchAlerts?.[code];return `<div class="finance-flow-row"><strong>${escape(code)}${alert?`<small> Aviso se ${alert.type==='above'?'acima':'abaixo'} de ${core.money(alert.priceCents)}</small>`:''}</strong><span id="finance-watch-${escape(code)}" class="finance-sensitive" role="status">Sem consulta nesta sessão</span><button type="button" data-finance-watch-quote="${escape(code)}">Consultar</button><button type="button" data-finance-watch-remove="${escape(code)}">Remover</button></div>`;}).join('')||'<p>Nenhum ativo acompanhado fora da carteira.</p>';
    const events=state.assetEvents||[];
    const totals=events.reduce((out,item)=>(out[item.type]+=item.amountCents,out),{compra:0,venda:0,provento:0});
    $('finance-asset-event-summary').textContent=events.length?`${events.length} operação(ões) · compras ${core.money(totals.compra)} · vendas ${core.money(totals.venda)} · proventos ${core.money(totals.provento)}. Histórico parcial; não representa lucro.`:'Nenhuma operação registrada ainda.';
    $('finance-asset-event-list').innerHTML=events.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(item=>`<div class="finance-flow-row"><span>${escape(item.name)} · ${item.type==='compra'?'Compra':item.type==='venda'?'Venda':'Provento'} · ${escape(item.date.split('-').reverse().join('/'))}${item.quantity!=null?` · <span class="finance-sensitive">${new Intl.NumberFormat('pt-BR',{maximumFractionDigits:8}).format(item.quantity)} un.</span>`:''}${item.appliedToPosition?' · cotas atualizadas':item.type!=='provento'?' · só histórico':''}${item.note?` · ${escape(item.note)}`:''}</span><strong class="finance-sensitive">${core.money(item.amountCents)}</strong>${item.id.startsWith('xp-note-')?'<span>Importado da XP</span>':`<button type="button" data-finance-asset-event-remove="${escape(item.id)}" aria-label="Remover operação">Remover</button>`}</div>`).join('');
    applyPrivacy();
  }
  function switchArea(area){
    const finance=area==='finance';
    document.body.dataset.appArea=finance?'finance':'training';
    $('forja-brand-title').innerHTML=finance?'FORJA<span class="dot">.</span>FINANÇAS':'FORJA<span class="dot">.</span>TREINO';
    document.title=finance?'Forja.Finanças':'Forja.Treino';
    $('training-main').hidden=finance;
    $('finance-main').hidden=!finance;
    $('forja-area-training').setAttribute('aria-pressed',String(!finance));
    $('forja-area-finance').setAttribute('aria-pressed',String(finance));
    if(finance){
      render();
      if(readToken()&&core.quotesRefreshDue(state))refreshQuotes();
      const fxDate=Date.parse(state.fx['USD/BRL'].asOf);
      if(state.positions.some(p=>p.currency==='USD')&&(!Number.isFinite(fxDate)||Date.now()-fxDate>3*864e5)&&Date.now()-lastFxAttempt>864e5)refreshFx();
    }
    try{localStorage.setItem('forjatreino:app-area-v1',finance?'finance':'training');}catch{}
  }
  function openEditor(id){
    const p=state.positions.find(item=>item.id===id);
    $('finance-form').reset();
    $('finance-form-error').textContent='';
    $('finance-edit-id').value=p?.id||'';
    $('finance-edit-name').value=p?.name||'';
    $('finance-edit-category').value=p?.category||'stocks';
    $('finance-edit-currency').value=p?.currency||'BRL';
    $('finance-edit-amount').value=p?(p.amountCents/100).toFixed(2):'';
    $('finance-edit-quantity').value=p?.quantity??'';
    $('finance-edit-average').value=p?.averagePriceCents!=null?(p.averagePriceCents/100).toFixed(2):'';
    $('finance-edit-unit').value=p?.unitPriceCents!=null?(p.unitPriceCents/100).toFixed(2):'';
    $('finance-editor-title').textContent=p?'Editar posição':'Adicionar investimento';
    $('finance-editor').showModal();
  }
  async function saveForm(event){
    event.preventDefault();
    const id=$('finance-edit-id').value||`manual-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const previous=state.positions.find(p=>p.id===id);
    const amount=num($('finance-edit-amount').value),quantity=$('finance-edit-quantity').value===''?null:num($('finance-edit-quantity').value);
    const average=$('finance-edit-average').value===''?null:num($('finance-edit-average').value),unit=$('finance-edit-unit').value===''?null:num($('finance-edit-unit').value);
    if(!Number.isFinite(amount)||Math.abs(amount)>1e10||quantity!=null&&(!Number.isFinite(quantity)||quantity<0)||[average,unit].some(v=>v!=null&&(!Number.isFinite(v)||v<0))){$('finance-form-error').textContent='Confira os valores informados.';return;}
    if($('finance-edit-currency').value==='USD'&&state.fx['USD/BRL'].rate===1){$('finance-form-error').textContent='Informe a conversão do dólar em “Importar uma posição” antes de salvar.';return;}
    const item={id,name:$('finance-edit-name').value.trim(),category:$('finance-edit-category').value,kind:quantity!=null?'market':'balance',currency:$('finance-edit-currency').value,amountCents:Math.round(amount*100),quantity,averagePriceCents:average==null?null:Math.round(average*100),unitPriceCents:unit==null?null:Math.round(unit*100),investedCents:previous?.investedCents??null,source:previous?.source||'manual',quoteAt:'',manualAt:new Date().toISOString()};
    const before=state;
    try{
      const candidate={...state,positions:previous?state.positions.map(p=>p.id===id?item:p):[...state.positions,item],asOf:state.asOf||new Date().toISOString(),lastQuoteRefresh:'',lastEdited:new Date().toISOString()};
      state=core.validate(candidate);await persist();$('finance-editor').close();
    }catch(error){state=before;$('finance-form-error').textContent=error.message||'Não foi possível salvar.';}
  }
  async function importFile(event){
    const file=event.target.files?.[0];if(!file)return;
    try{
      const incoming=core.validate(JSON.parse(await file.text()));
      if(state.positions.length&&!confirm(`Substituir as ${state.positions.length} posições atuais pelas ${incoming.positions.length} posições do arquivo?`))return;
      const before=state;state=core.validate({...incoming,cashFlows:incoming.cashFlows.length?incoming.cashFlows:state.cashFlows,assetEvents:incoming.assetEvents.length?incoming.assetEvents:state.assetEvents,watchlist:incoming.watchlist.length?incoming.watchlist:state.watchlist,watchAlerts:Object.keys(incoming.watchAlerts).length?incoming.watchAlerts:state.watchAlerts,provents:incoming.provents.length?incoming.provents:state.provents});
      try{await persist();}catch(error){state=before;render();throw error;}
    }catch(error){alert(error.message||'Não foi possível ler o arquivo.');}
    finally{event.target.value='';}
  }
  async function importXpFile(event){
    const file=event.target.files?.[0];if(!file)return;
    try{
      const parsed=await root.ForjaFinanceXp.parse(await file.arrayBuffer());
      const next=core.mergeXp(state,parsed),preview=core.previewXp(state,next);
      pendingXp=next;
      const quantityChanges=preview.quantityChanges.map(item=>`${item.name}: ${item.before??'ausente'} → ${item.after??'ausente'}`).join('; ');
      $('finance-xp-preview-text').textContent=`Posição XP de ${parsed.asOf.slice(0,10).split('-').reverse().join('/')}. ${preview.added} novo(s), ${preview.changed} alterado(s), ${preview.removed} ausente(s) na nova planilha. ${preview.preserved} valor(es) manuais preservados. ${quantityChanges?'Cotas: '+quantityChanges+'. ':'Nenhuma mudança de cotas. '}Patrimônio: ${core.money(preview.oldTotalCents)} → ${core.money(preview.newTotalCents)}. Proventos provisionados: ${core.money(next.receivables.amountCents)}. Confira se esta é a posição completa antes de aplicar.`;
      $('finance-xp-preview').showModal();
    }catch(error){alert(error.message||'Não foi possível ler a planilha XP. Nenhum dado foi alterado.');}
    finally{event.target.value='';}
  }
  async function confirmXp(){
    if(!pendingXp)return;
    const previous=state;
    try{state=pendingXp;await persist();pendingXp=null;$('finance-xp-preview').close();}
    catch(error){state=previous;render();alert('Não foi possível salvar a nova posição. A carteira anterior foi mantida.');}
  }
  function cancelXp(){pendingXp=null;$('finance-xp-preview').close();}
  async function importNoteFile(event){
    const file=event.target.files?.[0];if(!file)return;
    try{
      const parsed=await root.ForjaFinanceNote.parse(await file.arrayBuffer());
      const next=core.applyXpNote(state,parsed),applied=parsed.date>String(state.asOf||'').slice(0,10);
      const preview=core.previewXp(state,next);
      pendingNote=next;
      const changes=preview.quantityChanges.map(item=>`${item.name}: ${item.before??'ausente'} → ${item.after??'ausente'}`).join('; ');
      $('finance-note-preview-text').textContent=`Nota XP ${parsed.noteNumber} de ${parsed.date.split('-').reverse().join('/')}. ${parsed.trades.length} operação(ões). ${applied?'Cotas que mudarão: '+(changes||'nenhuma')+'.':'Essa nota é anterior ou da mesma data da posição base; ela entrará apenas no histórico, sem alterar cotas.'} Confira as operações antes de aplicar.`;
      $('finance-note-preview-list').innerHTML=parsed.trades.map(trade=>`<li>${trade.type==='compra'?'Compra':'Venda'} · ${escape(trade.name)} · ${trade.quantity} cotas · ${core.money(trade.amountCents)}</li>`).join('');
      $('finance-note-preview').showModal();
    }catch(error){pendingNote=null;alert(error.message||'Não foi possível ler a nota XP. Nenhum dado foi alterado.');}
    finally{event.target.value='';}
  }
  async function confirmNote(){
    if(!pendingNote)return;
    const previous=state;
    try{state=pendingNote;await persist();pendingNote=null;$('finance-note-preview').close();}
    catch{state=previous;render();alert('Não foi possível salvar a nota. Os dados anteriores foram mantidos.');}
  }
  function cancelNote(){pendingNote=null;$('finance-note-preview').close();}
  async function saveFlow(event){
    event.preventDefault();
    const amount=num($('finance-flow-amount').value),date=$('finance-flow-date').value,type=$('finance-flow-type').value;
    if(!Number.isFinite(amount)||amount<=0||amount>1e10||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!['aporte','retirada'].includes(type)){alert('Confira a movimentação.');return;}
    const previous=state;
    try{
      const flow={id:`flow-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,type,date,amountCents:Math.round(amount*100),note:$('finance-flow-note').value.trim()};
      state=core.validate({...state,cashFlows:[...(state.cashFlows||[]),flow]});await persist();$('finance-flow-form').reset();$('finance-flow-date').value=new Date().toISOString().slice(0,10);
    }catch{state=previous;render();alert('Não foi possível salvar a movimentação.');}
  }
  async function removeFlow(id){
    if(!confirm('Remover esta movimentação do histórico?'))return;
    const previous=state;
    try{state=core.validate({...state,cashFlows:(state.cashFlows||[]).filter(f=>f.id!==id)});await persist();}
    catch{state=previous;render();alert('Não foi possível remover a movimentação.');}
  }
  async function saveAssetEvent(event){
    event.preventDefault();
    if(savingAsset)return;
    const position=state.positions.find(p=>p.id===$('finance-asset-event-position').value);
    const type=$('finance-asset-event-type').value,date=$('finance-asset-event-date').value,amount=num($('finance-asset-event-amount').value),quantity=num($('finance-asset-event-quantity').value);
    if(!position||!['compra','venda','provento'].includes(type)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(amount)||amount<=0||type!=='provento'&&(!Number.isFinite(quantity)||quantity<=0)){alert('Confira investimento, data, valor e quantidade.');return;}
    const previous=state;savingAsset=true;
    try{
      const updatePosition=type!=='provento'&&$('finance-asset-event-update').checked;
      const message=updatePosition?`${type==='compra'?'Somar':'Subtrair'} ${quantity} unidade(s) de ${position.name} e registrar ${core.money(Math.round(amount*100))}?`:`Registrar ${type} de ${position.name} apenas no histórico, sem alterar as cotas?`;
      if(!confirm(message))return;
      state=core.recordAssetEvent(state,{positionId:position.id,type,date,amountCents:Math.round(amount*100),quantity:type==='provento'?null:quantity,note:$('finance-asset-event-note').value.trim(),updatePosition});
      await persist();$('finance-asset-event-form').reset();$('finance-asset-event-date').value=today();
    }
    catch(error){state=previous;render();alert(error.message||'Não foi possível salvar a operação.');}
    finally{savingAsset=false;}
  }
  async function removeAssetEvent(id){
    if(id.startsWith('xp-note-'))return;
    if(!confirm('Remover esta operação do histórico?'))return;
    const previous=state;
    try{state=core.removeAssetEvent(state,id);await persist();}
    catch(error){state=previous;render();alert(error.message||'Não foi possível remover a operação.');}
  }
  async function updateFx(){
    const rate=num($('finance-fx-rate').value);
    if(!Number.isFinite(rate)||rate<=0||rate>1000){alert('Informe uma conversão válida.');return;}
    const previous=state;
    state=core.validate({...state,fx:{'USD/BRL':{rate,asOf:new Date().toISOString().slice(0,10),estimated:false,source:'manual'}},lastEdited:new Date().toISOString()});
    try{await persist();$('finance-fx-status').textContent='Câmbio manual salvo.';}
    catch{state=previous;render();$('finance-fx-status').textContent='Não foi possível salvar o câmbio.';}
  }
  async function refreshFx(){
    lastFxAttempt=Date.now();
    $('finance-fx-status').textContent='Consultando câmbio oficial…';
    try{
      const end=new Date(),start=new Date(end.getTime()-10*864e5);
      const format=d=>`${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}-${d.getUTCFullYear()}`;
      const url=`https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?%40moeda='USD'&%40dataInicial='${format(start)}'&%40dataFinalCotacao='${format(end)}'&%24format=json&%24top=100`;
      const response=await root.fetch(url,{signal:AbortSignal.timeout(10000),cache:'no-store'});
      if(!response.ok)throw Error(`HTTP ${response.status}`);
      const rows=(await response.json()).value||[];
      const closing=rows.filter(item=>item.tipoBoletim==='Fechamento'&&Number(item.cotacaoVenda)>0).sort((a,b)=>String(b.dataHoraCotacao).localeCompare(String(a.dataHoraCotacao)))[0];
      if(!closing||!Number.isFinite(Number(closing.cotacaoVenda)))throw Error('Sem cotação de fechamento recente.');
      const rate=Number(closing.cotacaoVenda);
      if(rate<=0||rate>1000)throw Error('Cotação fora do intervalo esperado.');
      const previous=state;
      try{state=core.validate({...state,fx:{'USD/BRL':{rate,asOf:String(closing.dataHoraCotacao).slice(0,10),estimated:false,source:'BCB PTAX'}}});await persist();}
      catch(error){state=previous;render();throw error;}
      $('finance-fx-status').textContent=`PTAX de ${state.fx['USD/BRL'].asOf}: R$ ${rate.toFixed(4).replace('.',',')} por US$ 1.`;
    }catch(error){$('finance-fx-status').textContent='Câmbio indisponível. O valor anterior foi mantido; você pode informar manualmente.';console.warn('PTAX indisponível',error?.message||error);}
  }
  async function refreshAllFinance(){
    const button=$('finance-refresh-all');
    if(button.disabled)return;
    button.disabled=true;
    try{
      await refreshQuotes();
      if(state.positions.some(p=>p.currency==='USD'))await refreshFx();
    }finally{button.disabled=false;}
  }
  async function refreshQuotes(){
    if(refreshing)return;
    const token=readToken(),eligible=state.positions.filter(p=>core.quoteTicker(p)||core.cryptoTicker(p));
    if(!token){$('finance-quotes-status').textContent='Configure seu token gratuito da brapi para atualizar as cotações.';return;}
    if(!eligible.length){$('finance-quotes-status').textContent='Nenhum ativo com código e quantidade para consultar.';return;}
    refreshing=true;$('finance-quotes-refresh').disabled=true;
    const targetState=state;
    const priorPositions=state.positions,priorRefresh=state.lastQuoteRefresh;
    let success=0,failed=0;const failures=[];
    try{
      let cursor=0;
      await Promise.all(Array.from({length:Math.min(1,eligible.length)},async()=>{
        while(cursor<eligible.length){
          const position=eligible[cursor++];
          try{
            const isCrypto=core.cryptoTicker(position)==='BTC';
            const url=isCrypto?'https://brapi.dev/api/v2/crypto?coin=BTC&currency=BRL':`https://brapi.dev/api/quote/${encodeURIComponent(core.quoteTicker(position))}`;
            const response=await root.fetch(url,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(8000),cache:'no-store'});
            if(!response.ok)throw Error(`HTTP ${response.status}`);
            const payload=await response.json();
            const result=isCrypto?payload.coins?.[0]:payload.results?.[0];
            const updated=isCrypto?core.applyCryptoQuote(position,result,new Date().toISOString()):core.applyQuote(position,result,new Date().toISOString());
            if(state!==targetState)continue;
            state.positions=state.positions.map(p=>p.id===position.id?updated:p);success++;
          }catch(error){failed++;const code=core.cryptoTicker(position)||core.quoteTicker(position);const reason=/HTTP 403/.test(error?.message)?'plano sem acesso':/HTTP 401/.test(error?.message)?'token inválido':/HTTP 429/.test(error?.message)?'limite de consultas':/HTTP 404/.test(error?.message)?'código não encontrado':/Cotação incompatível/.test(error?.message)?'resposta incompatível':'consulta indisponível';failures.push(`${code}: ${reason}`);console.warn('Cotação indisponível para',code,error?.message||error);}
          $('finance-quotes-status').textContent=`Consultadas ${success+failed} de ${eligible.length} cotações…`;
        }
      }));
      if(state!==targetState){$('finance-quotes-status').textContent='A carteira mudou durante a consulta. Atualize novamente para usar a nova posição.';return;}
      lastQuoteFailures=failures;
      state.lastQuoteRefresh=new Date().toISOString();await persist();
      $('finance-quotes-status').textContent=`${success} cotação(ões) atualizada(s); ${failed} sem atualização.${failures.length?' Falharam: '+failures.join('; ')+'.':''} Valores anteriores foram mantidos. Fonte: brapi, com possível atraso.`;
    }catch(error){if(state===targetState){state.positions=priorPositions;state.lastQuoteRefresh=priorRefresh;render();}$('finance-quotes-status').textContent='Não foi possível salvar as cotações. Tente novamente.';console.error(error);}
    finally{refreshing=false;$('finance-quotes-refresh').disabled=false;}
  }
  async function saveBtcPurchase(event){
    event.preventDefault();
    if(savingBtc)return;
    savingBtc=true;
    const button=$('finance-btc-form').querySelector('button[type="submit"]');
    button.disabled=true;
    const previous=state;
    try{
      const quantity=num($('finance-btc-quantity').value),amount=num($('finance-btc-amount').value);
      state=core.recordBtcPurchase(state,{date:$('finance-btc-date').value,amountCents:Math.round(amount*100),quantity});
      await persist();$('finance-btc-form').reset();$('finance-btc-date').value=new Date().toISOString().slice(0,10);
      $('finance-btc-status').textContent+=' · Compra registrada. Atualize as cotações para conferir o valor atual.';
    }catch(error){state=previous;render();$('finance-btc-status').textContent=error?.message||'Não foi possível salvar a compra.';}
    finally{savingBtc=false;button.disabled=false;}
  }
  async function removeBtcPurchase(id){
    if(!confirm('Remover esta compra e subtrair o BTC da posição?'))return;
    const previous=state;
    try{state=core.removeBtcPurchase(state,id);await persist();$('finance-btc-status').textContent+=' · Compra removida. Atualize as cotações para conferir o valor atual.';}
    catch(error){state=previous;render();$('finance-btc-status').textContent=error?.message||'Não foi possível remover a compra.';}
  }
  function saveQuoteToken(){
    const token=$('finance-quotes-token').value.trim();
    try{if(token)root.localStorage.setItem(TOKEN_KEY,token);else root.localStorage.removeItem(TOKEN_KEY);$('finance-quotes-status').textContent=token?'Token salvo neste aparelho. Toque em Atualizar agora.':'Token removido deste aparelho.';}
    catch{$('finance-quotes-status').textContent='Não foi possível salvar o token neste aparelho.';}
    $('finance-quotes-token').value='';
  }
  async function showPeriod(button){
    const range=button.dataset.financePeriod,card=button.closest('[data-finance-variable]'),output=card?.querySelector('.finance-period-result'),position=state.positions.find(p=>p.id===card?.dataset.financeVariable),token=readToken();
    if(!output||!position||!['5d','1mo','3mo','6mo'].includes(range))return;
    if(!token){output.textContent='Configure o token da brapi em “Cotações da carteira” para consultar o histórico.';return;}
    const ticker=core.quoteTicker(position)||core.cryptoTicker(position);
    if(!ticker){output.textContent='Histórico automático indisponível para este ativo.';return;}
    for(const item of card.querySelectorAll('[data-finance-period]'))item.disabled=true;
    output.textContent='Consultando preços do período…';
    try{
      const crypto=core.cryptoTicker(position)==='BTC';
      const url=crypto?`https://brapi.dev/api/v2/crypto?coin=BTC&currency=BRL&range=${range}&interval=1d`:`https://brapi.dev/api/quote/${encodeURIComponent(ticker)}?range=${range}&interval=1d`;
      const response=await root.fetch(url,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000),cache:'no-store'});
      if(!response.ok)throw Error(response.status===403?'Este período não está disponível no seu plano da brapi.':response.status===429?'Limite de consultas atingido.':`Consulta indisponível (HTTP ${response.status}).`);
      const payload=await response.json(),result=crypto?payload.coins?.[0]:payload.results?.[0];
      if(String(crypto?result?.coin:result?.symbol).toUpperCase()!==ticker)throw Error('Resposta de histórico incompatível com o ativo.');
      const history=core.priceHistory(result?.historicalDataPrice||result?.data?.historicalDataPrice);
      if(!history)throw Error('Sem pontos suficientes para mostrar a evolução neste período.');
      const prices=history.points.map(p=>p.close),min=Math.min(...prices),max=Math.max(...prices),span=max-min||1;
      const path=history.points.map((p,i)=>`${i?'L':'M'}${(i/Math.max(1,history.points.length-1)*280).toFixed(1)},${(74-(p.close-min)/span*64).toFixed(1)}`).join(' ');
      const label={ '5d':'semana','1mo':'mês','3mo':'trimestre','6mo':'semestre'}[range],direction=history.changePercent>0?'up':history.changePercent<0?'down':'flat';
      output.innerHTML=`<strong class="finance-variable-movement" data-direction="${direction}">${history.changePercent>=0?'+':''}${new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(history.changePercent)}% no ${label}</strong><p>Preço: <span class="finance-sensitive">${core.money(Math.round(history.first.close*100),position.currency)} → ${core.money(Math.round(history.last.close*100),position.currency)}</span>. ${history.points.length} cotações disponíveis. Evolução do preço, sem somar proventos.</p><svg viewBox="0 0 280 84" role="img" aria-label="Evolução do preço no ${label}"><path d="${path}" fill="none" stroke="${direction==='up'?'#278b64':direction==='down'?'#c84352':'#7593a0'}" stroke-width="3" stroke-linejoin="round"/></svg>`;
      applyPrivacy();
    }catch(error){output.textContent=error.message||'Não foi possível consultar este período.';}
    finally{for(const item of card.querySelectorAll('[data-finance-period]'))item.disabled=false;}
  }
  async function saveWatch(event){
    event.preventDefault();
    if(savingWatch)return;
    const code=$('finance-watchlist-code').value.trim().toUpperCase();
    if(!/^[A-Z0-9]{4}\d{1,2}$/.test(code)){alert('Informe um código válido, como PETR4.');return;}
    if((state.watchlist||[]).includes(code)){alert('Este ativo já está na lista.');return;}
    const type=$('finance-watchlist-alert-type').value,priceText=$('finance-watchlist-alert-price').value,price=num(priceText);
    if(type&&(!Number.isFinite(price)||price<=0)){alert('Informe o preço de referência do aviso.');return;}
    const before=state;savingWatch=true;
    try{state=core.validate({...state,watchlist:[...(state.watchlist||[]),code],watchAlerts:type?{...(state.watchAlerts||{}),[code]:{type,priceCents:Math.round(price*100)}}:state.watchAlerts});await persist();$('finance-watchlist-form').reset();}
    catch(error){state=before;render();alert(error.message||'Não foi possível salvar o ativo.');}
    finally{savingWatch=false;}
  }
  async function removeWatch(code){
    const before=state;
    try{const watchAlerts={...(state.watchAlerts||{})};delete watchAlerts[code];state=core.validate({...state,watchlist:(state.watchlist||[]).filter(item=>item!==code),watchAlerts});await persist();}
    catch(error){state=before;render();alert(error.message||'Não foi possível remover o ativo.');}
  }
  async function quoteWatch(code){
    const output=$(`finance-watch-${code}`),token=readToken();
    if(!output)return;
    if(!token){output.textContent='Configure o token da brapi em Cotações da carteira.';return;}
    output.textContent='Consultando…';
    try{
      const response=await root.fetch(`https://brapi.dev/api/quote/${encodeURIComponent(code)}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(8000),cache:'no-store'});
      if(!response.ok)throw Error(response.status===429?'Limite de consultas atingido.':response.status===403?'Ativo fora do plano.':`Consulta indisponível (HTTP ${response.status}).`);
      const item=(await response.json()).results?.[0];
      if(String(item?.symbol||'').toUpperCase()!==code||!Number.isFinite(Number(item?.regularMarketPrice)))throw Error('Resposta incompatível com o ativo.');
      const change=item.regularMarketChangePercent==null?NaN:Number(item.regularMarketChangePercent);
      const priceCents=Math.round(Number(item.regularMarketPrice)*100),alert=state.watchAlerts?.[code],hit=alert&&(alert.type==='above'?priceCents>=alert.priceCents:priceCents<=alert.priceCents);
      output.textContent=`${hit?'⚑ Preço atingiu seu aviso · ':''}${core.money(priceCents)}${Number.isFinite(change)?` · ${change>=0?'+':''}${new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(change)}% no último pregão`:''} · brapi, consultado agora`;
      output.dataset.direction=Number.isFinite(change)?change>0?'up':change<0?'down':'flat':'flat';
    }catch(error){output.textContent=error.message||'Consulta indisponível.';}
  }
  async function saveProvent(event){
    event.preventDefault();
    if(savingProvent)return;
    const position=state.positions.find(item=>item.id===$('finance-provent-position').value),date=$('finance-provent-date').value,amount=num($('finance-provent-amount').value),status=$('finance-provent-status').value;
    if(!position||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(amount)||amount<=0||!['announced','estimated'].includes(status)){alert('Confira os dados do provento.');return;}
    const before=state;savingProvent=true;
    try{state=core.validate({...state,provents:[...(state.provents||[]),{id:`provent-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,positionId:position.id,name:position.name,date,amountCents:Math.round(amount*100),status}]});await persist();$('finance-provent-form').reset();}
    catch(error){state=before;render();alert(error.message||'Não foi possível salvar o provento.');}
    finally{savingProvent=false;}
  }
  async function updateProvent(id,remove=false){
    const before=state;
    try{state=core.validate({...state,provents:remove?(state.provents||[]).filter(item=>item.id!==id):(state.provents||[]).map(item=>item.id===id?{...item,status:'received'}:item)});await persist();}
    catch(error){state=before;render();alert(error.message||'Não foi possível atualizar o provento.');}
  }
  async function init(){
    $('forja-area-training').addEventListener('click',()=>switchArea('training'));
    $('forja-area-finance').addEventListener('click',()=>switchArea('finance'));
    $('finance-add').addEventListener('click',()=>openEditor());
    const openImportPanel=()=>{$('finance-import-panel').open=true;$('finance-import-panel').scrollIntoView({behavior:'smooth',block:'start'});};
    $('finance-import-open').addEventListener('click',openImportPanel);
    $('finance-date').addEventListener('click',openImportPanel);
    $('finance-privacy-toggle').addEventListener('click',togglePrivacy);
    $('finance-refresh-all').addEventListener('click',refreshAllFinance);
    $('finance-positions').addEventListener('click',event=>{const button=event.target.closest('[data-finance-edit]');if(button)openEditor(button.dataset.financeEdit);});
    $('finance-variable-list').addEventListener('click',event=>{const button=event.target.closest('[data-finance-period]');if(button)showPeriod(button);});
    $('finance-cancel').addEventListener('click',()=>$('finance-editor').close());
    $('finance-form').addEventListener('submit',saveForm);
    $('finance-import-file').addEventListener('change',importFile);
    $('finance-xp-file').addEventListener('change',importXpFile);
    $('finance-xp-confirm').addEventListener('click',confirmXp);
    $('finance-xp-cancel').addEventListener('click',cancelXp);
    $('finance-note-file').addEventListener('change',importNoteFile);
    $('finance-note-confirm').addEventListener('click',confirmNote);
    $('finance-note-cancel').addEventListener('click',cancelNote);
    $('finance-flow-form').addEventListener('submit',saveFlow);
    $('finance-asset-event-form').addEventListener('submit',saveAssetEvent);
    $('finance-asset-event-type').addEventListener('change',()=>{$('finance-asset-event-update').closest('label').hidden=$('finance-asset-event-type').value==='provento';});
    $('finance-asset-event-list').addEventListener('click',event=>{const button=event.target.closest('[data-finance-asset-event-remove]');if(button)removeAssetEvent(button.dataset.financeAssetEventRemove);});
    $('finance-provent-form').addEventListener('submit',saveProvent);
    $('finance-provent-list').addEventListener('click',event=>{const receive=event.target.closest('[data-finance-provent-received]'),remove=event.target.closest('[data-finance-provent-remove]');if(receive)updateProvent(receive.dataset.financeProventReceived);else if(remove)updateProvent(remove.dataset.financeProventRemove,true);});
    $('finance-watchlist-form').addEventListener('submit',saveWatch);
    $('finance-watchlist-list').addEventListener('click',event=>{const quote=event.target.closest('[data-finance-watch-quote]'),remove=event.target.closest('[data-finance-watch-remove]');if(quote)quoteWatch(quote.dataset.financeWatchQuote);else if(remove)removeWatch(remove.dataset.financeWatchRemove);});
    $('finance-asset-event-date').value=new Date().toISOString().slice(0,10);
    $('finance-btc-form').addEventListener('submit',saveBtcPurchase);
    $('finance-btc-trades').addEventListener('click',event=>{const button=event.target.closest('[data-finance-btc-remove]');if(button)removeBtcPurchase(button.dataset.financeBtcRemove);});
    $('finance-btc-date').value=new Date().toISOString().slice(0,10);
    $('finance-flow-list').addEventListener('click',event=>{const button=event.target.closest('[data-finance-flow-remove]');if(button)removeFlow(button.dataset.financeFlowRemove);});
    $('finance-flow-date').value=new Date().toISOString().slice(0,10);
    $('finance-fx-save').addEventListener('click',updateFx);
    $('finance-fx-auto').addEventListener('click',refreshFx);
    $('finance-quotes-refresh').addEventListener('click',refreshQuotes);
    $('finance-quotes-save-token').addEventListener('click',saveQuoteToken);
    try{valuesHidden=root.localStorage.getItem(PRIVATE_KEY)==='1';}catch{}
    await load();render();
    let area='training';try{area=localStorage.getItem('forjatreino:app-area-v1')||'training';}catch{}
    switchArea(area);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>init().catch(console.error),{once:true});else init().catch(console.error);
  root.ForjaFinance={init,switchArea,render,refreshQuotes,refreshFx};
})(typeof globalThis!=='undefined'?globalThis:this);
