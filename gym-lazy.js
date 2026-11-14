(function(root){
 'use strict';
 const scripts=[
  'gym-catalog.js',
  'gym-catalog-extra.js?v=20261006-full',
  'gym-gif-extras.js?v=20261008-lower-body',
  'gym-gif-library-extras.js?v=20261008-full-library',
  'gym-names-pt.js?v=20261002-pt',
  'gym-name-reviews-pt.js?v=20261006-review',
  'gym-exercise-guide.js?v=20261006-catalog',
  'gym-training.js?v=20261024-guided',
  'gym-gif-map.js?v=20261028-webp',
  'gym-gif-library-map.js?v=20261008-full-library',
  'gym-ui.js?v=20261024-guided',
  'gym-overview.js',
  'gym-guided-start.js?v=20261024',
  'gym-suggest.js'
 ];
 const loaded=new Set();
 let loading;
 function load(src){
  if(loaded.has(src))return Promise.resolve();
  return new Promise((resolve,reject)=>{
   const script=root.document.createElement('script');script.src=src;
   script.onload=()=>{loaded.add(src);resolve();};
   script.onerror=()=>{script.remove();reject(Error('Não foi possível carregar a Academia. Tente abrir a aba novamente.'));};
   root.document.head.append(script);
  });
 }
 function ensure(){
  if(!loading)loading=(async()=>{
   for(const src of scripts)await load(src);
   await root.ForjaGymTraining.init();
   await root.ForjaGymUI.init();
   root.ForjaGymOverview.init();
   return true;
  })().catch(error=>{loading=null;throw error;});
  return loading;
 }
 root.ForjaGymLazy={ensure};
})(globalThis);
