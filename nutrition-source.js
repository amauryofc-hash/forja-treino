(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.ForjaNutritionSource=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function label(source){const value=String(source||'').toLowerCase();if(!value)return'Origem não informada';if(/ia|inteligência artificial|llama/.test(value))return'Estimado por IA';if(/taco|unicamp|nepa/.test(value))return'Tabela TACO';if(/open food facts|produto cadastrado|rótulo/.test(value))return'Produto cadastrado · confira o rótulo';if(/usuário|user|informado|manual/.test(value))return'Informado por você';return'Outra referência · confira os dados';}
 function summary(rows){const sources=[...new Set((rows||[]).map(row=>label(row?.food?.source||row?.source)))];return sources.length?`Origem dos valores: ${sources.join(' · ')}. Confira porções e rótulos antes de salvar.`:'Origem dos valores: adicione alimentos para conferir.';}
 return{label,summary};
});
