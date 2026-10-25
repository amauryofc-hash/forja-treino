/* Prescrição do WOD: nunca preenche duração realizada ou calorias do atleta. */
(function(root){
 const fold=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const groups=[['Air Bike','assault bike','airbike','echo bike'],['BikeErg','bike erg'],['Bike'],['Row','remo','row erg','rowerg','rowing'],['SkiErg','ski','ski erg'],['Double KB Farmer Carry','double kb farmer carry','double kettlebell farmer carry'],['Farmer Carry','farmers carry','farmer walk'],['Burpee Broad Jump','burpee broad jumps'],['Burpee Bar Muscle Up / Pull Up','burpee bar muscle ups pull ups','burpee bar muscle up pull up'],['Burpee Bar Muscle Up','burpee bar muscle ups'],['Burpee','burpees'],['Deadlift','levantamento terra'],['Thruster','thrusters'],['Wall Ball','wall balls'],['Box Jump','box jumps'],['Box Jump Over'],['Box Step Over'],['Double Under','double unders','du'],['Single Under','single unders'],['Pull Up','pull ups','pullup'],['Chest to Bar','c2b'],['Toes to Bar','t2b'],['Muscle Up','muscle ups'],['Ring Muscle Up'],['Bar Muscle Up'],['Handstand Push Up','hspu'],['Handstand Walk','hsw'],['Push Up','push ups','flexao'],['Sit Up','sit ups'],['Air Squat'],['Back Squat'],['Front Squat'],['Overhead Squat','ohs'],['Snatch'],['Power Snatch'],['Dumbbell Hang Snatch','db hang snatch','db hang snatches','dumbbell hang snatches'],['Clean'],['Power Clean'],['Squat Clean','squat cleans'],['Clean and Jerk'],['Push Press'],['Push Jerk'],['Split Jerk'],['Shoulder Press','strict press'],['Kettlebell Swing','kb swing','kbs'],['Russian Swing'],['American Swing'],['Run','corrida'],['Shuttle Run'],['Lunge','lunges','walking lunge'],['Rope Climb'],['GHD Sit Up'],['Devil Press'],['Dumbbell Snatch','db snatch'],['Dumbbell Clean','db clean']];
 groups.push(
  ['Row Erg','remo ergometro','rowing ergometer'],['SkiErg','ski ergometro'],['Sprint','tiro de corrida'],
  ['Sled Push','empurrar treno'],['Sled Pull','puxar treno'],['Bear Crawl'],['Sandbag Clean'],['Sandbag Over Shoulder'],
  ['Sumo Deadlift'],['Romanian Deadlift','rdl'],['Deficit Deadlift'],['Trap Bar Deadlift'],['Single Leg Deadlift'],
  ['Sumo Deadlift High Pull','sdhp'],['Good Morning'],['Hip Thrust'],['Barbell Glute Bridge'],
  ['Box Squat'],['Pause Squat'],['Tempo Squat'],['Pistol Squat'],['Bulgarian Split Squat'],
  ['Hang Power Clean'],['Hang Squat Clean'],['High Hang Clean'],['Muscle Clean'],['Clean Pull'],['Clean High Pull'],
  ['Hang Power Snatch'],['Hang Squat Snatch'],['Squat Snatch'],['Muscle Snatch'],['Snatch Pull'],['Snatch High Pull'],
  ['Dumbbell Snatch','db snatch'],['Kettlebell Snatch','kb snatch'],['Kettlebell Clean','kb clean'],
  ['Power Jerk'],['Strict Press'],['Dumbbell Push Press','db push press'],['Dumbbell Push Jerk','db push jerk'],
  ['Dumbbell Shoulder Press','db shoulder press'],['Dumbbell Thruster','db thruster'],['Dumbbell Clean and Jerk','db clean and jerk'],
  ['Strict Pull Up'],['Kipping Pull Up'],['Butterfly Pull Up'],['Chin Up'],['Strict Bar Muscle Up'],
  ['Strict Ring Muscle Up'],['Kipping Ring Muscle Up'],['Ring Row'],['Ring Dip'],['Hanging Knee Raise'],['Knees to Elbows'],
  ['Hand Release Push Up'],['Handstand Hold'],['Wall Walk'],['Strict Handstand Push Up','strict hspu'],
  ['Kipping Handstand Push Up','kipping hspu'],['Legless Rope Climb'],['Turkish Get Up'],
  ['Reverse Lunge'],['Lateral Lunge'],['Overhead Walking Lunge'],['Kettlebell Front Rack Lunge','kb front rack lunge'],
  ['Kettlebell Thruster','kb thruster'],['Dumbbell Box Step Over','db box step over'],['Medicine Ball Clean','med ball clean'],
  ['Burpee Box Jump Over'],['Burpee Box Jump'],['Broad Jump'],['Mountain Climber'],
  ['Plank'],['Side Plank'],['Hollow Hold'],['Arch Hold'],['Hollow Rock'],['V Up'],['L Sit'],['Russian Twist'],['Ab Wheel Rollout']
 );
 const aliases=new Map();groups.forEach(g=>g.forEach(n=>aliases.set(fold(n),g[0])));aliases.set('handstand push ups','Handstand Push Up');aliases.set('devil presses','Devil Press');
 [['Chest to Bar','chest to bar pull up','chest to bar pull ups','c2b pull ups'],['Air Squat','agachamento livre','agachamentos livres','agachamento sem carga'],['Front Squat','agachamento frontal'],['Back Squat','agachamento costas'],['Overhead Squat','agachamento acima da cabeca'],['Row','remo indoor','remo ergometrico'],['SkiErg','ski erg','ski ergometer'],['Air Bike','assault air bike','bicicleta de ar'],['Double Under','saltos duplos'],['Wall Ball','arremesso de bola na parede'],['Deadlift','terra'],['Pull Up','barra fixa'],['Push Up','flexao de bracos'],['Sit Up','abdominal'],['Box Jump','salto na caixa']].forEach(([canonical,...names])=>names.forEach(name=>aliases.set(fold(name),canonical)));
 for(const [key,value] of [...aliases])if(key.length>3&&!key.endsWith('s'))aliases.set(key+'s',value);
 root.crossfitMovementNames=[...new Set(groups.map(group=>group[0]))].sort((a,b)=>a.localeCompare(b));
 const movementDetails=[
  {pattern:/\b(?:row|ski(?:erg)?|bike(?:erg)?)\b/i,familia:'Condicionamento',equipamento:'máquina',atencao:'Confira se a meta do visor está em calorias, metros ou tempo. Calorias do visor não equivalem ao gasto corporal.',adaptacoes:[]},
  {pattern:/\b(?:muscle up|pull up|chest to bar|ring row|chin up)\b/i,familia:'Ginástica',equipamento:'barra ou argolas',atencao:'Registre a versão realmente feita: strict, kipping, assistida ou substituída.',adaptacoes:['Chest to Bar','Pull Up','Ring Row']},
  {pattern:/\b(?:handstand|wall walk)\b/i,familia:'Ginástica',equipamento:'parede ou solo',atencao:'Confirme a variante, amplitude e assistência usadas.',adaptacoes:['Wall Walk','Handstand Hold']},
  {pattern:/\b(?:clean|snatch|jerk|deadlift|squat|thruster)\b/i,familia:'Levantamento',equipamento:'implemento prescrito',atencao:'Confirme variante, implemento e carga antes de comparar resultados.',adaptacoes:[]},
  {pattern:/\b(?:run|sprint|shuttle|carry|sled|lunge)\b/i,familia:'Deslocamento',equipamento:'conforme o WOD',atencao:'Confirme distância, percurso e implemento usados.',adaptacoes:[]},
  {pattern:/\b(?:jump|under|burpee)\b/i,familia:'Condicionamento',equipamento:'solo ou caixa',atencao:'Confirme altura, tipo de salto e repetições.',adaptacoes:[]}
 ];
 root.crossfitMovementInfo=name=>{const canonical=aliases.get(fold(name))||name;const detail=movementDetails.find(item=>item.pattern.test(canonical||''));return detail?{familia:detail.familia,equipamento:detail.equipamento,atencao:detail.atencao,adaptacoes:[...detail.adaptacoes]}:null;};
 const guidanceRules=[
  {pattern:/\b(?:row|ski(?:erg)?|bike(?:erg)?|erg)\b/i,label:'Máquina',tip:'Confira se a meta está em segundos, metros ou calorias do visor. Calorias do visor não são seu gasto energético.',warmup:'Comece leve na própria máquina e aumente o ritmo gradualmente.'},
  {pattern:/\b(?:clean|thruster|front squat)\b/i,label:'Front rack e pernas',tip:'Confira a variante, o implemento e a carga antes de comparar resultados.',warmup:'Se quiser, prepare tornozelos, quadris e posição de front rack.'},
  {pattern:/\b(?:snatch|jerk|overhead)\b/i,label:'Acima da cabeça',tip:'Confira se a variante é power, squat, hang, strict ou com impulso.',warmup:'Se quiser, prepare ombros e coluna torácica com movimentos confortáveis.'},
  {pattern:/\b(?:pull up|muscle up|ring|handstand|rope climb)\b/i,label:'Ginástica',tip:'Strict, kipping e versões assistidas devem ser registrados como execuções diferentes.',warmup:'Se quiser, prepare ombros e punhos para a variante que fará.'},
  {pattern:/\b(?:run|sprint|jump|double under|squat|lunge)\b/i,label:'Pernas e deslocamento',tip:'Confira distância, altura, repetições e se a variante foi adaptada.',warmup:'Se quiser, prepare tornozelos e quadris antes do bloco.'}
 ];
 root.crossfitMovementGuide=name=>guidanceRules.find(rule=>rule.pattern.test(name||''))||null;
 const equipmentFor=name=>/\b(?:dumbbell|db)\b/i.test(name)?'halter':/\b(?:kettlebell|kb)\b/i.test(name)?'kettlebell':/\b(?:row|ski(?:erg)?|bike(?:erg)?)\b/i.test(name)?'máquina':/\bsandbag\b/i.test(name)?'sandbag':/\bring\b/i.test(name)?'argolas':/\b(?:clean|snatch|deadlift|jerk|press|front squat|back squat)\b/i.test(name)?'barra ou implemento prescrito':'conforme o WOD';
 const measureFor=ex=>ex.tempo_s!=null?'tempo':ex.distancia_m!=null?'distância':ex.calorias_maquina!=null?'calorias da máquina':ex.reps_maximas?'repetições máximas':'repetições';
 const formatLine=/^(?:WOD\s+\d+\s*['"]|\d+\s*[x×]\s*EMOM\b|HEAVY\s*DAY|AMRAP|EMOM|E\d+MOM|EVERY\b|FOR\s*TIME|TABATA|CHIPPER|RFT|STRENGTH|TIME\s*CAP|BUY[- ]?IN|CASH[- ]?OUT|THEN\b|REST\b|\d+\s+Rounds?\b|\d+(?:\s*-\s*\d+){1,8}\b)/i;
 root.parseCrossfitWod=function(raw){
  raw=String(raw||'');const lines=raw.replace(/[’′]/g,"'").replace(/[“”″]/g,'"').replace(/([0-9])\s*['"]{2,}/g,'$1"').split(/\r?\n/).map(s=>s.trim());
  const result={data:null,wod_formato:null,exercicios:[],observacoes:'',texto_original:raw};
  const date=raw.match(/(?:WOD\s*[-–]?\s*)?(\d{1,2})\/(\d{1,2})\/(\d{4})/i);if(date)result.data=`${date[3]}-${date[2].padStart(2,'0')}-${date[1].padStart(2,'0')}`;
  let start=lines.findIndex(s=>/^WOD\s*:?$/i.test(s));if(start<0){const format=lines.findIndex(s=>formatLine.test(s));if(format<0){result.observacoes=raw;return result;}start=format-1;}
  if(start< -1||!lines.slice(start+1).some(s=>formatLine.test(s)||/^\d+[\s'"m]/i.test(s))){result.observacoes=raw;return result;}
  const notes=lines.slice(0,start).filter(s=>!/^WOD\s*[-–]?\s*\d/i.test(s));if(!result.data)notes.push('Revisar a data: não foi reconhecida na imagem.');const formats=[];let currentRounds=null;
  const blocks=[];let activeBlock=null;
  const beginBlock=(label,kind)=>{activeBlock={id:'b'+(blocks.length+1),titulo:label,tipo:kind,exercicios:0};blocks.push(activeBlock);};
  const addExercise=ex=>{if(!activeBlock)beginBlock('WOD','treino');ex.bloco_id=activeBlock.id;activeBlock.exercicios++;result.exercicios.push(ex);};
  for(const line of lines.slice(start+1)){
   if(/^(COOL\s*DOWN|Fazer\s*check|Ações|TECNOFIT)/i.test(line))break;if(!line)continue;
   const scheme=line.match(/^(\d+(?:\s*-\s*\d+){1,8})\.\s+([A-Za-z].+)$/);
   if(scheme){const name=scheme[2].trim(),canonical=aliases.get(fold(name));formats.push(scheme[1]);addExercise({nome:canonical||name,reps_esquema:scheme[1].replace(/\s/g,''),texto_original:line,revisar:!canonical});continue;}
   if(formatLine.test(line)){formats.push(line);const block=line.match(/^(\d+)\s+Rounds?\b/i)||line.match(/\bFOR\s+(?:TIME\s+)?(\d+)\s+Rounds?\b/i)||line.match(/^(\d+)\s*[x×]\s*EMOM\b/i);if(block)currentRounds=Number(block[1]);else if(/^(?:BUY[- ]?IN|CASH[- ]?OUT|THEN\b|REST\b)/i.test(line))currentRounds=null;
    if(/^TIME\s*CAP/i.test(line)){if(activeBlock)activeBlock.time_cap=line;}
    else if(/^(?:REST|DESCANSO)\b/i.test(line))beginBlock(line,'descanso');
    else if(/^(?:HEAVY\s*DAY|STRENGTH|AMRAP|EMOM|E\d+MOM|EVERY\b|FOR\s*TIME|TABATA|CHIPPER|RFT|\d+\s*[x×]\s*EMOM|\d+\s+Rounds?|BUY[- ]?IN|CASH[- ]?OUT|THEN\b)/i.test(line))beginBlock(line,'treino');
    continue;}
   const alternateCalories=line.match(/^(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)\s+cal(?:ories|orias)?\b(?:\s+(.+))?$/i);
   if(alternateCalories){const equipment=alternateCalories[3]?.trim(),canonical=equipment&&aliases.get(fold(equipment));const ex={nome:canonical||equipment||'Calorias na máquina',calorias_maquina:Number(alternateCalories[1].replace(',','.')),calorias_alternativa:Number(alternateCalories[2].replace(',','.')),texto_original:line,revisar:!canonical};if(currentRounds!=null)ex.series_ou_rounds=currentRounds;addExercise(ex);continue;}
   const maxReps=line.match(/^Max\s+(.+)$/i);
   if(maxReps){let name=maxReps[1].trim(),load=name.match(/\(([\d.,]+)\s*\/\s*([\d.,]+)\s*(kg|lb)\)/i);if(load)name=name.replace(load[0],'').trim();const canonical=aliases.get(fold(name));const ex={nome:canonical||name,reps_maximas:true,texto_original:line,revisar:!canonical};if(currentRounds!=null)ex.series_ou_rounds=currentRounds;if(load){ex.carga_prescrita=Number(load[1].replace(',','.'));ex.carga_scaled=Number(load[2].replace(',','.'));ex.unidade=load[3].toLowerCase();}addExercise(ex);continue;}
   const match=line.match(/^(\d+(?:[.,]\d+)?)\s*(km|m|minutes?|min|seconds?|seg|sec|s|cal(?:ories|orias)?|''|"|')?\s+(.+)$/i);
   if(!match){let name=line,load=name.match(/\(([\d.,]+)\s*\/\s*([\d.,]+)\s*(kg|lb)\)/i);if(load)name=name.replace(load[0],'').trim();const canonical=aliases.get(fold(name));if(canonical){const ex={nome:canonical,texto_original:line};if(currentRounds!=null)ex.series_ou_rounds=currentRounds;if(canonical.includes(' / '))ex.revisar=true;if(load){ex.carga_prescrita=Number(load[1].replace(',','.'));ex.carga_scaled=Number(load[2].replace(',','.'));ex.unidade=load[3].toLowerCase();}addExercise(ex);continue;}notes.push('Revisar: '+line);continue;}
   const n=Number(match[1].replace(',','.')),unit=(match[2]||'reps').toLowerCase();let name=match[3],load=name.match(/\(([\d.,]+)\s*\/\s*([\d.,]+)\s*(kg|lb)\)/i);if(load)name=name.replace(load[0],'').trim();
   const canonical=aliases.get(fold(name)),ex={nome:canonical||name,texto_original:line};
   if(currentRounds!=null)ex.series_ou_rounds=currentRounds;
   if(!canonical||canonical==='Bike'||canonical.includes(' / '))ex.revisar=true;
   if(unit==='m'||unit==='km')ex.distancia_m=n*(unit==='km'?1000:1);else if(["'",'min','minute','minutes'].includes(unit))ex.tempo_s=n*60;else if(["''",'"','s','sec','seg','second','seconds'].includes(unit))ex.tempo_s=n;else if(unit.startsWith('cal'))ex.calorias_maquina=n;else ex.reps=n;
   if(load){ex.carga_prescrita=Number(load[1].replace(',','.'));ex.carga_scaled=Number(load[2].replace(',','.'));ex.unidade=load[3].toLowerCase();}
   addExercise(ex);
  }
  result.wod_formato=formats.join(' · ')||null;result.observacoes=notes.join('\n');result.blocos=blocks.filter(b=>b.exercicios||b.tipo==='descanso');return result;
 };
 if(typeof root.crossfitExercicioRowHtml==='function'){
  const original=root.crossfitExercicioRowHtml;
  root.crossfitExercicioRowHtml=function(ex={}){
   const copy={...ex,nome:root.escapeHtml(ex.nome||'')};let html=original(copy);
   const kind=ex.tempo_s!=null?'tempo_s':ex.distancia_m!=null?'distancia_m':ex.calorias_maquina!=null?'calorias_maquina':'reps';
   html=html.replace(/<label>Reps<\/label>/,'<label>Quantidade</label>').replace(/class="cf-ex-reps" value="[^"]*"/,`class="cf-ex-reps" value="${ex[kind]??''}"`);
   html=html.replace('data-ex-row ',`data-ex-row data-bloco-id="${root.escapeHtml(ex.bloco_id||'')}" data-reps-esquema="${root.escapeHtml(ex.reps_esquema||'')}" data-unidade-prescrita="${ex.unidade === 'lb' ? 'lb' : ex.unidade === 'kg' ? 'kg' : ''}" data-texto-original="${root.escapeHtml(ex.texto_original||'')}" data-carga-scaled="${ex.carga_scaled??''}" data-calorias-alternativa="${ex.calorias_alternativa??''}" data-reps-maximas="${ex.reps_maximas?'1':''}" `);
   const select=`<div><label>Medida prescrita</label><select class="cf-ex-medida">${[['reps','Reps'],['distancia_m','Metros'],['tempo_s','Segundos'],['calorias_maquina','Cal da máquina']].map(([v,t])=>`<option value="${v}" ${v===kind?'selected':''}>${t}</option>`).join('')}</select></div>`;
   html=html.replace(/class="cf-ex-carga" value="[^"]*"/,`class="cf-ex-carga" value="${ex.carga_usada??''}"`);
   html=html.replace(/<div[^>]*><label>Séries<\/label><input[^>]*class="cf-ex-series"[^>]*><\/div>/,`<input type="hidden" class="cf-ex-series" value="${ex.series_ou_rounds??''}">`);
   html=html.replace(/<div[^>]*><label>Carga/,select+'<div style="width:76px;flex:none;"><label>Carga');
   const loadUnit=ex.carga_usada!=null?ex.unidade||'':'';
   html=html.replace(/<label>Unidade<\/label><select class="cf-ex-unidade">[\s\S]*?<\/select>/,`<label>Unidade da carga</label><select class="cf-ex-unidade"><option value="" ${!loadUnit?'selected':''}>Sem carga</option><option value="kg" ${loadUnit==='kg'?'selected':''}>kg</option><option value="lb" ${loadUnit==='lb'?'selected':''}>lb</option></select>`);
   html=html.replace('align-items:flex-end;gap:6px;','align-items:flex-end;gap:6px;flex-wrap:wrap;');
   html=html.replace('<button type="button" class="ex-remove-btn"',`<div style="width:130px;flex:none;"><label>Quantidade total que fiz (opcional)</label><input type="number" min="0" step="any" class="cf-ex-actual" value="${Number.isFinite(Number(ex.quantidade_realizada))&&ex.quantidade_realizada!==''&&ex.quantidade_realizada!=null?Number(ex.quantidade_realizada):''}" placeholder="${kind==='reps'?'Repetições':kind==='distancia_m'?'Metros':kind==='tempo_s'?'Segundos':'Cal da máquina'}"></div><button type="button" class="ex-remove-btn"`);
   const performed=root.escapeHtml(ex.nome_realizado||'');
   const adaptation=`<details class="cf-ex-adaptation" ${performed?'open':''}><summary>Adaptei este movimento</summary><label>O que eu fiz</label><input type="text" class="cf-ex-performed" value="${performed}" placeholder="Ex.: Ring Row no lugar de Pull Up"></details>`;
   html=html.replace('<button type="button" class="ex-remove-btn"',adaptation+'<button type="button" class="ex-remove-btn"');
   const hint=ex.calorias_alternativa!=null?'Confirme a máquina e se a meta é '+ex.calorias_maquina+' ou '+ex.calorias_alternativa+' calorias.':ex.reps_maximas?'Máximo de repetições no intervalo; informe o resultado realizado depois.':ex.revisar?'Confira o nome do exercício. Para Bike, confirme se foi Air Bike ou BikeErg.':'';
   return html+(hint?`<div class="muted">${hint}</div>`:'');
  };
  const review=root.renderCrossfitPrintReview;
  root.renderCrossfitPrintReview=function(data,opts){
   review(data,opts);
   const panel=root.document.getElementById('crossfit-print-review');panel.dataset.textoOriginal=data.texto_original||'';
   panel.dataset.blocos=JSON.stringify(data.blocos||[]);
   if(data.blocos?.length>1){
    const details=root.document.createElement('details');details.className='cf-block-list';
    const summary=root.document.createElement('summary');summary.textContent='Partes do WOD · '+data.blocos.length;details.append(summary);
    for(const block of data.blocos){const line=root.document.createElement('div');line.className='cf-block-item';line.textContent=block.titulo+(block.time_cap?' · '+block.time_cap:'');details.append(line);}
    panel.querySelector('#crossfit-print-exercicios')?.before(details);
   }
   const guides=[...new Map((data.exercicios||[]).map(ex=>root.crossfitMovementGuide(ex.nome)).filter(Boolean).map(item=>[item.label,item])).values()];
   if((data.exercicios||[]).length){const details=root.document.createElement('details');details.className='cf-guide-list';const summary=root.document.createElement('summary');summary.textContent='Exercícios, dicas e preparo opcional';details.append(summary);
    const seen=new Set();
    for(const ex of data.exercicios){if(seen.has(ex.nome))continue;seen.add(ex.nome);const item=root.document.createElement('p');const strong=root.document.createElement('strong');strong.textContent=ex.nome+': ';const info=root.crossfitMovementInfo(ex.nome);const description=info?`${info.familia} · ${info.equipamento} · medida: ${measureFor(ex)}. ${info.atencao}${info.adaptacoes.length?' Se você adaptou, opções para escolher manualmente: '+info.adaptacoes.join(', ')+'.':''}`:equipmentFor(ex.nome)+' · medida: '+measureFor(ex);item.append(strong,root.document.createTextNode(description));details.append(item);}
    for(const guide of guides){const item=root.document.createElement('p');const strong=root.document.createElement('strong');strong.textContent=guide.label+': ';item.append(strong,root.document.createTextNode(guide.tip+' '+guide.warmup));details.append(item);}
    panel.querySelector('#crossfit-print-exercicios')?.before(details);
   }
   const names=root.crossfitMovementNames||[];
   const bindInput=input=>{
    if(input.dataset.suggestionsBound)return;input.dataset.suggestionsBound='1';
    input.removeAttribute('list');
    const box=root.document.createElement('div');box.className='cf-ex-suggestions';box.hidden=true;
    input.parentElement.style.position='relative';input.before(box);
    const close=()=>{box.hidden=true;box.replaceChildren();};
    const show=()=>{
     const query=input.value.trim().toLocaleLowerCase('pt-BR');box.replaceChildren();
     if(!query){close();return;}
     const matches=names.filter(name=>name.toLocaleLowerCase('pt-BR').includes(query)&&name.toLocaleLowerCase('pt-BR')!==query).slice(0,8);
     for(const name of matches){const choice=root.document.createElement('button');choice.type='button';choice.textContent=name;choice.addEventListener('pointerdown',event=>event.preventDefault());choice.addEventListener('click',()=>{input.value=name;input.dispatchEvent(new Event('input',{bubbles:true}));close();input.focus();});box.append(choice);}
     box.hidden=!matches.length;
    };
    input.addEventListener('input',show);input.addEventListener('focus',show);input.addEventListener('blur',()=>setTimeout(close,180));
   };
   panel.querySelectorAll('.cf-ex-nome,.cf-ex-performed').forEach(bindInput);
   panel.addEventListener('focusin',event=>{const input=event.target;if(input.matches?.('.cf-ex-nome,.cf-ex-performed')&&!input.dataset.suggestionsBound){bindInput(input);input.dispatchEvent(new Event('focus'));}});
   const uncertain=(data.exercicios||[]).map((ex,index)=>({ex,index})).filter(({ex})=>ex.revisar);
   for(const {index} of uncertain){const row=panel.querySelectorAll('[data-ex-row]')[index];if(row){row.classList.add('cf-needs-review');row.insertAdjacentHTML('afterbegin','<strong class="cf-review-label">Confira este movimento</strong>');}}
   const unread=String(data.observacoes||'').split('\n').filter(line=>/^Revisar:\s*/i.test(line));
   if(!uncertain.length&&!unread.length)return;
   const box=root.document.createElement('div');box.id='crossfit-reading-review';box.className='cf-reading-review';
   const title=root.document.createElement('strong');title.textContent=`Confira ${uncertain.length+unread.length} item(ns) da leitura`;box.append(title);
   const intro=root.document.createElement('p');intro.textContent='O restante do WOD foi mantido. Corrija só os itens destacados antes de salvar.';box.append(intro);
   for(const line of unread){const row=root.document.createElement('div');row.className='cf-unread-line';const label=root.document.createElement('span');label.textContent=line.replace(/^Revisar:\s*/i,'');row.append(label);const button=root.document.createElement('button');button.type='button';button.textContent='Adicionar como exercício';button.addEventListener('click',()=>{root.addCrossfitExercicioRow();const last=panel.querySelector('[data-ex-row]:last-child .cf-ex-nome');if(last)last.value=label.textContent;row.remove();});row.append(button);box.append(row);}
   panel.querySelector('#crossfit-print-exercicios')?.before(box);
  };
 }
})(globalThis);
