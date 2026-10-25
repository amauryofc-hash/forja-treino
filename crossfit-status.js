(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.ForjaCrossfitStatus=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function completed(row){
  if(!row)return false;
  if(Number(row.duracao_s)>0||String(row.resultado||'').trim())return true;
  const score=row.resultScore;
  return !!score&&Object.values(score).some(value=>Number(value)>0);
 }
 return {completed};
});
