(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.ForjaOtaUpdate=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
 'use strict';
 const MANIFEST='https://raw.githubusercontent.com/amauryofc-hash/forja-treino/main/ota-manifest.json';
 const PREFIXES=['https://raw.githubusercontent.com/amauryofc-hash/forja-treino/main/bundles/','https://amauryofc-hash.github.io/forja-treino/bundles/'];
 const version=/^\d+\.\d+\.\d+$/;
 const hash=/^[a-f0-9]{64}$/i;
 let pending=null,busy=false;
 function plugin(){return root.Capacitor?.Plugins?.CapacitorUpdater||null;}
 function compare(a,b){const parts=x=>String(x).split('.').map(Number),left=parts(a),right=parts(b);for(let i=0;i<3;i++){if(left[i]!==right[i])return left[i]>right[i]?1:-1;}return 0;}
 function validate(value){
  if(!value||value.variant!=='personal'||!version.test(value.version)||!version.test(value.minNative)||!hash.test(value.checksum||''))throw Error('Pacote pessoal de atualização inválido.');
  const url=new URL(value.url);
  if(url.protocol!=='https:'||!PREFIXES.some(prefix=>url.href.startsWith(prefix))||!url.pathname.endsWith('.zip')||url.username||url.password||url.search||url.hash)throw Error('Origem do pacote não autorizada.');
  return {version:value.version,minNative:value.minNative,checksum:value.checksum.toLowerCase(),url:url.href,variant:'personal'};
 }
 function status(message){const area=root.document?.getElementById('ota-update-status');if(area)area.textContent=message;}
 function button(){return root.document?.getElementById('ota-update-check');}
 async function check(){
  const updater=plugin();if(!updater){status('No navegador, as novidades aparecem ao recarregar a página. No APK atual, instale uma vez a versão preparada para atualizações pelo GitHub.');return {native:false};}
  const current=await updater.current(),native=current.native,bundle=current.bundle?.version;
  if(!version.test(native))throw Error('Versão nativa desconhecida; atualização não aplicada.');
  const response=await root.fetch(MANIFEST,{cache:'no-store',credentials:'omit',redirect:'error'});
  if(!response.ok)throw Error('Não foi possível consultar o GitHub.');
  const manifest=validate(await response.json());
  if(compare(native,manifest.minNative)<0){status('Esta atualização altera recursos do Android e precisa de um novo APK. Seus dados permanecem no aparelho.');return {nativeRequired:true};}
  const installed=version.test(bundle)?bundle:native;
  if(compare(installed,manifest.version)>=0){pending=null;status('Forja atualizado: versão '+installed+'.');return {available:false};}
  pending=manifest;status('Nova versão '+manifest.version+' disponível no GitHub. Toque em Atualizar aplicativo para instalar sem baixar um APK. Seus registros permanecem neste aparelho.');return {available:true,manifest};
 }
 async function apply(){
  if(busy||!pending)return;
  const updater=plugin();if(!updater){status('Atualização no APK indisponível.');return;}
  busy=true;const action=button();if(action)action.disabled=true;
  try{status('Baixando e conferindo a atualização…');const bundle=await updater.download({version:pending.version,url:pending.url,checksum:pending.checksum});if(!bundle?.id)throw Error('Pacote incompleto.');status('Aplicando atualização…');await updater.set({id:bundle.id});}
  catch(error){status('Não foi possível atualizar. O conteúdo anterior continua disponível. '+(error?.message||''));}
  finally{busy=false;if(action)action.disabled=false;}
 }
 async function update(){
  if(busy)return;
  const action=button();if(action)action.disabled=true;
  try{const result=await check();if(result.available)await apply();}
  catch(error){status(error?.message||'Não foi possível verificar atualizações.');}
  finally{if(action)action.disabled=false;}
 }
 async function init(){const updater=plugin();if(updater)try{await updater.notifyAppReady();}catch{}try{await check();}catch(error){status(error?.message||'Não foi possível verificar atualizações.');}}
 return {MANIFEST,validate,compare,check,apply,update,init};
});
