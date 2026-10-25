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
  const sync=doc.getElementById('sync-center-card');
  if(sync&&!sync.querySelector(':scope > details.forja-fold')){
   for(const id of ['strava-card','health-connect-card']){
    const card=doc.getElementById(id);if(card)sync.append(card);
   }
   foldCard(sync,'🔄 Central de sincronização');
  }
  const settings=doc.querySelector('#tab-mais > .card:not([id])');
  if(settings)settings.id='forja-settings-card';
  for(const [id,title] of [
   ['forja-reminders-card','🔔 Avisos no celular'],
   ['dash-gym-card','💳 Pagamento do CrossFit'],
   ['forja-settings-card','⚙️ Configurações'],
   ['privacy-card','🔒 Privacidade e acesso'],
   ['update-card','⬆ Atualizações'],
   ['gdrive-card','☁️ Backup no Google Drive'],
   ['checkpoint-card','💾 Salvar tudo'],
   ['reset-dados-card','🗑️ Zerar dados anteriores']
  ])foldCard(doc.getElementById(id),title);
  const diet=doc.getElementById('diet-simple')?.closest('.card');
  if(diet){diet.id='diet-add-card';foldCard(diet,'➕ Adicionar refeição');}
 }
 function openDiet(){const form=root.document.querySelector('#diet-add-card > details.forja-fold');if(form)form.setAttribute('open','');}
 root.ForjaPanels={init,openDiet};
})(globalThis);
