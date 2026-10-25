(function(root){
 'use strict';
 async function dictate(targetId,statusId){
  const field=root.document.getElementById(targetId),status=root.document.getElementById(statusId);
  if(!field||!status)return;
  const plugin=root.Capacitor?.Plugins?.VoiceInput;
  if(!plugin){status.textContent='No navegador, use o microfone do teclado para ditar neste campo.';field.focus();return;}
  status.textContent='Abrindo o reconhecimento de voz do celular…';
  try{
   const result=await plugin.dictate();
   if(result.cancelled){status.textContent='Ditado cancelado; seu texto foi mantido.';return;}
   const phrase=String(result.text||'').trim();
   if(!phrase){status.textContent='Não entendi a fala. Você pode tentar novamente ou digitar.';return;}
   field.value=[field.value.trim(),phrase].filter(Boolean).join(field.value.trim().endsWith(',')?' ':', ');
   field.dispatchEvent(new Event('input',{bubbles:true}));
   status.textContent='Texto acrescentado. Confira antes de interpretar ou salvar.';
  }catch(error){status.textContent=error.message||'Ditado indisponível. Use o microfone do teclado ou digite.';}
 }
 root.ForjaVoiceInput={dictate};
})(globalThis);
