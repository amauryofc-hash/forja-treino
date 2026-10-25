(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.ForjaDietRecipes=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const KEY='diet-recipes-v1';
  function make(name,servings,rows){
    name=String(name||'').trim();servings=Number(servings);
    if(!name||name.length>80||!Number.isInteger(servings)||servings<1||servings>100||!Array.isArray(rows)||!rows.length||rows.length>40)throw Error('Informe nome, porções e alimentos da receita.');
    if(rows.some(row=>!row.food||!Number.isFinite(row.quantity)||row.quantity<=0))throw Error('Confira a quantidade e os nutrientes de cada alimento antes de guardar a receita.');
    return {id:`recipe-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,name,servings,rows:JSON.parse(JSON.stringify(rows.map(({name,unit,quantity,food})=>({name,unit,quantity,food}))))};
  }
  function oneServing(recipe){return recipe.rows.map(row=>({...JSON.parse(JSON.stringify(row)),quantity:row.quantity/recipe.servings}));}
  async function list(){try{const record=await root.ForjaStorage.get(KEY),items=JSON.parse(record?.value||'[]');return Array.isArray(items)?items.filter(item=>item&&item.name&&Array.isArray(item.rows)).slice(0,50):[];}catch{return [];}}
  async function render(){const select=root.document?.getElementById('diet-recipe-select');if(!select)return;const items=await list();select.replaceChildren();for(const item of items){const option=root.document.createElement('option');option.value=item.id;option.textContent=`${item.name} · ${item.servings} porções`;select.append(option);}root.document.getElementById('diet-recipe-message').textContent=items.length?'Escolha uma receita e acrescente uma porção à refeição atual.':'Nenhuma receita guardada neste aparelho.';}
  async function save(){const flow=root.ForjaDietFlow,name=root.document.getElementById('diet-recipe-name').value,servings=root.document.getElementById('diet-recipe-servings').value,message=root.document.getElementById('diet-recipe-message');try{const item=make(name,servings,flow.getRows()),items=await list();if(items.length>=50)throw Error('Limite de 50 receitas atingido. Remova alguma antes de salvar.');items.push(item);await root.ForjaStorage.set(KEY,JSON.stringify(items));await render();message.textContent='Receita guardada. O lançamento atual foi mantido.';}catch(error){message.textContent=error.message||'Não foi possível guardar a receita.';}}
  async function add(){const id=root.document.getElementById('diet-recipe-select').value,item=(await list()).find(value=>value.id===id);if(!item)return;root.ForjaDietFlow.appendRows(oneServing(item));}
  async function remove(){const id=root.document.getElementById('diet-recipe-select').value,items=await list();if(!id||!root.confirm('Remover esta receita guardada?'))return;await root.ForjaStorage.set(KEY,JSON.stringify(items.filter(item=>item.id!==id)));await render();}
  function init(){const panel=root.document?.getElementById('diet-recipes-panel');if(!panel)return;panel.addEventListener('toggle',()=>{if(panel.open)render();});root.document.getElementById('diet-recipe-save').addEventListener('click',save);root.document.getElementById('diet-recipe-add').addEventListener('click',add);root.document.getElementById('diet-recipe-remove').addEventListener('click',remove);}
  if(root.document){if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',init,{once:true});else init();}
  return {make,oneServing,list};
});
