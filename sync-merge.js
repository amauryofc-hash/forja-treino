(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.ForjaSyncMerge=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const ABSENT=Symbol('ausente');
 const own=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
 const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
 function canonical(value){
  if(value===ABSENT)return 'ABSENT';
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(plain(value))return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
  return JSON.stringify(value);
 }
 const same=(a,b)=>canonical(a)===canonical(b);
 function keyed(array){
  if(!Array.isArray(array)||!array.every(item=>plain(item)&&typeof item.id==='string'&&item.id))return null;
  const map=new Map(array.map(item=>[item.id,item]));
  return map.size===array.length?map:null;
 }
 function merge(base,local,remote,options={}){
  const conflicts=[];
  function visit(b,l,r,path){
   if(same(l,r))return l;
   if(same(l,b))return r;
   if(same(r,b))return l;
   if(plain(l)&&plain(r)&&(plain(b)||b===ABSENT)){
    const result={};
    for(const key of new Set([...Object.keys(b===ABSENT?{}:b),...Object.keys(l),...Object.keys(r)])){
     const value=visit(b!==ABSENT&&own(b,key)?b[key]:ABSENT,own(l,key)?l[key]:ABSENT,own(r,key)?r[key]:ABSENT,path.concat(key));
     if(value!==ABSENT)result[key]=value;
    }
    return result;
   }
   const bm=b===ABSENT?new Map():keyed(b),lm=keyed(l),rm=keyed(r);
   if(bm&&lm&&rm){
    const result=[];
    const ids=[...new Set([...lm.keys(),...rm.keys(),...bm.keys()])];
    for(const id of ids){
     const value=visit(bm.has(id)?bm.get(id):ABSENT,lm.has(id)?lm.get(id):ABSENT,rm.has(id)?rm.get(id):ABSENT,path.concat(id));
     if(value!==ABSENT)result.push(value);
    }
    return result;
   }
   conflicts.push(path.join('.')||'(raiz)');
   return options.prefer==='remote'?r:l;
  }
  const value=visit(base===undefined?ABSENT:base,local===undefined?ABSENT:local,remote===undefined?ABSENT:remote,[]);
  return {value:value===ABSENT?undefined:value,conflicts};
 }
 function mergeBackup(base,local,remote,allowedKeys,options){
  const permitted=new Set(allowedKeys||[]),clean=backup=>({data:Object.fromEntries(Object.entries(backup?.data||{}).filter(([key])=>permitted.has(key))),database:backup?.database&&plain(backup.database)?backup.database:{}});
  const result=merge(clean(base),clean(local),clean(remote),options);
  return {backup:{format:'forja-treino-backup',version:Math.max(2,Number(local?.version)||2,Number(remote?.version)||2),data:result.value.data,database:result.value.database},conflicts:result.conflicts};
 }
 return {canonical,same,merge,mergeBackup};
});
