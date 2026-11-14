/* Recolhe apenas blocos longos; os controles existentes continuam no mesmo cartão. */
(function(root){
 function foldCard(card,title){
  if(!card||card.querySelector(':scope > details.forja-fold'))return;
  const details=root.document.createElement('details');details.className='forja-fold';
  const summary=root.document.createElement('summary');summary.textContent=title;
  const content=root.document.createElement('div');content.className='forja-fold-content';
  const heading=card.querySelector(':scope > .card-head');if(heading)heading.remove();
  while(card.firstChild)content.append(card.firstChild);
  details.append(summary,content);card.append(details);
 }
 function init(){
  const doc=root.document;
  const gym=doc.getElementById('tab-academia');
  const gymDate=doc.getElementById('gym-overview-date');
  if(gymDate)gymDate.textContent=new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'short'});
  if(gym&&!gym.dataset.jumpReady)gym.addEventListener('click',event=>{
   const button=event.target.closest('[data-gym-jump]');if(!button)return;
   const target=doc.getElementById(button.dataset.gymJump);if(!target)return;
   if(target.matches('details'))target.open=true;
   const parent=target.closest('details.gym-archive-section');if(parent)parent.open=true;
   target.scrollIntoView({behavior:'smooth',block:'start'});
  });
  if(gym)gym.dataset.jumpReady='1';
  const sync=doc.getElementById('sync-center-card');
  if(sync&&!sync.querySelector(':scope > details.forja-fold')){
   for(const id of ['strava-card','health-connect-card']){
    const card=doc.getElementById(id);if(card)sync.append(card);
   }
   foldCard(sync,'🔄 Central de sincronização');
  }
  const settings=doc.querySelector('#tab-mais > .card:not([id])');
  if(settings)settings.id='forja-settings-card';
  const more=doc.getElementById('tab-mais');
  if(more&&!more.dataset.jumpReady){more.addEventListener('click',event=>{
   const button=event.target.closest('[data-forja-jump]');if(!button)return;
   const target=doc.getElementById(button.dataset.forjaJump);if(!target)return;
   for(let parent=target.parentElement;parent&&parent!==more;parent=parent.parentElement)if(parent.matches('details'))parent.open=true;
   const fold=target.querySelector(':scope > details.forja-fold');if(fold)fold.open=true;
   target.scrollIntoView({behavior:'smooth',block:'start'});
  });more.dataset.jumpReady='1';}
  if(settings&&more&&!doc.getElementById('forja-personalize-card')){
   const personal=doc.createElement('div');personal.id='forja-personalize-card';personal.className='card';
   personal.innerHTML='<div class="card-head"><h2>🎛️ Personalizar recursos</h2></div>';
   function moveCluster(id,before){const target=doc.getElementById(id);if(!target||!settings.contains(target))return;const nodes=[];let node=target;for(let i=0;i<before;i++){node=node.previousElementSibling;if(node)nodes.unshift(node);}nodes.push(target);nodes.forEach(item=>personal.append(item));}
   moveCluster('custom-card-form',2);
   moveCluster('custom-week-cards-settings',0);
   more.append(personal);
  }
  for(const [id,title] of [
   ['forja-reminders-card','🔔 Avisos no celular'],
   ['dash-gym-card','💳 Pagamento do CrossFit'],
   ['forja-settings-card','⚙️ Abas, cartões e preferências'],
   ['forja-personalize-card','🎛️ Meus cartões semanais'],
   ['privacy-card','🔒 Privacidade e acesso'],
   ['update-card','⬆ Atualizações'],
   ['checkpoint-card','💾 Salvar tudo'],
   ['reset-dados-card','🗑️ Zerar dados anteriores']
  ])foldCard(doc.getElementById(id),title);
  if(more&&!more.querySelector('.forja-settings-group')){
   for(const [title,ids,kind] of [
    ['🔗 Integrações e conexões',['sync-center-card','dash-gym-card','gdrive-card','checkpoint-card'],'connections'],
    ['⚙️ Configurações e preferências',['forja-reminders-card','forja-settings-card'],'preferences'],
    ['🎛️ Personalizar recursos',['forja-personalize-card'],'personalize'],
    ['🔒 Privacidade e dados',['privacy-card','reset-dados-card'],'privacy'],
    ['ℹ️ Sobre o app',['update-card'],'about']
   ]){
    const cards=ids.map(id=>doc.getElementById(id)).filter(card=>card&&more.contains(card));if(!cards.length)continue;
    const group=doc.createElement('details');group.className='card forja-settings-group';group.dataset.kind=kind;
    const header=doc.createElement('summary');header.textContent=title;group.append(header);
    const body=doc.createElement('div');body.className='forja-settings-group-body';cards.forEach(card=>body.append(card));group.append(body);more.append(group);
   }
  }
 }
 function openDiet(){root.ForjaDietQuick?.open?.();}
 root.ForjaPanels={init,openDiet};
})(globalThis);
