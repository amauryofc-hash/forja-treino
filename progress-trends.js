(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.ForjaProgressTrends=api;if(root.document?.readyState==='loading')root.document.addEventListener('DOMContentLoaded',api.init);else api.init();})(typeof globalThis!=='undefined'?globalThis:this,function(root){
 'use strict';
 const METRICS=[
  {key:'weight',label:'Peso',unit:'kg',digits:1,read:d=>d.weight},
  {key:'water',label:'Água',unit:'ml',digits:0,read:d=>d.water>0?d.water:null},
  {key:'food',label:'Calorias ingeridas',unit:'kcal',digits:0,read:d=>d.meals>0?d.kcal:null},
  {key:'steps',label:'Passos',unit:'passos',digits:0,read:d=>d.steps},
  {key:'active',label:'Gasto ativo Garmin',unit:'kcal',digits:0,read:d=>d.activeKcal},
  {key:'training',label:'Treinos',unit:'sessões',digits:0,total:true,read:d=>Object.values(d.training||{}).reduce((sum,n)=>sum+(Number(n)||0),0)||null}
 ];
 let period=30;
 function dateKey(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
 function series(index,metric,days,now=new Date()){
  const end=new Date(now.getFullYear(),now.getMonth(),now.getDate(),12);
  const start=new Date(end);start.setDate(end.getDate()-days+1);
  const points=[];
  for(const [date,data] of index){if(date<dateKey(start)||date>dateKey(end))continue;const value=metric.read(data);if(value!=null&&Number.isFinite(Number(value)))points.push({date,value:Number(value)});}
  return points.sort((a,b)=>a.date.localeCompare(b.date));
 }
 function format(value,digits=0){return Number(value).toLocaleString('pt-BR',{minimumFractionDigits:digits,maximumFractionDigits:digits});}
 function sparkline(points){if(points.length<2)return '<span class="progress-no-trend">Registre mais dias para ver a tendência.</span>';
  const values=points.map(p=>p.value),low=Math.min(...values),high=Math.max(...values),range=high-low||1;
  const xy=points.map((p,i)=>`${Math.round(i/(points.length-1)*280)},${Math.round(48-(p.value-low)/range*42)}`).join(' ');
  return `<svg viewBox="0 0 280 54" preserveAspectRatio="none" role="img" aria-label="Tendência entre ${format(values[0],1)} e ${format(values.at(-1),1)}"><polyline points="${xy}" fill="none" stroke="currentColor" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg>`;
 }
 function card(metric,points){if(!points.length)return `<div class="progress-trend-item"><strong>${metric.label}</strong><p>Sem registros neste período.</p></div>`;
  const last=points.at(-1),first=points[0],difference=last.value-first.value;
  const delta=!metric.total&&points.length>1?` · mudança de ${difference>0?'+':''}${format(difference,metric.digits)} ${metric.unit}`:'';
  const value=metric.total?points.reduce((sum,p)=>sum+p.value,0):last.value;
  const prefix=metric.total?'Total no período':'Último registro: '+last.date.slice(8)+'/'+last.date.slice(5,7);
  return `<div class="progress-trend-item"><div><strong>${metric.label}</strong><span>${format(value,metric.digits)} ${metric.unit}</span></div><small>${prefix} · ${points.length} dia(s) com dados${delta}</small>${sparkline(points)}</div>`;
 }
 async function render(){const target=root.document?.getElementById('progress-trends'),section=root.document?.getElementById('progress-trends-details');if(!target||!section?.open)return;
  try{const index=await root.ForjaProgressCalendar.loadIndex();target.innerHTML=METRICS.map(metric=>card(metric,series(index,metric,period))).join('');}
  catch(error){target.textContent='Não foi possível carregar as tendências agora.';root.console?.warn?.('Tendências indisponíveis:',error);}
 }
 function init(){const section=root.document?.getElementById('progress-trends-details');if(!section||section.dataset.trendsBound)return;section.dataset.trendsBound='1';section.addEventListener('toggle',()=>{if(section.open)render();});section.addEventListener('click',event=>{const button=event.target.closest?.('[data-progress-period]');if(!button)return;period=Number(button.dataset.progressPeriod)||30;for(const item of section.querySelectorAll('[data-progress-period]'))item.setAttribute('aria-pressed',String(item===button));render();});}
 return {METRICS,dateKey,series,sparkline,card,render,init};
});
