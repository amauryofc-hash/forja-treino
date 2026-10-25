
// ---------- STANDALONE STORAGE POLYFILL ----------
// Inside Claude, `window.storage` is provided by the host and syncs to your
// Claude account. Running standalone (published to a real address, or
// installed to the home screen from that address), there's no such bridge —
// so fall back to the browser's own localStorage. This is reliable and is
// shared automatically between an "installed" home-screen icon and a normal
// browser tab pointed at the SAME address (same origin = same storage).
if(typeof window.storage === 'undefined'){
  const LS_PREFIX = 'forjatreino:';
  window.storage = {
    async get(key){
      const raw = localStorage.getItem(LS_PREFIX + key);
      return raw === null ? null : {key, value: raw};
    },
    async set(key, value){
      localStorage.setItem(LS_PREFIX + key, value);
      return {key, value};
    },
    async delete(key){
      localStorage.removeItem(LS_PREFIX + key);
      return {key, deleted:true};
    },
    async list(prefix){
      const keys = [];
      for(let i=0;i<localStorage.length;i++){
        const k = localStorage.key(i);
        if(k && k.startsWith(LS_PREFIX)){
          const stripped = k.slice(LS_PREFIX.length);
          if(!prefix || stripped.startsWith(prefix)) keys.push(stripped);
        }
      }
      return {keys};
    }
  };
}

// ---------- RESILIENT MIRROR (when the real Claude storage bridge exists but
// intermittently fails, e.g. "Unexpected response type") ----------
// Every successful write also gets mirrored into localStorage on this device,
// instantly and independent of the network. Reads try the real bridge first;
// if it throws, they fall back to the mirror instead of silently returning
// nothing. This does not replace the real sync — it's a local safety net so
// a flaky round-trip can't quietly drop something you just logged.
(function(){
  if(typeof window.storage === 'undefined' || window.storage.__mirrored) return;
  const realGet = window.storage.get.bind(window.storage);
  const realSet = window.storage.set.bind(window.storage);
  const MIRROR_PREFIX = 'forjatreino-mirror:';
  window.storage.get = async function(key){
    try{
      const r = await realGet(key);
      if(r) { try{ localStorage.setItem(MIRROR_PREFIX+key, r.value); }catch(e){} }
      return r;
    }catch(e){
      let mirrored = null;
      try{ mirrored = localStorage.getItem(MIRROR_PREFIX+key); }catch(e2){}
      if(mirrored !== null) return {key, value: mirrored};
      throw e;
    }
  };
  window.storage.set = async function(key, value){
    const result=await realSet(key,value);
    try{ localStorage.setItem(MIRROR_PREFIX+key, value); }catch(e){}
    return result;
  };
  window.storage.__mirrored = true;
})();

// ---------- STORAGE HELPER (retries transient backend failures) ----------
async function storageSet(key, value, attempts=4){
  const delays = [500, 1200, 2500, 4000];
  for(let i=0;i<attempts;i++){
    try{
      const r = await window.storage.set(key, value);
      if(r) return r;
    }catch(e){
      if(i === attempts-1){
        console.warn(`storage set failed for "${key}" after ${attempts} tries:`, e && e.message ? e.message : e);
        return null;
      }
    }
    await new Promise(res=>setTimeout(res, delays[i] || 4000));
  }
  return null;
}

// Groups rapid successive writes to the same key into a single network call,
// so quick back-to-back actions (two photos, several rep taps) don't each fire
// their own storage request and trip the platform's rate limit.
const pendingWrites = {};
function scheduleWrite(key, valueFn, delay=900){
  if(pendingWrites[key]) clearTimeout(pendingWrites[key].timer);
  pendingWrites[key] = {
    valueFn,
    timer: setTimeout(async ()=>{
      delete pendingWrites[key];
      const ok = await storageSet(key, valueFn());
      if(!ok) showToast('Não sincronizou com o servidor ainda, mas seus dados estão salvos nesta sessão.');
    }, delay)
  };
}
// Forces any pending debounced write for a key to happen right away (e.g. before closing/switching context).
async function flushWrite(key){
  const pending = pendingWrites[key];
  if(!pending) return;
  clearTimeout(pending.timer);
  delete pendingWrites[key];
  await storageSet(key, pending.valueFn());
}

// ---------- BACKUP EXPORT / IMPORT ----------
const BACKUP_KEYS = ['body-log','progress-photos','measurements','diet-log','diet-closed-days','water-daily-goal','calorie-calc-lock','shopping-list-checked','shopping-list-removed','shopping-list-custom','visible-tabs-v1','creatine-days-v1','training-goal','rest-day-weekly','local-reminders-v1','gym-plans-v1','gym-sessions-v1','gym-custom-exercises-v1','gym-active-workout-v1','weight-goal-v1'];
async function buildBackupJson(){
  const data = {};
  for(const key of BACKUP_KEYS){
    try{
      const r = await window.storage.get(key);
      data[key] = r ? JSON.parse(r.value) : null;
    }catch(e){
      data[key] = null;
    }
  }
  return JSON.stringify({exportedAt: new Date().toISOString(), data}, null, 2);
}

