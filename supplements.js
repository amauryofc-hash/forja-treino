(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.ForjaSupplements=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
 'use strict';
 const DEFINITIONS='supplements-v1',CHECKS='supplement-checks-v1',el=id=>root.document?.getElementById(id),storage=()=>root.ForjaStorage||root.storage;
 const dateKey=(date=new Date())=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
 async function read(key,fallback){try{const row=await storage()?.get(key);return row?.value?JSON.parse(row.value):fallback;}catch{return fallback;}}
 async function write(key,value){await storage()?.set(key,JSON.stringify(value));return value;}
 function validate({name,dose,kcal}){const label=String(name||'').trim(),portion=String(dose||'').trim(),energy=kcal===''||kcal==null?null:Number(kcal);if(!label||label.length>60)throw Error('Informe um nome de até 60 caracteres.');if(!portion||portion.length>40)throw Error('Informe a dose.');if(energy!=null&&(!Number.isFinite(energy)||energy<0||energy>2000))throw Error('Calorias por dose devem ficar entre 0 e 2.000.');return{name:label,dose:portion,kcal:energy};}
 async function add(definition){const valid=validate(definition),list=await read(DEFINITIONS,[]);if(list.some(item=>item.name.toLocaleLowerCase('pt-BR')===valid.name.toLocaleLowerCase('pt-BR')))throw Error('Esse suplemento já foi cadastrado.');const item={id:root.crypto?.randomUUID?.()||`s-${Date.now()}-${Math.random().toString(36).slice(2)}`,...valid};await write(DEFINITIONS,[...list,item]);return item;}
 async function remove(id){const list=await read(DEFINITIONS,[]);await write(DEFINITIONS,list.filter(item=>item.id!==id));const checks=await read(CHECKS,{});for(const day of Object.keys(checks)){checks[day]=(checks[day]||[]).filter(value=>value!==id);if(!checks[day].length)delete checks[day];}await write(CHECKS,checks);}
 async function toggle(id,date=dateKey()){if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>dateKey())throw Error('Data inválida.');const definitions=await read(DEFINITIONS,[]);if(!definitions.some(item=>item.id===id))throw Error('Suplemento não encontrado.');const checks=await read(CHECKS,{}),set=new Set(checks[date]||[]);if(set.has(id))set.delete(id);else set.add(id);checks[date]=[...set];if(!set.size)delete checks[date];await write(CHECKS,checks);return set.has(id);}
 async function render(){
  const box=el('supplements-today'),manage=el('supplements-manage-list');if(!box)return;
  const [list,checks]=await Promise.all([read(DEFINITIONS,[]),read(CHECKS,{})]),taken=new Set(checks[dateKey()]||[]);
  box.replaceChildren();manage?.replaceChildren();
  if(!list.length){const p=root.document.createElement('p');p.className='calc-formula-note';p.textContent='Adicione um suplemento para marcá-lo aqui junto da creatina.';box.append(p);return;}
  for(const item of list){
   const button=root.document.createElement('button');button.type='button';button.className='supplement-chip';button.setAttribute('aria-pressed',String(taken.has(item.id)));button.textContent=`${taken.has(item.id)?'✓ ':'○ '}${item.name} · ${item.dose}`;
   button.onclick=async()=>{try{await toggle(item.id);await render();}catch(error){el('supplements-status').textContent=error.message;}};box.append(button);
   if(manage){const row=root.document.createElement('div');row.className='supplement-manage-row';const label=root.document.createElement('span');label.textContent=`${item.name} · ${item.dose}${item.kcal!=null?` · ${item.kcal} kcal`:''}`;const removeButton=root.document.createElement('button');removeButton.type='button';removeButton.className='secondary-btn';removeButton.textContent='Excluir';removeButton.setAttribute('aria-label','Excluir '+item.name);removeButton.onclick=async()=>{await remove(item.id);await render();};row.append(label,removeButton);manage.append(row);}
  }
 }
 function init(){const form=el('supplement-form');if(!form||form.dataset.bound)return;form.dataset.bound='1';form.addEventListener('submit',async event=>{event.preventDefault();try{await add({name:el('supplement-name').value,dose:el('supplement-dose').value,kcal:el('supplement-kcal').value});form.reset();el('supplements-status').textContent='Suplemento adicionado.';await render();}catch(error){el('supplements-status').textContent=error.message;}});render();}
 return{DEFINITIONS,CHECKS,dateKey,validate,read,add,remove,toggle,render,init};
});
