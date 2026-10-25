(function(root){
 'use strict';
 const byId=id=>root.document.getElementById(id);
 const line=(where,message)=>{const p=root.document.createElement('p');p.className='calc-formula-note';p.textContent=message;where.append(p);return p;};
 const fmt=value=>`${Math.round(value)} kcal`;
 const mode=()=>byId('cf-energy-no-watch')?.checked?'no_watch':'with_watch';
 function clearAppliedEstimate(){
  const review=byId('crossfit-print-review'),field=byId('crossfit-print-kcal');
  if(!review?.dataset.calorieEstimate)return;
  try{const previous=JSON.parse(review.dataset.calorieEstimate);if(['met_no_watch','met_watch_scenario'].includes(previous.kind)&&Number(field?.value)===previous.usedKcal)field.value='';}catch{}
  review.dataset.calorieEstimate='';
  const caption=byId('crossfit-print-kcal-label');if(caption)caption.textContent='Calorias ativas do treino';
 }
 function inferWorkoutType(){
  const format=(byId('crossfit-print-formato')?.value||'').toLowerCase();
  const names=[...root.document.querySelectorAll('#crossfit-print-exercicios .cf-ex-nome')].map(el=>el.value.toLowerCase()).join(' ');
  const strength=/heavy|força|strength|1\s*rm|1.?rep max|levantamento|snatch|clean|deadlift|squat|press/.test(format+' '+names);
  const conditioning=/amrap|emom|for time|metcon|bike|run|corrida|row|remo|ski|burpee|caloria/.test(format+' '+names);
  return strength&&conditioning?'misto':strength?'forca':conditioning?'metcon':'misto';
 }
 function estimate(){
  const duration=Number(byId('crossfit-print-min')?.value),weight=Number(byId('cf-energy-weight')?.value);
  if(!(duration>0))throw Error('Preencha a duração realizada do WOD acima para estimar o gasto.');
  if(!(weight>0))throw Error('Informe seu peso para estimar o gasto do WOD.');
  const format=byId('crossfit-print-formato')?.value||'',block=root.ForjaWodBlocks?.parse(format);
  const restMin=block&&block.totalSec/60<=duration?block.cycles*block.restSec/60:0;
  return root.ForjaCrossfitEnergy.estimateWod({durationMin:duration,weightKg:weight,workoutType:inferWorkoutType(),restMin});
 }
 function calculateSession(){
  const resultEl=byId('cf-energy-result');if(!resultEl)return null;resultEl.replaceChildren();
  const add=byId('cf-energy-add');if(add)add.disabled=true;
  try{
   const result=estimate();
   line(resultEl,`Referência para este WOD (${result.label}): cerca de ${fmt(result.activeKcal)} ativas e ${fmt(result.grossKcal)} totais. Faixa exploratória de ${fmt(result.range.minActiveKcal)} a ${fmt(result.range.maxActiveKcal)} ativas.`);
   if(result.restMin)line(resultEl,`Cálculo considera ${result.workMin} min de trabalho e ${result.restMin} min de descanso previstos no formato.`);
   if(mode()==='with_watch'){
    line(resultEl,'O relógio já inclui o esforço nas calorias ativas do dia. Sem a leitura desta sessão, não é possível calcular uma diferença confiável; nenhum adicional será somado ao balanço.');
   }else line(resultEl,'Sem registro no Garmin: as calorias ativas estimadas podem ser adicionadas ao WOD após sua revisão. É uma aproximação pelo peso, duração e tipo de movimento.');
   if(add){add.hidden=mode()==='with_watch';add.disabled=mode()==='with_watch';add.textContent='Adicionar estimativa ao WOD';}
   return result;
  }catch(error){line(resultEl,error.message);return null;}
 }
 function apply(){
  const result=calculateSession();if(!result)return;
  if(mode()==='with_watch')return;
  const kcal=Math.round(result.activeKcal),review=byId('crossfit-print-review');
  byId('crossfit-print-kcal').value=String(kcal);
  const caption=byId('crossfit-print-kcal-label');if(caption)caption.textContent='Calorias ativas estimadas do treino';
  review.dataset.calorieEstimate=JSON.stringify({kind:'met_no_watch',usedKcal:kcal,notInGarmin:true,method:result.method,workoutType:inferWorkoutType(),durationMin:Number(byId('crossfit-print-min').value),weightKg:Number(byId('cf-energy-weight').value),met:result.met,estimatedActiveKcal:kcal,estimatedTotalKcal:Math.round(result.grossKcal),rangeMinKcal:result.range.minActiveKcal,rangeMaxKcal:result.range.maxActiveKcal,restMin:result.restMin,uncertaintyKcal:null});
  line(byId('cf-energy-result'),'Estimativa colocada no WOD. Revise e salve o treino; ela será somada ao gasto do dia somente como treino não registrado pelo Garmin.');
 }
 async function open(){
  const target=byId('crossfit-print-kcal');if(!target)return;
  byId('crossfit-energy-panel')?.remove();
  const panel=root.document.createElement('details');panel.id='crossfit-energy-panel';panel.className='routine-panel';panel.open=true;
  const summary=root.document.createElement('summary');summary.textContent='Estimativa rápida do WOD';panel.append(summary);
  const latest=await root.getLastWeightValue?.();
  const weightLabel=root.document.createElement('label');weightLabel.textContent='Peso usado na estimativa (kg)';
  const weight=root.document.createElement('input');weight.id='cf-energy-weight';weight.type='number';weight.min='1';weight.step='0.1';weight.inputMode='decimal';weight.value=latest>0?String(latest):'';weightLabel.append(weight);panel.append(weightLabel);
  const calculate=root.document.createElement('button');calculate.type='button';calculate.className='dica-add-btn';calculate.textContent='Calcular pelo WOD';calculate.onclick=calculateSession;panel.append(calculate);
  const result=root.document.createElement('div');result.id='cf-energy-result';result.setAttribute('role','status');panel.append(result);
  const choices=root.document.createElement('div');choices.className='cf-energy-modes';
  for(const [id,text,checked] of [['cf-energy-with-watch','Com relógio (o esforço entrou nas calorias ativas do dia)',true],['cf-energy-no-watch','Sem relógio ou WOD fora do Garmin',false]]){
   const label=root.document.createElement('label'),radio=root.document.createElement('input');radio.type='radio';radio.name='cf-energy-mode';radio.id=id;radio.checked=checked;
   radio.onchange=()=>{clearAppliedEstimate();calculateSession();};label.append(radio,root.document.createTextNode(' '+text));choices.append(label);
  }
  panel.append(choices);
  const add=root.document.createElement('button');add.type='button';add.id='cf-energy-add';add.className='primary';add.textContent='Adicionar estimativa ao WOD';add.disabled=true;add.onclick=apply;panel.append(add);
  const row=target.closest('.row');if(row)row.insertAdjacentElement('afterend',panel);else target.parentElement.append(panel);
  calculateSession();
 }
 root.ForjaCrossfitEnergyUI={open,calculateSession,inferWorkoutType,apply};
 root.estimateCrossfitCalorias=open;
})(globalThis);
