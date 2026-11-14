(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.ForjaOkokWeight=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
 'use strict';
 const FIT='com.google.android.apps.fitness',OKOK='com.chipsea.btcontrol.en';
 const plugin=()=>root.Capacitor?.Plugins?.HealthConnect;
 const status=text=>{const el=root.document?.getElementById('okok-weight-status');if(el)el.textContent=text;};
 function normalize(rows){return(Array.isArray(rows)?rows:[]).filter(row=>{
  const time=Number(row?.timestamp),kg=Number(row?.kg);
  return [FIT,OKOK].includes(row?.sourcePackage)&&/^\d{4}-\d{2}-\d{2}$/.test(row?.date||'')&&Number.isFinite(time)&&time>0&&Number.isFinite(kg)&&kg>=20&&kg<=500;
 }).map(row=>({id:`okok-fit-${Math.round(Number(row.timestamp))}-${Math.round(Number(row.kg)*100)}`,date:row.date,time:String(row.time||'').slice(0,5),type:'weight',value:(Math.round(Number(row.kg)*100)/100).toFixed(2),period:row.sourcePackage===OKOK?'OKOK':'Google Fit',sourcePackage:row.sourcePackage}));}
 function newRecords(rows,body=[]){const ids=new Set(body.map(row=>row.id));return normalize(rows).filter(row=>!ids.has(row.id)&&!body.some(existing=>existing.type==='weight'&&existing.date===row.date&&Math.abs(Number(String(existing.value||'').replace(',','.'))-Number(row.value))<0.02&&Math.abs(Date.parse(row.date+'T'+(existing.time||'12:00'))-Date.parse(row.date+'T'+(row.time||'12:00')))<15*60000));}
 async function requestPermission(){if(!plugin()){status('A leitura automática de peso exige o APK Android atualizado.');return false;}try{await plugin().requestAccess();status('No Health Connect, permita ao Forja ler Peso. Depois volte e toque em Importar pesos.');return true;}catch(error){status(error?.message||'Não foi possível abrir as permissões.');return false;}}
 async function importWeights(){if(!plugin()){status('A leitura automática de peso exige o APK Android atualizado.');return{imported:0};}try{
  const check=await plugin().status();if(!check?.weightAuthorized){status('Autorize Peso no Health Connect antes de importar.');return{imported:0};}
  status('Lendo medições dos últimos 30 dias…');const response=await plugin().readWeightWeek(),body=await root.loadBody(),fresh=newRecords(response?.records,body);
  if(!fresh.length){status('Nenhum peso novo do Google Fit ou OKOK no Health Connect. Confira a sincronização no app da balança.');return{imported:0};}
  const summary=fresh.map(row=>`${row.date.split('-').reverse().join('/')}: ${Number(row.value).toLocaleString('pt-BR')} kg (${row.period})`).join('\n');
  if(!root.confirm?.(`Importar ${fresh.length} medição(ões) de peso?\n\n${summary.slice(0,1500)}\n\nConfira se são da sua balança OKOK.`)){status('Importação cancelada. Nenhum peso foi alterado.');return{imported:0};}
  await root.saveBody([...body,...fresh]);await root.renderBody?.();await root.renderDashboard?.();await root.ForjaProgressCalendar?.refreshIfVisible?.();status(`${fresh.length} peso(s) importado(s). Nenhum registro anterior foi apagado.`);return{imported:fresh.length};
 }catch(error){status('Não foi possível importar os pesos: '+String(error?.message||error));return{imported:0};}}
 async function init(){const a=root.document?.getElementById('okok-weight-permission'),b=root.document?.getElementById('okok-weight-import');a?.addEventListener('click',requestPermission);b?.addEventListener('click',importWeights);if(!plugin())status('A leitura automática de peso exige o APK Android atualizado.');}
 return{normalize,newRecords,requestPermission,importWeights,init};
});
