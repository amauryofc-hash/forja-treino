(function(root){
 'use strict';
 // Modelos de partida: somente preenchem a ficha; o usuário revisa e salva.
 const MODELS=[
  {id:'corpo-a',name:'Corpo todo A',items:['Agachamento livre','Supino reto','Remada baixa','Prancha']},
  {id:'corpo-b',name:'Corpo todo B',items:['Leg press','Desenvolvimento','Puxada frontal','Abdominal crunch']},
  {id:'corpo-c',name:'Corpo todo C',items:['Stiff','Flexão de braços','Remada curvada','Panturrilha em pé']},
  {id:'empurrar',name:'Empurrar: peito, ombros e tríceps',items:['Supino reto','Supino inclinado','Desenvolvimento','Elevação lateral','Tríceps corda']},
  {id:'puxar',name:'Puxar: costas e bíceps',items:['Puxada frontal','Remada baixa','Face pull','Rosca direta','Rosca alternada']},
  {id:'pernas',name:'Pernas',items:['Agachamento livre','Leg press','Mesa flexora','Elevação pélvica','Panturrilha em pé']},
  {id:'condicionamento',name:'Condicionamento',items:['Esteira','Avanço','Flexão de braços','Prancha']},
  {id:'corrida-complementar',name:'Força complementar à corrida',items:['Stiff','Avanço','Elevação pélvica','Panturrilha em pé','Prancha']},
  {id:'misto',name:'Funcional e musculação',items:['Levantamento terra','Agachamento livre','Barra fixa','Desenvolvimento','Prancha']},
  {id:'iniciante',name:'Corpo todo simples',items:['Leg press','Flexão de braços','Remada baixa','Desenvolvimento','Prancha']}
 ];
 function apply(modelId,doc=root.document,training=root.ForjaGymTraining,confirmFn=root.confirm){
  const model=MODELS.find(item=>item.id===modelId);
  const rows=doc?.getElementById('gym-plan-exercise-rows');
  const name=doc?.getElementById('gym-plan-name');
  if(!model||!rows||!name||!training?.addPlanExerciseRow)return false;
  const hasDraft=Boolean(name.value.trim()||rows.querySelector('.gym-plan-exercise-name')?.value.trim());
  if(hasDraft&&confirmFn&&!confirmFn('Substituir a ficha em edição pelo modelo escolhido?'))return false;
  rows.replaceChildren();
  name.value=model.name;
  for(const exercise of model.items)training.addPlanExerciseRow(exercise);
  const status=doc.getElementById('gym-ready-status');
  if(status)status.textContent='Modelo preenchido. Ajuste exercícios, séries, repetições e descanso; depois toque em Salvar ficha.';
  return true;
 }
 function init(doc=root.document){
  const select=doc?.getElementById('gym-ready-template'),button=doc?.getElementById('gym-ready-apply');
  if(!select||!button||button.dataset.readyBound)return;
  button.dataset.readyBound='1';
  for(const model of MODELS){const option=doc.createElement('option');option.value=model.id;option.textContent=model.name;select.append(option);}
  button.addEventListener('click',()=>{
   if(!select.value){const status=doc.getElementById('gym-ready-status');if(status)status.textContent='Escolha um modelo primeiro.';return;}
   apply(select.value,doc,root.ForjaGymTraining,root.confirm?.bind(root));
  });
 }
 root.ForjaGymReady={MODELS,apply,init};
 if(root.document?.readyState==='loading')root.document.addEventListener('DOMContentLoaded',()=>init());else init();
})(typeof globalThis!=='undefined'?globalThis:this);
