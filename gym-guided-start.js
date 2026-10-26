(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.ForjaGymGuidedStart=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
 'use strict';
 const G=()=>root.ForjaGymTraining;
 const templates={
  completo:{label:'Corpo inteiro A/B',days:[
   {name:'Corpo inteiro A',exercises:['Agachamento livre','Supino reto','Remada baixa','Desenvolvimento','Prancha']},
   {name:'Corpo inteiro B',exercises:['Leg press','Puxada frontal','Supino inclinado','Stiff','Panturrilha em pé']}
  ]},
  dividido:{label:'Superior / inferior',days:[
   {name:'Superior',exercises:['Supino reto','Remada baixa','Desenvolvimento','Puxada frontal','Tríceps corda','Rosca direta']},
   {name:'Inferior',exercises:['Agachamento livre','Leg press','Stiff','Mesa flexora','Panturrilha em pé','Prancha']}
  ]},
  iniciante:{label:'Iniciante · 3 dias',days:[
   {name:'Iniciante A',exercises:['Agachamento livre','Supino reto','Remada baixa','Prancha']},
   {name:'Iniciante B',exercises:['Leg press','Puxada frontal','Desenvolvimento','Panturrilha em pé']},
   {name:'Iniciante C',exercises:['Stiff','Flexão de braços','Remada baixa','Prancha']}
  ]},
  hipertrofia:{label:'Hipertrofia · empurrar / puxar / pernas',days:[
   {name:'Empurrar',exercises:['Supino reto','Supino inclinado','Desenvolvimento','Elevação lateral','Tríceps corda']},
   {name:'Puxar',exercises:['Puxada frontal','Remada baixa','Face pull','Rosca direta']},
   {name:'Pernas',exercises:['Agachamento livre','Leg press','Stiff','Mesa flexora','Panturrilha em pé']}
  ]},
  corrida:{label:'Força complementar à corrida',days:[
   {name:'Força para corrida',exercises:['Agachamento livre','Stiff','Elevação pélvica','Panturrilha em pé','Prancha']}
  ]},
  funcional:{label:'Funcional · corpo inteiro',days:[
   {name:'Funcional misto',exercises:['Agachamento livre','Afundo','Flexão de braços','Remada baixa','Burpee','Prancha']}
  ]}
 };
 async function read(key,fallback){try{const row=await(root.ForjaStorage||root.storage).get(key);return row?.value?JSON.parse(row.value):fallback;}catch{return fallback;}}
 function findExercise(name){return G().EXERCISES.find(e=>e.name===name);}
 function platePlan(total,bar,available=[20,15,10,5,2.5,1.25]){const goal=Number(total),barKg=Number(bar);if(!Number.isFinite(goal)||!Number.isFinite(barKg)||goal<barKg||barKg<0)return null;let remaining=Math.round((goal-barKg)*500),perSide=[];for(const plate of available){const units=Math.round(Number(plate)*1000);if(units<=0)continue;const count=Math.floor(remaining/units);if(count){perSide.push({kg:plate,count});remaining-=count*units;}}return{perSide,achievedKg:Math.round((goal-remaining/500)*100)/100,remainingKg:Math.round(remaining/500*100)/100};}
 function buildPlans(templateKey){const template=templates[templateKey];if(!template)throw Error('Modelo de ficha desconhecido.');return template.days.map(day=>G().createPlan(day.name,day.exercises.map(name=>{const match=findExercise(name);if(!match)throw Error(`Exercício indisponível: ${name}`);return{name:match.name,muscle:match.muscle,defaultSets:3,defaultReps:10,restSec:60};})));}
 async function install(templateKey){const plans=buildPlans(templateKey),existing=await read(G().PLANS,[]);const names=new Set(existing.map(p=>p.name.toLocaleLowerCase('pt-BR')));for(const plan of plans){let name=plan.name,n=2;while(names.has(name.toLocaleLowerCase('pt-BR')))name=`${plan.name} (${n++})`;plan.name=name;names.add(name.toLocaleLowerCase('pt-BR'));await G().savePlan(plan);}await root.ForjaGymUI?.render?.();const status=root.document?.getElementById('gym-training-status');if(status)status.textContent=`${plans.length} fichas adicionadas. Revise exercícios, séries e descanso antes de começar.`;return plans;}
 async function render(){const document=root.document;if(!document||!G())return;const target=document.getElementById('gym-guided-start'),list=document.getElementById('gym-ready-plan-list');if(!target||!list)return;const plans=await read(G().PLANS,[]),sessions=await read(G().SESSIONS,[]),draft=await read(G().DRAFT,null),suggested=G().suggestNextPlan(plans,sessions);
  const plateButton=document.getElementById('gym-plates-calculate');if(plateButton&&!plateButton.dataset.bound){plateButton.dataset.bound='1';plateButton.addEventListener('click',()=>{const result=platePlan(document.getElementById('gym-plates-total')?.value,document.getElementById('gym-plates-bar')?.value),output=document.getElementById('gym-plates-result');if(!output)return;output.textContent=!result?'Confira os pesos: o total deve ser igual ou maior que o peso da barra.':`Cada lado: ${result.perSide.map(p=>`${p.count} × ${p.kg} kg`).join(' + ')||'sem anilhas'}. Total montado: ${result.achievedKg} kg.${result.remainingKg?` Faltam ${result.remainingKg} kg com as anilhas consideradas.`:''}`;});}
  target.replaceChildren();
  if(draft){const p=document.createElement('p');p.textContent=`Treino em andamento: ${draft.planName||'treino livre'}. Continue abaixo de onde parou.`;target.append(p);}
  else if(suggested){const p=document.createElement('p');p.textContent=`Próxima ficha sugerida: ${suggested.name}. Você pode escolher outra na lista.`;const button=document.createElement('button');button.type='button';button.className='secondary-btn';button.textContent='Usar esta ficha';button.onclick=()=>{const select=document.getElementById('gym-session-plan');if(select)select.value=suggested.id;select?.scrollIntoView?.({behavior:'smooth',block:'center'});};target.append(p,button);}
  else{const p=document.createElement('p');p.textContent='Comece com treino livre, crie sua ficha ou use um modelo editável abaixo.';target.append(p);}
  const suggestion=root.ForjaGymSuggest?.message?.(sessions);
  if(suggestion){const p=document.createElement('p');p.className='gym-muscle-suggestion';p.textContent=suggestion;target.append(p);}
  list.replaceChildren();for(const [key,template] of Object.entries(templates)){const box=document.createElement('div');box.className='gym-ready-plan';const strong=document.createElement('strong');strong.textContent=template.label;const p=document.createElement('p');p.textContent=template.days.map(day=>`${day.name}: ${day.exercises.join(', ')}`).join(' · ');const button=document.createElement('button');button.type='button';button.className='secondary-btn';button.textContent='Adicionar fichas';button.addEventListener('click',()=>install(key).catch(error=>{const status=document.getElementById('gym-training-status');if(status)status.textContent=error.message;}));box.append(strong,p,button);list.append(box);}
 }
 return {templates,buildPlans,platePlan,install,render};
});
