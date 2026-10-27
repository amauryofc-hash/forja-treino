(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.ForjaHomeHero=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
 'use strict';
 const DEFAULT_NAME='';
 let latest={};
 const greeting=hour=>hour<5?'Boa madrugada':hour<12?'Bom dia':hour<18?'Boa tarde':'Boa noite';
 const clamp=value=>Math.max(0,Math.min(100,Math.round(Number(value)||0)));
 const fmt=value=>Math.round(Math.max(0,Number(value)||0)).toLocaleString('pt-BR');
 function name(){try{let saved=root.localStorage?.getItem('forja-display-name');if(!saved&&DEFAULT_NAME){root.localStorage?.setItem('forja-display-name',DEFAULT_NAME);saved=DEFAULT_NAME;}return String(saved||DEFAULT_NAME).trim().slice(0,40);}catch{return DEFAULT_NAME;}}
 function setName(value){try{root.localStorage?.setItem('forja-display-name',String(value||'').trim().slice(0,40));}catch{}render();}
 function ring(id,value,label,progress){const node=root.document?.getElementById(id);if(!node)return;node.style.setProperty('--progress',clamp(progress)+'%');node.querySelector('strong').textContent=value;node.querySelector('span').textContent=label;node.setAttribute('aria-label',`${label}: ${value}`);}
 function render(data){if(data)latest=data;data=latest;const doc=root.document;if(!doc?.getElementById('home-hero'))return;const now=new Date(),person=name();doc.getElementById('home-hero-date').textContent=now.toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'});doc.getElementById('home-hero-greeting').textContent=greeting(now.getHours())+(person?', '+person:'');
  const water=Math.max(0,Number(data.waterMl)||0),waterGoal=Math.max(0,Number(data.waterGoal)||0),eaten=Math.max(0,Number(data.eaten)||0),foodGoal=Math.max(0,Number(data.foodGoal)||0),trained=!!data.trained;
  ring('home-hero-training-ring',trained?'✓':'0/1','Treino',trained?100:0);
  ring('home-hero-water-ring',(water/1000).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+' L','Água',waterGoal?water/waterGoal*100:0);
  ring('home-hero-food-ring',fmt(eaten),'kcal ingeridas',foodGoal?eaten/foodGoal*100:0);
  const notes=[];if(!trained)notes.push('Treino ainda não registrado');if(waterGoal&&water<waterGoal)notes.push(`faltam ${fmt(waterGoal-water)} ml de água`);
  if(Number.isFinite(data.balance))notes.push(`${data.balance>=0?'saldo':'acima da referência'} de ${fmt(Math.abs(data.balance))} kcal${data.balanceSource==='garmin'?' pelo gasto Garmin parcial':' pela meta alimentar'}`);
  doc.getElementById('home-hero-situation').textContent=notes.length?notes.join(' · '):'Registros do dia em dia.';
 }
 function openSupplements(){const card=root.document?.getElementById('creatine-week-card');if(!card)return;card.hidden=false;card.scrollIntoView?.({behavior:'smooth',block:'center'});root.document?.getElementById('supplements-card')?.classList.add('attention');root.setTimeout?.(()=>root.document?.getElementById('supplements-card')?.classList.remove('attention'),1500);}
 function updateWaterGoal(value){latest={...latest,waterGoal:value};render();}
 return{greeting,render,openSupplements,setName,updateWaterGoal};
});
