(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.ForjaBackupStatus=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
 'use strict';const KEY='backup-last-confirmed-v1';
 async function render(){const el=root.document?.getElementById('backup-last-confirmed');if(!el)return;try{const row=await(root.ForjaStorage||root.storage)?.get?.(KEY),saved=row?.value?JSON.parse(row.value):null,time=Date.parse(saved?.at||'');el.textContent=Number.isFinite(time)?`Último backup ${saved.method==='compartilhado'?'compartilhado':'copiado'}: ${new Date(time).toLocaleString('pt-BR')}. Confirme que guardou uma cópia fora do aplicativo.`:'Nenhuma cópia confirmada neste aparelho.';}catch{el.textContent='Não foi possível conferir a última cópia do backup.';}}
 async function confirm(method,at=new Date().toISOString()){if(!['copiado','compartilhado'].includes(method))return false;try{await(root.ForjaStorage||root.storage).set(KEY,JSON.stringify({method,at}));await render();return true;}catch{return false;}}
 return{KEY,render,confirm};
});
