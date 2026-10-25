(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.ForjaCrossfitEnergy=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const finite=v=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null;
 const round10=v=>Math.round(v/10)*10;
 // Analogias do Compêndio 2024, não valores oficiais específicos de CrossFit.
 const MET={forca:{value:6,code:'02050',label:'resistência vigorosa'},metcon:{value:7.5,code:'02040',label:'circuito vigoroso'},misto:{value:5.8,code:'02055',label:'circuito de resistência com superséries'}};
 // Limites entre atividades análogas do Compêndio, não intervalo de confiança clínico.
 const MET_LIMITS={forca:[3.5,6],metcon:[5,7.5],misto:[3.5,7.5]};
 function estimateWod({durationMin,weightKg,workoutType='misto',restMin=0}={}){
  const duration=finite(durationMin),weight=finite(weightKg),rest=finite(restMin),type=MET[workoutType]||MET.misto;
  if(!(duration>0)||!(weight>0)||rest===null||rest<0||rest>duration)throw Error('Confira a duração, o peso e o descanso do WOD.');
  const work=duration-rest,calculate=met=>({grossKcal:(met*work+1.3*rest)*weight/60,activeKcal:((met-1)*work+.3*rest)*weight/60});
  const center=calculate(type.value),[low,high]=MET_LIMITS[workoutType]||MET_LIMITS.misto;
  return{...center,range:{minActiveKcal:Math.floor(calculate(low).activeKcal/10)*10,maxActiveKcal:Math.ceil(calculate(high).activeKcal/10)*10},workMin:work,restMin:rest,met:type.value,label:type.label,method:'analogia do Compêndio 2024; não é medição nem faixa validada para CrossFit'};
 }
 // Cenário ilustrativo: 28% é magnitude aproximada de erro observada em estudos,
 // não limite de confiança nem correção validada para um indivíduo. O ponto de 14%
 // é apenas o meio do cenário hipotético de subcontagem entre 0 e 28%.
 function watchAdjustmentScenario(activeKcal){
  const active=finite(activeKcal);
  if(!(active>0))return null;
  return {minKcal:0,midKcal:Math.round(active*.14),maxKcal:Math.round(active*.28),basis:'hipótese exploratória de subcontagem, não erro medido do Garmin'};
 }
 function estimate(input={}){
  const duration=finite(input.durationMin),reported=finite(input.watchGrossKcal),mode=input.watchCalorieKind==='active'?'active':input.watchCalorieKind==='none'?'none':'gross',restFromActivity=finite(input.restingCaloriesFromActivity),bmr=finite(input.basalDailyKcal),weight=finite(input.weightKg),age=finite(input.age),hr=finite(input.averageHr),maxHr=finite(input.maxHr),sex=String(input.sex||'').toUpperCase(),type=MET[input.workoutType]||MET.misto;
  if(!(duration>0))throw Error('Informe a duração real da sessão em minutos.');
  if(reported!==null&&reported<0)throw Error('As calorias do relógio não podem ser negativas.');
  if(restFromActivity!==null&&restFromActivity<0)throw Error('O basal do período não pode ser negativo.');
  if(hr!==null&&(!(hr>0)||maxHr!==null&&maxHr<hr))throw Error('Confira as frequências cardíacas média e máxima.');
  const resting=restFromActivity!==null?restFromActivity:bmr!==null&&bmr>0?bmr*duration/1440:null;
  const gross=mode==='none'?null:mode==='active'?(reported!==null&&resting!==null?reported+resting:null):reported;
  const watchActive=mode==='none'?null:mode==='active'?reported:gross!==null&&resting!==null?Math.max(0,gross-resting):null;
  let hrGross=null;
  // Keytel et al. (2005), kJ/min, convertido para kcal; validado em exercício aeróbico submáximo.
  if(hr!==null&&weight>0&&age>=18&&age<=45&&(sex==='M'||sex==='F')){
   const kjMin=sex==='M'?-55.0969+0.6309*hr+0.1988*weight+0.2017*age:-20.4022+0.4472*hr-0.1263*weight+0.074*age;
   if(kjMin>0)hrGross=kjMin/4.184*duration;
  }
  const metGross=weight>0?type.value*weight*duration/60:null;
  const metActive=weight>0?(type.value-1)*weight*duration/60:null;
  const center=mode==='none'?null:gross!==null?gross:mode==='active'?reported:null;
  const range=center===null?null:{min:round10(center*.72),max:round10(center*1.28),rawMin:center*.72,rawMax:center*1.28};
  const rangeGross=mode==='active'&&resting===null?null:range;
  const rangeActive=mode==='active'&&resting===null?range:null;
  const confidence=input.correctActivityMode===false||input.hrUnstable?'muito baixa':'baixa';
  const differenceFromMet=watchActive!==null&&metActive!==null?Math.round(metActive-watchActive):null;
  return{watchGrossKcal:gross,watchReportedKcal:mode==='none'?null:reported,watchCalorieKind:mode,restingKcal:resting,watchActiveKcal:watchActive,differenceFromMetKcal:differenceFromMet,
   heartRate:{grossKcal:hrGross,activeKcal:hrGross!==null&&resting!==null?Math.max(0,hrGross-resting):null,method:'Keytel 2005; baixa aplicabilidade ao CrossFit'},
   met:{grossKcal:metGross,activeKcal:metActive,met:type.value,code:type.code,label:type.label,method:'analogia do Compêndio 2024, não MET oficial de CrossFit'},
   rangeGrossKcal:rangeGross,rangeActiveKcal:rangeActive,uncertaintyKcal:center===null?null:Math.round(center*.28),confidence,
   duplicateWarning:'As calorias ativas diárias do Garmin já incluem o treino; não some esta sessão novamente.',
   summary:mode==='none'?(metGross!==null?`Sem relógio: analogia MET de ${Math.round(metGross)} kcal totais e ${Math.round(metActive)} kcal ativas. Não há faixa validada para esta sessão.`:'Sem relógio e sem peso: não foi possível estimar.'):(range?`Seu relógio marcou ${Math.round(reported)} kcal ${mode==='active'?'ativas':'totais'}. Faixa exploratória: aproximadamente entre ${range.min} e ${range.max} kcal ${mode==='active'&&resting===null?'ativas':'totais'}. Não use essa faixa para conclusões finas.`:'Sem dados suficientes para estimar uma faixa.')};
 }
 function dailyBalanceRange({intake,totalBurn,sessionUncertaintyKcal}={}){
  const eaten=finite(intake),burned=finite(totalBurn),uncertainty=finite(sessionUncertaintyKcal);
  if(eaten===null||burned===null||uncertainty===null||uncertainty<0)return null;
  const min=burned-eaten-uncertainty,max=burned-eaten+uncertainty;
  return{minDeficitKcal:min,maxDeficitKcal:max,displayMinKcal:round10(min),displayMaxKcal:round10(max)};
 }
 return{MET,estimate,estimateWod,dailyBalanceRange,watchAdjustmentScenario};
});