async function exportBackup(){
  const jsonStr = await buildBackupJson();
  const filename = `forja-treino-backup-${todayKey()}.json`;

  // Try the native share sheet first — works well on mobile even inside
  // restrictive webviews, since it hands off to the OS instead of relying on
  // in-page download APIs.
  let shared = false;
  if(navigator.share && navigator.canShare){
    try{
      const file = new File([jsonStr], filename, {type:'application/json'});
      if(navigator.canShare({files:[file]})){
        await navigator.share({files:[file], title:'Cópia de segurança Forja.Treino'});
        shared = true;
        await window.ForjaBackupStatus?.confirm?.('compartilhado');
        showToast('Cópia de segurança compartilhada! Salve onde preferir.');
      }
    }catch(e){ /* user cancelled or unsupported — fall through */ }
  }

  // Also try the classic blob-download link, in case that one does work here.
  if(!shared){
    try{
      const blob = new Blob([jsonStr], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(()=>URL.revokeObjectURL(url), 3000);
    }catch(e){ /* ignore — the text fallback below always works */ }
  }

  // Always show a copyable text fallback too — this has no dependency on any
  // download/share API, so it works even when both of the above are blocked.
  const panel = document.getElementById('backup-text-panel');
  const textarea = document.getElementById('backup-text-area');
  if(panel && textarea){
    textarea.value = jsonStr;
    panel.style.display = 'block';
    panel.scrollIntoView({behavior:'smooth', block:'nearest'});
  }
  if(!shared) showToast('Se não baixou automaticamente, copie o texto que apareceu abaixo.');
}

// One-tap: builds the backup and puts it straight on the clipboard, no
// intermediate textarea/select step needed. Falls back to showing the
// copyable text panel if clipboard access is blocked (e.g. inside an iframe).
async function copyBackupDirect(){
  const jsonStr = await buildBackupJson();
  try{
    if(!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('no clipboard api');
    await navigator.clipboard.writeText(jsonStr);
    await window.ForjaBackupStatus?.confirm?.('copiado');
    showToast('✅ Cópia de segurança copiada! Já pode colar no site novo.');
  }catch(e){
    const panel = document.getElementById('backup-text-panel');
    const textarea = document.getElementById('backup-text-area');
    if(panel && textarea){
      textarea.value = jsonStr;
      panel.style.display = 'block';
      panel.scrollIntoView({behavior:'smooth', block:'nearest'});
    }
    showToast('Não consegui copiar automático — toque em "📋 Copiar texto" abaixo.');
  }
}

// One-tap paste: reads the clipboard straight into the import box. Falls
// back to asking for a manual paste if clipboard read is blocked.
async function pasteBackupDirect(){
  try{
    if(!navigator.clipboard || !navigator.clipboard.readText) throw new Error('no clipboard api');
    const text = await navigator.clipboard.readText();
    if(!text || !text.trim()){ showToast('A área de transferência está vazia.'); return; }
    const textarea = document.getElementById('backup-paste-area');
    if(textarea) textarea.value = text;
    clearBackupPreview();
    showToast('Colado! Toque em "Conferir cópia" antes de restaurar.');
  }catch(e){
    showToast('Não consegui ler a área de transferência — cole manualmente no campo abaixo (toque e segure → Colar).');
  }
}
function copyBackupText(){
  const textarea = document.getElementById('backup-text-area');
  if(!textarea) return;
  textarea.select();
  textarea.setSelectionRange(0, 999999);
  try{
    if(!document.execCommand('copy'))throw new Error('Cópia não confirmada');
    window.ForjaBackupStatus?.confirm?.('copiado');
    showToast('Texto copiado! Cole num app de notas ou no Drive.');
  }catch(e){
    if(navigator.clipboard){
      navigator.clipboard.writeText(textarea.value).then(()=>window.ForjaBackupStatus?.confirm?.('copiado')).then(()=>showToast('Texto copiado!')).catch(()=>showToast('Não foi possível confirmar a cópia.'));
    } else {
      showToast('Selecione o texto manualmente e copie.');
    }
  }
}

function triggerImportPicker(){
  document.getElementById('backup-import-file').click();
}
document.addEventListener('DOMContentLoaded', ()=>{
  const el = document.getElementById('backup-import-file');
  if(el) el.addEventListener('change', handleImportFile);
  document.getElementById('backup-paste-area')?.addEventListener('input',clearBackupPreview);
});
let pendingBackupRestore = null;
function clearBackupPreview(){
  pendingBackupRestore = null;
  const panel = document.getElementById('backup-import-preview');
  if(panel) panel.hidden = true;
}
function prepareBackupRestore(raw, source){
  const parsed = JSON.parse(raw);
  const foundation = window.ForjaDataFoundation;
  const allowed = foundation?.ALLOWED_KEYS || BACKUP_KEYS;
  const legacy = parsed && typeof parsed === 'object' && !Array.isArray(parsed) &&
    !parsed.format && !parsed.version && parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data);
  const normalized = legacy ? {...parsed, version:2} : parsed;
  const checked = foundation?.validateBackup(normalized);
  if(!checked?.valid) throw new Error(checked?.error || 'Formato de cópia inválido.');
  const keys = Object.keys(checked.value.data).filter(key=>allowed.includes(key));
  if(!keys.length && !Object.keys(checked.value.database || {}).length) throw new Error('A cópia não contém registros reconhecidos.');
  pendingBackupRestore = checked.value;
  const panel = document.getElementById('backup-import-preview');
  const detail = document.getElementById('backup-import-detail');
  if(panel && detail){
    const date = Date.parse(parsed.exportedAt);
    detail.textContent = `${source} · ${Number.isFinite(date) ? new Date(date).toLocaleString('pt-BR') : 'data não informada'} · ${keys.length} categorias de dados. Seus registros atuais nessas categorias serão substituídos. Conexões e senhas não são importadas.`;
    panel.hidden = false;
    panel.scrollIntoView?.({behavior:'smooth',block:'nearest'});
  }
}
async function confirmBackupRestore(){
  if(!pendingBackupRestore){showToast('Confira uma cópia primeiro.');return;}
  const backup = pendingBackupRestore;
  clearBackupPreview();
  try{
    const restoredCount = await restoreBackupData(backup);
    showToast(`Cópia restaurada (${restoredCount} categorias). Recarregando...`);
    setTimeout(()=>location.reload(),1800);
  }catch(error){showToast('Não foi possível restaurar: '+error.message);}
}
async function restoreBackupData(parsed){
  const data = parsed.data || parsed;
  let restoredCount = 0;
  for(const key of BACKUP_KEYS){
    if(data[key] !== undefined && data[key] !== null){
      const ok = await storageSet(key, JSON.stringify(data[key]));
      if(ok) restoredCount++;
    }
  }
  return restoredCount;
}
async function handleImportFile(e){
  const file = e.target.files[0];
  if(!file) return;
  try{
    const text = await file.text();
    prepareBackupRestore(text,file.name);
  }catch(err){
    clearBackupPreview();
    showToast('Não consegui conferir esse arquivo: '+err.message);
  }
  e.target.value = '';
}
async function importBackupFromText(){
  const textarea = document.getElementById('backup-paste-area');
  if(!textarea || !textarea.value.trim()){
    showToast('Cole o texto do backup primeiro.');
    return;
  }
  try{
    prepareBackupRestore(textarea.value.trim(),'Texto colado');
  }catch(err){
    clearBackupPreview();
    showToast('Esse texto não parece uma cópia válida: '+err.message);
  }
}

const K_BODY = 'body-log';
// ---------- PROGRESS PHOTOS (body evolution) ----------
const K_PROGRESS = 'progress-photos';
let progressCache = null;
async function loadProgressCache(){
  if(progressCache) return progressCache;
  try{
    const r = await window.storage.get(K_PROGRESS);
    progressCache = r ? JSON.parse(r.value) : [];
  }catch(e){ progressCache = []; }
  return progressCache;
}
async function persistProgressCache(){
  scheduleWrite(K_PROGRESS, ()=>JSON.stringify(progressCache));
}

let selectedAngle = 'Frente';
function selectAngle(btn){
  document.querySelectorAll('.angle-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  selectedAngle = btn.dataset.angle;
}

document.getElementById('progress-photo-file').addEventListener('change', function(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(ev){
    const img = new Image();
    img.onload = async function(){
      const canvas = document.createElement('canvas');
      const maxW = 640;
      const scale = Math.min(1, maxW / img.width);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
      await loadProgressCache();
      progressCache.unshift({id:cid(), date:todayKey(), time:nowTime(), angle:selectedAngle, photo:dataUrl});
      await persistProgressCache();
      document.getElementById('progress-photo-file').value = '';
      showToast('Foto de progresso salva!');
      renderProgressGallery();
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
});

async function renderProgressGallery(){
  const arr = await loadProgressCache();
  document.getElementById('progress-count').textContent = arr.length ? arr.length+' fotos' : '';
  const grid = document.getElementById('progress-grid');
  if(arr.length===0){
    grid.innerHTML = '<div class="empty" style="grid-column:1/-1">Nenhuma foto ainda. Registre sua primeira foto de evolução.</div>';
  } else {
    grid.innerHTML = arr.map((p,i)=>`
      <div class="progress-thumb" onclick="openViewer(${i})">
        <img src="${p.photo}">
        <div class="tag">${escapeHtml(p.angle)}</div>
        <div class="datetag">${fmtDate(p.date).slice(0,5)}</div>
      </div>
    `).join('');
  }
  await renderPhotoReminder(arr);
  await renderPhotosHiddenState();
  await renderPhotoCompare(arr);
}

// ---------- WEEKLY PHOTO REMINDER ----------
async function renderPhotoReminder(arr){
  const el = document.getElementById('photo-reminder-banner');
  if(!el) return;
  if(arr.length===0){
    el.innerHTML = `<div class="photo-reminder-banner">📸 Nenhuma foto de evolução ainda — comece hoje pra ter um antes/depois daqui a algumas semanas.</div>`;
    return;
  }
  const sorted = [...arr].sort((a,b)=> b.date.localeCompare(a.date));
  const lastDate = sorted[0].date;
  const daysSince = Math.floor((new Date(todayKey()+'T00:00:00') - new Date(lastDate+'T00:00:00')) / 86400000);
  if(daysSince >= 7){
    el.innerHTML = `<div class="photo-reminder-banner">📸 Já faz ${daysSince} dias desde a última foto — hora da foto semanal!</div>`;
  } else {
    el.innerHTML = `<div class="photo-reminder-banner">📸 Próxima foto semanal em ${7-daysSince} dia(s) (última: ${fmtDate(lastDate)}).</div>`;
  }
}

// ---------- HIDE/SHOW PHOTO SEQUENCE (privacy toggle) ----------
const K_PHOTOS_HIDDEN = 'progress-photos-hidden';
async function renderPhotosHiddenState(){
  let hidden = false;
  try{
    const r = await window.storage.get(K_PHOTOS_HIDDEN);
    hidden = r && r.value === 'true';
  }catch(e){ hidden = false; }
  const grid = document.getElementById('progress-grid');
  const btn = document.getElementById('photo-hide-toggle');
  if(!grid || !btn) return;
  grid.classList.toggle('hidden-photos', hidden);
  btn.textContent = hidden ? '👁 Mostrar fotos' : '🙈 Ocultar fotos';
}
async function togglePhotosHidden(){
  tapFeedback();
  let hidden = false;
  try{
    const r = await window.storage.get(K_PHOTOS_HIDDEN);
    hidden = r && r.value === 'true';
  }catch(e){ hidden = false; }
  await storageSet(K_PHOTOS_HIDDEN, hidden ? 'false' : 'true');
  await renderPhotosHiddenState();
}

// ---------- BEFORE/AFTER COMPARISON SLIDER ("alternante") ----------
let compareAngle = 'Frente';
let compareLeftId = null, compareRightId = null;
function selectCompareAngle(btn){
  tapFeedback();
  document.querySelectorAll('#compare-angle-row .angle-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  compareAngle = btn.dataset.angle;
  compareLeftId = null; compareRightId = null;
  renderPhotoCompare();
}
async function renderPhotoCompare(arrParam){
  const card = document.getElementById('photo-compare-card');
  const arr = arrParam || await loadProgressCache();
  const angleRow = document.getElementById('compare-angle-row');
  if(!card || !angleRow) return;

  angleRow.innerHTML = ['Frente','Lado','Costas'].map(a=>
    `<button class="angle-btn ${a===compareAngle?'active':''}" data-angle="${a}" onclick="selectCompareAngle(this)">${a}</button>`
  ).join('');

  const matching = arr.filter(p=>p.angle===compareAngle).sort((a,b)=>a.date.localeCompare(b.date));
  if(matching.length < 2){
    card.style.display = 'none';
    return;
  }
  card.style.display = 'block';
  if(!compareLeftId) compareLeftId = matching[0].id;
  if(!compareRightId) compareRightId = matching[matching.length-1].id;

  const left = matching.find(p=>p.id===compareLeftId) || matching[0];
  const right = matching.find(p=>p.id===compareRightId) || matching[matching.length-1];

  document.getElementById('compare-slider-wrap').innerHTML = `
    <img class="compare-img" src="${left.photo}">
    <img class="compare-img over" id="compare-img-over" src="${right.photo}">
    <input type="range" class="compare-range" min="0" max="100" value="50" oninput="updateCompareSlider(this.value)">
    <div class="compare-handle" id="compare-handle"></div>
    <div class="compare-label left">${fmtDate(left.date)}</div>
    <div class="compare-label right">${fmtDate(right.date)}</div>
  `;
  const dateOptionsFor = (selectedId) => matching.map(p=>
    `<option value="${p.id}" ${p.id===selectedId?'selected':''}>${fmtDate(p.date)}</option>`
  ).join('');
  document.getElementById('compare-dates-row').innerHTML = `
    <select onchange="compareLeftId=this.value; renderPhotoCompare()">${dateOptionsFor(left.id)}</select>
    <select onchange="compareRightId=this.value; renderPhotoCompare()">${dateOptionsFor(right.id)}</select>
  `;
}
function updateCompareSlider(val){
  document.getElementById('compare-img-over').style.clipPath = `inset(0 0 0 ${val}%)`;
  document.getElementById('compare-handle').style.left = val + '%';
}

let viewerIndex = 0;
async function openViewer(i){
  await loadProgressCache();
  viewerIndex = i;
  renderViewer();
  document.getElementById('progress-viewer').style.display = 'flex';
}
function closeViewer(){
  document.getElementById('progress-viewer').style.display = 'none';
}
function renderViewer(){
  const p = progressCache[viewerIndex];
  if(!p){ closeViewer(); return; }
  document.getElementById('viewer-img').src = p.photo;
  document.getElementById('viewer-date').textContent = `${fmtDate(p.date)} · ${p.angle}`;
}
function viewerShift(dir){
  const next = viewerIndex + dir;
  if(next < 0 || next >= progressCache.length) return;
  viewerIndex = next;
  renderViewer();
}
async function deleteViewerPhoto(){
  progressCache.splice(viewerIndex, 1);
  await persistProgressCache();
  if(progressCache.length===0){ closeViewer(); }
  else { viewerIndex = Math.min(viewerIndex, progressCache.length-1); renderViewer(); }
  renderProgressGallery();
}

function slug(name){
  return (name||'').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
}
function cid(){ return Math.random().toString(36).slice(2,10)+Date.now().toString(36); }

let bodyMemCache = null;
async function loadBody(){
  if(bodyMemCache !== null) return bodyMemCache;
  try{
    const r = await window.storage.get(K_BODY);
    bodyMemCache = r ? JSON.parse(r.value) : [];
  }catch(e){
    bodyMemCache = [];
  }
  if(Array.isArray(bodyMemCache)){
    const original=bodyMemCache;
    const cutoff=new Date();cutoff.setHours(0,0,0,0);cutoff.setDate(cutoff.getDate()-5);
    const cutoffKey=todayKey(cutoff),groups=new Map();
    bodyMemCache.forEach(entry=>{if(entry.type==='water'&&entry.date<cutoffKey){const list=groups.get(entry.date)||[];list.push(entry);groups.set(entry.date,list);}});
    let changed=false;
    for(const [date,list] of groups){
      if(list.length===1&&list[0].consolidated)continue;
      const total=list.reduce((sum,item)=>sum+waterMl(item),0);
      bodyMemCache=bodyMemCache.filter(entry=>!list.includes(entry));
      bodyMemCache.push({id:'water-day-'+date,date,type:'water',ml:total,consolidated:true});changed=true;
    }
    if(changed)try{const saved=await window.storage.set(K_BODY,JSON.stringify(bodyMemCache));if(!saved)bodyMemCache=original;}catch{bodyMemCache=original;}
  }
  return bodyMemCache;
}
async function saveBody(arr){
  bodyMemCache = arr; // keep this session correct even if the backend write struggles
  scheduleWrite(K_BODY, ()=>JSON.stringify(bodyMemCache));
}
// IMPORTANT: use LOCAL date components here, not toISOString() (which is
// always UTC). For timezones behind UTC (like Brazil, UTC-3), a workout
// logged late at night would otherwise get silently stamped with tomorrow's
// date, making it look like "yesterday's workout" is still open today.
function todayKey(d=new Date()){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function fmtDate(key){ const [y,m,d] = key.split('-'); return `${d}/${m}/${y}`; }
function nowTime(){ return new Date().toTimeString().slice(0,5); }
function escapeHtml(s){
  if(s===undefined || s===null) return '';
  return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function parseNums(str){
  if(!str) return [];
  const matches = String(str).match(/\d+(?:[.,]\d+)?/g);
  if(!matches) return [];
  return matches.map(s=>parseFloat(s.replace(',','.')));
}
// ---------- SEED (fixed ids so re-loading the app can merge in new entries without duplicating) ----------
function fmtWeight(w){
  const r = Math.round(w*10)/10;
  return String(r).replace('.',',');
}
function tapFeedback(){
  if(navigator.vibrate) navigator.vibrate(8);
}

function periodFor(timeStr){
  const hour = parseInt((timeStr||'12:00').split(':')[0], 10);
  if(hour < 12) return 'manhã';
  if(hour < 18) return 'tarde';
  return 'noite';
}
function waterMl(entry){
  if(entry.ml !== undefined && entry.ml !== null) return Number(entry.ml);
  if(entry.value !== undefined){
    const n = parseFloat(String(entry.value).replace(',','.'));
    return isNaN(n) ? 0 : n * 1000; // legacy entries stored liters
  }
  return 0;
}

let weightPending = null;
async function initWeightPending(){
  const last = await getLastWeightValue();
  weightPending = last===null ? null : last;
  syncWeightPendingUI();
}
function syncWeightPendingUI(){
  const el = document.getElementById('weight-pending-display');
  if(el) el.value = weightPending===null?'':fmtWeight(weightPending);
}
function adjustWeightPending(deltaKg){
  tapFeedback();
  if(weightPending===null){showToast('Informe seu peso primeiro.');return;}
  weightPending = Math.round((weightPending + deltaKg) * 10) / 10;
  syncWeightPendingUI();
}
function setWeightPendingFromInput(){
  const el = document.getElementById('weight-pending-display');
  const n = parseFloat(el.value.replace(',','.'));
  if(!isNaN(n) && n >= 0) weightPending = n;
}
async function addWeight(){
  tapFeedback();
  if(weightPending===null){showToast('Informe seu peso primeiro.');return;}
  const period = document.getElementById('body-period').value;
  const arr = await loadBody();
  arr.push({id:cid(), date:todayKey(), time:nowTime(), type:'weight', period, value: fmtWeight(weightPending)});
  await saveBody(arr);
  showToast(`Peso registrado: ${fmtWeight(weightPending)}kg`);
  await renderBody();
}

async function getLastWeightValue(){
  const arr = await loadBody();
  const weights = arr.filter(e=>e.type==='weight')
    .sort((a,b)=> (a.date+((a.time)||'00:00')).localeCompare(b.date+((b.time)||'00:00')));
  if(weights.length===0) return null;
  const last = weights[weights.length-1];
  const n = parseFloat(String(last.value).replace(',','.'));
  return isNaN(n) ? null : n;
}

// ---------- WATER BOTTLE VISUAL ----------
const K_WATER_GOAL = 'water-daily-goal';
let waterDailyGoal = 2000; // default; editável na aba Água, persistido
async function loadWaterGoal(){
  try{
    const r = await window.storage.get(K_WATER_GOAL);
    const n = r ? parseInt(r.value, 10) : NaN;
    if(!isNaN(n) && n>0) waterDailyGoal = n;
  }catch(e){}
  return waterDailyGoal;
}
function syncWaterGoalUI(){
  const el = document.getElementById('water-goal-display');
  if(el) el.value = waterDailyGoal;
}
async function adjustWaterGoal(delta){
  tapFeedback();
  waterDailyGoal = Math.max(100, waterDailyGoal + delta);
  syncWaterGoalUI();
  await storageSet(K_WATER_GOAL, String(waterDailyGoal));
  await renderWaterBottleViews();
  await renderCharts();
}
async function setWaterGoalFromInput(){
  const el = document.getElementById('water-goal-display');
  const n = parseInt(el.value, 10);
  if(isNaN(n) || n<=0) return;
  waterDailyGoal = n;
  await storageSet(K_WATER_GOAL, String(waterDailyGoal));
  await renderWaterBottleViews();
  await renderCharts();
}

let selectedWaterDate = todayKey();
function shiftWaterDate(delta){
  tapFeedback();
  const d = new Date(selectedWaterDate+'T00:00:00');
  d.setDate(d.getDate()+delta);
  selectedWaterDate = todayKey(d);
  renderWaterBottleViews();
}
function setWaterDate(val){
  if(!val) return;
  selectedWaterDate = val;
  renderWaterBottleViews();
}

function buildWaterBottleSvg(uid, totalMl, size){
  const goal = waterDailyGoal;
  const pct = Math.max(0, Math.min(1, totalMl / goal));
  const bodyTop = 38, bodyBottom = 178, bodyH = bodyBottom - bodyTop;
  const fillH = Math.round(bodyH * pct);
  const fillY = bodyBottom - fillH;
  return `<svg viewBox="0 0 100 190" class="water-bottle-svg" style="width:${size}px" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <clipPath id="bottleClip-${uid}"><rect x="18" y="38" width="64" height="140" rx="16"/></clipPath>
      <linearGradient id="waterGrad-${uid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#6fe0ff"/>
        <stop offset="100%" stop-color="#0a8fd6"/>
      </linearGradient>
    </defs>
    <rect x="40" y="2" width="20" height="14" rx="3" fill="#3a3a3d"/>
    <path d="M42,16 L58,16 L64,38 L36,38 Z" fill="#232324" stroke="#4a4a4d" stroke-width="2"/>
    <g clip-path="url(#bottleClip-${uid})">
      <rect x="18" y="${fillY}" width="64" height="${fillH}" fill="url(#waterGrad-${uid})" style="transition: y 0.6s ease, height 0.6s ease;"/>
    </g>
    <rect x="18" y="38" width="64" height="140" rx="16" fill="none" stroke="#4a4a4d" stroke-width="2.5"/>
    <line x1="18" y1="108" x2="26" y2="108" stroke="#5a5a5d" stroke-width="1.5"/>
    <line x1="18" y1="73" x2="26" y2="73" stroke="#5a5a5d" stroke-width="1.5"/>
  </svg>`;
}
async function renderWaterBottleViews(){
  const arr = await loadBody();
  syncWaterGoalUI();
  const dateInput = document.getElementById('water-date-input');
  if(dateInput && dateInput.value !== selectedWaterDate) dateInput.value = selectedWaterDate;

  const selWater = arr.filter(e=>e.type==='water' && e.date===selectedWaterDate);
  const selTotal = Math.max(0, Math.round(selWater.reduce((sum,e)=> sum + waterMl(e), 0)));
  const mainEl = document.getElementById('water-bottle-main');
  if(mainEl){
    mainEl.innerHTML = buildWaterBottleSvg('main', selTotal, 120);
  }
  const mainLabel = document.getElementById('water-bottle-main-label');
  if(mainLabel){
    const pct = Math.round(Math.min(1, selTotal/waterDailyGoal)*100);
    mainLabel.innerHTML = `<b>${selTotal}ml</b> / ${waterDailyGoal}ml <span class="water-pct">(${pct}%)</span>`;
  }

  const todayTotal = selectedWaterDate===todayKey() ? selTotal
    : Math.max(0, Math.round(arr.filter(e=>e.type==='water' && e.date===todayKey()).reduce((sum,e)=> sum + waterMl(e), 0)));
  const dashEl = document.getElementById('water-bottle-dash');
  if(dashEl){
    dashEl.innerHTML = buildWaterBottleSvg('dash', todayTotal, 54);
  }
  const dashLabel = document.getElementById('water-bottle-dash-label');
  if(dashLabel) dashLabel.textContent = todayTotal + 'ml';
}

async function quickAddWater(ml,date=selectedWaterDate){
  tapFeedback();
  const arr = await loadBody();
  const added={id:cid(), date, time:nowTime(), type:'water', ml};
  const next=[...arr,added];
  await window.storage.set(K_BODY,JSON.stringify(next));
  bodyMemCache=next;
  await renderBody();
  await renderDashboard();
  showToast(`+${ml}ml de água registrados${date!==todayKey() ? ' em '+fmtDate(date) : ''}`,{label:'Desfazer',onClick:async()=>{
    const current=await loadBody();
    if(!current.some(entry=>entry.id===added.id))return;
    bodyMemCache=current.filter(entry=>entry.id!==added.id);
    await window.storage.set(K_BODY,JSON.stringify(bodyMemCache));
    await renderBody();await renderDashboard();
    showToast('Lançamento de água desfeito.');
  }});
}

let customWaterPending = 300;
function adjustCustomWater(delta){
  tapFeedback();
  customWaterPending = Math.max(0, customWaterPending + delta);
  syncCustomWaterUI();
}
function setCustomWaterFromInput(){
  const el = document.getElementById('custom-water-input');
  const n = parseInt(el.value, 10);
  customWaterPending = isNaN(n) ? 0 : Math.max(0, n);
}
function syncCustomWaterUI(){
  const input = document.getElementById('custom-water-input');
  if(input) input.value = customWaterPending;
}
async function commitCustomWater(){
  if(customWaterPending <= 0){ showToast('Digite uma quantidade primeiro.'); return; }
  await quickAddWater(customWaterPending);
}
async function removeCustomWater(){
  if(customWaterPending <= 0){ showToast('Digite uma quantidade primeiro.'); return; }
  tapFeedback();
  const arr = await loadBody();
  arr.push({id:cid(), date:selectedWaterDate, time:nowTime(), type:'water', ml:-customWaterPending, adjustment:true});
  await saveBody(arr);
  showToast(`−${customWaterPending}ml removidos (ajuste)`);
  await renderBody();
  await renderDashboard();
}

async function zerarAguaHoje(){
  tapFeedback();
  const arr = await loadBody();
  const remaining = arr.filter(e=> !(e.type==='water' && e.date===selectedWaterDate));
  await saveBody(remaining);
  showToast(`Água de ${fmtDate(selectedWaterDate)} zerada.`);
  await renderBody();
  await renderDashboard();
}

let waterEditingId = null;
function toggleWaterDateEdit(id){
  tapFeedback();
  waterEditingId = (waterEditingId===id) ? null : id;
  renderWaterHistory();
}
async function saveWaterDateEdit(id){
  tapFeedback();
  const dateInput = document.getElementById(`water-edit-date-${id}`);
  const newDate = dateInput.value;
  if(!newDate) return;
  const arr = await loadBody();
  const entry = arr.find(e=>e.id===id);
  if(entry){
    entry.date = newDate;
    await saveBody(arr);
    showToast(`Movido pra ${fmtDate(newDate)}`);
  }
  waterEditingId = null;
  await renderWaterHistory();
  await renderWaterBottleViews();
  await renderDashboard();
}

async function renderWaterHistory(){
  const el = document.getElementById('water-history-list');
  if(!el) return;
  const arr = await loadBody();
  const waterEntries = arr.filter(e=>e.type==='water')
    .sort((a,b)=> (b.date+((b.time)||'')).localeCompare(a.date+((a.time)||'')));
  if(waterEntries.length===0){
    el.innerHTML = '<div class="empty">Nenhum lançamento de água ainda.</div>';
    return;
  }
  el.innerHTML = waterEntries.slice(0,20).map(e=>{
    const ml = waterMl(e);
    const sign = ml >= 0 ? '+' : '';
    const tag = e.consolidated ? ' · total do dia' : e.adjustment ? ' · ajuste' : '';
    if(waterEditingId === e.id){
      return `<div class="entry entry-edit" style="display:block;">
        <div class="name" style="margin-bottom:8px;">${sign}${Math.round(ml)} ml${e.period? ' · '+e.period:''}${tag}</div>
        <label>Passar esse lançamento pra que dia?</label>
        <input type="date" id="water-edit-date-${e.id}" value="${e.date}" style="width:100%; background:var(--panel-2); border:1px solid var(--line); color:var(--text); border-radius:10px; padding:10px; margin-bottom:8px;">
        <button class="secondary-btn" onclick="saveWaterDateEdit('${e.id}')">✓ Mover</button>
        <button class="rpe-skip-btn" onclick="toggleWaterDateEdit('${e.id}')">Cancelar</button>
      </div>`;
    }
    return `
    <div class="entry">
      <div class="thumb placeholder">${ml>=0?'💧':'✂️'}</div>
      <div class="info">
        <div class="name">${sign}${Math.round(ml)} ml${e.period? ' · '+e.period:''}${tag}</div>
        <div class="meta">${fmtDate(e.date)}${e.time? ' · '+e.time:''}</div>
      </div>
      <button class="del" onclick="toggleWaterDateEdit('${e.id}')" style="margin-right:6px;">📅</button>
      <button class="del" onclick="delBody('${e.id}')">✕</button>
    </div>`;
  }).join('');
}

async function delBody(id){
  let arr = await loadBody();
  arr = arr.filter(e=>e.id!==id);
  await saveBody(arr);
  await renderBody();
}

// ---------- GOOGLE DRIVE SYNC (optional, personal backup — your own Drive) ----------
const K_GDRIVE_CLIENT_ID = 'gdrive-client-id';
const K_GDRIVE_FOLDER = 'gdrive-folder-id';
const K_GDRIVE_LAST_SYNC = 'gdrive-last-sync';
let gdriveClientId = null;
let gdriveTokenClient = null;
let gdriveAccessToken = null;
let gdriveFolderId = null;

async function loadGDriveClientId(){
  try{
    const r = await window.storage.get(K_GDRIVE_CLIENT_ID);
    gdriveClientId = r ? r.value : null;
  }catch(e){ gdriveClientId = null; }
  return gdriveClientId;
}
async function saveGDriveClientId(){
  const val = document.getElementById('gdrive-client-id-input').value.trim();
  if(!val) return;
  tapFeedback();
  gdriveClientId = val;
  await storageSet(K_GDRIVE_CLIENT_ID, val);
  showToast('ID do cliente salvo!');
  await renderGDriveStatus();
  tryInitGDriveWhenReady();
}
async function loadGDriveFolderId(){
  try{
    const r = await window.storage.get(K_GDRIVE_FOLDER);
    gdriveFolderId = r ? r.value : null;
  }catch(e){ gdriveFolderId = null; }
  return gdriveFolderId;
}

function connectGoogleDrive(){
  tapFeedback();
  if(!gdriveClientId){ showToast('Cole o ID do cliente Google primeiro.'); return; }
  if(typeof google === 'undefined' || !google.accounts){
    showToast('Google ainda carregando, tenta de novo em alguns segundos.');
    return;
  }
  gdriveTokenClient = google.accounts.oauth2.initTokenClient({
    client_id: gdriveClientId,
    scope: 'https://www.googleapis.com/auth/drive.file',
    callback: async (resp)=>{
      if(!resp || resp.error){ showToast('Falha ao conectar ao Drive.'); return; }
      gdriveAccessToken = resp.access_token;
      await ensureGDriveFolder();
      showToast('Google Drive conectado!');
      await renderGDriveStatus();
      window.ForjaDriveBackup?.render?.();
    }
  });
  gdriveTokenClient.requestAccessToken();
}

async function ensureGDriveFolder(){
  await loadGDriveFolderId();
  if(gdriveFolderId){
    try{
      const check = await fetch(`https://www.googleapis.com/drive/v3/files/${gdriveFolderId}?fields=id`, {
        headers:{Authorization:`Bearer ${gdriveAccessToken}`}
      });
      if(check.ok) return gdriveFolderId;
    }catch(e){}
  }
  const q = encodeURIComponent(`name='Forja.Treino Backups' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, {
    headers:{Authorization:`Bearer ${gdriveAccessToken}`}
  });
  const searchData = await searchRes.json();
  if(searchData.files && searchData.files.length){
    gdriveFolderId = searchData.files[0].id;
  } else {
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method:'POST',
      headers:{Authorization:`Bearer ${gdriveAccessToken}`, 'Content-Type':'application/json'},
      body: JSON.stringify({name:'Forja.Treino Backups', mimeType:'application/vnd.google-apps.folder'})
    });
    const createData = await createRes.json();
    gdriveFolderId = createData.id;
  }
  await storageSet(K_GDRIVE_FOLDER, gdriveFolderId);
  return gdriveFolderId;
}

async function renderGDriveStatus(){
  const el = document.getElementById('gdrive-status');
  if(!el) return;
  await loadGDriveClientId();
  const input = document.getElementById('gdrive-client-id-input');
  if(input && gdriveClientId && !input.value) input.value = gdriveClientId;
  document.getElementById('gdrive-connect-btn').style.display = gdriveClientId ? 'block' : 'none';
  let lastSync = null;
  try{
    const r = await window.storage.get(K_GDRIVE_LAST_SYNC);
    lastSync = r ? r.value : null;
  }catch(e){}
  if(!gdriveClientId){
    el.textContent = 'Cole o ID do cliente Google abaixo para ativar.';
  } else if(!gdriveAccessToken){
    el.textContent = 'ID do cliente salvo. Toque em "Conectar" para autorizar.';
  } else {
    el.textContent = lastSync ? `Conectado. Última sincronização: ${new Date(lastSync).toLocaleString('pt-BR')}` : 'Conectado. Ainda sem sincronização hoje.';
  }
}
window.ForjaGDriveSession={token:()=>gdriveAccessToken,folder:ensureGDriveFolder,preview:prepareBackupRestore};

// ---------- CHECKPOINT (salvar/restaurar um ponto de tudo — pareado com o reset abaixo) ----------
const K_CHECKPOINT = 'full-checkpoint';
async function saveCheckpoint(){
  tapFeedback();
  const jsonStr = await buildBackupJson();
  await storageSet(K_CHECKPOINT, jsonStr);
  await renderCheckpointStatus();
  showToast('💾 Tudo salvo! Esse é o ponto que o app vai usar daqui pra frente.');
}
async function loadCheckpoint(){
  try{
    const r = await window.storage.get(K_CHECKPOINT);
    return r ? JSON.parse(r.value) : null;
  }catch(e){ return null; }
}
async function renderCheckpointStatus(){
  const el = document.getElementById('checkpoint-status');
  if(!el) return;
  const parsed = await loadCheckpoint();
  if(parsed && parsed.exportedAt){
    const d = new Date(parsed.exportedAt);
    el.textContent = `Último salvamento: ${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`;
  } else {
    el.textContent = 'Nenhum salvamento ainda.';
  }
}
function toggleRestoreCheckpointConfirm(show){
  tapFeedback();
  document.getElementById('checkpoint-default').style.display = show ? 'none' : 'block';
  document.getElementById('checkpoint-restore-confirm').style.display = show ? 'block' : 'none';
}
async function executeRestoreCheckpoint(){
  tapFeedback();
  const parsed = await loadCheckpoint();
  if(!parsed){
    showToast('Nenhum salvamento encontrado ainda.');
    toggleRestoreCheckpointConfirm(false);
    return;
  }
  const restoredCount = await restoreBackupData(parsed);
  toggleRestoreCheckpointConfirm(false);
  showToast(`Restaurado (${restoredCount}/${BACKUP_KEYS.length} categorias). Recarregando...`);
  setTimeout(()=> location.reload(), 1800);
}

// ---------- RESET DE DADOS ANTERIORES (peso, água, fotos de evolução, dieta) ----------
function toggleResetDadosConfirm(show){
  tapFeedback();
  document.getElementById('reset-dados-default').style.display = show ? 'none' : 'block';
  document.getElementById('reset-dados-confirm').style.display = show ? 'block' : 'none';
}
async function executeResetDados(){
  tapFeedback();
  await storageSet('body-log', '[]');
  await storageSet('measurements', '[]');
  await storageSet('progress-photos', '[]');
  await storageSet('diet-log', '[]');
  bodyMemCache = [];
  progressCache = [];
  dietCache = [];
  toggleResetDadosConfirm(false);
  showToast('Dados anteriores zerados. Corrida, natação e CrossFit continuam intactos.');
  await renderBody();
  await renderProgressGallery();
  await renderDietTab();
  await renderDashboard();
  await initCalorieCalc();
}

function tryInitGDriveWhenReady(retries=10){
  if(typeof google !== 'undefined' && google.accounts){
    initGDrive();
  } else if(retries>0){
    setTimeout(()=>tryInitGDriveWhenReady(retries-1), 500);
  }
}
async function initGDrive(){
  await loadGDriveClientId();
  await loadGDriveFolderId();
  await renderGDriveStatus();
  if(!gdriveClientId) return;
  try{
    gdriveTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: gdriveClientId,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: async (resp)=>{
        if(resp && resp.access_token){
          gdriveAccessToken = resp.access_token;
          await renderGDriveStatus();
        }
      }
    });
    // try a silent re-auth (no popup) in case this browser already granted access before
    gdriveTokenClient.requestAccessToken({prompt:''});
  }catch(e){}
}

// ---------- CALORIE CALCULATOR (BMR/TDEE) ----------
// Formula choice based on a 2005 systematic review (J Am Diet Assoc) comparing
// BMR equations against indirect calorimetry: Mifflin-St Jeor had the smallest
// mean error for the general population. When body-fat % is known, the
// lean-mass-based Katch-McArdle equation is more accurate (especially for
// athletic or higher body-fat individuals), so it's used automatically
// whenever a body-fat % is available.
const ACTIVITY_LEVELS = [
  {key:'sedentary', mult:1.2,   label:'Sedentário',        desc:'pouco ou nenhum exercício'},
  {key:'light',     mult:1.375, desc:'exercício leve 1–3x/semana',        label:'Levemente ativo'},
  {key:'moderate',  mult:1.55,  desc:'exercício moderado 3–5x/semana',    label:'Moderadamente ativo'},
  {key:'active',    mult:1.725, desc:'exercício intenso 6–7x/semana',     label:'Muito ativo'},
  {key:'very',      mult:1.9,   desc:'exercício muito intenso + trabalho físico', label:'Extremamente ativo'},
];
let calcState = { sex:'M', age:30, height:170, weight:70, bodyfat:0, activity:'moderate' };
const K_CALC_LOCK = 'calorie-calc-lock';
let calcLocked = false;

// Trava os campos pra não mudarem mais sozinhos (ex: peso deixa de puxar o
// os dados depois de preencher tudo do jeito que quer.
async function loadCalcLock(){
  try{
    const r = await window.storage.get(K_CALC_LOCK);
    if(r && r.value){
      const saved = JSON.parse(r.value);
      if(saved && saved.locked){
        calcLocked = true;
        calcState = {sex:saved.sex, age:saved.age, height:saved.height, weight:saved.weight, bodyfat:saved.bodyfat, activity:saved.activity};
        return true;
      }
    }
  }catch(e){}
  calcLocked = false;
  return false;
}
async function toggleCalcLock(){
  tapFeedback();
  calcLocked = !calcLocked;
  if(calcLocked){
    await storageSet(K_CALC_LOCK, JSON.stringify({locked:true, ...calcState}));
    showToast('🔒 Dados travados — não mudam mais sozinhos.');
  } else {
    await storageSet(K_CALC_LOCK, JSON.stringify({locked:false}));
    showToast('🔓 Destravado — pode editar de novo.');
  }
  const card = document.getElementById('calorie-calc-card');
  if(card) card.classList.toggle('calc-locked', calcLocked);
  renderCalorieCalc();
}

async function initCalorieCalc(){
  const wasLocked = await loadCalcLock();
  if(!wasLocked){
    const lastW = await getLastWeightValue();
    if(lastW !== null){
      calcState.weight = lastW;
      const src = document.getElementById('calc-weight-source');
      if(src) src.textContent = '(do seu último peso registrado)';
    }
  }
  const actWrap = document.getElementById('activity-select');
  if(actWrap){
    actWrap.innerHTML = ACTIVITY_LEVELS.map(a=>
      `<button class="activity-opt ${calcState.activity===a.key?'active':''}" onclick="setCalcActivity('${a.key}')">
        <b>${a.label}</b>${a.desc}
      </button>`
    ).join('');
  }
  document.getElementById('sex-btn-m').classList.toggle('active', calcState.sex==='M');
  document.getElementById('sex-btn-f').classList.toggle('active', calcState.sex==='F');
  const card = document.getElementById('calorie-calc-card');
  if(card) card.classList.toggle('calc-locked', calcLocked);
  renderCalorieCalc();
}
function setCalcSex(sex){
  if(calcLocked) return;
  tapFeedback();
  calcState.sex = sex;
  document.getElementById('sex-btn-m').classList.toggle('active', sex==='M');
  document.getElementById('sex-btn-f').classList.toggle('active', sex==='F');
  renderCalorieCalc();
}
function setCalcActivity(key){
  if(calcLocked) return;
  tapFeedback();
  calcState.activity = key;
  document.querySelectorAll('#activity-select .activity-opt').forEach((el,i)=>{
    el.classList.toggle('active', ACTIVITY_LEVELS[i].key===key);
  });
  renderCalorieCalc();
}
function adjustCalcField(field, delta){
  if(calcLocked) return;
  tapFeedback();
  calcState[field] = Math.max(0, Math.round((calcState[field]+delta)*10)/10);
  renderCalorieCalc();
}
function renderCalorieCalc(){
  document.getElementById('calc-age-display').textContent = calcState.age + ' anos';
  document.getElementById('calc-height-display').textContent = calcState.height + 'cm';
  document.getElementById('calc-weight-display').textContent = fmtWeight(calcState.weight) + 'kg';
  document.getElementById('calc-bf-display').textContent = calcState.bodyfat + '%';

  const {weight, height, age, sex, bodyfat} = calcState;
  let bmr, formulaUsed;
  if(bodyfat > 0){
    // Katch-McArdle: BMR = 370 + 21.6 × lean body mass (kg)
    const leanMass = weight * (1 - bodyfat/100);
    bmr = 370 + 21.6 * leanMass;
    formulaUsed = `Fórmula: Katch-McArdle (usa massa magra, mais precisa quando o % de gordura é conhecido) — massa magra estimada: ${leanMass.toFixed(1)}kg.`;
  } else {
    // Mifflin-St Jeor — smallest mean error vs indirect calorimetry per a 2005
    // systematic review (J Am Diet Assoc 105:775-789).
    bmr = sex==='M'
      ? 10*weight + 6.25*height - 5*age + 5
      : 10*weight + 6.25*height - 5*age - 161;
    formulaUsed = `Fórmula: Mifflin-St Jeor — a mais precisa pra população geral segundo revisão sistemática de 2005 (J Am Diet Assoc). Informe seu % de gordura acima pra usar Katch-McArdle, ainda mais precisa.`;
  }
  document.getElementById('calc-formula-note').textContent = formulaUsed;

  const activityMult = (ACTIVITY_LEVELS.find(a=>a.key===calcState.activity)||ACTIVITY_LEVELS[2]).mult;
  const tdee = bmr * activityMult;

  const resultsEl = document.getElementById('calorie-results');
  resultsEl.innerHTML = `
    <div class="calorie-result-card">
      <div class="lbl">Taxa Metabólica Basal (TMB)</div>
      <div class="val">${Math.round(bmr)} kcal/dia</div>
    </div>
    <div class="calorie-result-card">
      <div class="lbl">Gasto total diário (TDEE)</div>
      <div class="val">${Math.round(tdee)} kcal/dia</div>
    </div>
    <label style="margin-top:4px;">Metas sugeridas por objetivo</label>
    <div class="goal-grid">
      <div class="goal-cell"><div class="glbl">Emagrecer</div><div class="gval">${Math.round(tdee*0.8)}</div></div>
      <div class="goal-cell"><div class="glbl">Manter</div><div class="gval">${Math.round(tdee)}</div></div>
      <div class="goal-cell"><div class="glbl">Ganhar massa</div><div class="gval">${Math.round(tdee*1.12)}</div></div>
    </div>
  `;

  const lockEl = document.getElementById('calc-lock-status');
  if(lockEl){
    lockEl.innerHTML = calcLocked
      ? `<div class="calc-formula-note" style="color:var(--gold);">🔒 Dados travados — não mudam mais sozinhos.</div><button class="secondary-btn" onclick="toggleCalcLock()">🔓 Destravar</button>`
      : `<button class="secondary-btn" onclick="toggleCalcLock()">🔒 Travar dados</button>`;
  }
}

function stripAccents(s){
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}
// ---------- OCR IMAGE PREPROCESSING ----------
// Grayscale + contrast stretch before Tesseract, plus upscaling small images —
// this is a well-established way to meaningfully improve OCR accuracy on
// colorful, low-contrast UI screenshots (as opposed to plain scanned text).
async function preprocessImageForOcr(dataUrl){
  return new Promise((resolve)=>{
    const img = new Image();
    img.onload = () => {
      try{
        // Upscala imagem pequena (melhora leitura), mas também precisa DOWNSCALAR
        // imagem grande — fotos de câmera de celular (ex: 3024x4032, comum em
        // rótulo de produto) são muito maiores que os prints de tela usados no
        // CrossFit, e processar/OCR numa imagem gigante é lento o bastante pra
        // bater no timeout de 25s num aparelho real. 1800px de largura é mais
        // que suficiente pra texto impresso continuar legível pro Tesseract.
        const scale = img.width < 900 ? 900/img.width : (img.width > 1800 ? 1800/img.width : 1);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const imgData = ctx.getImageData(0,0,canvas.width,canvas.height);
        const d = imgData.data;
        for(let i=0;i<d.length;i+=4){
          const gray = 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2];
          const contrasted = Math.min(255, Math.max(0, (gray-128)*1.5+128));
          d[i]=d[i+1]=d[i+2]=contrasted;
        }
        ctx.putImageData(imgData,0,0);
        resolve(canvas.toDataURL('image/png'));
      }catch(err){
        resolve(dataUrl); // fall back to original if canvas processing fails
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// Fotos tiradas com a câmera do iPhone vêm em .heic por padrão — formato que a
// maioria dos navegadores não decodifica via <img>/canvas (causa raiz real do
// ícone de preview quebrado 🖼️ e também da falha "não consegui processar essa
// imagem" no OCR do rótulo, achada em 2026-09-17: os dois dependem do mesmo
// decode). Prints de tela (CrossFit/Corrida/Natação) nunca batem nisso — só
// fotos reais tiradas com a câmera (rótulo e prato). heic2any decodifica HEIC
// via WASM, sem depender do navegador suportar o formato nativamente.
let heic2anyLoadPromise = null;
function loadHeic2Any(){
  if(window.heic2any) return Promise.resolve();
  if(heic2anyLoadPromise) return heic2anyLoadPromise;
  heic2anyLoadPromise = new Promise((resolve, reject)=>{
    const script = document.createElement('script');
    script.src = 'heic2any.min.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('heic2any não carregou'));
    document.head.appendChild(script);
  });
  return heic2anyLoadPromise;
}
function isHeicFile(file){
  return /image\/hei[cf]/i.test(file.type||'') || /\.(heic|heif)$/i.test(file.name||'');
}
async function convertHeicIfNeeded(file){
  if(!isHeicFile(file)) return file;
  try{
    await loadHeic2Any();
    const out = await window.heic2any({blob:file, toType:'image/jpeg', quality:0.9});
    const blob = Array.isArray(out) ? out[0] : out;
    const newName = (file.name||'foto').replace(/\.(heic|heif)$/i,'') + '.jpg';
    return new File([blob], newName, {type:'image/jpeg'});
  }catch(err){
    return file; // conversão falhou — segue com o original, preview/OCR já tratam a falha de decode
  }
}


// ---------- TOAST ----------
let toastTimer = null;
function showToast(msg, action){
  let el = document.getElementById('toast');
  if(!el){
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.innerHTML = '';
  const msgSpan = document.createElement('span');
  msgSpan.textContent = msg;
  el.appendChild(msgSpan);
  if(action){
    const btn = document.createElement('button');
    btn.textContent = action.label;
    btn.className = 'toast-action';
    btn.onclick = ()=>{ el.style.display = 'none'; action.onClick(); };
    el.appendChild(btn);
  }
  el.style.display = 'flex';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{ el.style.display = 'none'; }, action?6000:2600);
}

// ---------- SVG CHARTS ----------
function svgBarChart(containerId, data, opts={}){
  const el = document.getElementById(containerId);
  if(!data.length){ el.innerHTML = '<div class="chart-empty">Sem dados suficientes ainda.</div>'; return; }
  const W = 300, H = 110, pad = 4, barGap = 4;
  const maxVal = Math.max(...data.map(d=>d.value), opts.goalLine||0) * 1.15 || 1;
  const barW = (W - pad*2 - barGap*(data.length-1)) / data.length;
  let bars = '';
  data.forEach((d,i)=>{
    const h = Math.max(2, (d.value/maxVal) * (H-22));
    const x = pad + i*(barW+barGap);
    const y = H - 18 - h;
    const color = opts.highlightLast && i===data.length-1 ? 'var(--gold)' : 'var(--blue)';
    bars += `<rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="3" fill="${color}"></rect>`;
    if(opts.showValues){
      bars += `<text x="${x+barW/2}" y="${Math.max(9,y-3)}" font-size="8" fill="${color}" text-anchor="middle" font-weight="700">${d.value}</text>`;
    }
    bars += `<text x="${x+barW/2}" y="${H-6}" font-size="7" fill="#8a8fb0" text-anchor="middle">${d.label}</text>`;
  });
  let goalLine = '';
  if(opts.goalLine){
    const gy = H - 18 - (opts.goalLine/maxVal)*(H-22);
    goalLine = `<line x1="${pad}" y1="${gy}" x2="${W-pad}" y2="${gy}" stroke="var(--gold)" stroke-width="1" stroke-dasharray="3,3"></line>`;
  }
  el.innerHTML = `<div class="chart-title">${opts.title||''}</div>
    <svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${bars}${goalLine}</svg>`;
}
function svgLineChart(containerId, data, opts={}){
  const el = document.getElementById(containerId);
  if(data.length < 2){
    if(data.length===1){
      el.innerHTML = `<div class="chart-title">${opts.title||''}</div><div class="chart-empty">Registre mais valores para ver a tendência.</div>`;
    } else {
      el.innerHTML = '<div class="chart-empty">Sem dados suficientes ainda.</div>';
    }
    return;
  }
  const W = 300, H = 110, pad = 8;
  const vals = data.map(d=>d.value);
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const range = (maxV - minV) || 1;
  const stepX = (W - pad*2) / (data.length - 1);
  const pts = data.map((d,i)=>{
    const x = pad + i*stepX;
    const y = H - 20 - ((d.value - minV)/range) * (H-40);
    return {x,y,label:d.label,value:d.value};
  });
  const path = pts.map((p,i)=> (i===0?'M':'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
  const dots = pts.map(p=>`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.5" fill="var(--blue)"></circle>`).join('');
  const labels = pts.filter((_,i)=> i===0 || i===pts.length-1 || pts.length<=5)
    .map(p=>`<text x="${p.x.toFixed(1)}" y="${H-6}" font-size="7" fill="#8a8fb0" text-anchor="middle">${p.label}</text>`).join('');
  const lastLabel = `<text x="${pts[pts.length-1].x.toFixed(1)}" y="${pts[pts.length-1].y-8}" font-size="9" fill="var(--gold)" text-anchor="middle" font-weight="700">${pts[pts.length-1].value}</text>`;
  el.innerHTML = `<div class="chart-title">${opts.title||''}</div>
    <svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
      <path d="${path}" fill="none" stroke="var(--blue)" stroke-width="2"></path>
      ${dots}${labels}${lastLabel}
    </svg>`;
}

function lastNDays(n){
  const days = [];
  const d = new Date();
  for(let i=n-1;i>=0;i--){
    const dd = new Date(d);
    dd.setDate(d.getDate()-i);
    days.push(todayKey(dd));
  }
  return days;
}
function shortDay(dateKey){
  const [,,d] = dateKey.split('-');
  return d;
}

async function renderCharts(){
  const arr = await loadBody();
  // water: last 14 days totals
  const days14 = lastNDays(14);
  const waterByDay = {};
  arr.filter(e=>e.type==='water').forEach(e=>{
    waterByDay[e.date] = (waterByDay[e.date]||0) + waterMl(e);
  });
  const waterData = days14.map(d=>({label: shortDay(d), value: Math.round(waterByDay[d]||0)}));
  svgBarChart('water-chart', waterData, {title:`Água por dia (últimos 14 dias) · meta ${waterDailyGoal}ml`, goalLine:waterDailyGoal, highlightLast:true});

  // weight: chronological entries (last per day), up to last 14 with data
  const weights = arr.filter(e=>e.type==='weight')
    .map(e=>({date:e.date, time:e.time||'12:00', v: parseFloat(String(e.value).replace(',','.'))}))
    .filter(e=>!isNaN(e.v))
    .sort((a,b)=> (a.date+a.time).localeCompare(b.date+b.time));
  const lastPerDay = {};
  weights.forEach(w=>{ lastPerDay[w.date] = w.v; });
  const weightDates = Object.keys(lastPerDay).sort();
  const weightData = weightDates.slice(-14).map(d=>({label: d.slice(8)+'/'+d.slice(5,7), value: lastPerDay[d]}));
  svgLineChart('weight-chart', weightData, {title:'Peso (kg) · tendência'});
  const weightChart=document.getElementById('weight-chart');
  if(weightChart&&weightDates.length){const history=document.createElement('div');history.className='weight-history';history.setAttribute('aria-label','Histórico de pesos');weightDates.slice(-14).reverse().forEach((d,i,visible)=>{const row=document.createElement('div');row.className='weight-history-row';const previous=weightDates[weightDates.indexOf(d)-1];const diff=previous?Math.round((lastPerDay[d]-lastPerDay[previous])*10)/10:null;row.textContent=`${d.slice(8)}/${d.slice(5,7)}/${d.slice(0,4)} · ${Number(lastPerDay[d]).toLocaleString('pt-BR')} kg${diff===null?' · primeiro registro':` · ${diff>0?'+':''}${diff.toLocaleString('pt-BR')} kg desde o anterior`}`;history.append(row);});weightChart.append(history);}

  const cur = await getLastWeightValue();
  document.getElementById('weight-current').textContent = cur!==null ? cur+'kg' : '';
  await window.ForjaWeightGoal?.render?.();
}

// ---------- NOTIFICATIONS / REMINDERS ----------
async function enableReminders(){
  if(!('Notification' in window)){
    showToast('Notificações não suportadas neste navegador.');
    return;
  }
  const perm = await Notification.requestPermission();
  const btn = document.getElementById('notif-btn');
  if(perm === 'granted'){
    await storageSet('reminders-enabled', 'true');
    btn.textContent = '🔔 Lembretes ativados (mantenha a aba aberta)';
    btn.classList.add('on');
    showToast('Lembretes ativados! Funciona enquanto o app estiver aberto.');
    startReminderLoop();
  } else {
    showToast('Permissão de notificação negada.');
  }
}
// ---------- GYM PAYMENT REMINDER ----------
const K_GYM = 'gym-payment';
let gymCache = null;
async function loadGymCache(){
  if(gymCache) return gymCache;
  try{
    const r = await window.storage.get(K_GYM);
    gymCache = r ? JSON.parse(r.value) : {dueDay:5, paidMonths:[],configured:false};
  }catch(e){ gymCache = {dueDay:5, paidMonths:[],configured:false}; }
  return gymCache;
}
async function persistGymCache(){
  scheduleWrite(K_GYM, ()=>JSON.stringify(gymCache));
}
function currentMonthKey(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
async function adjustGymDueDay(delta){
  tapFeedback();
  await loadGymCache();
  gymCache.dueDay = Math.min(28, Math.max(1, gymCache.dueDay + delta));
  gymCache.configured = true;
  document.getElementById('gym-due-day-display').textContent = gymCache.dueDay;
  await persistGymCache();
  await renderGymStatus();
}
async function markGymPaid(){
  tapFeedback();
  await loadGymCache();
  const mk = currentMonthKey();
  gymCache.configured = true;
  if(!gymCache.paidMonths.includes(mk)) gymCache.paidMonths.push(mk);
  await persistGymCache();
  showToast('CrossFit marcado como pago este mês. 💪');
  await renderGymStatus();
}
async function renderGymStatus(){
  await loadGymCache();
  document.getElementById('gym-due-day-display').textContent = gymCache.dueDay;
  const el = document.getElementById('gym-status');
  const mk = currentMonthKey();
  const paid = gymCache.paidMonths.includes(mk);
  const dayNow = new Date().getDate();
  if(gymCache.configured===false){el.className='gym-status pending';el.textContent='Opcional: ajuste o dia de vencimento se quiser acompanhar o pagamento.';return;}
  if(paid){
    el.className = 'gym-status paid';
    el.textContent = `✓ CrossFit pago este mês`;
  } else if(dayNow >= gymCache.dueDay){
    el.className = 'gym-status due';
    el.textContent = `⚠ Vencido dia ${gymCache.dueDay} — ainda não marcado como pago`;
  } else {
    const daysLeft = gymCache.dueDay - dayNow;
    el.className = 'gym-status pending';
    el.textContent = `Vence dia ${gymCache.dueDay} · faltam ${daysLeft} dia${daysLeft>1?'s':''}`;
  }
}

async function enableGymReminders(){
  if(!('Notification' in window)){
    showToast('Notificações não suportadas neste navegador.');
    return;
  }
  const perm = await Notification.requestPermission();
  const btn = document.getElementById('gym-notif-btn');
  if(perm === 'granted'){
    await storageSet('gym-reminders-enabled', 'true');
    btn.textContent = '🔔 Lembrete ativado (mantenha a aba aberta)';
    btn.classList.add('on');
    showToast('Lembrete de pagamento ativado!');
    startGymReminderLoop();
  } else {
    showToast('Permissão de notificação negada.');
  }
}
async function initGymReminderState(){
  let enabled = false;
  try{
    const r = await window.storage.get('gym-reminders-enabled');
    enabled = r && r.value === 'true';
  }catch(e){}
  if(enabled && 'Notification' in window && Notification.permission === 'granted'){
    document.getElementById('gym-notif-btn').textContent = '🔔 Lembrete ativado (mantenha a aba aberta)';
    document.getElementById('gym-notif-btn').classList.add('on');
    startGymReminderLoop();
  }
}
let gymReminderInterval = null;
function startGymReminderLoop(){
  if(gymReminderInterval) return;
  checkGymPayment();
  gymReminderInterval = setInterval(checkGymPayment, 30*60*1000);
}
async function checkGymPayment(){
  await loadGymCache();
  const dayNow = new Date().getDate();
  if(dayNow < gymCache.dueDay) return;
  const mk = currentMonthKey();
  if(gymCache.paidMonths.includes(mk)) return;

  const flagKey = `notified-gym-${todayKey()}`;
  let already = false;
  try{ const r = await window.storage.get(flagKey); already = !!r; }catch(e){ already = false; }
  if(already) return;
  await storageSet(flagKey, 'true');

  const msg = `Não esqueça: passar no banco e pagar o CrossFit (venceu dia ${gymCache.dueDay}).`;
  if('Notification' in window && Notification.permission === 'granted'){
    new Notification('💳 Pagar o CrossFit', { body: msg });
  }
  showToast(msg);
}

async function initReminderState(){
  let enabled = false;
  try{
    const r = await window.storage.get('reminders-enabled');
    enabled = r && r.value === 'true';
  }catch(e){}
  if(enabled && 'Notification' in window && Notification.permission === 'granted'){
    document.getElementById('notif-btn').textContent = '🔔 Lembretes ativados (mantenha a aba aberta)';
    document.getElementById('notif-btn').classList.add('on');
    startReminderLoop();
  }
}
let reminderInterval = null;
function startReminderLoop(){
  if(reminderInterval) return;
  checkReminders();
  reminderInterval = setInterval(checkReminders, 5*60*1000);
}
async function checkReminders(){
  const arr = await loadBody();
  const today = arr.filter(e=>e.type==='water' && e.date===todayKey());
  const total = today.reduce((sum,e)=> sum + waterMl(e), 0);
  const missing = Math.round(waterDailyGoal - total);
  if(missing <= 0) return; // meta do dia já batida, nada a cobrar

  let lastNotify = 0;
  try{
    const r = await window.storage.get('last-water-notify');
    lastNotify = r ? parseInt(r.value, 10) : 0;
  }catch(e){ lastNotify = 0; }
  const TWO_HOURS = 2*60*60*1000;
  if(Date.now() - lastNotify < TWO_HOURS) return;

  await storageSet('last-water-notify', String(Date.now()));

  const copos = Math.ceil(missing/200);
  const coposTxt = `${copos} copo${copos>1?'s':''} de 200ml`;
  let msg;
  if(total <= 0){
    msg = `Você ainda não bebeu água hoje. Faltam ${missing}ml (~${coposTxt}) pra bater a meta. Leva a garrafinha! 🍼`;
  } else {
    msg = `Só falta mais ${missing}ml (~${coposTxt}) pra completar a meta do dia.`;
  }
  if('Notification' in window && Notification.permission === 'granted'){
    new Notification('💧 Lembrete de água', { body: msg, silent: true });
  }
  showToast(msg);
}

// ---------- RENDER: BODY ----------
function archiveHistory(container, recentCount=5){
  const entries=Array.from(container.children).filter(item=>item.matches('.entry,.card'));
  if(entries.length<=recentCount)return;
  const older=entries.slice(recentCount),details=document.createElement('details'),summary=document.createElement('summary'),scroll=document.createElement('div');
  details.className='history-archive';summary.textContent=`Ver anteriores (${older.length})`;scroll.className='history-archive-scroll';
  scroll.append(...older);details.append(summary,scroll);container.append(details);
}
async function renderBody(){
  const arr = await loadBody();
  const sorted = [...arr].sort((a,b)=> b.date.localeCompare(a.date));
  const list = document.getElementById('body-list');
  if(sorted.length===0){
    list.innerHTML = '<div class="empty">Nenhum registro ainda.</div>';
  } else {
    list.innerHTML = sorted.map(e=>{
      const isWeight = e.type==='weight';
      const label = isWeight ? `Peso${e.period? ' · '+e.period:''}` : `Água${e.period? ' · '+e.period:''}`;
      const icon = isWeight ? '⚖️' : '💧';
      const displayVal = isWeight ? `${escapeHtml(e.value)} kg` : `${Math.round(waterMl(e))} ml`;
      return `
      <div class="entry">
        <div class="thumb placeholder">${icon}</div>
        <div class="info">
          <div class="name">${label}</div>
          <div class="meta">${fmtDate(e.date)}${e.time? ' · '+e.time:''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="val">${displayVal}</div>
          <button class="del" onclick="delBody('${e.id}')">✕</button>
        </div>
      </div>`;
    }).join('');
  }
  archiveHistory(list);
  await renderCharts();
  await renderWaterHistory();
  await renderWaterBottleViews();
}

// ---------- COMBINED SPORT ACTIVITY (corrida + natação + CrossFit) ----------
async function loadCombinedSportDates(){
  const db = window.claude ? await window.claude.use('db') : null;
  if(!db) return new Set();
  const dates = new Set();
  for(const col of ['corridas','natacao','crossfit']){
    try{
      const snap = await db.collection(col).get();
      snap.docs.forEach(d=>{ const v = d.data(); if(v && v.data && (col!=='crossfit'||window.ForjaCrossfitStatus?.completed(v))) dates.add(v.data); });
    }catch(e){ /* collection may not exist yet */ }
  }
  return dates;
}
// Soma as calorias reais de corrida+natação+CrossFit num dia — usado no
// resumo da Dieta ("Exercício") pra refletir o gasto de verdade em vez de
// só o que vier de um import manual do Zepp.
async function loadCombinedSportCalorias(dateStr){
  const db = window.claude ? await window.claude.use('db') : null;
  if(!db) return 0;
  let total = 0;
  for(const col of ['corridas','natacao','crossfit']){
    try{
      const snap = await db.collection(col).get();
      snap.docs.forEach(d=>{
        const v = d.data();
        if(v && v.data===dateStr && v.calorias && (col!=='crossfit'||window.ForjaCrossfitStatus?.completed(v)&&v.calorias_referencia?.kind!=='met_watch_scenario')) total += Number(v.calorias)||0;
      });
    }catch(e){ /* collection may not exist yet */ }
  }
  return Math.round(total);
}

async function loadCrossfitUntrackedCalories(dateStr,garminPresent=false){
  const db = window.claude ? await window.claude.use('db') : null;
  if(!db) return {total:0,estimated:0,uncertainty:0};
  try{
    const snap=await db.collection('crossfit').get();
    return snap.docs.reduce((sum,d)=>{
      const row=d.data();
      // A sessão já ligada ao Garmin ou Strava pode estar no gasto do relógio.
      if(row?.data!==dateStr || !window.ForjaCrossfitStatus?.completed(row))return sum;
      const uncertainty=Number(row.calorias_referencia?.uncertaintyKcal);
      if(Number.isFinite(uncertainty)&&uncertainty>0)sum.uncertainty+=uncertainty;
      if(row.calorias_referencia?.kind==='met_watch_scenario'&&!garminPresent)return sum;
      if(garminPresent&&row.calorias_referencia?.notInGarmin!==true)return sum;
      if(/push_garmin|strava/i.test(row.origem||''))return sum;
      const kcal=Number(row.calorias);
      if(Number.isFinite(kcal)&&kcal>0){sum.total+=Math.round(kcal);if(row.calorias_estimadas)sum.estimated+=Math.round(kcal);}
      return sum;
    },{total:0,estimated:0,uncertainty:0});
  }catch{return {total:0,estimated:0,uncertainty:0};}
}

async function loadHealthConnectDay(dateStr){
  try{
    const stored=await window.storage.get('health-connect-daily');
    const rows=stored?.value?JSON.parse(stored.value):[];
    const day=Array.isArray(rows)?rows.find(row=>row&&row.date===dateStr):null;
    if(day?.sourcePackage!=='com.garmin.android.apps.connectmobile')return null;
    const num=v=>v==null||!Number.isFinite(Number(v))?null:Math.max(0,Number(v));
    return day?{steps:num(day.steps),activeKcal:num(day.activeKcal),totalKcal:num(day.totalKcal),syncedAt:day.syncedAt||null}:null;
  }catch(e){return null;}
}

// Resumo calórico de um dia (ingerido/exercício/meta) — usado pela própria
// aba Dieta e reaproveitado no resumo do Início, pra não duplicar a lógica.
async function computeDietDaySummary(dateStr){
  await loadDietCache();
  const dayEntries = dietCache.filter(e=>e.date===dateStr);
  const comido = dayEntries.reduce((s,e)=>s+(e.kcal||0),0);
  // Prioriza o gasto real das 3 abas de esporte pro dia; só cai pro que veio
  // de um import do Zepp (se houver) quando não há dado real, pra não contar
  // a mesma atividade duas vezes.
  const sportCalorias = await loadCombinedSportCalorias(dateStr);
  const garmin=await loadHealthConnectDay(dateStr);
  const crossfit=await loadCrossfitUntrackedCalories(dateStr,garmin?.activeKcal!=null),crossfitExtra=crossfit.total;
  const zeppExercise = dayEntries.reduce((s,e)=>s+(e.exerciseKcal||0),0);
  // Calorias ativas são o gasto de atividade/exercício mostrado no início.
  // O gasto total (atividade + repouso) permanece exclusivo do saldo energético.
  const exercicio = garmin?.activeKcal != null ? garmin.activeKcal+crossfitExtra : (sportCalorias>0 ? sportCalorias : zeppExercise);
  const importGoal = [...dayEntries].reverse().find(e=>e.goalKcal)?.goalKcal;
  const goal = importGoal || computeDeficitGoal() || null;
  return {comido, exercicio, goal, entryCount:dayEntries.length, garminSyncedAt:garmin?.syncedAt??null, garminTotal:garmin?.totalKcal!=null?garmin.totalKcal+crossfitExtra:null, garminSteps:garmin?.steps??null, garminActive:garmin?.activeKcal??null, crossfitExtra, crossfitEstimated:crossfit.estimated, crossfitUncertainty:crossfit.uncertainty, exerciseSource:garmin?.activeKcal!=null?'Garmin':sportCalorias>0?'treinos registrados':'lançamento manual'};
}

// ---------- STREAK ----------
async function computeStreak(){
  const sportDays=await loadCombinedSportDates(),body=await loadBody();
  const bibleState=await window.ForjaBibleReader?.load?.();
  const water={};for(const row of body.filter(e=>e.type==='water'))water[row.date]=(water[row.date]||0)+waterMl(row);
  let closed={},restWeeks={};
  try{const r=await window.storage.get('diet-closed-days');closed=r?JSON.parse(r.value):{};}catch{}
  try{const r=await window.storage.get('rest-day-weekly');restWeeks=r?JSON.parse(r.value):{};}catch{}
  async function qualifies(date){
    const key=todayKey(date),week=todayKey(getMonday(date));
    const rest=Number.isInteger(Number(restWeeks[week]))&&restWeeks[week]!=null?Number(restWeeks[week]):0;
    if(!closed[key]||water[key]<waterDailyGoal||(!sportDays.has(key)&&date.getDay()!==rest)||bibleState&&!window.ForjaBibleReader.qualifies(bibleState,key))return false;
    const summary=await computeDietDaySummary(key);
    if(summary.entryCount===0||summary.comido<=0)return false;
    return summary.garminTotal>0?summary.comido<summary.garminTotal:summary.goal>0&&summary.comido<=summary.goal;
  }
  let streak = 0;
  let cursor = new Date();
  cursor.setHours(0,0,0,0);
  if(!await qualifies(cursor)){
    cursor.setDate(cursor.getDate()-1);
    if(!await qualifies(cursor))return 0;
  }
  while(streak<365&&await qualifies(cursor)){
    streak++;
    cursor.setDate(cursor.getDate()-1);
  }
  return streak;
}
async function streakCriteriaToday(){
  const date=new Date(),key=todayKey(date),week=todayKey(getMonday(date));
  const body=await loadBody(),water=body.filter(e=>e.type==='water'&&e.date===key).reduce((sum,e)=>sum+waterMl(e),0);
  const sport=await loadCombinedSportDates();
  let closed={},restWeeks={};try{const r=await window.storage.get('diet-closed-days');closed=r?JSON.parse(r.value):{};}catch{}
  try{const r=await window.storage.get('rest-day-weekly');restWeeks=r?JSON.parse(r.value):{};}catch{}
  const rest=Number(restWeeks[week]??0),summary=await computeDietDaySummary(key);
  const balance=summary.garminTotal>0?summary.garminTotal-summary.comido:summary.goal-summary.comido;
  const waterOk=water>=waterDailyGoal,foodOk=!!closed[key]&&summary.entryCount>0&&summary.comido>0&&balance>0;
  const trainingOk=sport.has(key),restOk=date.getDay()===rest;
  const bibleOk=await window.ForjaBibleReader?.readOn?.(key)??true;
  return {waterOk,foodOk,trainingOk,restOk,bibleOk,balanceSource:summary.garminTotal>0?'gasto medido':'meta alimentar'};
}

// Water goal streak — same logic as the workout streak, applied to days that
// hit the daily hydration goal. A bit of gamification to keep it up.
async function computeWaterStreak(){
  const bodyArr = await loadBody();
  const waterByDate = {};
  bodyArr.filter(e=>e.type==='water').forEach(e=>{
    waterByDate[e.date] = (waterByDate[e.date]||0) + waterMl(e);
  });
  const daySet = new Set(Object.keys(waterByDate).filter(d=>waterByDate[d] >= waterDailyGoal));
  if(daySet.size===0) return 0;
  let streak = 0;
  let cursor = new Date();
  cursor.setHours(0,0,0,0);
  if(!daySet.has(todayKey(cursor))){
    cursor.setDate(cursor.getDate()-1);
    if(!daySet.has(todayKey(cursor))) return 0;
  }
  while(daySet.has(todayKey(cursor))){
    streak++;
    cursor.setDate(cursor.getDate()-1);
  }
  return streak;
}

// ---------- ZEPP-STYLE CIRCULAR GAUGES (calories + macros) ----------
// Compartilhado com a aba Dieta (buildCaloriesRingsHtml/buildMacroRingsHtml) —
// não é exclusivo de nenhuma feature de import removida.
function buildRingSvg(pct, size, strokeWidth, color){
  const clamped = Math.max(0, Math.min(100, pct));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped/100);
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="transform:rotate(-90deg)">
    <circle cx="${size/2}" cy="${size/2}" r="${radius}" fill="none" stroke="var(--panel-2)" stroke-width="${strokeWidth}"/>
    <circle cx="${size/2}" cy="${size/2}" r="${radius}" fill="none" stroke="${color}" stroke-width="${strokeWidth}"
      stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" stroke-linecap="round"/>
  </svg>`;
}
function buildCaloriesRingsHtml(comido, exercicio, goal, garminTotal=0){
  const restante = comido!==null ? Math.round(garminTotal>0?garminTotal-comido:(goal!==null?goal-comido:0)) : null;
  const pct = (goal && comido!==null) ? Math.min(100, Math.round((comido/goal)*100)) : 0;
  return `<div class="zepp-cal-row">
    <div class="zepp-cal-side">
      <div class="zepp-cal-icon">🍴</div>
      <div class="zepp-cal-num">${comido??'–'}</div>
      <div class="zepp-cal-lbl">Comido</div>
    </div>
    <div class="zepp-ring-wrap">
      ${buildRingSvg(pct, 108, 10, 'var(--green)')}
      <div class="zepp-ring-center">
        <div class="zepp-ring-num">${restante??'–'}</div>
        <div class="zepp-ring-lbl">${garminTotal>0?'Saldo parcial':'Da meta'}</div>
      </div>
    </div>
    <div class="zepp-cal-side">
      <div class="zepp-cal-icon">🔥</div>
      <div class="zepp-cal-num">${garminTotal>0?garminTotal:(exercicio??'–')}</div>
      <div class="zepp-cal-lbl">${garminTotal>0?'Gasto total':'Exercício'}</div>
    </div>
  </div>
  ${garminTotal>0?'<div class="zepp-goal-line">Saldo parcial do Garmin com CrossFit registrado à parte. Atividades já ligadas ao Garmin ou Strava não entram de novo.</div>':(goal?`<div class="zepp-goal-line">Meta de ingestão: ${goal} kcal</div>`:'')}`;
}
function buildMacroRingsHtml(carbs, protein, fat){
  function item(label, m, color){
    const pct = m ? Math.min(100, Math.round((m.g/m.goalG)*100)) : 0;
    return `<div class="zepp-macro-item">
      <div class="zepp-macro-lbl">${label}</div>
      <div class="zepp-ring-wrap small">
        ${buildRingSvg(pct, 76, 8, color)}
        <div class="zepp-ring-center"><div class="zepp-ring-pct">${m?(m.unknown?'—':m.partial?'Parcial':pct+'%'):'–'}</div></div>
      </div>
      <div class="zepp-macro-grams">${m?(m.unknown?'Não informado':`${m.partial?'≥ ':''}${m.g}g/${m.goalG}g`):'–'}</div>
    </div>`;
  }
  return `<div class="zepp-macro-row">
    ${item('🌾 Carbo', carbs, '#3b9dff')}
    ${item('⚛ Proteína', protein, '#a78bfa')}
    ${item('💧 Gordura', fat, '#ff9f43')}
  </div>`;
}


// ---------- DIET / CALORIE TRACKING (AI-estimated via direct Claude API call) ----------
const K_DIET = 'diet-log';
let dietCache = null;
async function loadDietCache(){
  if(dietCache) return dietCache;
  try{
    const r = await window.storage.get(K_DIET);
    dietCache = r ? JSON.parse(r.value) : [];
  }catch(e){ dietCache = []; }
  return dietCache;
}
async function persistDietCache(){
  // A saved meal must be durable before its draft can be discarded.
  await window.storage.set(K_DIET, JSON.stringify(dietCache));
}

let dietPendingEstimate = null;
let selectedDietDate = todayKey();
function shiftDietDate(delta){
  tapFeedback();
  const d = new Date(selectedDietDate+'T00:00:00');
  d.setDate(d.getDate()+delta);
  selectedDietDate = todayKey(d);
  const input = document.getElementById('diet-date-input');
  if(input) input.value = selectedDietDate;
  dietSelectedMealType = null;
  dietPendingPhotoFile = null;
  dietPendingLabelFile = null;
  renderDietTab();
}
function setDietDate(val){
  if(!val) return;
  selectedDietDate = val;
  dietSelectedMealType = null;
  dietPendingPhotoFile = null;
  dietPendingLabelFile = null;
  renderDietTab();
}
function jumpToDietDate(dateStr){
  tapFeedback();
  selectedDietDate = dateStr;
  const input = document.getElementById('diet-date-input');
  if(input) input.value = selectedDietDate;
  dietSelectedMealType = null;
  dietPendingPhotoFile = null;
  dietPendingLabelFile = null;
  renderDietTab();
  document.getElementById('diet-summary-card').scrollIntoView({behavior:'smooth', block:'start'});
}

// ---------- TIPO DE REFEIÇÃO (café/almoço/janta/ceia/lanche/livre) ----------
// Cada tipo pode se repetir no dia (ex: 2 lanches) — a numeração conta quantas
// entradas desse tipo já existem no dia selecionado antes de salvar uma nova.
const MEAL_TYPES = [
  {key:'cafe', label:'Café', emoji:'☕'},
  {key:'almoco', label:'Almoço', emoji:'🍛'},
  {key:'janta', label:'Janta', emoji:'🍲'},
  {key:'ceia', label:'Ceia', emoji:'🌙'},
  {key:'lanche', label:'Lanche', emoji:'🍪'},
  {key:'livre', label:'Livre', emoji:'📝'},
];
let dietSelectedMealType = null;
function mealTypeCountToday(typeKey){
  return dietCache.filter(e=>e.date===selectedDietDate && e.mealType===typeKey).length;
}
function selectDietMealType(key){
  tapFeedback();
  dietSelectedMealType = key;
  renderMealTypeButtons();
  // Se uma foto/rótulo já tinha sido carregado antes de escolher o tipo
  // (ver comentário em handleDietPhotoFile), a leitura retoma sozinha aqui,
  // sem precisar escolher o arquivo de novo.
  if(dietPendingPhotoFile){
    const file = dietPendingPhotoFile;
    dietPendingPhotoFile = null;
    runDietPhotoEstimate(file);
  }
  if(dietPendingLabelFile){
    const file = dietPendingLabelFile;
    dietPendingLabelFile = null;
    runDietLabelEstimate(file);
  }
}
function renderMealTypeButtons(){
  const el = document.getElementById('diet-meal-type-grid');
  if(!el) return;
  el.innerHTML = MEAL_TYPES.map(t=>{
    const count = mealTypeCountToday(t.key);
    return `<button type="button" class="meal-type-btn ${dietSelectedMealType===t.key?'active':''}" onclick="selectDietMealType('${t.key}')">${t.emoji} ${t.label}${count>0?` (${count})`:''}</button>`;
  }).join('');
}
function mealTypeBadgeHtml(){
  if(!dietSelectedMealType) return '';
  const type = MEAL_TYPES.find(t=>t.key===dietSelectedMealType);
  if(!type) return '';
  const number = mealTypeCountToday(dietSelectedMealType) + 1;
  return `<div class="calc-formula-note">Vai ser salvo como: <b>${type.emoji} ${type.label} ${number}</b></div>`;
}

function dietEstimateResultHtml(parsed, labelOverride){
  return `
    ${mealTypeBadgeHtml()}
    <div class="calorie-result-card" style="margin-top:10px;">
      <div class="lbl">${escapeHtml(labelOverride || 'Estimativa')}</div>
      <div class="val">${parsed.kcal} kcal</div>
    </div>
    <div class="goal-grid" style="margin-bottom:10px;">
      <div class="goal-cell"><div class="glbl">Proteína</div><div class="gval">${parsed.protein_g}g</div></div>
      <div class="goal-cell"><div class="glbl">Carbo</div><div class="gval">${parsed.carbs_g}g</div></div>
      <div class="goal-cell"><div class="glbl">Gordura</div><div class="gval">${parsed.fat_g}g</div></div>
    </div>
    ${parsed.note ? `<div class="science-tip"><div class="st-body">${escapeHtml(parsed.note)}</div></div>` : ''}
    <button class="primary" onclick="saveDietEntry()">✓ Adicionar em ${fmtDate(selectedDietDate)}</button>
  `;
}
async function estimateDietCalories(){
  const input = document.getElementById('diet-input');
  const text = input.value.trim();
  const statusEl = document.getElementById('diet-estimate-status');
  const resultEl = document.getElementById('diet-estimate-result');
  if(!dietSelectedMealType){ showToast('Selecione o tipo de refeição primeiro.'); return; }
  if(!text){ showToast('Descreve o que você comeu primeiro.'); return; }
  const sample = window.claude ? await window.claude.use('sample') : null;
  if(!sample){ statusEl.innerHTML = '<p class="calc-formula-note">Estimativa por IA não disponível nesta sessão.</p>'; return; }
  statusEl.innerHTML = '🤖 Estimando calorias...';
  resultEl.innerHTML = '';
  document.getElementById('diet-photo-result').innerHTML = '';
  document.getElementById('diet-label-result').innerHTML = '';
  try{
    const parsed = await sample.json(
      `Você é um nutricionista estimando calorias de uma refeição descrita por um usuário de um app de treino. Responda ESTRITAMENTE em JSON, sem markdown, sem texto antes ou depois, neste formato exato:
{"kcal": <número inteiro, total estimado>, "protein_g": <número>, "carbs_g": <número>, "fat_g": <número>, "items": [{"name": "<item>", "kcal": <número>}], "note": "<observação curta em português sobre a estimativa, ex: 'estimativa aproximada, pode variar conforme preparo'>"}

Refeição descrita: "${text}"`,
      {modelTier: 'quick'}
    );
    dietPendingEstimate = {description: text, ...parsed};
    statusEl.innerHTML = '';
    resultEl.innerHTML = dietEstimateResultHtml(parsed);
  }catch(err){
    statusEl.innerHTML = `<p class="calc-formula-note">${corridaSampleErrorMsg(err)}</p>`;
  }
}

// A label abre a câmera/galeria do sistema ANTES do evento onchange do input
// disparar — se a checagem de tipo só rodasse depois (em handleDietPhotoFile),
// o usuário já teria gasto o esforço de tirar/escolher a foto pra só então
// ver um toast rápido dizendo que precisava selecionar o tipo primeiro, e a
// foto seria descartada sem ele perceber o motivo. Interceptando aqui, no
// clique da própria label, o seletor de arquivo nem chega a abrir.
function guardDietMealTypeSelected(e, actionLabel){
  if(!dietSelectedMealType){
    e.preventDefault();
    showToast(`Selecione o tipo de refeição primeiro (Café, Almoço...) antes de ${actionLabel}.`);
    const grid = document.getElementById('diet-meal-type-grid');
    if(grid) grid.scrollIntoView({behavior:'smooth', block:'center'});
    return false;
  }
  return true;
}
function handleDietPhotoLabelClick(e){
  return guardDietMealTypeSelected(e, 'enviar a foto');
}
function handleDietLabelClickGuard(e){
  return guardDietMealTypeSelected(e, 'enviar o rótulo');
}

// Confirmação visual de que o arquivo escolhido chegou de verdade no app —
// aparece IMEDIATAMENTE ao selecionar, antes de qualquer chamada de IA, pra
// dar uma resposta clara mesmo se a leitura por IA travar ou falhar depois.
// Sem isso, "escolhi a foto e nada aparece" não dizia se o problema era o
// navegador nem sequer ter recebido o arquivo, ou a IA travando na leitura.
let dietFilePreviewUrl = null;
// Fotos de iPhone costumam vir em .heic/.heif, que a maioria dos navegadores
// não decodifica pra exibir num <img> — em vez de deixar aparecer um preview
// quebrado (o alt text sozinho), troca por um ícone genérico quando a
// imagem falha ao carregar. Não precisa adivinhar por extensão: cobre
// qualquer formato que o navegador não consiga decodificar.
function dietFilePreviewError(imgEl){
  imgEl.outerHTML = '<div class="dfp-icon">🖼️</div>';
}
function renderDietFilePreview(previewElId, file, kind){
  const el = document.getElementById(previewElId);
  if(!el) return;
  if(dietFilePreviewUrl) URL.revokeObjectURL(dietFilePreviewUrl);
  dietFilePreviewUrl = URL.createObjectURL(file);
  const sizeKb = Math.round(file.size/1024);
  el.innerHTML = `<div class="diet-file-preview">
    <img src="${dietFilePreviewUrl}" alt="preview" onerror="dietFilePreviewError(this)">
    <div class="dfp-text">📎 Arquivo carregado: <b>${escapeHtml(file.name)}</b> (${sizeKb}KB)</div>
    <button type="button" class="dfp-remove" onclick="clearDietFile('${kind}')" aria-label="Remover arquivo">✕</button>
  </div>`;
}
function clearDietFilePreview(previewElId){
  const el = document.getElementById(previewElId);
  if(el) el.innerHTML = '';
}
// Botão explícito pra descartar a foto/rótulo carregado a qualquer momento —
// arquivo, sem um jeito de simplesmente remover o que já tinha enviado.
function clearDietFile(kind){
  tapFeedback();
  const ids = kind==='label'
    ? {file:'diet-label-file', preview:'diet-label-preview', status:'diet-label-status', result:'diet-label-result'}
    : {file:'diet-photo-file', preview:'diet-photo-preview', status:'diet-photo-status', result:'diet-photo-result'};
  document.getElementById(ids.file).value = '';
  clearDietFilePreview(ids.preview);
  document.getElementById(ids.status).innerHTML = '';
  document.getElementById(ids.result).innerHTML = '';
  if(kind==='label'){
    dietPendingLabelFile = null;
    dietLabelPerServing = null;
    dietLabelServings = 1;
  } else {
    dietPendingPhotoFile = null;
  }
  dietPendingEstimate = null;
}

// Se a chamada de IA travar sem nunca resolver nem rejeitar (ex: problema de
// rede/capability), o usuário ficaria olhando "Lendo a foto..." pra sempre
// sem explicação — mesmo risco já visto no OCR do CrossFit. Timeout de
// segurança de 30s força uma mensagem clara em vez de travar silenciosamente.
function withTimeout(promise, ms=30000){
  let timer;
  const timeout = new Promise((_, reject)=>{
    timer = setTimeout(()=>reject(Object.assign(new Error('timeout'), {code:'timeout'})), ms);
  });
  return Promise.race([promise.finally(()=>clearTimeout(timer)), timeout]);
}

// Se o clique na label não tiver sido interceptado a tempo por algum motivo
// (ex: preventDefault não respeitado por algum webview específico), o
// arquivo chega aqui mesmo sem tipo selecionado. Em vez de descartar a foto
// e deixar só um toast rápido como único aviso — o que deixava a foto
// "carregada" pro sempre sem nenhum caminho de recuperação, exigindo
// escolher tudo de novo do zero — guardamos o arquivo numa variável e a
// leitura roda sozinha assim que um tipo for selecionado (selectDietMealType
// abaixo verifica isso).
let dietPendingPhotoFile = null;
let dietPendingLabelFile = null;

async function handleDietPhotoFile(e){
  const rawFile = e.target.files[0];
  if(!rawFile) return;
  const statusEl = document.getElementById('diet-photo-status');
  const resultEl = document.getElementById('diet-photo-result');
  resultEl.innerHTML = '';
  document.getElementById('diet-estimate-result').innerHTML = '';
  document.getElementById('diet-label-result').innerHTML = '';
  if(isHeicFile(rawFile)) statusEl.innerHTML = '🔄 Convertendo foto...';
  const file = await convertHeicIfNeeded(rawFile);
  renderDietFilePreview('diet-photo-preview', file, 'photo');
  if(!dietSelectedMealType){
    dietPendingPhotoFile = file;
    statusEl.innerHTML = '<p class="calc-formula-note"><b>Foto carregada.</b> Selecione o tipo de refeição acima (Café, Almoço...) pra continuar a leitura por IA.</p>';
    const grid = document.getElementById('diet-meal-type-grid');
    if(grid) grid.scrollIntoView({behavior:'smooth', block:'center'});
    return;
  }
  await runDietPhotoEstimate(file);
}
async function runDietPhotoEstimate(file){
  const statusEl = document.getElementById('diet-photo-status');
  const resultEl = document.getElementById('diet-photo-result');
  const sample = window.claude ? await window.claude.use('sample') : null;
  if(!sample){
    statusEl.innerHTML = '<p class="calc-formula-note">Leitura por IA não disponível nesta sessão — descreve a refeição por texto abaixo.</p>';
    return;
  }
  statusEl.innerHTML = '🤖 Lendo a foto...';
  try{
    const parsed = await withTimeout(sample.json(
      'Essa imagem é uma foto de uma refeição. Você é um nutricionista estimando as calorias do que aparece no prato. Responda ESTRITAMENTE em JSON, sem markdown, neste formato exato: {"description": "<descrição curta do que aparece no prato, em português>", "kcal": <número inteiro, total estimado>, "protein_g": <número>, "carbs_g": <número>, "fat_g": <número>, "items": [{"name": "<item>", "kcal": <número>}], "note": "<observação curta em português sobre a estimativa>"}',
      {images: file, modelTier: 'quick'}
    ));
    dietPendingEstimate = parsed;
    statusEl.innerHTML = '';
    resultEl.innerHTML = dietEstimateResultHtml(parsed, parsed.description);
  }catch(err){
    statusEl.innerHTML = `<p class="calc-formula-note">${corridaSampleErrorMsg(err)} Descreve a refeição por texto abaixo em vez disso.</p>`;
  }
}

// ---------- RÓTULO NUTRICIONAL (produto industrializado — ex: iogurte) ----------
// Lido por OCR local (Tesseract, mesmo caminho já validado no CrossFit) em vez
// da capability `sample` — diferente da foto do prato (que precisa mesmo de
// visão de IA pra reconhecer comida), o rótulo é só texto numa tabela
// padronizada (modelo ANVISA), então OCR + parser resolve sem depender de IA
// remota nem esbarrar no bloqueio `images_unavailable` desta conta.
// O usuário ajusta quantas porções vai comer — os totais são recalculados na
// hora, sem precisar reler a foto pra cada ajuste.
let dietLabelPerServing = null;
let dietLabelServings = 1;
// Regex tolerante a variação de espaçamento (comum quando o OCR lê uma tabela
// em colunas) — nunca inventa valor, deixa null quando não encontra. Cada
// captura exige um dígito logo após o rótulo, o que já filtra a maioria dos
// falsos positivos (ex: "Quantidade por porção %VD" não bate a regex de
// porção, já que depois de "porção" vem "%VD", não um número).
function parseNutritionLabel(rawText){
  const text = stripAccents(rawText);
  function grabNum(re){
    const m = text.match(re);
    if(!m) return null;
    const n = parseFloat(m[1].replace(',','.'));
    return isNaN(n) ? null : n;
  }
  const kcal = grabNum(/valor\s+energetico\D{0,20}?(\d+[\d.,]*)\s*k?cal/i);
  const carbs_g = grabNum(/carboidratos?(?:\s+totais)?\D{0,10}?(\d+[\d.,]*)\s*g\b/i);
  const protein_g = grabNum(/proteinas?\D{0,10}?(\d+[\d.,]*)\s*g\b/i);
  const fat_g = grabNum(/gorduras?\s*totais\D{0,10}?(\d+[\d.,]*)\s*g\b/i);
  const servingMatch = text.match(/porcao\s*:?\s*(\d[^\n%]*?)(?:\n|quantidade|$)/i);
  const serving_description = servingMatch ? servingMatch[1].trim().replace(/\s{2,}/g,' ') : null;
  return {kcal, carbs_g, protein_g, fat_g, serving_description};
}
async function handleDietLabelFile(e){
  const rawFile = e.target.files[0];
  if(!rawFile) return;
  const statusEl = document.getElementById('diet-label-status');
  const resultEl = document.getElementById('diet-label-result');
  resultEl.innerHTML = '';
  document.getElementById('diet-photo-result').innerHTML = '';
  document.getElementById('diet-estimate-result').innerHTML = '';
  if(isHeicFile(rawFile)) statusEl.innerHTML = '🔄 Convertendo foto...';
  const file = await convertHeicIfNeeded(rawFile);
  renderDietFilePreview('diet-label-preview', file, 'label');
  if(!dietSelectedMealType){
    dietPendingLabelFile = file;
    statusEl.innerHTML = '<p class="calc-formula-note"><b>Rótulo carregado.</b> Selecione o tipo de refeição acima (Café, Almoço...) pra continuar a leitura por IA.</p>';
    const grid = document.getElementById('diet-meal-type-grid');
    if(grid) grid.scrollIntoView({behavior:'smooth', block:'center'});
    return;
  }
  await runDietLabelEstimate(file);
}
// Mostra sempre o texto bruto que o OCR conseguiu ler (colapsado por padrão)
// — mesmo quando o parser não estrutura nada. Sem isso, "não funcionou" não
// dizia se o OCR não leu nada, leu errado, ou leu certo mas o parser não
// reconheceu o formato — cada causa pede um conserto diferente.
function dietOcrRawTextHtml(rawText){
  if(!rawText || !rawText.trim()) return '';
  return `<details style="margin-top:8px;"><summary class="calc-formula-note" style="cursor:pointer;">Ver texto reconhecido pelo OCR</summary><pre style="white-space:pre-wrap; font-size:11px; color:var(--muted); background:var(--panel-2); border-radius:8px; padding:8px; margin-top:6px;">${escapeHtml(rawText.trim())}</pre></details>`;
}
async function runDietLabelEstimate(file){
  const statusEl = document.getElementById('diet-label-status');
  const resultEl = document.getElementById('diet-label-result');
  statusEl.innerHTML = '🔍 Lendo o rótulo... isso pode levar alguns segundos.';
  try{
    if(typeof Tesseract === 'undefined') throw new Error('Tesseract não carregou');
    const rawDataUrl = await new Promise((resolve,reject)=>{
      const reader = new FileReader();
      reader.onload = ()=>resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const dataUrl = await preprocessImageForOcr(rawDataUrl);
    const ocrTimeout = new Promise((_,reject)=>setTimeout(()=>reject(Object.assign(new Error('ocr_timeout'),{code:'ocr_timeout'})), 25000));
    const workerPath = await buildOcrWorkerUrl();
    const result = await Promise.race([Tesseract.recognize(dataUrl, 'por', {workerPath, corePath:'core'}), ocrTimeout]);
    const rawText = result.data.text || '';
    const parsed = parseNutritionLabel(rawText);
    const gotAny = parsed.kcal!==null || parsed.protein_g!==null || parsed.carbs_g!==null || parsed.fat_g!==null;
    if(!gotAny){
      statusEl.innerHTML = '<p class="calc-formula-note">Não consegui reconhecer os valores da tabela nutricional — tenta uma foto mais nítida, bem enquadrada na tabela, ou descreve por texto abaixo.</p>';
      resultEl.innerHTML = dietOcrRawTextHtml(rawText);
      return;
    }
    statusEl.innerHTML = (parsed.kcal!==null && parsed.protein_g!==null && parsed.carbs_g!==null && parsed.fat_g!==null)
      ? '✓ Rótulo lido — confira os valores antes de salvar.'
      : '⚠️ Só consegui ler parte dos valores — confira e ajusta antes de salvar.';
    dietLabelPerServing = {
      product_name: null,
      serving_description: parsed.serving_description,
      kcal: parsed.kcal, protein_g: parsed.protein_g, carbs_g: parsed.carbs_g, fat_g: parsed.fat_g,
    };
    dietLabelServings = 1;
    renderDietLabelResult();
    resultEl.insertAdjacentHTML('beforeend', dietOcrRawTextHtml(rawText));
  }catch(err){
    const msg = err && err.code==='ocr_timeout'
      ? 'A leitura por OCR não completou a tempo (mais de 25s) — a imagem pode ser grande ou complexa demais.'
      : `Não consegui processar essa imagem (${(err&&err.message)||'erro desconhecido'}).`;
    statusEl.innerHTML = `<p class="calc-formula-note">${msg} Tenta outra foto, ou descreve a refeição por texto abaixo.</p>`;
  }
}
// A estrutura (incluindo o <input> de porções) é montada UMA VEZ em
// renderDietLabelResult(); depois disso, só updateDietLabelTotals() roda a
// cada ajuste, reescrevendo apenas os números — recriar o <input> a cada
// tecla digitada (via innerHTML) faria o campo perder o foco no meio da
// digitação.
function renderDietLabelResult(){
  const resultEl = document.getElementById('diet-label-result');
  if(!resultEl || !dietLabelPerServing) return;
  const p = dietLabelPerServing;
  resultEl.innerHTML = `
    ${p.serving_description ? `<div class="calc-formula-note">Porção do rótulo: <b>${escapeHtml(p.serving_description)}</b>${p.kcal?` — ${p.kcal}kcal`:''}</div>` : ''}
    <label style="margin-top:8px;">Quantas porções você vai comer?</label>
    <div class="stepper-row">
      <button type="button" class="step-btn" onclick="adjustLabelServings(-0.5)">−0,5</button>
      <input type="text" inputmode="decimal" class="custom-amount-input" id="diet-label-servings-input" value="${dietLabelServings}" oninput="setLabelServingsFromInput(this.value)">
      <button type="button" class="step-btn plus" onclick="adjustLabelServings(0.5)">+0,5</button>
    </div>
    <div id="diet-label-totals"></div>
  `;
  updateDietLabelTotals();
}
function updateDietLabelTotals(){
  const p = dietLabelPerServing;
  if(!p) return;
  const mult = dietLabelServings;
  const totals = {
    kcal: Math.round((p.kcal||0)*mult),
    protein_g: Math.round((p.protein_g||0)*mult),
    carbs_g: Math.round((p.carbs_g||0)*mult),
    fat_g: Math.round((p.fat_g||0)*mult),
  };
  const desc = p.product_name || 'Produto do rótulo';
  dietPendingEstimate = {description: desc, ...totals};
  const totalsEl = document.getElementById('diet-label-totals');
  if(totalsEl) totalsEl.innerHTML = dietEstimateResultHtml(totals, desc);
}
function adjustLabelServings(delta){
  tapFeedback();
  dietLabelServings = Math.max(0.5, Math.round((dietLabelServings+delta)*2)/2);
  const input = document.getElementById('diet-label-servings-input');
  if(input) input.value = dietLabelServings;
  updateDietLabelTotals();
}
function setLabelServingsFromInput(val){
  const n = parseFloat(String(val).replace(',','.'));
  dietLabelServings = (!isNaN(n) && n>0) ? n : dietLabelServings;
  updateDietLabelTotals();
}

async function saveDietEntry(){
  if(!dietPendingEstimate) return;
  if(!dietSelectedMealType){ showToast('Selecione o tipo de refeição primeiro.'); return; }
  tapFeedback();
  await loadDietCache();
  const mealNumber = mealTypeCountToday(dietSelectedMealType) + 1;
  await window.ForjaEnhancements?.reopenDay(selectedDietDate);
  const added={id:cid(), date:selectedDietDate, time:nowTime(), mealType:dietSelectedMealType, mealNumber, ...dietPendingEstimate};
  dietCache.push(added);
  try{await persistDietCache();}catch(error){dietCache=dietCache.filter(e=>e.id!==added.id);throw Error('Não foi possível gravar a refeição. Seu rascunho foi mantido; tente salvar novamente.');}
  dietPendingEstimate = null;
  dietSelectedMealType = null;
  dietLabelPerServing = null;
  dietLabelServings = 1;
  dietPendingPhotoFile = null;
  dietPendingLabelFile = null;
  document.getElementById('diet-input').value = '';
  document.getElementById('diet-estimate-result').innerHTML = '';
  document.getElementById('diet-photo-result').innerHTML = '';
  document.getElementById('diet-photo-file').value = '';
  document.getElementById('diet-label-result').innerHTML = '';
  document.getElementById('diet-label-file').value = '';
  clearDietFilePreview('diet-photo-preview');
  clearDietFilePreview('diet-label-preview');
  showToast(`Refeição adicionada em ${fmtDate(selectedDietDate)}!`);
  await renderDietTab();
}

async function deleteDietEntry(id){
  await loadDietCache();
  const removed = dietCache.find(e=>e.id===id);
  const originalIndex = dietCache.findIndex(e=>e.id===id);
  if(removed) await window.ForjaEnhancements?.reopenDay(removed.date);
  dietCache = dietCache.filter(e=>e.id!==id);
  await persistDietCache();
  await renderDietTab();
  if(removed) showToast('Refeição removida.', {label:'Desfazer', onClick:async()=>{
    await loadDietCache();
    if(!dietCache.some(e=>e.id===removed.id)) dietCache.splice(Math.max(0,originalIndex),0,removed);
    await persistDietCache();
    await renderDietTab();
    if(window.ForjaEnhancements) await window.ForjaEnhancements.renderWeeklyBalance();
  }});
}

let dietEditingId = null;
function toggleDietEdit(id){
  tapFeedback();
  dietEditingId = (dietEditingId===id) ? null : id;
  renderDietTab();
}
async function saveDietEdit(id){
  tapFeedback();
  await loadDietCache();
  const entry = dietCache.find(e=>e.id===id);
  if(!entry) return;
  const kcalEl = document.getElementById(`diet-edit-kcal-${id}`);
  const descEl = document.getElementById(`diet-edit-desc-${id}`);
  const kcal = parseInt(kcalEl.textContent, 10);
  if(isNaN(kcal)||kcal<0){showToast('Informe calorias válidas.');return;}
  entry.kcal=kcal;entry.totalsEdited=true;
  entry.description = descEl.textContent.trim() || entry.description;
  await window.ForjaEnhancements?.reopenDay(entry.date);
  await persistDietCache();
  dietEditingId = null;
  showToast('Refeição atualizada!');
  await renderDietTab();
}

function computeTdee(){
  if(!calcState.weight) return 0;
  const bmr = calcState.bodyfat>0
    ? (370+21.6*calcState.weight*(1-calcState.bodyfat/100))
    : (calcState.sex==='M' ? 10*calcState.weight+6.25*calcState.height-5*calcState.age+5 : 10*calcState.weight+6.25*calcState.height-5*calcState.age-161);
  return Math.round(bmr * (ACTIVITY_LEVELS.find(a=>a.key===calcState.activity)||ACTIVITY_LEVELS[2]).mult);
}
// Meta oficial prescrita pelo nutricionista (2026-09-17) — passa a ser a
// meta usada de verdade pro acompanhamento diário (Dieta, streak, saldo do
// Início), substituindo o TDEE×0,8 calculado como fonte principal. A
// calculadora de calorias da aba Corpo (TMB/TDEE) continua disponível como
// referência própria, só não alimenta mais a meta usada aqui.
let NUTRITION_GOAL = {kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0};
async function loadNutritionGoal(){
  try {
    const saved=await window.storage.get('nutrition-goal-v1');
    if(saved){const value=JSON.parse(saved.value);if(Number.isFinite(value.kcal)&&value.kcal>0)NUTRITION_GOAL=value;}
  } catch {}
  for(const [field,key] of [['kcal','kcal'],['protein','protein_g'],['fat','fat_g'],['carbs','carbs_g']]){
    const input=document.getElementById('nutrition-goal-'+field);if(input)input.value=NUTRITION_GOAL[key]||'';
  }
}
async function saveNutritionGoal(){
  const read=(field)=>Number(document.getElementById('nutrition-goal-'+field)?.value);
  const value={kcal:read('kcal'),protein_g:read('protein'),fat_g:read('fat'),carbs_g:read('carbs')};
  const status=document.getElementById('nutrition-goal-status');
  if(!Number.isFinite(value.kcal)||value.kcal<=0||value.kcal>10000||Object.values(value).some(v=>!Number.isFinite(v)||v<0)){
    if(status)status.textContent='Informe uma meta calórica válida e macros não negativos.';return;
  }
  try{await window.storage.set('nutrition-goal-v1',JSON.stringify(value));NUTRITION_GOAL=value;if(status)status.textContent='Meta salva neste aparelho.';await renderDashboard();await renderDietTab();}
  catch{if(status)status.textContent='Não foi possível salvar a meta.';}
}
function computeDeficitGoal(){
  return NUTRITION_GOAL.kcal;
}
async function computeDeficitDays(){
  await loadDietCache();
  const byDate = {};
  dietCache.forEach(e=>{ byDate[e.date] = (byDate[e.date]||0) + (e.kcal||0); });
  const goal = computeDeficitGoal();
  if(goal<=0) return new Set();
  let closed={};try{const r=await window.storage.get('diet-closed-days');closed=r?JSON.parse(r.value):{};}catch{}
  return new Set(Object.keys(byDate).filter(d=>closed[d]));
}
async function computeDeficitStreak(){
  const deficitDays = await computeDeficitDays();
  if(deficitDays.size===0) return 0;
  let streak = 0;
  let cursor = new Date();
  cursor.setHours(0,0,0,0);
  if(!deficitDays.has(todayKey(cursor))){
    cursor.setDate(cursor.getDate()-1);
    if(!deficitDays.has(todayKey(cursor))) return 0;
  }
  while(deficitDays.has(todayKey(cursor))){
    streak++;
    cursor.setDate(cursor.getDate()-1);
  }
  return streak;
}

async function renderDietTab(){
  checkImageSupport('diet-photo-note', 'o rótulo nutricional (lido por OCR local, sem depender de IA) ou a descrição por texto abaixo');
  await loadDietCache();
  renderMealTypeButtons();
  const dateInput = document.getElementById('diet-date-input');
  if(dateInput && !dateInput.value) dateInput.value = selectedDietDate;

  const isToday = selectedDietDate === todayKey();
  const titleSuffix = isToday ? 'Hoje' : fmtDate(selectedDietDate);
  const summaryTitle = document.getElementById('diet-summary-title');
  if(summaryTitle) summaryTitle.textContent = `🍽 ${titleSuffix}`;
  const listTitle = document.getElementById('diet-list-title');
  if(listTitle) listTitle.textContent = `Refeições ${isToday ? 'de hoje' : 'de '+fmtDate(selectedDietDate)}`;

  const dayEntries = dietCache.filter(e=>e.date===selectedDietDate);
  const totalKcal = dayEntries.reduce((s,e)=>s+(e.kcal||0),0);

  const ringsEl = document.getElementById('diet-rings');
  if(ringsEl){
    const {comido, exercicio, goal, entryCount, garminSyncedAt, garminTotal, garminSteps, crossfitExtra, crossfitEstimated, crossfitUncertainty, exerciseSource} = await computeDietDaySummary(selectedDietDate);
    let ringsHtml = buildCaloriesRingsHtml(comido||null, exercicio||null, goal, garminTotal);
    ringsHtml += `<p class="calc-formula-note">${escapeHtml(window.ForjaSyncCenter?.describeDay?.({intake:entryCount?comido:null,totalBurn:garminTotal,activeKcal:exercicio||null,steps:garminSteps,garminSyncedAt,crossfitExtra,crossfitEstimated,crossfitUncertainty,exerciseSource})||'Confira as fontes do gasto antes de usar o saldo.')}</p>`;

    const sumCarbs = dayEntries.reduce((s,e)=>s+(e.carbs_g||0),0);
    const sumProtein = dayEntries.reduce((s,e)=>s+(e.protein_g||0),0);
    const sumFat = dayEntries.reduce((s,e)=>s+(e.fat_g||0),0);
    if(sumCarbs || sumProtein || sumFat){
      const importedMacroGoals = [...dayEntries].reverse().find(e=>e.carbsGoalG)||{};
      const carbGoalG = importedMacroGoals.carbsGoalG || Math.round(NUTRITION_GOAL.carbs_g);
      const proteinGoalG = importedMacroGoals.proteinGoalG || Math.round(NUTRITION_GOAL.protein_g);
      const fatGoalG = importedMacroGoals.fatGoalG || Math.round(NUTRITION_GOAL.fat_g);
      ringsHtml += buildMacroRingsHtml(
        carbGoalG?{g:sumCarbs, goalG:carbGoalG, partial:dayEntries.some(e=>e.carbs_g==null), unknown:dayEntries.every(e=>e.carbs_g==null)}:null,
        proteinGoalG?{g:sumProtein, goalG:proteinGoalG, partial:dayEntries.some(e=>e.protein_g==null), unknown:dayEntries.every(e=>e.protein_g==null)}:null,
        fatGoalG?{g:sumFat, goalG:fatGoalG, partial:dayEntries.some(e=>e.fat_g==null), unknown:dayEntries.every(e=>e.fat_g==null)}:null
      );
    }
    if(dayEntries.some(e=>[e.carbs_g,e.protein_g,e.fat_g].some(v=>v==null))) ringsHtml += '<p class="calc-formula-note">Macros parciais: há refeições com nutrientes não informados.</p>';
    ringsEl.innerHTML = ringsHtml;
  }

  const compareEl = document.getElementById('diet-goal-compare');
  if(compareEl){
    const goal = computeDeficitGoal();
    const diff = totalKcal - goal;
    const inDeficit = totalKcal>0 && totalKcal<=goal;
    compareEl.innerHTML = goal>0?`<div class="ex-card-last">Meta alimentar: <b>${goal} kcal</b> (P ${NUTRITION_GOAL.protein_g}g · L ${NUTRITION_GOAL.fat_g}g · C ${NUTRITION_GOAL.carbs_g}g) — ${diff>=0?`+${diff}`:diff} kcal ${diff>=0?'acima':'abaixo'} da meta. ${inDeficit?'Saldo da meta alimentar; não equivale ao déficit energético.':''}</div>`:'<div class="ex-card-last">Sem meta alimentar definida neste aparelho. Os alimentos e totais continuam disponíveis.</div>';
  }
  const streakEl = document.getElementById('deficit-streak-label');
  if(streakEl){
    streakEl.textContent = 'Conclua os lançamentos do dia para incluí-lo no balanço semanal.';
  }

  const todayListEl = document.getElementById('diet-today-list');
  if(todayListEl){
    todayListEl.innerHTML = dayEntries.length===0 ? '<div class="empty">Nenhuma refeição registrada nesse dia.</div>' : dayEntries.map(e=>{
      if(dietEditingId === e.id){
        return `<div class="entry entry-edit" style="display:block;">
          <label>Descrição</label>
          <div class="gval" contenteditable="true" id="diet-edit-desc-${e.id}" style="background:var(--panel-2); border-radius:8px; padding:8px; margin-bottom:8px; font-size:13px;">${escapeHtml(e.description)}</div>
          <label>Kcal</label>
          <div class="gval" contenteditable="true" id="diet-edit-kcal-${e.id}" style="background:var(--panel-2); border-radius:8px; padding:8px; margin-bottom:8px;">${e.kcal}</div>
          <button class="secondary-btn" onclick="saveDietEdit('${e.id}')">✓ Salvar</button>
          <button class="rpe-skip-btn" onclick="toggleDietEdit('${e.id}')">Cancelar</button>
        </div>`;
      }
      const mealType = MEAL_TYPES.find(t=>t.key===e.mealType);
      const mealPrefix = mealType ? `${mealType.emoji} ${mealType.label} ${e.mealNumber||1} — ` : '';
      return `
      <div class="entry" data-diet-entry="${escapeHtml(e.id)}">
        <div class="thumb placeholder">🍽</div>
        <div class="info">
          <div class="name">${mealPrefix}${escapeHtml(e.description)} — ${e.kcal}kcal</div>
          <div class="meta">${e.time} · P ${e.protein_g??'—'} g · C ${e.carbs_g??'—'} g · G ${e.fat_g??'—'} g${[e.protein_g,e.carbs_g,e.fat_g].some(v=>v==null)?' · nutrientes não informados':''}</div>
          ${e.items?.length?`<details><summary>Alimentos e origens</summary>${e.items.map(item=>`<div>${escapeHtml(item.name)} · ${escapeHtml(window.ForjaNutritionSource?.label(item.source)||'Origem não informada')}</div>`).join('')}</details>`:''}
        </div>
        <button class="del" onclick="toggleDietEdit('${e.id}')" style="margin-right:6px;" aria-label="Editar refeição">✏️</button>
        <button class="del" onclick="deleteDietEntry('${e.id}')" aria-label="Remover refeição">✕</button>
      </div>
    `;
    }).join('');
  }

  const histEl = document.getElementById('diet-history-list');
  if(histEl){
    const byDate = {};
    dietCache.forEach(e=>{ (byDate[e.date]=byDate[e.date]||[]).push(e); });
    const dates = Object.keys(byDate).sort((a,b)=>b.localeCompare(a)).filter(d=>d!==selectedDietDate).slice(0,14);
    histEl.innerHTML = dates.length===0 ? '<div class="empty">Sem histórico ainda.</div>' : dates.map(d=>{
      const total = byDate[d].reduce((s,e)=>s+(e.kcal||0),0);
      return `<div class="watch-hist-row" onclick="jumpToDietDate('${d}')" style="cursor:pointer;"><span>${fmtDate(d)} · ${byDate[d].length} refeição(ões)</span><span>${total} kcal ✏️</span></div>`;
    }).join('');
  }
  if(window.ForjaEnhancements) await window.ForjaEnhancements.renderWeeklyBalance(selectedDietDate);
  await window.ForjaRoutineDiet?.renderSavedMeals();
  await window.ForjaEnhancements?.renderDayClose(selectedDietDate);
}

// Versão compartilhável: nenhum plano alimentar de outra pessoa é incluído.
let DIET_PLAN={cafe:{label:'Café da manhã',icon:'☕',items:[]},almoco:{label:'Almoço',icon:'🍛',items:[]},lanche:{label:'Lanche',icon:'🍪',options:[{name:'Minha opção',items:[]}]},janta:{label:'Jantar',icon:'🍽️',options:[{name:'Minha opção',items:[]}]},ceia:{label:'Ceia',icon:'🌙',items:[]}};
let SHOPPING_LIST=[{cat:'Outros',items:[]}];
const K_SHOP_CHECKED = 'shopping-list-checked';
let shopCheckedCache = null;
async function loadShopCheckedCache(){
  if(shopCheckedCache) return shopCheckedCache;
  try{
    const r = await window.storage.get(K_SHOP_CHECKED);
    shopCheckedCache = r ? JSON.parse(r.value) : {};
  }catch(e){ shopCheckedCache = {}; }
  return shopCheckedCache;
}
async function persistShopCheckedCache(){
  scheduleWrite(K_SHOP_CHECKED, ()=>JSON.stringify(shopCheckedCache));
}
// Reseta o estado de "comprado" (checkbox marcado) semanalmente, sempre que a
// aba Cardápio é aberta numa semana nova (segunda-feira como início, mesmo
// Só o que foi marcado como comprado desmarca; itens removidos/adicionados
// por ele continuam do jeito que estavam. Sem processo em segundo plano (é
// só um app local), então o reset acontece na próxima vez que a aba abrir
// depois da virada da semana, não exatamente à meia-noite de segunda.
const K_SHOP_CHECKED_WEEK = 'shopping-list-checked-week';
async function ensureShopWeeklyReset(){
  const currentWeek = todayKey(getMonday(new Date()));
  let lastWeek = null;
  try{
    const r = await window.storage.get(K_SHOP_CHECKED_WEEK);
    lastWeek = r ? r.value : null;
  }catch(e){}
  if(lastWeek === currentWeek) return;
  await loadShopCheckedCache();
  shopCheckedCache = {};
  await persistShopCheckedCache();
  await storageSet(K_SHOP_CHECKED_WEEK, currentWeek);
}
async function toggleShopItem(key){
  tapFeedback();
  await loadShopCheckedCache();
  shopCheckedCache[key] = !shopCheckedCache[key];
  await persistShopCheckedCache();
  renderCardapioTab();
}

// ---------- LISTA DE COMPRAS PERSONALIZADA (remover item da lista base /
// (SHOPPING_LIST, transcrita do plano) nunca são apagados de verdade do
// código — "remover" só marca a chave como escondida (`shopRemovedCache`),
// reversível se algum dia precisar reverter. Itens adicionados pelo usuário
// vivem à parte (`shopCustomCache`) e esses sim somem de vez ao excluir, já
// que foram criados por ele mesmo, não vêm da prescrição.
const K_SHOP_REMOVED = 'shopping-list-removed';
let shopRemovedCache = null;
async function loadShopRemovedCache(){
  if(shopRemovedCache) return shopRemovedCache;
  try{
    const r = await window.storage.get(K_SHOP_REMOVED);
    shopRemovedCache = r ? JSON.parse(r.value) : {};
  }catch(e){ shopRemovedCache = {}; }
  return shopRemovedCache;
}
async function persistShopRemovedCache(){
  scheduleWrite(K_SHOP_REMOVED, ()=>JSON.stringify(shopRemovedCache));
}
async function removeShopItem(key){
  tapFeedback();
  await loadShopRemovedCache();
  shopRemovedCache[key] = true;
  await persistShopRemovedCache();
  showToast('Item removido da lista.');
  renderCardapioTab();
}

const K_SHOP_CUSTOM = 'shopping-list-custom';
let shopCustomCache = null;
async function loadShopCustomCache(){
  if(shopCustomCache) return shopCustomCache;
  try{
    const r = await window.storage.get(K_SHOP_CUSTOM);
    shopCustomCache = r ? JSON.parse(r.value) : [];
  }catch(e){ shopCustomCache = []; }
  return shopCustomCache;
}
async function persistShopCustomCache(){
  scheduleWrite(K_SHOP_CUSTOM, ()=>JSON.stringify(shopCustomCache));
}
async function addCustomShopItem(){
  const nameInput = document.getElementById('shop-add-name');
  const qtyInput = document.getElementById('shop-add-qty');
  const catSelect = document.getElementById('shop-add-cat');
  const name = nameInput.value.trim();
  if(!name){ showToast('Digite o nome do item primeiro.'); return; }
  tapFeedback();
  await loadShopCustomCache();
  shopCustomCache.push({id: cid(), cat: catSelect.value, name, qty: qtyInput.value.trim() || null});
  await persistShopCustomCache();
  showToast(`"${name}" adicionado à lista.`);
  renderCardapioTab();
}
async function deleteCustomShopItem(id){
  tapFeedback();
  await loadShopCustomCache();
  shopCustomCache = shopCustomCache.filter(i=>i.id!==id);
  await persistShopCustomCache();
  renderCardapioTab();
}

const K_MENU_SELECTED = 'cardapio-selected';
let menuSelectedCache = null;
async function loadMenuSelectedCache(){
  if(menuSelectedCache) return menuSelectedCache;
  try{
    const r = await window.storage.get(K_MENU_SELECTED);
    menuSelectedCache = r ? JSON.parse(r.value) : {};
  }catch(e){ menuSelectedCache = {}; }
  return menuSelectedCache;
}
async function persistMenuSelectedCache(){
  scheduleWrite(K_MENU_SELECTED, ()=>JSON.stringify(menuSelectedCache));
}
function getMenuOptionIndex(key){
  return menuSelectedCache[key] || 0;
}
async function swapMenuOption(key){
  tapFeedback();
  await loadMenuSelectedCache();
  const def = DIET_PLAN[key];
  if(!def?.options?.length)return;
  const current = getMenuOptionIndex(key);
  const next = (current + 1) % def.options.length;
  menuSelectedCache[key] = next;
  await persistMenuSelectedCache();
  renderCardapioTab();
}
// Lista de itens (com substituições em <details>, colapsadas por padrão) —
// compartilhada pelas refeições fixas e pelas opções de Lanche/Janta.
function dietPlanItemsHtml(items){
  return items.map(it=>`
    <div class="menu-meal">
      <div class="mm-name">${escapeHtml(it.name)} — ${escapeHtml(it.qty)}</div>
      ${it.subs.length ? `<details style="margin-top:4px;"><summary class="calc-formula-note" style="cursor:pointer;margin-bottom:0;">Opções de substituição</summary><div class="calc-formula-note" style="margin-top:4px;">${it.subs.map(escapeHtml).join(' · ')}</div></details>` : ''}
    </div>
  `).join('');
}
function dietPlanFixedCardHtml(key){
  const def = DIET_PLAN[key];
  return `<div class="card menu-day-card">
    <div class="card-head"><h2>${def.icon} ${def.label}</h2></div>
    ${dietPlanItemsHtml(def.items)}
  </div>`;
}
function dietPlanOptionCardHtml(key){
  const def = DIET_PLAN[key];
  const idx = getMenuOptionIndex(key);
  const opt = def.options[idx];
  return `<div class="card menu-day-card">
    <div class="card-head"><h2>${def.icon} ${def.label}</h2><span class="count">${escapeHtml(opt.name)}</span></div>
    ${opt.note ? `<div class="calc-formula-note">${escapeHtml(opt.note)}</div>` : ''}
    ${dietPlanItemsHtml(opt.items)}
    <button class="menu-swap-btn" onclick="swapMenuOption('${key}')">🔄 Trocar opção (${idx+1}/${def.options.length})</button>
  </div>`;
}

async function renderCardapioTab(){
  await ensureShopWeeklyReset();
  await loadMenuSelectedCache();
  const daysEl = document.getElementById('cardapio-days-list');
  if(daysEl){
    daysEl.innerHTML = !Object.values(DIET_PLAN).some(def=>def.items?.length||def.options?.some(opt=>opt.items?.length))
      ? '<div class="card"><p>Seu cardápio ainda não foi cadastrado. Você pode registrar refeições livremente na aba Dieta. Para adicionar um cardápio, abra Mais → Meu cardápio.</p></div>'
      : [
      dietPlanFixedCardHtml('cafe'),
      dietPlanFixedCardHtml('almoco'),
      dietPlanOptionCardHtml('lanche'),
      dietPlanOptionCardHtml('janta'),
      dietPlanFixedCardHtml('ceia'),
    ].join('');
  }
  const shopEl = document.getElementById('shopping-list');
  if(shopEl){
    await loadShopCheckedCache();
    await loadShopRemovedCache();
    await loadShopCustomCache();
    const shopCatHtml = SHOPPING_LIST.map(cat=>{
      const baseItems = cat.items.filter(item=>{
        const name = typeof item==='string' ? item : item.name;
        return !shopRemovedCache[slug(cat.cat+name)];
      });
      const customItems = shopCustomCache.filter(i=>i.cat===cat.cat);
      if(baseItems.length===0 && customItems.length===0) return '';
      return `
      <div class="shop-cat">${cat.cat}</div>
      ${baseItems.map(item=>{
        const name = typeof item==='string' ? item : item.name;
        const qty = typeof item==='string' ? null : item.qty;
        const key = slug(cat.cat+name);
        const checked = !!shopCheckedCache[key];
        return `<div class="shop-item ${checked?'checked':''}">
          <input type="checkbox" id="shop-${key}" ${checked?'checked':''} onchange="toggleShopItem('${key}')">
          <div style="flex:1;">
            <label for="shop-${key}">${escapeHtml(name)}</label>
            ${qty ? `<div class="shop-item-qty">${escapeHtml(qty)}</div>` : ''}
          </div>
          <button type="button" class="shop-item-del" onclick="removeShopItem('${key}')" aria-label="Remover item">✕</button>
        </div>`;
      }).join('')}
      ${customItems.map(i=>{
        const key = 'custom-'+i.id;
        const checked = !!shopCheckedCache[key];
        return `<div class="shop-item ${checked?'checked':''}">
          <input type="checkbox" id="shop-${key}" ${checked?'checked':''} onchange="toggleShopItem('${key}')">
          <div style="flex:1;">
            <label for="shop-${key}">${escapeHtml(i.name)}</label>
            ${i.qty ? `<div class="shop-item-qty">${escapeHtml(i.qty)}</div>` : ''}
          </div>
          <button type="button" class="shop-item-del" onclick="deleteCustomShopItem('${i.id}')" aria-label="Remover item">✕</button>
        </div>`;
      }).join('')}
      `;
    }).join('');
    const addFormHtml = `
      <div class="shop-cat">➕ Adicionar item</div>
      <div class="row" style="gap:8px;">
        <div style="flex:2;"><label>Item</label><input type="text" id="shop-add-name" placeholder="Ex: Papel toalha"></div>
        <div style="flex:1;"><label>Qtd (opcional)</label><input type="text" id="shop-add-qty" placeholder="Ex: 500g"></div>
      </div>
      <label>Categoria</label>
      <select id="shop-add-cat">${SHOPPING_LIST.map(c=>`<option value="${escapeHtml(c.cat)}">${escapeHtml(c.cat)}</option>`).join('')}</select>
      <button type="button" class="secondary-btn" style="margin-top:10px;" onclick="addCustomShopItem()">+ Adicionar à lista</button>
    `;
    shopEl.innerHTML = shopCatHtml + addFormHtml;
  }
}

// ---------- CORRIDA TAB ----------
let corridaUnsub = null;
let corridaStatusUnsub = null;
const ORIGEM_BADGE = {print:'📷', push_garmin:'⚡', strava:'🔄', manual:'✍️', 'push_garmin+print':'⚡📷', 'push_garmin+manual':'⚡✍️'};

// ---------- EDITAR/EXCLUIR (Corrida/Natação/CrossFit) ----------
// 3 abas. Em vez de gesto de "segurar" (mais frágil entre mouse/toque, e nada no resto
// do app usa isso), reaproveita o clique-pra-expandir que já existe: o detalhe expandido
// ganha os botões. Excluir pede confirmação inline (sem `confirm()` nativo — não dá pra
// garantir que diálogo nativo funciona dentro do sandbox do Artifact).
function activityActionsHtml(collection, id){
  return `
    <div style="margin-top:10px;" id="${collection}-actions-${id}">
      <div id="${collection}-actions-default-${id}" style="display:flex;gap:8px;">
        <button type="button" class="dica-add-btn" onclick="event.stopPropagation(); editActivityEntry('${collection}','${id}')">✏️ Editar</button>
        <button type="button" class="danger-btn" onclick="event.stopPropagation(); document.getElementById('${collection}-actions-default-${id}').style.display='none'; document.getElementById('${collection}-actions-confirm-${id}').style.display='flex';">🗑️ Excluir</button>
      </div>
      <div id="${collection}-actions-confirm-${id}" style="display:none;gap:8px;align-items:center;">
        <span style="font-size:12px;color:var(--muted);">Excluir de vez?</span>
        <button type="button" class="danger-btn" onclick="event.stopPropagation(); deleteActivityEntry('${collection}','${id}')">Sim</button>
        <button type="button" class="dica-add-btn" onclick="event.stopPropagation(); document.getElementById('${collection}-actions-confirm-${id}').style.display='none'; document.getElementById('${collection}-actions-default-${id}').style.display='flex';">Cancelar</button>
      </div>
    </div>
  `;
}
async function deleteActivityEntry(collection, id){
  const db = window.claude ? await window.claude.use('db') : null;
  if(!db){ showToast('Banco de dados não disponível nesta sessão.'); return; }
  await db.collection(collection).doc(id).delete();
  showToast('Treino excluído.');
}
async function editActivityEntry(collection, id){
  const db = window.claude ? await window.claude.use('db') : null;
  if(!db){ showToast('Banco de dados não disponível nesta sessão.'); return; }
  const snap = await db.doc(`${collection}/${id}`).get();
  if(!snap.exists){ showToast('Treino não encontrado.'); return; }
  const data = snap.data();
  if(collection==='crossfit'){
    document.getElementById('crossfit-print-status').innerHTML = '';
    renderCrossfitPrintReview({...data, duracao_min: data.duracao_s!=null ? data.duracao_s/60 : undefined}, {editId:id});
    document.getElementById('crossfit-print-review').scrollIntoView({behavior:'smooth', block:'center'});
  } else if(collection==='corridas'){
    document.getElementById('corrida-print-status').innerHTML = '';
    renderCorridaPrintReview({
      data: data.data, distancia_km: data.distancia_km,
      duracao_min: data.duracao_s!=null ? data.duracao_s/60 : undefined,
      calorias: data.calorias, calorias_reportadas:data.calorias_reportadas, calorias_tipo:data.calorias_tipo, calorias_referencia:data.calorias_referencia, fc_media: data.fc_media, fc_max: data.fc_max,
    }, {editId:id});
    document.getElementById('corrida-print-review').scrollIntoView({behavior:'smooth', block:'center'});
  } else if(collection==='natacao'){
    document.getElementById('natacao-print-status').innerHTML = '';
    renderNatacaoPrintReview({
      data: data.data, distancia_m: data.distancia_m,
      duracao_min: data.duracao_s!=null ? data.duracao_s/60 : undefined,
      calorias: data.calorias, calorias_reportadas:data.calorias_reportadas, calorias_tipo:data.calorias_tipo, calorias_referencia:data.calorias_referencia, fc_media: data.fc_media, fc_max: data.fc_max,
    }, {editId:id});
    document.getElementById('natacao-print-review').scrollIntoView({behavior:'smooth', block:'center'});
  }
}

// ---------- DEDUP ENTRE FONTES (print/push/Strava) ----------
// Hierarquia: print é a fonte mais pobre; push (Garmin) e Strava empatam
// como mais ricas. Casamento por mesma data + distância dentro de uma
// tolerância (fontes diferentes arredondam o número de jeitos ligeiramente
// diferentes) — nunca por id, já que cada fonte gera um id próprio.
const ORIGEM_RANK = {print:1, strava:2, push_garmin:2};
function activityTolerance(distanceField, value){
  const abs = distanceField==='distancia_m' ? 20 : 0.3;
  return Math.max(abs, value*0.15);
}
function findActivityMatch(docs, newData, distanceField){
  return docs.find(d=>{
    if(d.data !== newData.data) return false;
    if(d[distanceField]==null || newData[distanceField]==null) return false;
    const tol = activityTolerance(distanceField, Math.max(d[distanceField], newData[distanceField]));
    return Math.abs(d[distanceField]-newData[distanceField]) <= tol;
  });
}
// Grava uma atividade sem duplicar: se já existir uma correspondente
// (mesmo dia, distância parecida), mescla os campos que faltam nela em vez
// de criar um documento novo — nunca sobrescreve um valor já preenchido.
async function upsertActivity(db, collection, distanceField, newData, localDocs){
  const match = findActivityMatch(localDocs, newData, distanceField);
  if(match){
    const patch = {};
    for(const k in newData){
      if(newData[k]!=null && match[k]==null) patch[k] = newData[k];
    }
    if((ORIGEM_RANK[newData.origem]||1) > (ORIGEM_RANK[match.origem]||1)) patch.origem = newData.origem;
    if(Object.keys(patch).length){
      await db.collection(collection).doc(match.id).update(patch);
      Object.assign(match, patch);
    }
    return {id: match.id, created:false};
  }
  const ref = await db.collection(collection).add(newData);
  localDocs.push({id: ref.id, ...newData});
  return {id: ref.id, created:true};
}
// Passada única de limpeza — roda toda vez que a aba abre (idempotente: se
// não achar duplicata, não faz nada). Corrige o que já ficou duplicado no
// banco antes dessa correção existir.
function clusterDuplicates(docs, distanceField){
  const used = new Set();
  const clusters = [];
  for(let i=0;i<docs.length;i++){
    if(used.has(docs[i].id)) continue;
    const group = [docs[i]];
    used.add(docs[i].id);
    for(let j=i+1;j<docs.length;j++){
      if(used.has(docs[j].id)) continue;
      if(docs[j].data !== docs[i].data) continue;
      const a = docs[i][distanceField], b = docs[j][distanceField];
      if(a==null || b==null) continue;
      if(Math.abs(a-b) <= activityTolerance(distanceField, Math.max(a,b))){ group.push(docs[j]); used.add(docs[j].id); }
    }
    if(group.length>1) clusters.push(group);
  }
  return clusters;
}
async function reconcileDuplicates(db, collection, distanceField){
  try{
    const snap = await db.collection(collection).get();
    const docs = snap.docs.map(d=>({id:d.id, ...d.data()})).filter(d=>d[distanceField]!=null);
    for(const group of clusterDuplicates(docs, distanceField)){
      group.sort((a,b)=> (ORIGEM_RANK[b.origem]||1)-(ORIGEM_RANK[a.origem]||1));
      const [primary, ...rest] = group;
      const patch = {};
      for(const other of rest){
        for(const k in other){
          if(k==='id') continue;
          if(other[k]!=null && primary[k]==null) patch[k] = other[k];
        }
      }
      if(Object.keys(patch).length) await db.collection(collection).doc(primary.id).update(patch);
      for(const other of rest) await db.collection(collection).doc(other.id).delete();
    }
  }catch(e){ console.warn('reconcileDuplicates', collection, e); }
}
function fmtPace(paceSecPerKm){
  if(!paceSecPerKm || !isFinite(paceSecPerKm)) return '–';
  const m = Math.floor(paceSecPerKm/60);
  const s = Math.round(paceSecPerKm%60);
  return `${m}:${String(s).padStart(2,'0')}/km`;
}
function fmtDuracaoCorrida(s){
  const h = Math.floor(s/3600), m = Math.round((s%3600)/60);
  return h>0 ? `${h}h${String(m).padStart(2,'0')}` : `${m}min`;
}
async function renderCorridaTab(){
  checkImageSupport('corrida-print-note');
  const db = window.claude ? await window.claude.use('db') : null;
  if(!db){
    document.getElementById('corrida-status-line').textContent = 'Banco de dados não disponível nesta sessão.';
    return;
  }
  await reconcileDuplicates(db, 'corridas', 'distancia_km');
  if(corridaUnsub) corridaUnsub();
  corridaUnsub = db.collection('corridas').orderBy('data','desc').onSnapshot(snap=>{
    renderCorridaHistory(snap.docs.map(d=>({id:d.id, ...d.data()})).filter(c=>c.distancia_km!==undefined));
  }, err=>console.warn('corridas onSnapshot', err));
  if(corridaStatusUnsub) corridaStatusUnsub();
  corridaStatusUnsub = db.doc('corridas_status/atual').onSnapshot(snap=>{
    renderCorridaStatus(snap.exists ? snap.data() : null);
  }, err=>console.warn('corridas_status onSnapshot', err));
  syncStrava();
}
async function syncStrava(){
  const stravaEl = document.getElementById('corrida-strava-status');
  const mcp = window.claude ? await window.claude.use('mcp') : null;
  if(!mcp){ stravaEl.textContent = ''; return; }
  try{
    const result = await mcp.callTool('Strava', 'list_activities', {first: 30});
    const activities = (result.payload && result.payload.activities) || [];
    const runs = activities.filter(a=>a.sport_type==='Run');
    const db = await window.claude.use('db');
    if(!db) return;
    const existing = await db.collection('corridas').get();
    const localDocs = existing.docs.map(d=>({id:d.id, ...d.data()})).filter(d=>d.distancia_km!=null);
    let created = 0;
    for(const r of runs){
      const distancia_km = r.summary.distance/1000;
      const duracao_s = r.summary.moving_time;
      if(!distancia_km || !duracao_s) continue;
      const doc = {
        data: r.start_local.slice(0,10),
        distancia_km, duracao_s,
        ritmo: duracao_s/distancia_km,
        calorias: r.summary.total_calories,
        origem: 'strava'
      };
      if(r.summary.elevation_gain!=null) doc.elevacao_m = r.summary.elevation_gain;
      if(r.summary.avg_cadence!=null) doc.cadencia = r.summary.avg_cadence;
      try{
        const perf = await mcp.callTool('Strava', 'get_activity_performance', {activity_id: String(r.id)});
        if(perf.payload){
          if(perf.payload.average_heartrate!=null) doc.fc_media = perf.payload.average_heartrate;
          if(perf.payload.max_heartrate!=null) doc.fc_max = perf.payload.max_heartrate;
        }
      }catch(e){}
      const res = await upsertActivity(db, 'corridas', 'distancia_km', doc, localDocs);
      if(res.created) created++;
    }
    stravaEl.textContent = created ? `🔄 ${created} ${created>1?'corridas novas':'corrida nova'} do Strava` : `🔄 sincronizado às ${nowTime()}`;
  }catch(e){
    console.warn('syncStrava', e);
    stravaEl.textContent = '';
  }
}
const TRAINING_STATUS_PT = {
  PRODUCTIVE: {text:'Evoluindo bem', cls:'good', icon:'📈'},
  PEAKING: {text:'No pico de forma', cls:'good', icon:'🏆'},
  MAINTAINING: {text:'Mantendo o nível', cls:'', icon:'➖'},
  RECOVERY: {text:'Em recuperação', cls:'', icon:'💤'},
  UNPRODUCTIVE: {text:'Sem progresso', cls:'warn', icon:'⚠️'},
  OVERREACHING: {text:'Carga alta', cls:'warn', icon:'⚠️'},
  STRAINED: {text:'Sobrecarregado', cls:'warn', icon:'⚠️'},
  DETRAINING: {text:'Perdendo condicionamento', cls:'warn', icon:'📉'},
};
const ACWR_PT = {
  OPTIMAL: {text:'Carga equilibrada', cls:'good'},
  HIGH: {text:'Carga subindo rápido', cls:'warn'},
  LOW: {text:'Carga baixa', cls:''},
};
function renderCorridaStatus(status){
  const lineEl = document.getElementById('corrida-status-line');
  if(!status){ lineEl.innerHTML = ''; return; }
  const statusKey = (status.training_status_feedback||'').replace(/_\d+$/,'');
  const s = TRAINING_STATUS_PT[statusKey];
  const a = ACWR_PT[status.acwr_status];
  const chips = [s
    ? `<div class="corrida-status-chip ${s.cls}">${s.icon} ${s.text}</div>`
    : `<div class="corrida-status-chip">Sem classificação ainda</div>`];
  if(a) chips.push(`<div class="corrida-status-chip ${a.cls}">${a.text}</div>`);
  if(status.vo2_max) chips.push(`<div class="corrida-status-chip">💨 VO2 max ${status.vo2_max}</div>`);
  lineEl.innerHTML = chips.join('');
}
function renderCorridaHistory(corridas){
  const listEl = document.getElementById('corrida-history-list');
  const chartsEl = document.getElementById('corrida-charts');
  const weekStart=todayKey(getMonday(new Date()));
  const weekly=corridas.filter(c=>c.data>=weekStart&&c.data<=todayKey());
  const weekSeconds=weekly.reduce((sum,c)=>sum+(Number(c.duracao_s)||0),0);
  const weekKm=weekly.reduce((sum,c)=>sum+(Number(c.distancia_km)||0),0);
  document.getElementById('corrida-week-summary').innerHTML=`<div class="corrida-status-chip">${weekly.length} sessões na semana</div><div class="corrida-status-chip">${Math.round(weekSeconds/60)} min (${(weekSeconds/3600).toLocaleString('pt-BR',{maximumFractionDigits:1})} h)</div><div class="corrida-status-chip">${weekKm.toLocaleString('pt-BR',{maximumFractionDigits:1})} km</div>`;
  if(chartsEl.parentElement?.matches('details.training-extra'))chartsEl.parentElement.hidden=!corridas.length;
  if(!corridas.length){
    listEl.innerHTML = '<p class="calc-formula-note">Nenhuma corrida registrada ainda.</p>';
    chartsEl.style.display = 'none';
    return;
  }
  chartsEl.style.display = '';
  listEl.innerHTML = corridas.map(c=>`
    <div class="card" data-training-date="${c.data}" style="padding:10px 14px;cursor:pointer;" onclick="toggleCorridaDetail('${c.id}')">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span>${fmtDate(c.data)} · ${c.distancia_km.toFixed(2)} km · ${fmtDuracaoCorrida(c.duracao_s)} · ${fmtPace(c.ritmo)}</span>
        <span>${ORIGEM_BADGE[c.origem]||''}</span>
      </div>
      <div id="corrida-detail-${c.id}" style="display:none;margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,.08);font-size:13px;color:#8a8fb0;">
        ${corridaDetailHtml(c)}
      </div>
    </div>
  `).join('');
  archiveHistory(listEl);
  renderCorridaWeeklyCharts(corridas);
}
function corridaDetailHtml(c){
  const rows = [c.calorias!=null?`🔥 ${Math.round(c.calorias)} kcal${c.calorias_ativas!=null?' ativas':''}`:'🔥 calorias ativas não confirmadas'];
  if(c.calorias_reportadas!=null)rows.push(`relógio: ${Math.round(c.calorias_reportadas)} kcal ${c.calorias_tipo==='gross'?'totais':c.calorias_tipo==='active'?'ativas':'sem tipo identificado'}`);
  if(c.calorias_brutas!=null)rows.push(`relógio: ${Math.round(c.calorias_brutas)} kcal brutas`);
  if(c.calorias_referencia?.rangeGrossKcal)rows.push(`faixa aproximada: ${c.calorias_referencia.rangeGrossKcal.min}–${c.calorias_referencia.rangeGrossKcal.max} kcal`);
  if(c.calorias_estimadas) rows.push('estimativa por peso, tempo e intensidade');
  if(c.fc_media) rows.push(`❤️ FC média ${Math.round(c.fc_media)}${c.fc_max?` · máx ${Math.round(c.fc_max)}`:''}`);
  if(c.elevacao_m) rows.push(`⛰️ ${Math.round(c.elevacao_m)}m de subida`);
  if(c.cadencia) rows.push(`👟 cadência ${Math.round(c.cadencia)}`);
  const origemLabel = {print:'print do Garmin', push_garmin:'push (Garmin)', strava:'Strava', manual:'digitado manualmente'}[c.origem] || c.origem;
  rows.push(`fonte: ${origemLabel}`);
  return rows.join(' · ') + activityActionsHtml('corridas', c.id);
}
function toggleCorridaDetail(id){
  const el = document.getElementById('corrida-detail-'+id);
  if(el) el.style.display = el.style.display==='none' ? 'block' : 'none';
}
function corridaSampleErrorMsg(err){
  const map = {
    not_granted: 'Leitura por IA não autorizada nesta sessão.',
    images_unavailable: 'Essa sessão não permite enviar imagem pra IA.',
    image_rejected: 'Não consegui ler esse arquivo — tenta outro print.',
    rate_limited: 'Muitas leituras seguidas, espera um pouco e tenta de novo.',
    invalid_json: 'Não consegui interpretar a leitura — tenta um print mais nítido.',
    timeout: 'A leitura demorou demais e foi cancelada (pode ser conexão lenta).',
  };
  return (err && map[err.code]) || 'Não consegui ler o print agora. Tenta de novo.';
}
async function calibrateGarminSportPrint(data,sport){
  const kind=data?.calorias_tipo;
  const reported=Number(data?.calorias),duration=Number(data?.duracao_min);
  if(!Number.isFinite(reported)||reported<0||!(duration>0))return data;
  if(!['active','gross'].includes(kind)){data.calorias_reportadas=reported;data.calorias_tipo='unknown';data.calorias=null;return data;}
  let resting=null;
  if(kind==='gross'){
    const day=await loadHealthConnectDay(data.data||todayKey());
    if(day?.totalKcal!=null&&day?.activeKcal!=null&&day.totalKcal>=day.activeKcal)
      resting=(day.totalKcal-day.activeKcal)*duration/1440;
  }
  const result=window.ForjaSportCalibration?.assess?.({sport,durationMin:duration,reportedKcal:reported,calorieKind:kind,restingKcal:resting,chestStrap:false});
  if(!result)return data;
  data.calorias_reportadas=reported;
  data.calorias_tipo=kind;
  if(result.activeKcal!==null){data.calorias=Math.round(result.activeKcal);data.calorias_referencia={kind:'garmin_print',usedKcal:data.calorias,reportedKcal:reported,calorieKind:kind,restingKcal:resting,confidence:result.confidence};}
  else data.calorias=null;
  return data;
}
async function handleCorridaPrintFile(e){
  const file = e.target.files[0];
  if(!file) return;
  const statusEl = document.getElementById('corrida-print-status');
  document.getElementById('corrida-print-review').innerHTML = '';
  const sample = window.claude ? await window.claude.use('sample') : null;
  if(!sample){
    statusEl.innerHTML = '<p class="calc-formula-note">Leitura por IA não disponível nesta sessão.</p>';
    return;
  }
  statusEl.innerHTML = '🤖 Lendo o print...';
  try{
    const data = await sample.json(
      'Essa imagem é o print da tela de detalhe de uma corrida (Garmin Connect ou app similar). Leia os dados visíveis e responda ESTRITAMENTE em JSON, sem markdown, neste formato exato: {"distancia_km": <número ou null>, "duracao_min": <número, duração total em minutos, ou null>, "calorias": <número ou null>, "calorias_tipo": <"active" se estiver escrito calorias ativas, "gross" se estiver escrito calorias totais, ou null se não estiver claro>, "fc_media": <número ou null>, "fc_max": <número ou null>, "data": <"YYYY-MM-DD" se a data estiver visível, senão null>}. Nunca invente um valor ou o tipo das calorias quando não estiver visível — use null.',
      {images: file, modelTier: 'quick'}
    );
    statusEl.innerHTML = '';
    renderCorridaPrintReview(await calibrateGarminSportPrint(data,'corrida'));
  }catch(err){
    statusEl.innerHTML = `<p class="calc-formula-note">${corridaSampleErrorMsg(err)}</p>`;
  }
}
function startCorridaManualEntry(){
  document.getElementById('corrida-print-status').innerHTML = '';
  renderCorridaPrintReview({}, {manual:true});
}
function renderCorridaPrintReview(data, opts){
  opts = opts || {};
  const el = document.getElementById('corrida-print-review');
  el.dataset.manual = opts.manual ? '1' : '';
  el.dataset.editId = opts.editId || '';
  const cancelBtn = opts.editId ? `<button type="button" class="tertiary-btn" style="margin-left:8px;" onclick="document.getElementById('corrida-print-review').innerHTML='';">Cancelar edição</button>` : '';
  el.innerHTML = `
    <div class="goal-grid" style="grid-template-columns:repeat(2,1fr); margin:10px 0;">
      <div class="goal-cell"><div class="glbl">Data</div><div class="gval" contenteditable="true" id="corrida-print-data">${data.data||todayKey()}</div></div>
      <div class="goal-cell"><div class="glbl">Distância (km)</div><div class="gval" contenteditable="true" id="corrida-print-km">${data.distancia_km??''}</div></div>
      <div class="goal-cell"><div class="glbl">Duração (min)</div><div class="gval" contenteditable="true" id="corrida-print-min">${data.duracao_min??''}</div></div>
      <div class="goal-cell"><div class="glbl">Calorias ativas</div><div class="gval" contenteditable="true" id="corrida-print-kcal">${data.calorias??''}</div></div>
      <div class="goal-cell"><div class="glbl">FC média</div><div class="gval" contenteditable="true" id="corrida-print-fcmed">${data.fc_media??''}</div></div>
      <div class="goal-cell"><div class="glbl">FC máxima</div><div class="gval" contenteditable="true" id="corrida-print-fcmax">${data.fc_max??''}</div></div>
    </div>
    <p class="calc-formula-note">${opts.manual ? 'Preenche distância e duração pelo menos — o resto é opcional.' : 'Confira os números antes de salvar — a leitura por IA pode errar.'} ${data.calorias_referencia?.kind==='garmin_print'?`Relógio: ${Math.round(data.calorias_reportadas)} kcal ${data.calorias_tipo==='active'?'ativas':'totais'} → ${data.calorias} kcal ativas para o registro. `:data.calorias_reportadas!=null?`${data.calorias_tipo==='gross'?'O print mostrou calorias totais, mas faltou o repouso do dia para converter.':'O print não deixou claro se as calorias são ativas ou totais.'} Confirme as calorias ativas antes de preencher. `:'Para o saldo, use calorias ativas; o total da atividade Garmin também inclui o repouso.'}</p>
    <button class="primary" onclick="saveCorridaPrintEntry()">✓ ${opts.editId ? 'Salvar alterações' : 'Salvar corrida'}</button>${cancelBtn}
  `;
  el.dataset.calorieEstimate=data.calorias_referencia?.kind==='garmin_print'&&Number(data.calorias_referencia.usedKcal)===Number(data.calorias)?JSON.stringify(data.calorias_referencia):'';
  el.dataset.reportedKcal=data.calorias_reportadas??'';
  el.dataset.reportedKind=data.calorias_tipo||'';
  el.dataset.originalGarminEstimate=data.calorias_referencia?.kind==='garmin_print'?'1':'';
}
async function saveCorridaPrintEntry(){
  tapFeedback();
  const db = window.claude ? await window.claude.use('db') : null;
  if(!db){ showToast('Banco de dados não disponível nesta sessão.'); return; }
  const reviewEl = document.getElementById('corrida-print-review');
  const isManual = reviewEl.dataset.manual === '1';
  const editId = reviewEl.dataset.editId;
  const dataStr = document.getElementById('corrida-print-data').textContent.trim() || todayKey();
  const km = parseFloat(document.getElementById('corrida-print-km').textContent.replace(',','.'));
  const min = parseFloat(document.getElementById('corrida-print-min').textContent.replace(',','.'));
  if(!km || !min){ showToast('Preciso de distância e duração pra salvar.'); return; }
  const kcal = parseFloat(document.getElementById('corrida-print-kcal').textContent.replace(',','.'));
  const fcMed = parseFloat(document.getElementById('corrida-print-fcmed').textContent);
  const fcMax = parseFloat(document.getElementById('corrida-print-fcmax').textContent);
  const doc = {
    data: dataStr,
    distancia_km: km,
    duracao_s: min*60,
    ritmo: (min*60)/km,
  };
  if(!editId) doc.origem = isManual ? 'manual' : 'print';
  if(!isNaN(kcal)) doc.calorias = kcal;
  if(reviewEl.dataset.reportedKcal!=='')doc.calorias_reportadas=Number(reviewEl.dataset.reportedKcal);
  if(reviewEl.dataset.reportedKind)doc.calorias_tipo=reviewEl.dataset.reportedKind;
  try{const reference=JSON.parse(reviewEl.dataset.calorieEstimate||'null');if(reference?.usedKcal===kcal)doc.calorias_referencia=reference;}catch{}
  if(editId&&!doc.calorias_referencia&&reviewEl.dataset.originalGarminEstimate==='1')doc.calorias_referencia=null;
  if(!isNaN(fcMed)) doc.fc_media = fcMed;
  if(!isNaN(fcMax)) doc.fc_max = fcMax;
  if(editId){
    await db.collection('corridas').doc(editId).update(doc);
  } else {
    const existing = await db.collection('corridas').get();
    const localDocs = existing.docs.map(d=>({id:d.id, ...d.data()})).filter(d=>d.distancia_km!=null);
    await upsertActivity(db, 'corridas', 'distancia_km', doc, localDocs);
  }
  document.getElementById('corrida-print-review').innerHTML = '';
  document.getElementById('corrida-print-file').value = '';
  showToast(editId ? 'Corrida atualizada!' : 'Corrida salva!');
}
document.addEventListener('paste', function(e){
  const tabCorrida = document.getElementById('tab-corrida');
  const tabNatacao = document.getElementById('tab-natacao');
  const activeHandler = (tabCorrida && tabCorrida.style.display!=='none') ? handleCorridaPrintFile
    : (tabNatacao && tabNatacao.style.display!=='none') ? handleNatacaoPrintFile
    : null;
  if(!activeHandler) return;
  const items = e.clipboardData && e.clipboardData.items;
  if(!items) return;
  for(const item of items){
    if(item.type && item.type.startsWith('image/')){
      const file = item.getAsFile();
      if(file){ e.preventDefault(); activeHandler({target:{files:[file]}}); }
      break;
    }
  }
});

// ---------- NATAÇÃO TAB ----------
let natacaoUnsub = null;
function fmtRitmo100m(paceSecPer100m){
  if(!paceSecPer100m || !isFinite(paceSecPer100m)) return '–';
  const m = Math.floor(paceSecPer100m/60);
  const s = Math.round(paceSecPer100m%60);
  return `${m}:${String(s).padStart(2,'0')}/100m`;
}
const NATACAO_EFFECT_PT = {
  RECOVERY: 'recuperação', BASE: 'base aeróbica', AEROBIC_BASE: 'base aeróbica',
  TEMPO: 'tempo', THRESHOLD: 'limiar', VO2MAX: 'VO2 max',
  ANAEROBIC_CAPACITY: 'capacidade anaeróbica', SPRINT: 'sprint',
};
async function renderNatacaoTab(){
  checkImageSupport('natacao-print-note');
  const db = window.claude ? await window.claude.use('db') : null;
  if(!db){
    document.getElementById('natacao-history-list').innerHTML = '<p class="calc-formula-note">Banco de dados não disponível nesta sessão.</p>';
    return;
  }
  await reconcileDuplicates(db, 'natacao', 'distancia_m');
  if(natacaoUnsub) natacaoUnsub();
  natacaoUnsub = db.collection('natacao').orderBy('data','desc').onSnapshot(snap=>{
    renderNatacaoHistory(snap.docs.map(d=>({id:d.id, ...d.data()})).filter(c=>c.distancia_m!==undefined));
  }, err=>console.warn('natacao onSnapshot', err));
  syncStravaNatacao();
}
async function syncStravaNatacao(){
  const stravaEl = document.getElementById('natacao-strava-status');
  const mcp = window.claude ? await window.claude.use('mcp') : null;
  if(!mcp){ stravaEl.textContent = ''; return; }
  try{
    const result = await mcp.callTool('Strava', 'list_activities', {first: 30});
    const activities = (result.payload && result.payload.activities) || [];
    const swims = activities.filter(a=>a.sport_type==='Swim');
    const db = await window.claude.use('db');
    if(!db) return;
    const existing = await db.collection('natacao').get();
    const localDocs = existing.docs.map(d=>({id:d.id, ...d.data()})).filter(d=>d.distancia_m!=null);
    let created = 0;
    for(const s of swims){
      const distancia_m = s.summary.distance;
      const duracao_s = s.summary.moving_time;
      if(!distancia_m || !duracao_s) continue;
      const doc = {
        data: s.start_local.slice(0,10),
        distancia_m, duracao_s,
        ritmo_100m: (duracao_s/distancia_m)*100,
        calorias: s.summary.total_calories,
        origem: 'strava'
      };
      try{
        const perf = await mcp.callTool('Strava', 'get_activity_performance', {activity_id: String(s.id)});
        if(perf.payload){
          if(perf.payload.average_heartrate!=null) doc.fc_media = perf.payload.average_heartrate;
          if(perf.payload.max_heartrate!=null) doc.fc_max = perf.payload.max_heartrate;
        }
      }catch(e){}
      const res = await upsertActivity(db, 'natacao', 'distancia_m', doc, localDocs);
      if(res.created) created++;
    }
    stravaEl.textContent = created ? `🔄 ${created} ${created>1?'sessões novas':'sessão nova'} do Strava` : `🔄 sincronizado às ${nowTime()}`;
  }catch(e){
    console.warn('syncStravaNatacao', e);
    stravaEl.textContent = '';
  }
}
function natacaoDetailHtml(c){
  const rows = [c.calorias!=null?`🔥 ${Math.round(c.calorias)} kcal`:'🔥 calorias ativas não confirmadas'];
  if(c.calorias_reportadas!=null)rows.push(`relógio: ${Math.round(c.calorias_reportadas)} kcal ${c.calorias_tipo==='gross'?'totais':c.calorias_tipo==='active'?'ativas':'sem tipo identificado'}`);
  if(c.fc_media) rows.push(`❤️ FC média ${Math.round(c.fc_media)}${c.fc_max?` · máx ${Math.round(c.fc_max)}`:''}`);
  if(c.training_effect_label) rows.push(`🎯 ${NATACAO_EFFECT_PT[c.training_effect_label]||c.training_effect_label.toLowerCase()}`);
  const origemLabel = {print:'print do Garmin', push_garmin:'push (Garmin)', strava:'Strava', manual:'digitado manualmente'}[c.origem] || c.origem;
  rows.push(`fonte: ${origemLabel}`);
  return rows.join(' · ') + activityActionsHtml('natacao', c.id);
}
function toggleNatacaoDetail(id){
  const el = document.getElementById('natacao-detail-'+id);
  if(el) el.style.display = el.style.display==='none' ? 'block' : 'none';
}
const SWIM_MOTIVATIONAL = [
  '🌊 Cada braçada conta. Bora molhar o corpo.',
  '🌊 Piscina esperando — a primeira sessão começa quando você quiser.',
  '🌊 Consistência na água também constrói resultado.',
];
function renderNatacaoStatus(sessoes){
  const el = document.getElementById('natacao-status-line');
  const weekStart=todayKey(getMonday(new Date()));
  const weekly=sessoes.filter(c=>c.data>=weekStart&&c.data<=todayKey());
  const seconds=weekly.reduce((sum,c)=>sum+(Number(c.duracao_s)||0),0);
  const meters=weekly.reduce((sum,c)=>sum+(Number(c.distancia_m)||0),0);
  el.innerHTML=`<div class="corrida-status-chip">${weekly.length} sessões na semana</div><div class="corrida-status-chip">${Math.round(seconds/60)} min (${(seconds/3600).toLocaleString('pt-BR',{maximumFractionDigits:1})} h)</div><div class="corrida-status-chip">${(meters/1000).toLocaleString('pt-BR',{maximumFractionDigits:2})} km</div>`;
}
function renderNatacaoHistory(sessoes){
  const listEl = document.getElementById('natacao-history-list');
  const chartsEl = document.getElementById('natacao-charts');
  if(chartsEl.parentElement?.matches('details.training-extra'))chartsEl.parentElement.hidden=!sessoes.length;
  renderNatacaoStatus(sessoes);
  if(!sessoes.length){
    listEl.innerHTML = '<p class="calc-formula-note">Nenhuma sessão de natação registrada ainda.</p>';
    chartsEl.style.display = 'none';
    return;
  }
  chartsEl.style.display = '';
  listEl.innerHTML = sessoes.map(c=>`
    <div class="card" data-training-date="${c.data}" style="padding:10px 14px;cursor:pointer;" onclick="toggleNatacaoDetail('${c.id}')">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span>${fmtDate(c.data)} · ${Math.round(c.distancia_m)}m · ${fmtDuracaoCorrida(c.duracao_s)} · ${fmtRitmo100m(c.ritmo_100m)}</span>
        <span>${ORIGEM_BADGE[c.origem]||''}</span>
      </div>
      <div id="natacao-detail-${c.id}" style="display:none;margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,.08);font-size:13px;color:#8a8fb0;">
        ${natacaoDetailHtml(c)}
      </div>
    </div>
  `).join('');
  archiveHistory(listEl);
  renderNatacaoWeeklyCharts(sessoes);
}
function renderNatacaoWeeklyCharts(sessoes){
  const byWeek = {};
  sessoes.forEach(c=>{
    const monday = getMonday(new Date(c.data+'T00:00:00'));
    const key = todayKey(monday);
    if(!byWeek[key]) byWeek[key] = {m:0, s:0, n:0, monday};
    byWeek[key].m += c.distancia_m;
    byWeek[key].s += c.duracao_s;
    byWeek[key].n += 1;
  });
  const weekKeys = Object.keys(byWeek).sort().slice(-8);
  const volumeData = weekKeys.map(k=>({label: fmtDateCurta(byWeek[k].monday), value: Math.round(byWeek[k].m)}));
  svgBarChart('natacao-volume-chart', volumeData, {title:'Volume semanal (m)', highlightLast:true, showValues:true});
  document.getElementById('natacao-volume-caption').innerHTML = weekKeys.map(k=>{
    const w = byWeek[k];
    const sunday = addDays(w.monday,6);
    return `<div>${fmtDateCurta(w.monday)}–${fmtDateCurta(sunday)} · ${w.n} ${w.n>1?'sessões':'sessão'} · ${Math.round(w.m)}m · ${fmtDuracaoCorrida(w.s)}</div>`;
  }).join('');
  const timeData = weekKeys.map(k=>({label: fmtDateCurta(byWeek[k].monday), value: Math.round(byWeek[k].s/60)}));
  svgBarChart('natacao-pace-chart', timeData, {title:'Tempo semanal (min)', highlightLast:true, showValues:true});
  document.getElementById('natacao-pace-caption').innerHTML = weekKeys.map(k=>{
    const w = byWeek[k];
    const sunday = addDays(w.monday,6);
    return `<div>${fmtDateCurta(w.monday)}–${fmtDateCurta(sunday)} · ${Math.round(w.s/60)} min (${(w.s/3600).toLocaleString('pt-BR',{maximumFractionDigits:1})} h)</div>`;
  }).join('');
}
async function handleNatacaoPrintFile(e){
  const file = e.target.files[0];
  if(!file) return;
  const statusEl = document.getElementById('natacao-print-status');
  document.getElementById('natacao-print-review').innerHTML = '';
  const sample = window.claude ? await window.claude.use('sample') : null;
  if(!sample){
    statusEl.innerHTML = '<p class="calc-formula-note">Leitura por IA não disponível nesta sessão.</p>';
    return;
  }
  statusEl.innerHTML = '🤖 Lendo o print...';
  try{
    const data = await sample.json(
      'Essa imagem é o print da tela de detalhe de uma sessão de natação (Garmin Connect ou app similar). Leia os dados visíveis e responda ESTRITAMENTE em JSON, sem markdown, neste formato exato: {"distancia_m": <número ou null>, "duracao_min": <número, duração total em minutos, ou null>, "calorias": <número ou null>, "calorias_tipo": <"active" se estiver escrito calorias ativas, "gross" se estiver escrito calorias totais, ou null se não estiver claro>, "fc_media": <número ou null>, "fc_max": <número ou null>, "data": <"YYYY-MM-DD" se a data estiver visível, senão null>}. Nunca invente um valor ou o tipo das calorias quando não estiver visível — use null.',
      {images: file, modelTier: 'quick'}
    );
    statusEl.innerHTML = '';
    renderNatacaoPrintReview(await calibrateGarminSportPrint(data,'natacao'));
  }catch(err){
    statusEl.innerHTML = `<p class="calc-formula-note">${corridaSampleErrorMsg(err)}</p>`;
  }
}
function startNatacaoManualEntry(){
  document.getElementById('natacao-print-status').innerHTML = '';
  renderNatacaoPrintReview({}, {manual:true});
}
function renderNatacaoPrintReview(data, opts){
  opts = opts || {};
  const el = document.getElementById('natacao-print-review');
  el.dataset.manual = opts.manual ? '1' : '';
  el.dataset.editId = opts.editId || '';
  const cancelBtn = opts.editId ? `<button type="button" class="tertiary-btn" style="margin-left:8px;" onclick="document.getElementById('natacao-print-review').innerHTML='';">Cancelar edição</button>` : '';
  el.innerHTML = `
    <div class="goal-grid" style="grid-template-columns:repeat(2,1fr); margin:10px 0;">
      <div class="goal-cell"><div class="glbl">Data</div><div class="gval" contenteditable="true" id="natacao-print-data">${data.data||todayKey()}</div></div>
      <div class="goal-cell"><div class="glbl">Distância (m)</div><div class="gval" contenteditable="true" id="natacao-print-m">${data.distancia_m??''}</div></div>
      <div class="goal-cell"><div class="glbl">Duração (min)</div><div class="gval" contenteditable="true" id="natacao-print-min">${data.duracao_min??''}</div></div>
      <div class="goal-cell"><div class="glbl">Calorias ativas</div><div class="gval" contenteditable="true" id="natacao-print-kcal">${data.calorias??''}</div></div>
      <div class="goal-cell"><div class="glbl">FC média</div><div class="gval" contenteditable="true" id="natacao-print-fcmed">${data.fc_media??''}</div></div>
      <div class="goal-cell"><div class="glbl">FC máxima</div><div class="gval" contenteditable="true" id="natacao-print-fcmax">${data.fc_max??''}</div></div>
    </div>
    <p class="calc-formula-note">${opts.manual ? 'Preenche distância e duração pelo menos — o resto é opcional.' : 'Confira os números antes de salvar — a leitura por IA pode errar.'} ${data.calorias_referencia?.kind==='garmin_print'?`Relógio: ${Math.round(data.calorias_reportadas)} kcal ${data.calorias_tipo==='active'?'ativas':'totais'} → ${data.calorias} kcal ativas para o registro. `:data.calorias_reportadas!=null?`${data.calorias_tipo==='gross'?'O print mostrou calorias totais, mas faltou o repouso do dia para converter.':'O print não deixou claro se as calorias são ativas ou totais.'} Confirme as calorias ativas antes de preencher. `:'Para o saldo, use calorias ativas; o total da atividade Garmin também inclui o repouso.'}</p>
    <button class="primary" onclick="saveNatacaoPrintEntry()">✓ ${opts.editId ? 'Salvar alterações' : 'Salvar sessão'}</button>${cancelBtn}
  `;
  el.dataset.calorieEstimate=data.calorias_referencia?.kind==='garmin_print'&&Number(data.calorias_referencia.usedKcal)===Number(data.calorias)?JSON.stringify(data.calorias_referencia):'';
  el.dataset.reportedKcal=data.calorias_reportadas??'';
  el.dataset.reportedKind=data.calorias_tipo||'';
  el.dataset.originalGarminEstimate=data.calorias_referencia?.kind==='garmin_print'?'1':'';
}
async function saveNatacaoPrintEntry(){
  tapFeedback();
  const db = window.claude ? await window.claude.use('db') : null;
  if(!db){ showToast('Banco de dados não disponível nesta sessão.'); return; }
  const reviewEl = document.getElementById('natacao-print-review');
  const isManual = reviewEl.dataset.manual === '1';
  const editId = reviewEl.dataset.editId;
  const dataStr = document.getElementById('natacao-print-data').textContent.trim() || todayKey();
  const m = parseFloat(document.getElementById('natacao-print-m').textContent.replace(',','.'));
  const min = parseFloat(document.getElementById('natacao-print-min').textContent.replace(',','.'));
  if(!m || !min){ showToast('Preciso de distância e duração pra salvar.'); return; }
  const kcal = parseFloat(document.getElementById('natacao-print-kcal').textContent.replace(',','.'));
  const fcMed = parseFloat(document.getElementById('natacao-print-fcmed').textContent);
  const fcMax = parseFloat(document.getElementById('natacao-print-fcmax').textContent);
  const doc = {
    data: dataStr,
    distancia_m: m,
    duracao_s: min*60,
    ritmo_100m: (min*60)/m*100,
  };
  if(!editId) doc.origem = isManual ? 'manual' : 'print';
  if(!isNaN(kcal)) doc.calorias = kcal;
  if(reviewEl.dataset.reportedKcal!=='')doc.calorias_reportadas=Number(reviewEl.dataset.reportedKcal);
  if(reviewEl.dataset.reportedKind)doc.calorias_tipo=reviewEl.dataset.reportedKind;
  try{const reference=JSON.parse(reviewEl.dataset.calorieEstimate||'null');if(reference?.usedKcal===kcal)doc.calorias_referencia=reference;}catch{}
  if(editId&&!doc.calorias_referencia&&reviewEl.dataset.originalGarminEstimate==='1')doc.calorias_referencia=null;
  if(!isNaN(fcMed)) doc.fc_media = fcMed;
  if(!isNaN(fcMax)) doc.fc_max = fcMax;
  if(editId){
    await db.collection('natacao').doc(editId).update(doc);
  } else {
    const existing = await db.collection('natacao').get();
    const localDocs = existing.docs.map(d=>({id:d.id, ...d.data()})).filter(d=>d.distancia_m!=null);
    await upsertActivity(db, 'natacao', 'distancia_m', doc, localDocs);
  }
  document.getElementById('natacao-print-review').innerHTML = '';
  document.getElementById('natacao-print-file').value = '';
  showToast(editId ? 'Sessão atualizada!' : 'Sessão de natação salva!');
}
function fmtDateCurta(d){
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
}
function renderCorridaWeeklyCharts(corridas){
  const byWeek = {};
  corridas.forEach(c=>{
    const monday = getMonday(new Date(c.data+'T00:00:00'));
    const key = todayKey(monday);
    if(!byWeek[key]) byWeek[key] = {km:0, s:0, n:0, monday};
    byWeek[key].km += c.distancia_km;
    byWeek[key].s += c.duracao_s;
    byWeek[key].n += 1;
  });
  const weekKeys = Object.keys(byWeek).sort().slice(-8);
  const volumeData = weekKeys.map(k=>({label: fmtDateCurta(byWeek[k].monday), value: Math.round(byWeek[k].km*10)/10}));
  svgBarChart('corrida-volume-chart', volumeData, {title:'Volume semanal (km)', highlightLast:true, showValues:true});
  document.getElementById('corrida-volume-caption').innerHTML = weekKeys.map(k=>{
    const w = byWeek[k];
    const sunday = addDays(w.monday,6);
    return `<div>${fmtDateCurta(w.monday)}–${fmtDateCurta(sunday)} · ${w.n} corrida${w.n>1?'s':''} · ${w.km.toFixed(1)} km · ${fmtDuracaoCorrida(w.s)}</div>`;
  }).join('');
  const timeData = weekKeys.map(k=>({label: fmtDateCurta(byWeek[k].monday), value: Math.round(byWeek[k].s/60)}));
  svgBarChart('corrida-pace-chart', timeData, {title:'Tempo semanal (min)', highlightLast:true, showValues:true});
  document.getElementById('corrida-pace-caption').innerHTML = weekKeys.map(k=>{
    const w = byWeek[k];
    const sunday = addDays(w.monday,6);
    return `<div>${fmtDateCurta(w.monday)}–${fmtDateCurta(sunday)} · ${Math.round(w.s/60)} min (${(w.s/3600).toLocaleString('pt-BR',{maximumFractionDigits:1})} h)</div>`;
  }).join('');
}

// ---------- CROSSFIT TAB ----------
let crossfitUnsub = null;
const CROSSFIT_MOTIVATIONAL = [
  '🔥 Todo WOD conta. Bora pro box.',
  '🔥 Constância bate intensidade isolada — mantém o ritmo.',
  '🔥 O próximo treino começa quando você quiser.',
];
// Achados de um estudo transversal com 45 atletas amadores de CrossFit (Souza,
// Orsi, Vechi — RBNE, 2025) e das recomendações de nutrição esportiva que ele cita.
const CIENCIA_CROSSFIT = [
  {
    title: '⚡ Déficit calórico é a regra, não a exceção',
    body: 'Um estudo com 45 atletas amadores de CrossFit achou déficit calórico em 80% deles — em média 305 kcal/dia abaixo do gasto real. O treino de alta intensidade queima mais do que a maioria imagina, e a alimentação raramente acompanha.',
    src: 'Souza, Orsi, Vechi — Revista Brasileira de Nutrição Esportiva, 2025'
  },
  {
    title: '🍚 Carboidrato: a maioria come menos do que precisa',
    body: 'A meta pra atividade de alta intensidade como CrossFit é 6-10g de carboidrato por kg de peso/dia — bem acima da recomendação da população geral (45-65% do gasto energético total). No mesmo estudo, só 33% dos atletas bateram essa meta.',
    src: 'Thomas, Erdman, Burke — Academy of Nutrition and Dietetics, 2016'
  },
  {
    title: '🍗 Proteína: dose certa, hora certa',
    body: 'A recomendação pra atleta é 1,2-1,7g/kg/dia — mas o timing importa tanto quanto a quantidade: 20-40g de proteína de alto valor biológico a cada 3-4h, com atenção especial ao pós-treino e antes de dormir, otimiza a recuperação muscular.',
    src: 'Kerksick et al. — International Society of Sports Nutrition, 2017'
  },
  {
    title: '⚠️ Déficit persistente tem nome: RED\'s',
    body: 'Quando a energia consumida fica cronicamente abaixo da gasta, o corpo entra em Deficiência de Energia Relativa no Esporte (RED\'s) — afeta metabolismo, saúde óssea, imunidade e recuperação. Não é sobre "comer pouco pra emagrecer rápido": é risco real de lesão e platô de performance.',
    src: 'Mountjoy et al. — British Journal of Sports Medicine, 2024'
  },
];
function renderCienciaCrossfit(){
  const el = document.getElementById('crossfit-science-list');
  if(!el) return;
  el.innerHTML = CIENCIA_CROSSFIT.map(t=>`
    <div class="science-tip">
      <div class="st-title">${t.title}</div>
      <div class="st-body">${t.body}</div>
      <div class="st-src">${t.src}</div>
    </div>
  `).join('');
}
async function checkImageSupport(noteElId, fallbackLabel){
  fallbackLabel = fallbackLabel || 'o Registro manual';
  const noteEl = document.getElementById(noteElId);
  if(!noteEl) return;
  const sample = window.claude ? await window.claude.use('sample') : null;
  if(!sample){
    noteEl.innerHTML = `<p class="calc-formula-note">Leitura de print por IA não disponível nesta sessão — pode tentar mesmo assim, ou usar ${fallbackLabel}.</p>`;
    return;
  }
  const limits = await sample.limits().catch(()=>null);
  if(!limits || !limits.images){
    noteEl.innerHTML = `<p class="calc-formula-note">Esta sessão sinaliza que não suporta envio de imagem (\`images_unavailable\`) — mas o botão continua liberado pra tentar. Se falhar, use ${fallbackLabel}.</p>`;
  } else {
    noteEl.innerHTML = '';
  }
}
async function renderCrossfitTab(){
  renderCienciaCrossfit();
  const db = window.claude ? await window.claude.use('db') : null;
  if(!db){
    document.getElementById('crossfit-history-list').innerHTML = '<p class="calc-formula-note">Banco de dados não disponível nesta sessão.</p>';
    return;
  }
  if(crossfitUnsub) crossfitUnsub();
  crossfitUnsub = db.collection('crossfit').orderBy('data','desc').onSnapshot(snap=>{
    renderCrossfitHistory(snap.docs.map(d=>({id:d.id, ...d.data()})).filter(c=>window.ForjaCrossfitStatus?.completed(c)));
  }, err=>console.warn('crossfit onSnapshot', err));
}
function crossfitDetailHtml(c){
  const scenario=c.calorias_referencia?.kind==='met_watch_scenario';
  const rows = [scenario?`🔥 +${Math.round(c.calorias||0)} kcal hipotéticas ao Garmin (cenário 0–${Math.round(c.calorias_referencia.scenarioMaxKcal||0)} kcal)`:`🔥 ${Math.round(c.calorias||0)} kcal`];
  if(scenario)rows.push(`WOD estimado: ${Math.round(c.calorias_referencia.estimatedActiveKcal||0)} kcal ativas · ${Math.round(c.calorias_referencia.estimatedTotalKcal||0)} kcal totais`);
  if(c.fc_media) rows.push(`❤️ FC média ${Math.round(c.fc_media)}${c.fc_max?` · máx ${Math.round(c.fc_max)}`:''}`);
  if(c.training_effect_label) rows.push(`🎯 ${NATACAO_EFFECT_PT[c.training_effect_label]||c.training_effect_label.toLowerCase()}`);
  const origemLabel = {print:'print do Tecnofit', push_garmin:'push (Garmin)', manual:'digitado manualmente', 'push_garmin+print':'Garmin + Tecnofit', 'push_garmin+manual':'Garmin + digitado'}[c.origem] || c.origem;
  rows.push(`fonte: ${origemLabel}`);
  let html = rows.join(' · ');
  if(c.wod_formato) html += `<div style="margin-top:6px;"><b>${escapeHtml(c.wod_formato)}</b>${c.scale?` · ${escapeHtml(String(c.scale).toUpperCase())}`:''}</div>`;
  if(c.exercicios && c.exercicios.length){
    html += `<ul style="margin:6px 0 0;padding-left:18px;">` + c.exercicios.map(ex=>{
      const parts = [escapeHtml(ex.nome)];
      if(ex.series_ou_rounds) parts.push(`${ex.series_ou_rounds}x`);
      if(ex.reps) parts.push(`${ex.reps} reps`);
      if(ex.tempo_s != null) parts.push(`${ex.tempo_s}s`);
      if(ex.distancia_m != null) parts.push(`${ex.distancia_m}m`);
      if(ex.calorias_maquina != null) parts.push(`${ex.calorias_maquina} cal da máquina (prescritas)`);
      if(ex.carga_usada) parts.push(`${ex.carga_usada}${ex.unidade||'kg'}`);
      return `<li>${parts.join(' · ')}</li>`;
    }).join('') + `</ul>`;
  }
  if(c.resultado) html += `<div style="margin-top:6px;">🏁 ${escapeHtml(c.resultado)}</div>`;
  if(c.rpe) html += `<div>💪 Esforço percebido: ${c.rpe}/10</div>`;
  if(c.observacoes) html += `<div style="margin-top:4px;font-style:italic;">${escapeHtml(c.observacoes)}</div>`;
  html += activityActionsHtml('crossfit', c.id);
  return html;
}
function toggleCrossfitDetail(id){
  const el = document.getElementById('crossfit-detail-'+id);
  if(el) el.style.display = el.style.display==='none' ? 'block' : 'none';
}
function renderCrossfitStatus(sessoes){
  const el = document.getElementById('crossfit-status-line');
  if(!sessoes.length){
    const phrase = CROSSFIT_MOTIVATIONAL[Math.floor(Math.random()*CROSSFIT_MOTIVATIONAL.length)];
    el.innerHTML = `<div class="corrida-status-chip">${phrase}</div>`;
    return;
  }
  const monthKey = todayKey().slice(0,7);
  const thisMonth = sessoes.filter(c=>c.data.startsWith(monthKey));
  const chips = [`<div class="corrida-status-chip">📅 ${thisMonth.length} ${thisMonth.length===1?'sessão':'sessões'} este mês</div>`];
  const totalKcal = thisMonth.reduce((s,c)=>s+(c.calorias||0),0);
  if(totalKcal) chips.push(`<div class="corrida-status-chip good">🔥 ${Math.round(totalKcal)} kcal no mês</div>`);
  el.innerHTML = chips.join('');
}
function renderCrossfitHistory(sessoes){
  const listEl = document.getElementById('crossfit-history-list');
  const chartsEl = document.getElementById('crossfit-charts');
  if(chartsEl.parentElement?.matches('details.training-extra'))chartsEl.parentElement.hidden=!sessoes.length;
  renderCrossfitStatus(sessoes);
  if(!sessoes.length){
    listEl.innerHTML = '<p class="calc-formula-note">Nenhuma sessão de CrossFit registrada ainda.</p>';
    chartsEl.style.display = 'none';
    return;
  }
  chartsEl.style.display = '';
  const comparableGroups={};
  if(window.ForjaCrossfitResults)for(const session of sessoes){const signature=ForjaCrossfitResults.signature({format:session.wod_formato,scale:session.scale,movements:session.exercicios});(comparableGroups[signature]??=[]).push(session);}
  listEl.innerHTML = sessoes.map(c=>{const signature=window.ForjaCrossfitResults?.signature({format:c.wod_formato,scale:c.scale,movements:c.exercicios}),matches=comparableGroups[signature]||[],comparison=matches.length>1?`<div class="calc-formula-note">📈 ${matches.length} resultados comparáveis neste WOD e escala</div>`:'';return `
    <div class="card" data-training-date="${c.data}" style="padding:10px 14px;cursor:pointer;" onclick="toggleCrossfitDetail('${c.id}')">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span>${fmtDate(c.data)} · ${Number(c.duracao_s)>0?fmtDuracaoCorrida(c.duracao_s):'tempo não informado'} · ${Math.round(c.calorias||0)} kcal</span>
        <span>${ORIGEM_BADGE[c.origem]||''}</span>
      </div>
      ${comparison}
      <div id="crossfit-detail-${c.id}" style="display:none;margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,.08);font-size:13px;color:#8a8fb0;">
        ${crossfitDetailHtml(c)}
      </div>
    </div>
  `;}).join('');
  archiveHistory(listEl);
  renderCrossfitWeeklyCharts(sessoes);
}
function renderCrossfitWeeklyCharts(sessoes){
  const byWeek = {};
  sessoes.forEach(c=>{
    const monday = getMonday(new Date(c.data+'T00:00:00'));
    const key = todayKey(monday);
    if(!byWeek[key]) byWeek[key] = {s:0, kcal:0, n:0, monday};
    byWeek[key].s += Number(c.duracao_s)||0;
    byWeek[key].kcal += (c.calorias||0);
    byWeek[key].n += 1;
  });
  const weekKeys = Object.keys(byWeek).sort().slice(-8);
  const freqData = weekKeys.map(k=>({label: fmtDateCurta(byWeek[k].monday), value: byWeek[k].n}));
  svgBarChart('crossfit-freq-chart', freqData, {title:'Frequência semanal (sessões)', highlightLast:true, showValues:true});
  document.getElementById('crossfit-freq-caption').innerHTML = weekKeys.map(k=>{
    const w = byWeek[k];
    const sunday = addDays(w.monday,6);
    return `<div>${fmtDateCurta(w.monday)}–${fmtDateCurta(sunday)} · ${w.n} ${w.n>1?'sessões':'sessão'}</div>`;
  }).join('');
  const duracaoData = weekKeys.map(k=>({label: fmtDateCurta(byWeek[k].monday), value: Math.round(byWeek[k].s/60)}));
  svgBarChart('crossfit-duracao-chart', duracaoData, {title:'Duração semanal (min)', highlightLast:true, showValues:true});
  document.getElementById('crossfit-duracao-caption').innerHTML = weekKeys.map(k=>{
    const w = byWeek[k];
    const sunday = addDays(w.monday,6);
    return `<div>${fmtDateCurta(w.monday)}–${fmtDateCurta(sunday)} · ${fmtDuracaoCorrida(w.s)} · ${Math.round(w.kcal)} kcal</div>`;
  }).join('');
}
function normalizeExerciseId(nome){
  return nome.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}
// Lê o print do Tecnofit por OCR local (Tesseract, já usado pelo Zepp/balança) em vez da
// capability `sample` — evita depender do envio de imagem pra IA, travado nesta conta
// (erro `images_unavailable` confirmado em 2 clientes e num upload real em 2026-09-15).
// Calibrado num print real do Tecnofit (Wod - DD/MM/YYYY, seções Warmup/Skill/Metcon,
// bloco "WOD" com formato + linhas "<reps> <exercício> (<carga Rx>/<carga scaled>kg)").
// Calibrado com 2 prints reais (2026-09-15): 1º WOD era "AMRAP 12'" (formato +
// tempo na mesma linha); 2º era "10 Rounds" + "TIME CAP: 30 minutes" numa linha
// separada — formato bem diferente, que a 1ª versão do parser não reconhecia (tudo
// caía em Observações). Agora cobre os dois padrões observados.
function parseCrossfitWod(rawText){
  const result = {data: null, wod_formato: null, exercicios: [], observacoes: ''};

  const dateMatch = rawText.match(/Wod\s*[-–]\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
  if(dateMatch) result.data = `${dateMatch[3]}-${dateMatch[2].padStart(2,'0')}-${dateMatch[1].padStart(2,'0')}`;

  const wodHeaderRe = /\bWOD\b/g;
  let wodStart = -1, wodBodyStart = -1, m;
  while((m = wodHeaderRe.exec(rawText))){
    // "WOD" (maiúsculo) é o cabeçalho do bloco prescrito; o título da página usa "Wod"
    // (só a 1ª letra maiúscula), então não bate aqui — o filtro abaixo é só reforço
    // pra caso o OCR leia o título todo em caixa alta por engano.
    const before = rawText.slice(Math.max(0, m.index-6), m.index);
    if(/-\s*$/.test(before)) continue;
    wodStart = m.index;
    wodBodyStart = m.index + m[0].length;
    break;
  }

  if(wodBodyStart >= 0){
    let wodBodyEnd = rawText.length;
    const endMarker = /COOL\s*DOWN|Fazer\s*check-?in|A[çc][õo]es/i;
    const endM = endMarker.exec(rawText.slice(wodBodyStart));
    if(endM) wodBodyEnd = wodBodyStart + endM.index;
    let body = rawText.slice(wodBodyStart, wodBodyEnd);

    const fmtKeyword = body.match(/\b(AMRAP|EMOM|FOR\s*TIME|TABATA|CHIPPER|RFT|STRENGTH)\b\s*(\d+)?\s*'?/i);
    const fmtRounds = body.match(/(\d+)\s*Rounds?\b/i);
    const timeCapRe = /TIME\s*CAP[:\s]*(\d+)\s*(?:min|minutes?|')/i;
    const timeCap = body.match(timeCapRe);

    if(fmtKeyword){
      const timecap = fmtKeyword[2] ? ` ${fmtKeyword[2]}'` : '';
      result.wod_formato = fmtKeyword[1].toUpperCase().replace(/\s+/g,' ') + timecap;
    } else if(fmtRounds){
      result.wod_formato = `${fmtRounds[1]} Rounds`;
    }
    if(timeCap){
      result.wod_formato = result.wod_formato
        ? `${result.wod_formato} (Time cap ${timeCap[1]}min)`
        : `Time cap ${timeCap[1]}min`;
    }

    // Remove as linhas de formato/time cap do corpo antes de procurar exercícios, pra
    // elas não virarem "exercício" falso (ex.: "10 Rounds" -> reps 10, nome "Rounds").
    if(fmtRounds) body = body.replace(fmtRounds[0], '');
    if(timeCap) body = body.replace(timeCapRe, '');

    // Cada linha: <número> + opcional "m"/"km" grudado (distância, ex. "200m Run") +
    // nome + opcional "(carga Rx/scaled unidade)". Unidade aceita qualquer 1-3 letras
    // (OCR erra "kg"/"lb" às vezes) — só vira `unidade` no doc se bater kg/lb de verdade;
    // a carga numérica fica registrada mesmo quando a unidade sai ilegível.
    const exLineRe = /(\d+)(?:\s*(m|km)(?![a-zA-Z]))?\s+([^\n(]+?)(?:\s*\(([\d.,]+)\s*\/\s*([\d.,]+)\s*([a-zA-Z]{1,3})\))?(?=\n|$)/g;
    let em;
    while((em = exLineRe.exec(body))){
      const nome = em[3].trim();
      if(!nome) continue;
      const ex = {nome: em[2] ? `${em[1]}${em[2]} ${nome}` : nome};
      if(!em[2]) ex.reps = parseInt(em[1],10); // "m"/"km" = distância, não reps
      if(em[4]){
        const carga = parseFloat(em[4].replace(',','.'));
        if(!isNaN(carga)) ex.carga_prescrita = carga;
      }
      if(em[6] && /^(kg|lb)$/i.test(em[6])) ex.unidade = em[6].toLowerCase();
      result.exercicios.push(ex);
    }

    const context = rawText.slice(0, wodStart)
      .replace(/Wod\s*[-–]\s*\d{1,2}\/\d{1,2}\/\d{4}/i, '')
      .replace(/\bCROSSFIT\b/i, '')
      .trim();
    if(context) result.observacoes = context;
  } else {
    // Não achei o bloco "WOD" — devolve o texto bruto inteiro em Observações pra nada
    // se perder, mesmo sem estrutura.
    result.observacoes = rawText.trim();
  }

  return result;
}
// Tentativa 2 de fazer o OCR funcionar (2026-09-15, depois do timeout confirmar o
// travamento em uso real): investigação encontrou que o Tesseract busca 2 coisas em
// tempo de execução — o motor (`tesseract-core...wasm.js`, carregado via `importScripts`,
// mesma categoria de `<script>`, deveria funcionar normal) e o pacote de idioma
// (`por.traineddata.gz`, ~1,36MB, carregado via `fetch()` — essa é a chamada bloqueada).
// Em vez de deixar o Tesseract buscar o pacote de idioma sozinho, ele é publicado junto
// deste Artifact como JSON (`por-traineddata.json`, `{data: "<base64 do .gz>"}` — o
// publicador de arquivo não aceita binário puro/gzip, só tipos web padrão) e um worker
// próprio (combinando o `worker.min.js` original + um pedacinho de código que intercepta
// só a chamada de fetch do pacote de idioma) devolve o arquivo já buscado por uma
// requisição normal da própria página — nunca uma chamada de rede feita de dentro do worker.
// Genérica (não é exclusiva do CrossFit) — reaproveitada também na leitura de rótulo
// nutricional da Dieta.
let ocrWorkerUrlPromise = null;
async function buildOcrWorkerUrl(){
  if(ocrWorkerUrlPromise) return ocrWorkerUrlPromise;
  ocrWorkerUrlPromise = (async () => {
    const [workerSrc, trainJson] = await Promise.all([
      fetch('worker.min.js').then(r=>{ if(!r.ok) throw new Error('worker.min.js '+r.status); return r.text(); }),
      fetch('por-traineddata.json').then(r=>{ if(!r.ok) throw new Error('por-traineddata.json '+r.status); return r.json(); }),
    ]);
    const b64 = trainJson.data;
    const shim = `self.__CF_TRAINEDDATA_B64=${JSON.stringify(b64)};(function(){
      function b64ToBytes(b64){var bin=atob(b64),arr=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);return arr;}
      var _f=self.fetch?self.fetch.bind(self):null;
      self.fetch=function(url,opts){
        if(typeof url==='string' && /\\.traineddata(\\.gz)?(\\?|$)/.test(url)){
          return Promise.resolve(new Response(b64ToBytes(self.__CF_TRAINEDDATA_B64),{status:200,statusText:'OK',headers:{'Content-Type':'application/gzip'}}));
        }
        return _f ? _f(url,opts) : Promise.reject(new Error('fetch indisponível no worker'));
      };
    })();\n`;
    const blob = new Blob([shim, workerSrc], {type:'application/javascript'});
    return URL.createObjectURL(blob);
  })();
  return ocrWorkerUrlPromise;
}
async function handleCrossfitPrintFile(e){
  const file = e.target.files[0];
  if(!file) return;
  const statusEl = document.getElementById('crossfit-print-status');
  document.getElementById('crossfit-print-review').innerHTML = '';
  statusEl.innerHTML = '🔍 Lendo o print... isso pode levar alguns segundos.';
  try{
    if(typeof Tesseract === 'undefined') throw new Error('Tesseract não carregou');
    const rawDataUrl = await new Promise((resolve,reject)=>{
      const reader = new FileReader();
      reader.onload = ()=>resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const dataUrl = await preprocessImageForOcr(rawDataUrl);
    // Sem timeout, um travamento (ex.: o motor via importScripts também bloqueado) fica
    const ocrTimeout = new Promise((_,reject)=>setTimeout(()=>reject(Object.assign(new Error('ocr_timeout'),{code:'ocr_timeout'})), 25000));
    const workerPath = await buildOcrWorkerUrl();
    const result = await Promise.race([Tesseract.recognize(dataUrl, 'por', {workerPath, corePath:'core'}), ocrTimeout]);
    const parsed = parseCrossfitWod(result.data.text || '');
    statusEl.innerHTML = parsed.exercicios.length
      ? `✓ Li ${parsed.exercicios.length} exercício(s) — confira antes de salvar.`
      : 'Não consegui separar os exercícios automaticamente — o texto bruto foi colocado em Observações, confira e ajusta.';
    renderCrossfitPrintReview(parsed);
  }catch(err){
    const msg = err && err.code==='ocr_timeout'
      ? 'A leitura por OCR não completou a tempo. Use o Registro manual.'
      : `Não consegui processar essa imagem (${(err&&err.message)||'erro desconhecido'}). Tenta outro print, ou usa o Registro manual.`;
    statusEl.innerHTML = `<p class="calc-formula-note">${msg}</p>`;
  }
  e.target.value = '';
}
function crossfitExercicioRowHtml(ex){
  ex = ex || {};
  const unidade = ex.unidade==='lb' ? 'lb' : 'kg'; // default kg quando o OCR não identificou
  const rxNote = ex.carga_prescrita!=null ? ` (Rx ${ex.carga_prescrita}${unidade})` : '';
  return `
    <div class="row" style="align-items:flex-end;gap:6px;margin-bottom:8px;" data-ex-row data-carga-prescrita="${ex.carga_prescrita??''}" data-padrao-sugerido="${ex.padrao_movimento_sugerido||''}">
      <div style="flex:2;"><label>Exercício</label><input type="text" class="cf-ex-nome" value="${ex.nome||''}"></div>
      <div style="width:56px;flex:none;"><label>Rounds</label><input type="number" class="cf-ex-series" value="${ex.series_ou_rounds??''}"></div>
      <div style="width:56px;flex:none;"><label>Repetições</label><input type="number" class="cf-ex-reps" value="${ex.reps??''}"></div>
      <div style="width:66px;flex:none;"><label>Carga${rxNote}</label><input type="number" class="cf-ex-carga" value="${ex.carga_prescrita??''}"></div>
      <div style="width:64px;flex:none;"><label>Unidade</label><select class="cf-ex-unidade"><option value="kg" ${unidade==='kg'?'selected':''}>kg</option><option value="lb" ${unidade==='lb'?'selected':''}>lb</option></select></div>
      <button type="button" class="ex-remove-btn" onclick="this.closest('[data-ex-row]').remove()">✕</button>
    </div>
  `;
}
function addCrossfitExercicioRow(){
  document.getElementById('crossfit-print-exercicios').insertAdjacentHTML('beforeend', crossfitExercicioRowHtml());
}
function startCrossfitManualEntry(){
  document.getElementById('crossfit-print-status').innerHTML = '';
  renderCrossfitPrintReview({}, {manual:true});
}
function renderCrossfitPrintReview(data, opts){
  opts = opts || {};
  const el = document.getElementById('crossfit-print-review');
  el.dataset.manual = opts.manual ? '1' : '';
  el.dataset.editId = opts.editId || '';
  const exercicios = data.exercicios || [];
  // Editar não tenta separar de volta um `resultado` já salvo em tempo/rounds/reps — o
  // texto inteiro entra em "Outro" (nada se perde; a pessoa reescreve se quiser mudar).
  const cancelBtn = opts.editId ? `<button type="button" class="tertiary-btn" style="margin-left:8px;" onclick="document.getElementById('crossfit-print-review').innerHTML='';">Cancelar edição</button>` : '';
  el.innerHTML = `
    <label>Data</label><input type="text" id="crossfit-print-data" value="${data.data||todayKey()}">
    <div class="row">
      <div><label>Duração realizada do WOD (min)</label><input type="number" id="crossfit-print-min" value="${data.duracao_min??''}" aria-describedby="crossfit-duration-help"><small id="crossfit-duration-help">Só a parte do WOD; não inclua aquecimento e volta à calma.</small></div>
      <div>
        <label id="crossfit-print-kcal-label">${data.calorias_referencia?.kind==='met_watch_scenario'?'Adicional hipotético às calorias ativas Garmin':'Calorias ativas do treino'}</label><input type="number" id="crossfit-print-kcal" value="${data.calorias??''}">
        <button type="button" class="dica-add-btn" style="margin-top:4px;" onclick="estimateCrossfitCalorias()">Estimar calorias do WOD</button>
      </div>
    </div>
    <div id="crossfit-kcal-status"></div>
    <h3>Prescrição do WOD</h3>
    <p class="calc-formula-note">O que estava escrito no treino. Duração e calorias realizadas ficam no resultado, abaixo.</p>
    <label>Formato do WOD</label><input type="text" id="crossfit-print-formato" value="${escapeHtml(data.wod_formato||'')}" placeholder="For Time, AMRAP, EMOM...">
    <div id="crossfit-block-preview" class="calc-formula-note"></div>
    <label>Escala realizada</label><select id="crossfit-print-scale"><option value="rx">RX</option><option value="intermediario">Intermediário</option><option value="adaptado">Adaptado</option></select>
    <label>Exercícios</label>
    <div id="crossfit-print-exercicios">${exercicios.map(crossfitExercicioRowHtml).join('')}</div>
    <button type="button" class="dica-add-btn" style="margin-bottom:10px;" onclick="addCrossfitExercicioRow()">+ Adicionar exercício</button>
    <h3>Resultado realizado</h3>
    <label>Tipo do resultado</label><select id="crossfit-result-type"><option value="time">Tempo</option><option value="rounds-reps">Rounds + repetições</option><option value="load">Carga</option><option value="calories">Calorias</option><option value="notes">Outro</option></select>
    <div class="calc-formula-note" style="margin:0 0 8px;">Terminou todos os rounds? Preenche o tempo. Bateu o time cap sem terminar? Preenche rounds + repetições. Os dois em branco tudo bem também.</div>
    <label>Tempo final (se terminou)</label><input type="text" id="crossfit-resultado-tempo" placeholder="mm:ss, ex. 23:45">
    <div class="row">
      <div><label>Rounds completos (se bateu o time cap)</label><input type="number" id="crossfit-resultado-rounds"></div>
      <div><label>+ Repetições</label><input type="number" id="crossfit-resultado-reps"></div>
    </div>
    <label>Outro (carga máxima, observação livre sobre o resultado)</label><input type="text" id="crossfit-resultado-obs" value="${escapeHtml(data.resultado||'')}">
    <div class="row"><div><label>Carga do resultado (kg)</label><input type="number" id="crossfit-resultado-carga" min="0" step="0.5"></div><div><label>Calorias do resultado</label><input type="number" id="crossfit-resultado-calorias" min="0"></div></div>
    <label>Percepção de esforço (opcional, 1–10)</label><input type="number" id="crossfit-print-rpe" min="1" max="10" placeholder="Quanto o treino foi puxado?">
    <p class="calc-formula-note">1 = muito leve · 5 = moderado · 10 = esforço máximo. Não é quantidade de repetições ou rounds.</p>
    <label>Observações</label><textarea id="crossfit-print-obs" rows="2" placeholder="Sensação, dor, variação feita, aquecimento...">${escapeHtml(data.observacoes||'')}</textarea>
    <p class="calc-formula-note">${opts.manual ? 'Preenche o que quiser lembrar — nenhum campo é obrigatório além da data.' : 'Confira os números antes de salvar — a leitura por IA pode errar.'}</p>
    <button class="primary" onclick="saveCrossfitPrintEntry()">✓ ${opts.editId ? 'Salvar alterações' : 'Salvar WOD'}</button>${cancelBtn}
  `;
  el.dataset.calorieEstimate = data.calorias_referencia && Number(data.calorias_referencia.usedKcal)===Number(data.calorias) ? JSON.stringify(data.calorias_referencia) : '';
  el.dataset.originalGarminEstimate = data.calorias_referencia?.kind === 'garmin_session' ? '1' : '';
  window.ForjaWodBlocks?.mount?.(el);
}
function estimateCrossfitCalorias(){ return window.ForjaCrossfitEnergyUI?.open(); }
async function mergeCrossfitByDate(db, newData){
  const existing = await db.collection('crossfit').get();
  const match = existing.docs.map(d=>({id:d.id, ...d.data()})).find(d=>d.data===newData.data);
  if(match){
    const patch = {};
    for(const k in newData){
      if(k==='data') continue;
      if(newData[k]!=null && match[k]==null) patch[k] = newData[k];
    }
    if(newData.calorias_referencia?.kind === 'garmin_session'){
      patch.calorias = newData.calorias;
      patch.calorias_ativas = newData.calorias_ativas;
      patch.calorias_brutas = newData.calorias_brutas;
      patch.calorias_referencia = newData.calorias_referencia;
      patch.calorias_estimadas = false;
      patch.origem = newData.origem;
    }
    if(match.origem==='push_garmin' && (newData.origem==='print' || newData.origem==='manual')) patch.origem = 'push_garmin+'+newData.origem;
    if(Object.keys(patch).length) await db.collection('crossfit').doc(match.id).update(patch);
    return {id: match.id, created:false};
  }
  const ref = await db.collection('crossfit').add(newData);
  return {id: ref.id, created:true};
}
async function saveCrossfitPrintEntry(){
  tapFeedback();
  const db = window.claude ? await window.claude.use('db') : null;
  if(!db){ showToast('Banco de dados não disponível nesta sessão.'); return; }
  const dataStr = document.getElementById('crossfit-print-data').value.trim() || todayKey();
  const min = parseFloat(document.getElementById('crossfit-print-min').value);
  const kcal = parseFloat(document.getElementById('crossfit-print-kcal').value);
  const formato = document.getElementById('crossfit-print-formato').value.trim();
  const resultadoTempo = document.getElementById('crossfit-resultado-tempo').value.trim();
  const resultadoRounds = document.getElementById('crossfit-resultado-rounds').value;
  const resultadoReps = document.getElementById('crossfit-resultado-reps').value;
  const resultadoObs = document.getElementById('crossfit-resultado-obs').value.trim();
  const resultType = document.getElementById('crossfit-result-type').value;
  const scale = document.getElementById('crossfit-print-scale').value;
  const resultLoad = parseFloat(document.getElementById('crossfit-resultado-carga').value);
  const resultCalories = parseFloat(document.getElementById('crossfit-resultado-calorias').value);
  const resultadoParts = [];
  if(resultadoTempo) resultadoParts.push(resultadoTempo);
  if(resultadoRounds || resultadoReps) resultadoParts.push(`${resultadoRounds||0} voltas${resultadoReps?` + ${resultadoReps} repetições`:''}`);
  if(resultadoObs) resultadoParts.push(resultadoObs);
  if(!isNaN(resultLoad)) resultadoParts.push(`${resultLoad} kg`);
  if(!isNaN(resultCalories)) resultadoParts.push(`${resultCalories} cal`);
  const resultado = resultadoParts.join(' · ');
  const rpe = parseFloat(document.getElementById('crossfit-print-rpe').value);
  const obs = document.getElementById('crossfit-print-obs').value.trim();
  const rows = [...document.querySelectorAll('#crossfit-print-exercicios [data-ex-row]')];
  const libSnap = await db.collection('crossfit_exercicios').get();
  const lib = {};
  libSnap.docs.forEach(d=>{ lib[d.id] = d.data(); });
  const exercicios = [];
  for(const row of rows){
    const nome = row.querySelector('.cf-ex-nome').value.trim();
    if(!nome) continue;
    const id = normalizeExerciseId(nome);
    let padrao = lib[id] ? lib[id].padrao_movimento : (row.dataset.padraoSugerido || 'não classificado');
    if(!lib[id]){
      await db.collection('crossfit_exercicios').doc(id).set({padrao_movimento: padrao});
      lib[id] = {padrao_movimento: padrao};
    }
    const seriesVal = parseFloat(row.querySelector('.cf-ex-series').value);
    const repsVal = parseFloat(row.querySelector('.cf-ex-reps').value);
    const cargaVal = parseFloat(row.querySelector('.cf-ex-carga').value);
    const cargaPrescrita = parseFloat(row.dataset.cargaPrescrita);
    const unidadeVal = row.querySelector('.cf-ex-unidade').value;
    const ex = {nome, padrao_movimento: padrao};
    if(row.dataset.blocoId) ex.bloco_id = row.dataset.blocoId;
    if(/^\d+(?:-\d+)*$/.test(row.dataset.repsEsquema||'')) ex.reps_esquema = row.dataset.repsEsquema;
    const actualRaw=row.querySelector('.cf-ex-actual')?.value.trim();
    if(actualRaw!==undefined&&actualRaw!==''&&Number.isFinite(Number(actualRaw))&&Number(actualRaw)>=0) ex.quantidade_realizada=Number(actualRaw);
    const nomeRealizado = row.querySelector('.cf-ex-performed')?.value.trim();
    if(nomeRealizado && nomeRealizado !== nome) ex.nome_realizado = nomeRealizado;
    if(!isNaN(seriesVal)) ex.series_ou_rounds = seriesVal;
    if(!isNaN(repsVal)) ex[row.querySelector('.cf-ex-medida')?.value || 'reps'] = repsVal;
    if(row.dataset.textoOriginal) ex.texto_original = row.dataset.textoOriginal;
    const caloriasAlternativa = parseFloat(row.dataset.caloriasAlternativa);
    if(!isNaN(caloriasAlternativa)) ex.calorias_alternativa = caloriasAlternativa;
    if(row.dataset.repsMaximas === '1') ex.reps_maximas = true;
    const scaled = parseFloat(row.dataset.cargaScaled);
    if(!isNaN(scaled)) ex.carga_scaled = scaled;
    if(!isNaN(cargaVal)) ex.carga_usada = cargaVal;
    if(!isNaN(cargaPrescrita)) ex.carga_prescrita = cargaPrescrita;
    if((!isNaN(cargaVal) || !isNaN(cargaPrescrita)) && unidadeVal) ex.unidade = unidadeVal;
    else if(!isNaN(cargaPrescrita) && row.dataset.unidadePrescrita) ex.unidade = row.dataset.unidadePrescrita;
    exercicios.push(ex);
  }
  const reviewEl = document.getElementById('crossfit-print-review');
  const isManual = reviewEl.dataset.manual === '1';
  const editId = reviewEl.dataset.editId;
  const doc = { data: dataStr };
  if(reviewEl.dataset.textoOriginal) doc.texto_original = reviewEl.dataset.textoOriginal;
  if(reviewEl.dataset.blocos){try{const blocks=JSON.parse(reviewEl.dataset.blocos);if(Array.isArray(blocks)&&blocks.length)doc.blocos=blocks;}catch(e){}}
  if(!editId) doc.origem = isManual ? 'manual' : 'print';
  if(!isNaN(min)) doc.duracao_s = min*60;
  if(!isNaN(kcal)) doc.calorias = kcal;
  doc.calorias_estimadas = false;
  doc.calorias_referencia = null;
  if(reviewEl.dataset.calorieEstimate){
    try{
      const estimate = JSON.parse(reviewEl.dataset.calorieEstimate);
      if(estimate.usedKcal === kcal){
        doc.calorias_estimadas = estimate.kind !== 'garmin_session';
        doc.calorias_referencia = estimate;
        if(estimate.kind === 'garmin_session'){
          doc.calorias_brutas = estimate.watchGrossKcal;
          doc.calorias_ativas = kcal;
          if(!editId)doc.origem = isManual ? 'push_garmin+manual' : 'push_garmin+print';
        }
      }
    }catch(e){}
  }
  if(editId && !doc.calorias_referencia && reviewEl.dataset.originalGarminEstimate === '1'){
    doc.calorias_brutas = null;
    doc.calorias_ativas = null;
  }
  if(formato) doc.wod_formato = formato;
  doc.scale = scale;
  doc.resultType = resultType;
  if(resultType==='time'&&resultadoTempo)doc.resultScore={seconds:window.ForjaCrossfitResults?.normalize({resultType:'time',time:resultadoTempo}).score.seconds};
  if(resultType==='rounds-reps')doc.resultScore={rounds:Number(resultadoRounds)||0,reps:Number(resultadoReps)||0};
  if(resultType==='load'&&!isNaN(resultLoad))doc.resultScore={loadKg:resultLoad};
  if(resultType==='calories'&&!isNaN(resultCalories))doc.resultScore={calories:resultCalories};
  if(exercicios.length) doc.exercicios = exercicios;
  if(resultado) doc.resultado = resultado;
  if(!isNaN(rpe)) doc.rpe = rpe;
  if(obs) doc.observacoes = obs;
  if(editId){
    await db.collection('crossfit').doc(editId).update(doc);
  } else {
    await mergeCrossfitByDate(db, doc);
  }
  document.getElementById('crossfit-print-review').innerHTML = '';
  document.getElementById('crossfit-print-file').value = '';
  showToast(editId ? 'WOD atualizado!' : 'WOD salvo!');
}

// ---------- TABS ----------
function switchTab(tab){
  window.ForjaEnhancements?.showTabGroupFor?.(tab);
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
  document.getElementById('tab-inicio').style.display = tab==='inicio' ? '' : 'none';
  document.getElementById('tab-corrida').style.display = tab==='corrida' ? '' : 'none';
  document.getElementById('tab-natacao').style.display = tab==='natacao' ? '' : 'none';
  document.getElementById('tab-crossfit').style.display = tab==='crossfit' ? '' : 'none';
  document.getElementById('tab-academia').style.display = tab==='academia' ? '' : 'none';
  document.getElementById('tab-progresso').style.display = tab==='progresso' ? '' : 'none';
  document.getElementById('tab-corpo').style.display = tab==='corpo' ? '' : 'none';
  document.getElementById('tab-agua').style.display = tab==='agua' ? '' : 'none';
  document.getElementById('tab-mais').style.display = tab==='mais' ? '' : 'none';
  document.getElementById('tab-importar').style.display = tab==='importar' ? '' : 'none';
  document.getElementById('tab-dieta').style.display = tab==='dieta' ? '' : 'none';
  document.getElementById('tab-cardapio').style.display = tab==='cardapio' ? '' : 'none';
  if(tab==='inicio') renderDashboard();
  if(tab==='corrida') renderCorridaTab();
  if(tab==='natacao') renderNatacaoTab();
  if(tab==='crossfit') renderCrossfitTab();
  if(tab==='academia') window.ForjaGymTraining?.render?.().then(()=>window.ForjaGymUI?.render?.());
  if(tab==='progresso'){window.ForjaProgressCalendar?.init?.();window.ForjaProgressCalendar?.render?.();}
  if(tab==='corpo')window.ForjaWeightGoal?.render?.();
  if(tab==='dieta') renderDietTab();
  if(tab==='cardapio') renderCardapioTab();
  if(tab==='importar'){
    renderProgressGallery();
  }
  if(tab==='mais'){
    renderGymStatus();
    renderGDriveStatus();
    renderCheckpointStatus();
  }
}
document.querySelectorAll('.tab').forEach(btn=>{
  btn.addEventListener('click', ()=> switchTab(btn.dataset.tab));
});
// ---------- THEME (dark/light) ----------
async function setTheme(mode){
  tapFeedback();
  document.body.dataset.theme = ['light','aurora'].includes(mode) ? mode : '';
  document.getElementById('theme-dark-btn').classList.toggle('active', mode==='dark');
  document.getElementById('theme-aurora-btn')?.classList.toggle('active', mode==='aurora');
  document.getElementById('theme-light-btn').classList.toggle('active', mode==='light');
  await storageSet('theme-mode', mode);
}
async function initTheme(){
  let mode = 'aurora';
  try{
    const r = await window.storage.get('theme-mode');
    if(r && r.value) mode = r.value;
  }catch(e){}
  document.body.dataset.theme = ['light','aurora'].includes(mode) ? mode : '';
  document.getElementById('theme-dark-btn').classList.toggle('active', mode==='dark');
  document.getElementById('theme-aurora-btn')?.classList.toggle('active', mode==='aurora');
  document.getElementById('theme-light-btn').classList.toggle('active', mode==='light');
}

// ---------- DASHBOARD ----------
async function renderDashboard(){
  await window.ForjaBibleReader?.init?.();
  await window.ForjaCreatine?.render();
  const streak = await computeStreak();
  document.getElementById('dash-streak').textContent = streak;
  const streakNumEl = document.getElementById('streak-num');
  if(streakNumEl) streakNumEl.textContent = streak;
  const criteria=await streakCriteriaToday(),criteriaEl=document.getElementById('home-streak-criteria');
  if(criteriaEl)criteriaEl.textContent=`Sequência hoje: ${criteria.waterOk?'✓':'○'} água · ${criteria.foodOk?'✓':'○'} alimentação concluída com saldo positivo (${criteria.balanceSource}) · ${criteria.trainingOk?'✓ treino':criteria.restOk?'✓ descanso planejado':'○ treino pendente'} · ${criteria.bibleOk?'✓ leitura bíblica':'○ leitura bíblica pendente'}.`;
  document.getElementById('dash-water-streak').textContent = await computeWaterStreak();

  const bodyArr = await loadBody();
  const lastWeight = await getLastWeightValue();
  document.getElementById('dash-weight').textContent = lastWeight!==null ? lastWeight+'kg' : '–';

  const sportDays = await loadCombinedSportDates();
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const daysThisMonth = [...sportDays].filter(d=>d.startsWith(ym));
  document.getElementById('dash-workouts-month').textContent = daysThisMonth.length;

  const {comido, exercicio, goal, entryCount, garminSyncedAt, garminTotal, garminSteps, crossfitExtra, crossfitEstimated, crossfitUncertainty, exerciseSource} = await computeDietDaySummary(todayKey());
  let foodClosed=false;try{const row=await window.storage.get('diet-closed-days');foodClosed=!!(row?.value&&JSON.parse(row.value)[todayKey()]);}catch{}
  let garminAt=garminSyncedAt;try{const row=await window.storage.get('health-connect-last-sync');garminAt=JSON.parse(row?.value||'null')?.at||garminAt;}catch{}
  const creatineOk=await window.ForjaCreatine?.takenToday?.();
  window.ForjaDailyAttention?.render?.({...criteria,foodClosed,entryCount,creatineOk,garminConnected:!!garminAt,garminAt});
  const sources=document.getElementById('home-energy-sources');
  if(sources)sources.textContent=window.ForjaSyncCenter?.describeDay?.({intake:entryCount?comido:null,totalBurn:garminTotal,activeKcal:exercicio||null,steps:garminSteps,garminSyncedAt,crossfitExtra,crossfitEstimated,crossfitUncertainty,exerciseSource})||`Gasto em exercício: ${exerciseSource}. Confira a origem dos dados antes de usar o saldo.`;
  const balance = (comido!==null) ? Math.round(garminTotal>0?garminTotal-comido:(goal!==null?goal-comido:0)) : null;
  document.getElementById('dash-cal-balance').textContent = balance!==null ? balance+'kcal' : '–';
  document.getElementById('dash-cal-balance').nextElementSibling.textContent=garminTotal>0?'🍽 saldo parcial do gasto':'🍽 saldo da meta alimentar';
  await window.ForjaHealthConnect?.showHome();
  document.getElementById('dash-cal-exercise').textContent = exercicio>0 ? exercicio+'kcal' : '–';
  document.getElementById('dash-intake').textContent = comido>0 ? Math.round(comido)+'kcal' : '–';
  const energyParts=window.ForjaSyncCenter?.dailyEnergy?.({intake:comido,totalBurn:garminTotal,activeKcal:exercicio});
  document.getElementById('dash-resting').textContent = energyParts?.restingKcal!=null ? energyParts.restingKcal+'kcal' : '–';
  document.getElementById('dash-steps').textContent = garminSteps!=null ? Math.round(garminSteps).toLocaleString('pt-BR') : '–';
  document.getElementById('dash-garmin-total').textContent = garminTotal>0 ? Math.round(garminTotal)+'kcal' : '–';
  document.getElementById('dash-deficit-streak').textContent = await computeDeficitStreak();

  await renderGymStatus();
  await renderWeeklyGoal();
  await renderWaterBottleViews();
  if(window.ForjaEnhancements) await window.ForjaEnhancements.renderWeeklyBalance();
  await window.ForjaWeeklyReport?.render?.();
  await window.ForjaDashboardLayout?.apply?.();
  window.ForjaReminders?.refresh?.();
}

// ---------- WEEKLY TRAINING GOAL ----------
const K_GOAL = 'training-goal';
let goalCache = null;
async function loadGoalCache(){
  if(goalCache) return goalCache;
  try{
    const r = await window.storage.get(K_GOAL);
    goalCache = r ? JSON.parse(r.value) : {weeklyTarget: 3};
  }catch(e){ goalCache = {weeklyTarget: 3}; }
  return goalCache;
}
async function persistGoalCache(){
  scheduleWrite(K_GOAL, ()=>JSON.stringify(goalCache));
}
function getMonday(d){
  const date = new Date(d);
  const day = date.getDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1) - day; // shift to Monday
  date.setDate(date.getDate() + diff);
  date.setHours(0,0,0,0);
  return date;
}
function addDays(d, n){
  const date = new Date(d);
  date.setDate(date.getDate() + n);
  return date;
}
async function daysTrainedInRange(start, end){
  const sportDays = await loadCombinedSportDates();
  const startKey = todayKey(start);
  const endKey = todayKey(end);
  const days = [...sportDays].filter(d => d >= startKey && d <= endKey);
  return days.length;
}
async function computeWeeklyGoal(){
  await loadGoalCache();
  const baseGoal = goalCache.weeklyTarget;
  const thisMonday = getMonday(new Date());
  const thisSunday = addDays(thisMonday, 6);
  const done = await daysTrainedInRange(thisMonday, thisSunday);
  return { target: baseGoal, done, baseGoal, shortfall: 0, compensating: false };
}
async function renderWeeklyGoal(){
  await loadGoalCache();
  document.getElementById('weekly-goal-display').textContent = goalCache.weeklyTarget;
  const status = await computeWeeklyGoal();
  document.getElementById('goal-progress-line').textContent = `${status.done} / ${status.target} treinos esta semana`;
  const note = document.getElementById('goal-compensation-note');
  note.textContent = status.compensating
    ? `+${status.shortfall} pra compensar a semana passada (meta base: ${status.baseGoal})`
    : '';
  const restSelect=document.getElementById('weekly-rest-day');
  if(restSelect){let choices={};try{const r=await window.storage.get('rest-day-weekly');choices=r?JSON.parse(r.value):{};}catch{}restSelect.value=String(choices[todayKey(getMonday(new Date()))]??0);}
}
async function setWeeklyRestDay(value){
  const day=Number(value);if(!Number.isInteger(day)||day<0||day>6)return;
  let choices={};try{const r=await window.storage.get('rest-day-weekly');choices=r?JSON.parse(r.value):{};}catch{}
  choices[todayKey(getMonday(new Date()))]=day;
  await window.storage.set('rest-day-weekly',JSON.stringify(choices));
  await renderDashboard();
}
async function adjustWeeklyGoal(delta){
  tapFeedback();
  await loadGoalCache();
  goalCache.weeklyTarget = Math.max(1, Math.min(7, goalCache.weeklyTarget + delta));
  await persistGoalCache();
  await renderWeeklyGoal();
}

// ---------- DAILY QUOTE (tough, direct, no self-humiliation) ----------
const DAILY_QUOTES = [
  "Ninguém vai treinar por você. Levanta e vai.",
  "Desculpa não constrói músculo. Só a série constrói.",
  "O treino ruim que você fez ainda venceu o perfeito que você só pensou em fazer.",
  "Cansaço é temporário. Desistir é decisão.",
  "Você prometeu isso pra você. Cumpre.",
  "Ninguém lembra dos dias que você faltou. Você vai lembrar.",
  "Ou você treina hoje, ou explica amanhã por que não treinou.",
  "A vontade passa. O hábito fica.",
  "Sua versão de amanhã depende do que você faz agora.",
  "Parar é fácil. Difícil é continuar depois de parar. Não pare.",
  "Não existe motivação todo dia. Existe disciplina.",
  "O peso não fica mais leve esperando. Levanta.",
  "Cada série que você pula, alguém no seu lugar não pulou.",
  "Você já veio até aqui. Não é hora de recuar.",
  "Foco no que você controla: aparecer e fazer.",
  "Ninguém vai bater na sua porta te lembrando. É com você.",
  "O corpo que você quer não nasce do conforto.",
  "Hoje conta. Todo dia conta.",
  "Se fosse fácil, todo mundo teria o resultado que você quer.",
  "Menos desculpa, mais série.",
  "Você não precisa ter vontade. Precisa ter compromisso.",
  "O treino de hoje é o resultado de amanhã.",
  "Ninguém constrói disciplina nos dias fáceis.",
  "Trocar hoje por 'amanhã eu faço' é a receita pra nunca fazer.",
  "Faz mesmo sem vontade. A vontade vem depois que você começa.",
  "Você é o único responsável pelo seu progresso — e pela sua estagnação.",
  "Cada dia que passa sem treinar, o objetivo fica mais longe, não mais perto.",
  "Não é sobre se sentir pronto. É sobre ir mesmo sem estar.",
  "Constância vence intensidade ocasional. Aparece hoje.",
  "O único treino que não te ajuda é o que você não fez.",
];
function getDailyQuote(offset=0){
  const d = new Date();
  const start = new Date(d.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((d - start) / 86400000);
  return DAILY_QUOTES[(dayOfYear + offset) % DAILY_QUOTES.length];
}
function renderDailyQuote(){
  document.getElementById('quote-text').textContent = getDailyQuote();
  window.ForjaBibleReader?.init?.();
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)renderDailyQuote();});

async function runInit(){
  renderDailyQuote();
  await initTheme();
  await loadNutritionGoal();
  await loadWaterGoal();
  syncWaterGoalUI();
  await renderBody();
  await renderProgressGallery();
  await initReminderState();
  await initGymReminderState();
  await renderGymStatus();
  await renderDashboard();
  tryInitGDriveWhenReady();
  await initWeightPending();
  await initCalorieCalc();
  document.getElementById('custom-water-input').value = customWaterPending;
}
// Initialized by standalone-ui.js
