(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.ForjaDietQuick=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
 'use strict';
 const el=id=>root.document?.getElementById(id);
 let bound=false,previousFocus=null,openedMethod=null;
 function close(){
  const panel=el('diet-add-card'),backdrop=el('diet-add-backdrop');
  if(!panel)return;
  const quick=el('diet-fast-text'),draft=el(openedMethod==='ai'?'diet-simple-text':'quick-paste');
  if((openedMethod==='text'||openedMethod==='ai')&&quick&&draft)quick.value=draft.value;
  panel.hidden=true;if(backdrop)backdrop.hidden=true;
  root.document.body.classList.remove('diet-entry-open');
  const focusTarget=previousFocus?.isConnected===false?el('diet-quick-meals')?.querySelector('button'):previousFocus;
  focusTarget?.focus?.();previousFocus=null;openedMethod=null;
 }
 function open(){
  const panel=el('diet-add-card'),backdrop=el('diet-add-backdrop');
  if(!panel)return;
  previousFocus=root.document.activeElement;
  const title=el('diet-entry-title');if(title)title.textContent='Adicionar refeição';
  el('diet-meal-choice').hidden=false;
  el('diet-selected-meal').hidden=true;
  el('diet-simple').hidden=true;
  panel.hidden=false;if(backdrop)backdrop.hidden=false;
  root.document.body.classList.add('diet-entry-open');
  el('diet-entry-close')?.focus?.();
 }
 function openWith(method){
  if(method==='text'){
   const quick=el('diet-fast-text');
   const content=quick?.value.trim()||'';
   method=/(?:\bkcal\b|calorias?|prote[ií]nas?|carboidratos?|gorduras?)/i.test(content)?'text':'ai';
   const draft=el(method==='text'?'quick-paste':'diet-simple-text');
   if(quick&&draft&&quick.value.trim()){
    const fresh=quick.value.trim(),existing=draft.value.trim();
    draft.value=existing&&existing!==fresh?existing+'\n'+fresh:fresh;
    quick.value='';
   }
  }
  open();openedMethod=method;
  root.ForjaDietFlow?.showMethod?.(method);
  el('diet-meal-type-grid')?.querySelector('button')?.focus?.();
 }
 function openForMeal(key){
  openWith('food');
  root.selectDietMealType?.(key);
  const title=el('diet-entry-title');
  const labels={cafe:'Café',almoco:'Almoço',lanche:'Lanche',janta:'Janta',ceia:'Ceia',livre:'Refeição livre'};
  if(title)title.textContent='Adicionar '+(labels[key]||'refeição');
 }
 function onMealSelected(key){
  const labels={cafe:'☕ Café',almoco:'🍛 Almoço',lanche:'🍪 Lanche',janta:'🍲 Janta',ceia:'🌙 Ceia',livre:'📝 Livre'};
  if(!labels[key]||el('diet-add-card')?.hidden)return;
  el('diet-meal-choice').hidden=true;
  el('diet-selected-meal').hidden=false;
  el('diet-selected-meal-name').textContent=labels[key];
  el('diet-simple').hidden=false;
  el('diet-entry-title').textContent='Adicionar '+labels[key].replace(/^\S+\s/,'');
 }
 function render(){
  const box=el('diet-quick-meals');if(!box)return;
  box.replaceChildren();
  function action(label,kind,callback){const button=root.document.createElement('button');button.type='button';button.className=kind+' diet-entry-trigger';button.textContent=label;button.addEventListener('click',callback);return button;}
  box.append(action('✓ Revisar texto e lançar','primary',()=>openWith('text')));
  box.append(action('📷 Tirar foto','secondary-btn',()=>{openWith('photo');el('diet-simple-photo')?.click?.();}));
  box.append(action('🖼 Escolher da galeria','secondary-btn',()=>{openWith('photo');el('diet-simple-photo-gallery')?.click?.();}));
  const more=root.document.createElement('details');more.className='diet-fast-more';
  const summary=root.document.createElement('summary');summary.textContent='Outras formas de adicionar';more.append(summary);
  const actions=root.document.createElement('div');actions.className='diet-fast-more-actions';
  for(const [method,label] of [['food','Buscar alimento'],['barcode','Código de barras'],['custom','Cadastrar produto'],['ai','Estimar por IA']])actions.append(action(label,'secondary-btn',()=>openWith(method)));
  more.append(actions);box.append(more);
 }
 function init(){
  if(bound||!el('diet-add-card'))return;
  bound=true;
  el('diet-entry-close')?.addEventListener('click',close);
  el('diet-add-backdrop')?.addEventListener('click',close);
  el('diet-change-meal')?.addEventListener('click',()=>{el('diet-meal-choice').hidden=false;el('diet-meal-type-grid')?.querySelector('button.active')?.focus?.();});
  root.document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!el('diet-add-card').hidden)close();});
  render();
 }
 return{open,openWith,openForMeal,onMealSelected,close,render,init};
});
