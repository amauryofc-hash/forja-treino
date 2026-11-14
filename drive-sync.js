(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.ForjaDriveSync=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
 'use strict';
 const API='https://www.googleapis.com/drive/v3/files',UPLOAD='https://www.googleapis.com/upload/drive/v3/files';
 const META='forja-drive-sync-meta-v1',AUTO='forja-drive-sync-auto-v1',PREFIX='forja-sync-op-';
 const EXCLUDED=new Set(['gym-active-workout-v1','sync-state-v1','progress-photos']);
 const allowed=()=>root.ForjaDataFoundation.ALLOWED_KEYS.filter(key=>!EXCLUDED.has(key));
 const store=()=>root.ForjaStorage||root.storage;
 const el=id=>root.document?.getElementById(id);
 const empty=()=>({format:'forja-treino-backup',version:root.ForjaDataFoundation.VERSION,data:{},database:{}});
 const id=()=>root.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`;
 let busy=false,timer=null;
 function message(text){const node=el('gdrive-sync-status');if(node)node.textContent=text;}
 function snapshot(raw){const checked=root.ForjaDataFoundation.validateBackup(raw);if(!checked.valid)throw Error(checked.error);const data={};for(const key of allowed())if(Object.hasOwn(checked.value.data,key))data[key]=checked.value.data[key];return {format:checked.value.format,version:checked.value.version,data,database:checked.value.database};}
 async function readMeta(){try{const row=await store().get(META),value=row?.value?JSON.parse(row.value):null;return value&&Array.isArray(value.seen)&&value.base?value:{device:id(),seen:[],base:empty()};}catch{return{device:id(),seen:[],base:empty()};}}
 async function saveMeta(value){await store().set(META,JSON.stringify(value));}
 async function request(url,options={}){const token=root.ForjaGDriveSession?.token?.();if(!token)throw Error('Conecte sua conta Google para sincronizar.');const response=await root.fetch(url,{...options,headers:{Authorization:`Bearer ${token}`,...options.headers}});if(!response.ok)throw Error(`Google Drive não respondeu à sincronização (${response.status}).`);return response;}
 async function list(){const folder=await root.ForjaGDriveSession.folder();if(!/^[A-Za-z0-9_-]+$/.test(folder))throw Error('Pasta do Drive inválida.');let page='',files=[];
  do{const q=encodeURIComponent(`'${folder}' in parents and name contains '${PREFIX}' and trashed = false`),url=`${API}?q=${q}&fields=nextPageToken,files(id,name,createdTime,size)&pageSize=1000${page?'&pageToken='+encodeURIComponent(page):''}`;const body=await(await request(url)).json();files.push(...(Array.isArray(body.files)?body.files:[]));page=body.nextPageToken||'';if(files.length>10000)throw Error('Há muitas versões no Drive. Faça uma cópia manual e revise a sincronização.');}while(page);
  return files.filter(file=>file?.name?.startsWith(PREFIX)&&/^[A-Za-z0-9_-]+$/.test(file.id)).sort((a,b)=>String(a.createdTime).localeCompare(String(b.createdTime))||String(a.id).localeCompare(String(b.id)));
 }
 async function download(file){const raw=await(await request(`${API}/${file.id}?alt=media`)).text();if(raw.length>15_000_000)throw Error('Uma versão da nuvem é grande demais para sincronizar automaticamente.');const op=JSON.parse(raw);if(op?.format!=='forja-sync-operation'||op.version!==1||typeof op.device!=='string'||!op.base||!op.after)throw Error('Uma versão da nuvem está em formato desconhecido.');return {device:op.device,base:snapshot(op.base),after:snapshot(op.after)};}
 async function upload(device,base,after){const folder=await root.ForjaGDriveSession.folder(),name=`${PREFIX}${Date.now()}-${id()}.json`,content=JSON.stringify({format:'forja-sync-operation',version:1,device,base,after}),bytes=new TextEncoder().encode(content);
  const start=await request(`${UPLOAD}?uploadType=resumable&fields=id,name,createdTime`,{method:'POST',headers:{'Content-Type':'application/json; charset=UTF-8','X-Upload-Content-Type':'application/json','X-Upload-Content-Length':String(bytes.byteLength)},body:JSON.stringify({name,mimeType:'application/json',parents:[folder]})});const location=start.headers.get('Location');if(!location?.startsWith('https://www.googleapis.com/'))throw Error('O Drive não devolveu um endereço seguro para o envio.');const saved=await(await request(location,{method:'PUT',headers:{'Content-Type':'application/json'},body:bytes})).json();if(!/^[A-Za-z0-9_-]+$/.test(saved.id||''))throw Error('O Drive não confirmou a versão enviada.');return saved.id;
 }
 function showConflicts(paths){const panel=el('gdrive-sync-conflicts');if(!panel)return;panel.replaceChildren();if(!paths.length)return;const title=root.document.createElement('p');title.textContent=`${paths.length} diferença(s) precisam da sua escolha:`;panel.append(title);const list=root.document.createElement('ul');for(const path of paths.slice(0,20)){const item=root.document.createElement('li');item.textContent=path;list.append(item);}panel.append(list);for(const [choice,label] of [['local','Manter meus dados nesses conflitos'],['remote','Usar a versão da nuvem nesses conflitos']]){const button=root.document.createElement('button');button.type='button';button.className='secondary-btn';button.textContent=label;button.addEventListener('click',()=>sync(choice));panel.append(button);}}
 async function sync(prefer,automatic=false){if(busy)return{busy:true};busy=true;const button=el('gdrive-sync-btn');if(button)button.disabled=true;message('Conferindo alterações deste aparelho e do Drive…');try{
   if(root.ForjaFlushPendingWrites)await root.ForjaFlushPendingWrites();
   const meta=await readMeta(),base=snapshot(meta.base),local=snapshot(await root.ForjaDataFoundation.buildBackup()),seen=new Set(meta.seen),files=await list();let merged=local,conflicts=[],processed=[];
   for(const file of files){if(seen.has(file.id))continue;const op=await download(file),result=root.ForjaSyncMerge.mergeBackup(op.base,merged,op.after,allowed(),prefer?{prefer}:undefined);conflicts.push(...result.conflicts.map(path=>`${file.name}: ${path}`));if(result.conflicts.length&&!prefer){showConflicts([...new Set(conflicts)]);message('Há diferenças entre aparelhos. Escolha como resolver antes de aplicar qualquer dado.');return{conflicts};}merged=result.backup;processed.push(file.id);}
   const remoteChange=!root.ForjaSyncMerge.same(local,merged);
   if(automatic&&remoteChange){message('Há dados novos no Drive. Toque em Sincronizar quando terminar o lançamento atual.');return{pending:true,processed:processed.length};}
   if(!root.ForjaSyncMerge.same(local,snapshot(await root.ForjaDataFoundation.buildBackup())))throw Error('Os dados mudaram durante a sincronização. Tente novamente.');
   const changedHere=!root.ForjaSyncMerge.same(base,local),needsUpload=changedHere||Boolean(prefer&&conflicts.length);let own=null;
   if(needsUpload)own=await upload(meta.device,base,merged);
   if(!root.ForjaSyncMerge.same(local,snapshot(await root.ForjaDataFoundation.buildBackup())))throw Error('Os dados mudaram durante o envio. Repita a sincronização para incluir os lançamentos mais recentes.');
   if(remoteChange)await root.ForjaDataFoundation.replaceBackup(merged,store(),root.ForjaDB,{keys:allowed()});
   if(own)processed.push(own);
   await saveMeta({...meta,base:merged,seen:[...new Set([...meta.seen,...processed])],lastSuccess:new Date().toISOString()});showConflicts([]);
   message(processed.length?`Sincronizado. ${processed.length} versão(ões) conferida(s).`:'Tudo atualizado entre este aparelho e o Drive.');if(remoteChange)root.location?.reload?.();return{ok:true,processed:processed.length};
  }catch(error){message(error.message||'Não foi possível sincronizar agora.');return{error};}finally{busy=false;if(button)button.disabled=false;}}
 async function setAuto(value){await store().set(AUTO,JSON.stringify(Boolean(value)));message(value?'Sincronização automática ativada para quando o Google Drive estiver conectado.':'Sincronização automática desativada.');}
 async function onConnected(){try{const row=await store().get(AUTO);if(row?.value==='true')return await sync(undefined,true);}catch{}return null;}
 async function init(){const button=el('gdrive-sync-btn'),toggle=el('gdrive-sync-auto');if(!button||button.dataset.bound)return;button.dataset.bound='1';button.addEventListener('click',()=>sync());if(toggle){try{toggle.checked=(await store().get(AUTO))?.value==='true';}catch{}toggle.addEventListener('change',()=>setAuto(toggle.checked));}button.disabled=!root.ForjaGDriveSession?.token?.();timer=root.setInterval?.(()=>{if(root.ForjaGDriveSession?.token?.())onConnected();},15*60*1000);}
 function render(){const button=el('gdrive-sync-btn');if(button)button.disabled=!root.ForjaGDriveSession?.token?.();}
 return{snapshot,readMeta,list,download,upload,sync,setAuto,onConnected,init,render};
});
