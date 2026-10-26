(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.ForjaGymSuggest=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
 'use strict';
 const groups=['Peito','Costas','Ombros','Quadríceps','Posterior','Glúteos'];
 function groupRecency(sessions,now=new Date()){
  const latest=new Map();
  for(const session of sessions||[]){const date=new Date(`${session.date||''}T12:00:00`);if(Number.isNaN(date.getTime())||date>now)continue;for(const entry of session.entries||[]){if(!(entry.sets||[]).some(set=>set.type!=='aquecimento'))continue;const group=entry.muscle;if(!groups.includes(group))continue;if(!latest.has(group)||date>latest.get(group))latest.set(group,date);}}
  return groups.map(group=>({group,days:latest.has(group)?Math.floor((now-latest.get(group))/86400000):null}));
 }
 function message(sessions,now=new Date()){
  if(!sessions?.length)return null;
  const rows=groupRecency(sessions,now),never=rows.find(item=>item.days==null);
  if(never)return `No histórico da Academia, ${never.group.toLowerCase()} ainda não aparece. Use suas fichas e seu planejamento para decidir o próximo treino.`;
  const oldest=[...rows].sort((a,b)=>b.days-a.days)[0];
  return oldest?.days>=7?`No histórico da Academia, ${oldest.group.toLowerCase()} foi treinado há ${oldest.days} dias. Confira sua ficha antes de decidir o próximo treino.`:null;
 }
 return{groups,groupRecency,message};
});
