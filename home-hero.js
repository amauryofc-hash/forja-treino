(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.ForjaHomeHero=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
 'use strict';
 const greeting=hour=>hour<12?'Bom dia':hour<18?'Boa tarde':'Boa noite';
 function render(){const doc=root.document;if(!doc?.getElementById('home-hero'))return;const now=new Date();doc.getElementById('home-hero-date').textContent=now.toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'});doc.getElementById('home-hero-greeting').textContent=`${greeting(now.getHours())}, vamos cuidar de hoje.`;
  for(const [target,source] of [['home-hero-water','water-bottle-dash-label'],['home-hero-steps','dash-steps'],['home-hero-balance','dash-cal-balance']]){const value=doc.getElementById(source)?.textContent?.trim();doc.getElementById(target).textContent=value||'—';}
 }
 return{greeting,render};
});
