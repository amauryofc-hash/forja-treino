(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.ForjaBibleReader=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
 'use strict';
 const KEY='bible-reading-v1',cache=new Map();let manifest=null,ready=false,selectedDate=null;
 const dayKey=(date=new Date())=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
 const storage=()=>root.ForjaStorage||root.storage;
 function normalize(raw={}){return{activatedOn:/^\d{4}-\d{2}-\d{2}$/.test(raw.activatedOn||'')?raw.activatedOn:null,book:typeof raw.book==='string'?raw.book:'GEN',chapter:Math.max(1,Number(raw.chapter)||1),read:Array.isArray(raw.read)?raw.read.filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x?.date||'')&&typeof x.book==='string'&&Number.isInteger(Number(x.chapter))):[],fontScale:Math.min(1.5,Math.max(.85,Number(raw.fontScale)||1)),open:raw.open!==false};}
 async function load(){try{const value=(await storage()?.get(KEY))?.value;return normalize(value?JSON.parse(value):{});}catch{return normalize();}}
 async function save(state){await storage()?.set(KEY,JSON.stringify(normalize(state)));return state;}
 async function activate(){const state=await load();if(!state.activatedOn){state.activatedOn=dayKey();await save(state);}return state;}
 function qualifies(state,date){return !state.activatedOn||date<state.activatedOn||state.read.some(x=>x.date===date);}
 async function readOn(date){return qualifies(await load(),date);}
 function eligibleDate(state,date){return /^\d{4}-\d{2}-\d{2}$/.test(date)&&date<=dayKey()&&(!state.activatedOn||date>=state.activatedOn);}
 async function markChapter(date,book,chapter){
  const state=await load();
  if(!eligibleDate(state,date))throw Error('Escolha uma data desde a ativação da leitura e até hoje.');
  const books=(await getManifest()).books,meta=books.find(item=>item.id===book);
  if(!meta||!Number.isInteger(Number(chapter))||Number(chapter)<1||Number(chapter)>meta.chapters)throw Error('Escolha um capítulo válido.');
  const index=state.read.findIndex(item=>item.date===date&&item.book===book&&Number(item.chapter)===Number(chapter));
  if(index<0)state.read.push({date,book,chapter:Number(chapter)});else state.read.splice(index,1);
  await save(state);return index<0;
 }
 async function showDate(date){const state=await activate();if(!eligibleDate(state,date))throw Error('Esta data não aceita marcação retroativa.');selectedDate=date;await render();const panel=root.document?.getElementById('bible-reader-card');if(panel){panel.open=true;panel.scrollIntoView?.({behavior:'smooth',block:'start'});}return date;}
 async function getManifest(){if(!manifest){const response=await root.fetch('bible/books.json');if(!response.ok)throw Error('Acervo bíblico indisponível.');manifest=await response.json();}return manifest;}
 async function getBook(id){if(!cache.has(id)){if(!/^[1-4A-Z]{3}$/.test(id))throw Error('Livro inválido.');const response=await root.fetch(`bible/${id}.json`);if(!response.ok)throw Error('Não foi possível abrir este livro.');cache.set(id,await response.json());}return cache.get(id);}
 function step(books,id,chapter,direction){const index=books.findIndex(x=>x.id===id),book=books[index];if(!book)return{book:'GEN',chapter:1};if(direction>0)return chapter<book.chapters?{book:id,chapter:chapter+1}:{book:books[Math.min(index+1,books.length-1)].id,chapter:index+1<books.length?1:chapter};return chapter>1?{book:id,chapter:chapter-1}:{book:books[Math.max(0,index-1)].id,chapter:index>0?books[index-1].chapters:1};}
 async function render(){const panel=root.document?.getElementById('bible-reader-card');if(!panel)return;const state=await activate(),title=root.document.getElementById('bible-reader-title'),status=root.document.getElementById('bible-reader-status'),bookSelect=root.document.getElementById('bible-book'),chapterSelect=root.document.getElementById('bible-chapter'),verses=root.document.getElementById('bible-verses'),mark=root.document.getElementById('bible-mark');panel.open=state.open;
  try{const dateInput=root.document.getElementById('bible-reading-date');if(!eligibleDate(state,selectedDate))selectedDate=dayKey();dateInput.min=state.activatedOn||dayKey();dateInput.max=dayKey();dateInput.value=selectedDate;const data=await getManifest(),books=data.books;bookSelect.replaceChildren();let group=null,previous='';for(const book of books){if(book.group!==previous){group=root.document.createElement('optgroup');group.label=book.group;bookSelect.append(group);previous=book.group;}const option=root.document.createElement('option');option.value=book.id;option.textContent=book.name;group.append(option);}if(!books.some(x=>x.id===state.book))state.book=books[0].id;const selected=books.find(x=>x.id===state.book);state.chapter=Math.min(selected.chapters,state.chapter);bookSelect.value=state.book;chapterSelect.replaceChildren();for(let n=1;n<=selected.chapters;n++){const option=root.document.createElement('option');option.value=String(n);option.textContent=`Capítulo ${n}`;chapterSelect.append(option);}chapterSelect.value=String(state.chapter);title.textContent=`📖 Leitura da Bíblia · ${selected.name} ${state.chapter}`;const book=await getBook(state.book),chapter=book[String(state.chapter)];if(!chapter?.length)throw Error('Capítulo indisponível.');verses.replaceChildren();verses.style.fontSize=`${state.fontScale}em`;for(const [number,text] of chapter){const p=root.document.createElement('p'),sup=root.document.createElement('sup');sup.textContent=number;p.append(sup,root.document.createTextNode(' '+text));verses.append(p);}const done=state.read.some(x=>x.date===selectedDate&&x.book===state.book&&Number(x.chapter)===state.chapter);mark.textContent=done?'✓ Lido em '+selectedDate.split('-').reverse().join('/')+' · desfazer':'Marcar capítulo em '+selectedDate.split('-').reverse().join('/');mark.setAttribute('aria-pressed',String(done));status.textContent=state.read.some(x=>x.date===dayKey())?'Leitura de hoje concluída':'Leitura de hoje pendente';root.document.getElementById('home-sync-verse')?.replaceChildren(root.document.createTextNode('Bíblia: '+(state.read.some(x=>x.date===dayKey())?'lida hoje':'pendente')));
  }catch(error){verses.textContent=error.message;status.textContent='Leitura indisponível';}
 }
 async function init(){
  if(ready){await render();return;}ready=true;
  const panel=root.document?.getElementById('bible-reader-card');if(!panel)return;
  await render();
  const book=root.document.getElementById('bible-book'),chapter=root.document.getElementById('bible-chapter'),dateInput=root.document.getElementById('bible-reading-date');
  book.addEventListener('change',async()=>{const state=await load();state.book=book.value;state.chapter=1;await save(state);await render();});
  chapter.addEventListener('change',async()=>{const state=await load();state.chapter=Number(chapter.value);await save(state);await render();});
  dateInput.addEventListener('change',async()=>{const state=await load();if(!eligibleDate(state,dateInput.value)){dateInput.value=selectedDate||dayKey();return;}selectedDate=dateInput.value;await render();});
  root.document.getElementById('bible-mark').addEventListener('click',async()=>{const state=await load();try{await markChapter(selectedDate||dayKey(),state.book,state.chapter);selectedDate=dayKey();await render();await root.renderDashboard?.();await root.ForjaProgressCalendar?.refreshIfVisible?.();}catch(error){root.document.getElementById('bible-reader-status').textContent=error.message;}});
  for(const [id,direction] of [['bible-prev',-1],['bible-next',1]])root.document.getElementById(id).addEventListener('click',async()=>{const state=await load(),data=await getManifest();Object.assign(state,step(data.books,state.book,state.chapter,direction));await save(state);await render();});
  for(const [id,delta] of [['bible-font-down',-.1],['bible-font-up',.1]])root.document.getElementById(id).addEventListener('click',async()=>{const state=await load();state.fontScale=Math.min(1.5,Math.max(.85,Math.round((state.fontScale+delta)*10)/10));await save(state);await render();});
  panel.addEventListener('toggle',async()=>{const state=await load();if(state.open!==panel.open){state.open=panel.open;await save(state);}});
 }
 return{dayKey,normalize,load,save,activate,qualifies,readOn,eligibleDate,markChapter,showDate,getManifest,getBook,step,render,init};
});
