(function(root){
 'use strict';
 function status(message){const area=root.document?.getElementById('ota-update-status');if(area)area.textContent=message;}
 async function check(){status('Para atualizar a versão compartilhável, peça um novo pacote a quem distribuiu o aplicativo. Seus registros continuam neste aparelho.');return {available:false,shared:true};}
 async function init(){try{await root.Capacitor?.Plugins?.CapacitorUpdater?.notifyAppReady?.();}catch{}await check();}
 async function apply(){return check();}
 root.ForjaOtaUpdate={check,init,apply};
})(globalThis);
