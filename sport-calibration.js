(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.ForjaSportCalibration=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const value=v=>v===''||v===null||v===undefined?null:Number.isFinite(Number(v))?Number(v):null;
 function assess(input={}){
  const duration=value(input.durationMin),reported=value(input.reportedKcal),rest=value(input.restingKcal),bmr=value(input.basalDailyKcal),weight=value(input.weightKg),met=value(input.met),kind=input.calorieKind;
  if(!(duration>0))throw Error('Informe a duração real da sessão.');
  if(reported!==null&&reported<0)throw Error('As calorias informadas não podem ser negativas.');
  if(rest!==null&&rest<0||bmr!==null&&bmr<0)throw Error('Confira o valor de repouso.');
  if(met!==null&&met<1||weight!==null&&weight<=0)throw Error('Confira peso e intensidade escolhidos.');
  const resting=rest!==null?rest:bmr!==null?bmr*duration/1440:null;
  const active=reported===null?null:kind==='active'?reported:kind==='gross'&&resting!==null?Math.max(0,reported-resting):null;
  const gross=reported===null?null:kind==='gross'?reported:kind==='active'&&resting!==null?reported+resting:null;
  const metGross=weight!==null&&met!==null?met*weight*duration/60:null;
  const metActive=weight!==null&&met!==null?(met-1)*weight*duration/60:null;
  return{reportedKcal:reported,calorieKind:kind||'unknown',restingKcal:resting,activeKcal:active,grossKcal:gross,metGrossKcal:metGross,metActiveKcal:metActive,method:'MET apenas para comparação; não corrige o relógio',confidence:input.sport==='natacao'&&!input.chestStrap?'muito baixa':'baixa',duplicateWarning:'Se o gasto diário Garmin já inclui esta sessão, não a some novamente.'};
 }
 return{assess};
});
