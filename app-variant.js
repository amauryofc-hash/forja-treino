(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.ForjaAppVariant=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
 'use strict';
 let resolution;
 async function resolve(){
  if(resolution)return resolution;
  resolution=(async()=>{
   const body=root.document?.body;
   const current=body?.dataset.forjaVariant||'personal';
   try{
    const info=await root.Capacitor?.Plugins?.App?.getInfo?.();
    const nativeId=info?.id;
    const variant=nativeId==='com.forjatreino.app'?'personal':nativeId==='com.forjatreino.publico'?'shared':current;
    if(body)body.dataset.forjaVariant=variant;
    return variant;
   }catch{return current;}
  })();
  return resolution;
 }
 return {resolve};
});
