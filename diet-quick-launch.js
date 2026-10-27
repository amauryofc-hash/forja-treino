(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.ForjaDietQuick=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
 'use strict';
 const el=id=>root.document?.getElementById(id);
 let bound=false,previousFocus=null;
 function close(){
  const panel=el('diet-add-card'),backdrop=el('diet-add-backdrop');
  if(!panel)return;
  panel.hidden=true;if(backdrop)backdrop.hidden=true;
  root.document.body.classList.remove('diet-entry-open');
  const focusTarget=previousFocus?.isConnected===false?el('diet-quick-meals')?.querySelector('button'):previousFocus;
  focusTarget?.focus?.();previousFocus=null;
 }
 function open(){
  const panel=el('diet-add-card'),backdrop=el('diet-add-backdrop');
  if(!panel)return;
  previousFocus=root.document.activeElement;
  panel.hidden=false;if(backdrop)backdrop.hidden=false;
  root.document.body.classList.add('diet-entry-open');
  el('diet-entry-close')?.focus?.();
 }
 function render(){
  const box=el('diet-quick-meals');if(!box)return;
  box.replaceChildren();
  const button=root.document.createElement('button');
  button.type='button';button.className='primary diet-entry-trigger';
  button.textContent='＋ Adicionar refeição';button.onclick=open;box.append(button);
 }
 function init(){
  if(bound||!el('diet-add-card'))return;
  bound=true;
  el('diet-entry-close')?.addEventListener('click',close);
  el('diet-add-backdrop')?.addEventListener('click',close);
  root.document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!el('diet-add-card').hidden)close();});
  render();
 }
 return{open,close,render,init};
});
