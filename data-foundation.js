(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.ForjaDataFoundation=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
 'use strict';const SCHEMA_KEY='forja-schema-v2',FORMAT='forja-treino-backup',VERSION=2;
 const ALLOWED_KEYS=['gym-favorite-exercises-v1','body-log','progress-photos','measurements','diet-log','water-daily-goal','garmin-water-daily-v1','garmin-water-source-v1','calorie-calc-lock','shopping-list-checked','shopping-list-removed','shopping-list-custom','diet-shopping-plan-v1','visible-tabs-v1','creatine-days-v1','supplements-v1','supplement-checks-v1','custom-week-cards-v1','diet-plan-custom-v1','training-goal','rest-day-weekly','local-reminders-v1','gym-payment','diet-food-bindings','diet-recurring','diet-recipes-v1','diet-recent-foods','diet-closed-days','diet-untracked-days','health-connect-daily','strava-imported','dashboard-layout-v1','bible-reading-v1','nutrition-corrections-v1','gym-plans-v1','gym-sessions-v1','gym-custom-exercises-v1','gym-active-workout-v1','crossfit-results-v1','sync-state-v1','finance-position-v1','weight-goal-v1'];
 async function migrate(storage=root.ForjaStorage||root.storage){let meta={version:0};try{const r=await storage.get(SCHEMA_KEY);if(r?.value)meta=JSON.parse(r.value);}catch{}if((meta.version||0)<VERSION)await storage.set(SCHEMA_KEY,JSON.stringify({version:VERSION,migratedAt:new Date().toISOString()}));return{version:VERSION};}
 async function buildBackup(storage=root.ForjaStorage||root.storage,db=root.ForjaDB){const data={};for(const key of ALLOWED_KEYS){try{const r=await storage.get(key);if(r?.value!==undefined)data[key]=JSON.parse(r.value);}catch{}}let database={};try{database=await db?.export?.()||{};}catch{}return{format:FORMAT,version:VERSION,exportedAt:new Date().toISOString(),data,database};}
 function validateBackup(payload){const legacy=payload&&!payload.format&&Number.isInteger(payload.version)&&payload.version>=1;if(!payload||(!legacy&&payload.format!==FORMAT)||!Number.isInteger(payload.version)||payload.version<1||!payload.data||typeof payload.data!=='object'||Array.isArray(payload.data))return{valid:false,error:'Formato de backup inválido.'};if(payload.version>VERSION)return{valid:false,error:'Esta cópia foi criada por uma versão mais recente do Forja. Atualize o aplicativo antes de importar.'};const safe={},database={};for(const key of ALLOWED_KEYS)if(Object.hasOwn(payload.data,key))safe[key]=payload.data[key];if(payload.database&&typeof payload.database==='object'&&!Array.isArray(payload.database))for(const [key,value]of Object.entries(payload.database))if(/^db:[\w-]+\/[\w-]+$/.test(key))database[key]=value;return{valid:true,value:{...payload,format:FORMAT,data:safe,database}};}
 async function restoreBackup(payload,storage=root.ForjaStorage||root.storage,db=root.ForjaDB){
  const checked=validateBackup(payload);if(!checked.valid)throw new Error(checked.error);
  const before=await buildBackup(storage,db),schemaBefore=await storage.get(SCHEMA_KEY),applied=[];
  try{
   for(const [key,value]of Object.entries(checked.value.data)){await storage.set(key,JSON.stringify(value));applied.push(key);}
   await db?.restore?.(checked.value.database);await migrate(storage);
   return{restored:applied.length};
  }catch(error){
   const rollbackErrors=[];
   for(const key of applied.reverse())try{if(Object.hasOwn(before.data,key))await storage.set(key,JSON.stringify(before.data[key]));else await storage.delete(key);}catch(failure){rollbackErrors.push(failure);}
   try{if(schemaBefore?.value!==undefined)await storage.set(SCHEMA_KEY,schemaBefore.value);else await storage.delete(SCHEMA_KEY);}catch(failure){rollbackErrors.push(failure);}
   try{if(db?.export&&db?.restore){const current=await db.export();for(const key of Object.keys(current))if(!Object.hasOwn(before.database,key)&&/^db:[\w-]+\/[\w-]+$/.test(key))await db.doc(key.slice(3)).delete();await db.restore(before.database);}}catch(failure){rollbackErrors.push(failure);}
   if(rollbackErrors.length)throw new AggregateError([error,...rollbackErrors],'A restauração falhou e alguns dados não puderam ser revertidos.');
   throw error;
  }
 }
 async function replaceBackup(payload,storage=root.ForjaStorage||root.storage,db=root.ForjaDB,options={}){
  const checked=validateBackup(payload);if(!checked.valid)throw new Error(checked.error);
  const keys=ALLOWED_KEYS.filter(key=>!options.keys||options.keys.includes(key));
  const before=await buildBackup(storage,db),beforeDb=db?.export?await db.export():{},schemaBefore=await storage.get(SCHEMA_KEY);
  const previous={...before,database:beforeDb},desired=checked.value;
  try{
   for(const key of keys){if(Object.hasOwn(desired.data,key))await storage.set(key,JSON.stringify(desired.data[key]));else if(Object.hasOwn(previous.data,key))await storage.delete(key);}
   if(db?.export&&db?.restore){const current=await db.export();for(const key of Object.keys(current))if(!Object.hasOwn(desired.database,key)&&/^db:[\w-]+\/[\w-]+$/.test(key))await db.doc(key.slice(3)).delete();await db.restore(desired.database);}
   await migrate(storage);return{replaced:Object.keys(desired.data).length};
  }catch(error){
   const failures=[];
   for(const key of keys)try{if(Object.hasOwn(previous.data,key))await storage.set(key,JSON.stringify(previous.data[key]));else await storage.delete(key);}catch(failure){failures.push(failure);}
   try{if(schemaBefore?.value!==undefined)await storage.set(SCHEMA_KEY,schemaBefore.value);else await storage.delete(SCHEMA_KEY);}catch(failure){failures.push(failure);}
   try{if(db?.export&&db?.restore){const current=await db.export();for(const key of Object.keys(current))if(!Object.hasOwn(previous.database,key)&&/^db:[\w-]+\/[\w-]+$/.test(key))await db.doc(key.slice(3)).delete();await db.restore(previous.database);}}catch(failure){failures.push(failure);}
   if(failures.length)throw new AggregateError([error,...failures],'A sincronização falhou e alguns dados não puderam ser revertidos.');
   throw error;
  }
 }
 return{SCHEMA_KEY,FORMAT,VERSION,ALLOWED_KEYS,migrate,buildBackup,validateBackup,restoreBackup,replaceBackup};
});
