(function(root,factory){
 const api=factory(root);
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.ForjaMuscleMap=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
 'use strict';
 const anatomy=root.ForjaMuscleAnatomy||(typeof module==='object'&&module.exports?require('./muscle-anatomy-data.js'):null);
 const completedCrossfit=root.ForjaCrossfitStatus||(typeof module==='object'&&module.exports?require('./crossfit-status.js'):null);
 const anatomyGroups={TRAPEZIUS:'trapezio',CHEST:'peito',SHOULDERS_FRONT:'ombros',SHOULDERS_SIDE:'ombros',SHOULDERS_REAR:'ombros',BICEPS:'biceps',TRICEPS:'triceps',FOREARMS:'antebracos',CORE:'abdomen',OBLIQUES:'abdomen',QUADS:'quadriceps',ADDUCTORS:'adutores',ABDUCTORS:'abdutores',CALVES:'panturrilhas',LATS:'dorsais',RHOMBOIDS:'dorsais',BACK_LOWER:'lombar',GLUTES:'gluteos',HAMSTRINGS:'posteriores'};
 const anatomyNames={TRAPEZIUS:'Trapézio',CHEST:'Peitoral',SHOULDERS_FRONT:'Deltoide anterior',SHOULDERS_SIDE:'Deltoide lateral',SHOULDERS_REAR:'Deltoide posterior',BICEPS:'Bíceps',TRICEPS:'Tríceps',FOREARMS:'Antebraço',CORE:'Abdômen',OBLIQUES:'Oblíquos',QUADS:'Quadríceps',ADDUCTORS:'Adutores',ABDUCTORS:'Abdutores',CALVES:'Panturrilha',LATS:'Grande dorsal',RHOMBOIDS:'Romboides',BACK_LOWER:'Lombar',GLUTES:'Glúteos',HAMSTRINGS:'Posteriores da coxa'};
 const names={peito:'Peito',ombros:'Ombros',biceps:'Bíceps',triceps:'Tríceps',antebracos:'Antebraços',abdomen:'Abdômen',quadriceps:'Quadríceps',adutores:'Adutores',abdutores:'Abdutores',panturrilhas:'Panturrilhas',trapezio:'Trapézio',dorsais:'Costas',lombar:'Lombar',gluteos:'Glúteos',posteriores:'Posteriores da coxa'};
 const blank=()=>Object.fromEntries(Object.keys(names).map(key=>[key,0]));
 const add=(scores,weights)=>{for(const [key,value] of Object.entries(weights))scores[key]+=value;};
 const run={quadriceps:2,panturrilhas:2,gluteos:1.6,posteriores:1.4,abdomen:.5};
 const swim={dorsais:2,ombros:2,peito:1,biceps:.7,triceps:1.1,abdomen:1.2,gluteos:.6,quadriceps:.6,panturrilhas:.5};
 const gymGroups={peito:'peito',ombros:'ombros',biceps:'biceps',triceps:'triceps',abdomen:'abdomen',quadriceps:'quadriceps',panturrilhas:'panturrilhas',trapezio:'trapezio',costas:'dorsais',lombar:'lombar',gluteos:'gluteos',posterior:'posteriores',adutores:'adutores',abdutores:'abdutores',antebracos:'antebracos'};
 const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 function gymMuscle(entry){
  const catalog=root.ForjaGymTraining?.EXERCISES||(typeof module==='object'&&module.exports?require('./gym-training.js').EXERCISES:[]);
  const group=entry.muscle||catalog.find(row=>normalize(row.name)===normalize(entry.exercise))?.muscle;
  return gymGroups[normalize(group)]||null;
 }
 const rules=[
  [/\b(?:devil press(?:es)?|devils? press)\b/i,{quadriceps:1.5,gluteos:1.5,posteriores:1.3,ombros:1.8,peito:1.2,triceps:1.2,abdomen:.9}],
  [/\b(?:wall ball|arremesso de bola na parede)\b/i,{quadriceps:1.8,gluteos:1.5,ombros:1.4,triceps:.5,abdomen:.7}],
  [/\b(?:kettlebell|kb|peso russo).*(?:swing|balanco)|\b(?:swing|balanco).*(?:kettlebell|kb|peso russo)/i,{posteriores:1.7,gluteos:1.8,ombros:.9,abdomen:.8}],
  [/\b(?:toes.to.bar|ttb|joelhos.ao.peito|knee.raise|ghd sit.up)\b/i,{abdomen:2,antebracos:.7,dorsais:.5}],
  [/\b(?:wall walk|caminhada na parede)\b/i,{ombros:2,triceps:1.1,abdomen:1.2,peito:.5}],
  [/^(?:row(?:erg)?|rowing|remo)\b/i,{quadriceps:1.5,gluteos:1.2,posteriores:.8,dorsais:1.5,biceps:1,abdomen:.7}],
  [/^ski(?:\s*erg)?\b/i,{dorsais:2,ombros:1,triceps:1.2,abdomen:1.1,gluteos:.3,quadriceps:.2}],
  [/^(?:(?:air|echo|assault|fan)\s*)?bike(?:erg)?\b/i,{quadriceps:2,gluteos:1.2,posteriores:.8,panturrilhas:.7,ombros:.35,triceps:.25}],
  [/\b(?:run|corrida|sprint|shuttle)\b/i,run],
  [/\b(?:squat|agachamento|lunge|avanco|step.over|step.up|pistol)\b/i,{quadriceps:2,gluteos:1.7,posteriores:.7,abdomen:.8}],
  [/\b(?:deadlift|terra|good morning|hip thrust)\b/i,{posteriores:2,gluteos:2,lombar:1,quadriceps:.5}],
  [/\b(?:clean|snatch|thruster|jerk)\b/i,{quadriceps:1.5,gluteos:1.5,posteriores:1,ombros:1.5,dorsais:.7,abdomen:.8}],
  [/\b(?:pull.up|chin.up|muscle.up|ring row|rope climb|chest.to.bar)\b/i,{dorsais:2,biceps:1.4,ombros:.8,abdomen:.7}],
  [/\b(?:push.up|press|handstand|dip)\b/i,{peito:1.3,ombros:1.8,triceps:1.6,abdomen:.5}],
  [/\b(?:burpee|box jump|broad jump|double under|saltos duplos|salto na caixa)\b/i,{quadriceps:1.4,gluteos:1,panturrilhas:1.5,peito:.7,ombros:.6}],
  [/\b(?:sit.up|plank|hollow|v.up|l.sit|ab wheel)\b/i,{abdomen:2,lombar:.5}],
  [/\b(?:carry|farmer|sandbag|turkish get.up)\b/i,{trapezio:1.2,ombros:1,gluteos:1,quadriceps:1,abdomen:1.3}]
 ];
 function movementWeights(name){const text=normalize(name),weights={};for(const [pattern,group] of rules)if(pattern.test(text))for(const [key,value] of Object.entries(group))weights[key]=Math.max(weights[key]||0,value);return Object.keys(weights).length?weights:null;}
 const positive=value=>Number.isFinite(Number(value))&&Number(value)>0?Number(value):0;
 function movementDose(exercise,workout){
  const hasActual=exercise.quantidade_realizada!==undefined&&exercise.quantidade_realizada!==null||exercise.reps_realizadas!==undefined&&exercise.reps_realizadas!==null;
  if(hasActual){const actual=positive(exercise.quantidade_realizada??exercise.reps_realizadas),benchmark=exercise.distancia_m!=null?200:exercise.tempo_s!=null?60:exercise.calorias_maquina!=null?15:8;return actual?Math.min(2.6,1+Math.log2(1+actual/benchmark)*.45):0;}
  if(exercise.reps_maximas)return 1;
  const format=normalize(workout.wod_formato),amrap=/\bamrap\b/.test(format);
  const trainingBlocks=(workout.blocos||[]).filter(block=>block.tipo!=='descanso').length;
  const completedRounds=trainingBlocks>1?0:positive(workout.resultScore?.rounds);
  const fixedRounds=!amrap&&positive(workout.resultScore?.seconds)?Math.min(positive(exercise.series_ou_rounds),30):0;
  const rounds=amrap?Math.min(completedRounds,30):fixedRounds;
  const oldScheme=String(exercise.texto_original||'').match(/^\s*(\d+(?:\s*-\s*\d+){1,8})\s*\./)?.[1];
  const scheme=String(exercise.reps_esquema||oldScheme||'').match(/\d+/g)?.map(Number);
  const reps=scheme?.length?scheme.reduce((sum,n)=>sum+n,0):positive(exercise.reps);
  const volume=reps*(scheme?.length?1:rounds||1);
  if(volume)return Math.min(2.6,1+Math.log2(1+volume/8)*.45);
  const distance=positive(exercise.distancia_m),seconds=positive(exercise.tempo_s),machine=positive(exercise.calorias_maquina);
  const equivalent=distance/100+seconds/45+machine/8;
  return equivalent?Math.min(2.3,1+Math.log2(1+equivalent)*.25):1;
 }
 function scoreDay({corrida=[],natacao=[],crossfit=[],academia=[]}={}){
  const scores=blank(),sources={corrida:0,natacao:0,crossfit:0,academia:0};let unknownCrossfit=0,unknownCrossfitMovements=0,crossfitMovements=0;
  for(const row of corrida){if(!row)continue;sources.corrida++;add(scores,run);}
  for(const row of natacao){if(!row)continue;sources.natacao++;add(scores,swim);}
  for(const row of crossfit){if(!completedCrossfit?.completed(row))continue;sources.crossfit++;let recognized=false;
   for(const exercise of row.exercicios||[]){const name=String(exercise?.nome_realizado||exercise?.nome||'').trim();if(!name)continue;crossfitMovements++;const weights=movementWeights(name);if(weights){recognized=true;const dose=movementDose(exercise,row);if(dose)add(scores,Object.fromEntries(Object.entries(weights).map(([muscle,weight])=>[muscle,weight*dose])));}else unknownCrossfitMovements++;}
   if(!recognized)unknownCrossfit++;
  }
  for(const session of academia){if(!session)continue;sources.academia++;
   for(const entry of session.entries||[]){const key=gymMuscle(entry);if(!key)continue;
    const work=(entry.sets||[]).filter(set=>set.type!=='aquecimento'&&Number(set.reps)>0).length;
    if(work)scores[key]+=Math.min(3,work)*.7;
   }
  }
  return {scores,sources,unknownCrossfit,unknownCrossfitMovements,crossfitMovements};
 }
 function colorForScore(score,max=3){if(!score)return '#69707a';const ratio=Math.min(1,score/Math.max(max,.01));return ratio<.4?'#f2c94c':ratio<.75?'#f17842':'#ef334e';}
 const silhouette='<path class="anatomy-outline" d="M83 72 Q72 75 61 83 Q54 87 51 101 L40 145 L30 191 Q27 203 31 212 L38 211 L48 186 L62 141 L66 126 L70 177 Q70 191 73 205 L76 231 Q71 253 73 278 L75 326 L78 376 Q79 384 87 385 L94 383 L97 322 L100 258 L103 322 L106 383 L113 385 Q121 384 122 376 L125 326 L127 278 Q129 253 124 231 L127 205 Q130 191 130 177 L134 126 L138 141 L152 186 L162 211 L169 212 Q173 203 170 191 L160 145 L149 101 Q146 87 139 83 Q128 75 117 72 L108 68 L92 68 Z" fill="#383c43" stroke="#8a9098" stroke-width="1.8"/><path d="M90 69 L89 58 Q78 49 79 31 Q80 10 100 8 Q120 10 121 31 Q122 49 111 58 L110 69" fill="#555a60" stroke="#8a9098" stroke-width="1.8"/><path d="M83 72 Q100 82 117 72" fill="none" stroke="#a6aab0" stroke-width="1.2"/>';
 const front=[
  ['ombros','M62 83 Q72 73 82 75 L79 94 Q73 101 58 103 Q54 94 62 83 Z'],['ombros','M118 75 Q128 73 138 83 Q146 94 142 103 Q127 101 121 94 Z'],
  ['peito','M82 78 Q91 79 99 85 L98 112 Q87 120 74 113 Q67 107 68 94 Z'],['peito','M101 85 Q109 79 118 78 L132 94 Q133 107 126 113 Q113 120 102 112 Z'],
  ['biceps','M56 104 Q67 102 70 110 L65 138 Q60 146 52 143 L47 137 Z'],['biceps','M130 110 Q133 102 144 104 L153 137 L148 143 Q140 146 135 138 Z'],
  ['biceps','M45 147 Q55 148 61 151 L51 182 L41 190 L35 186 Z'],['biceps','M139 151 Q145 148 155 147 L165 186 L159 190 L149 182 Z'],
  ['abdomen','M80 119 Q89 123 97 121 L97 140 Q86 144 78 139 Z'],['abdomen','M103 121 Q111 123 120 119 L122 139 Q114 144 103 140 Z'],
  ['abdomen','M78 143 Q87 146 97 144 L97 163 Q88 167 76 161 Z'],['abdomen','M103 144 Q113 146 122 143 L124 161 Q112 167 103 163 Z'],
  ['abdomen','M76 165 Q87 169 97 167 L97 189 Q84 189 74 179 Z'],['abdomen','M103 167 Q113 169 124 165 L126 179 Q116 189 103 189 Z'],
  ['quadriceps','M77 229 Q85 221 97 237 L95 272 Q92 300 86 321 L77 322 L74 279 Z'],['quadriceps','M103 237 Q115 221 123 229 L126 279 L123 322 L114 321 Q108 300 105 272 Z'],
  ['quadriceps','M78 232 Q87 232 93 253 L88 296 L80 305 Z'],['quadriceps','M122 232 Q113 232 107 253 L112 296 L120 305 Z'],
  ['panturrilhas','M79 330 Q88 329 94 338 L89 372 L80 374 Z'],['panturrilhas','M106 338 Q112 329 121 330 L120 374 L111 372 Z']
 ];
 const back=[
  ['trapezio','M86 72 Q100 84 114 72 L121 88 L102 112 L98 112 L79 88 Z'],
  ['ombros','M62 83 Q73 74 82 77 L78 99 L59 105 Q54 95 62 83 Z'],['ombros','M118 77 Q127 74 138 83 Q146 95 141 105 L122 99 Z'],
  ['triceps','M57 107 Q67 106 71 112 L64 141 L52 144 L47 136 Z'],['triceps','M129 112 Q133 106 143 107 L153 136 L148 144 L136 141 Z'],
  ['triceps','M46 148 L60 151 L51 185 L40 190 L35 184 Z'],['triceps','M140 151 L154 148 L165 184 L160 190 L149 185 Z'],
  ['dorsais','M79 91 Q87 106 97 117 L96 162 Q83 154 71 174 Q72 129 79 91 Z'],['dorsais','M121 91 Q113 106 103 117 L104 162 Q117 154 129 174 Q128 129 121 91 Z'],
  ['dorsais','M77 105 L95 126 L93 153 L74 162 Z'],['dorsais','M123 105 L105 126 L107 153 L126 162 Z'],
  ['lombar','M97 165 L103 165 L115 188 L100 204 L85 188 Z'],
  ['gluteos','M75 213 Q86 204 98 214 L98 241 Q85 251 74 241 Z'],['gluteos','M102 214 Q114 204 125 213 L126 241 Q115 251 102 241 Z'],
  ['posteriores','M76 249 Q87 250 97 244 L94 291 L86 322 L77 322 Z'],['posteriores','M103 244 Q113 250 124 249 L123 322 L114 322 L106 291 Z'],
  ['posteriores','M79 254 L91 252 L86 299 L79 307 Z'],['posteriores','M121 254 L109 252 L114 299 L121 307 Z'],
  ['panturrilhas','M79 330 Q90 327 95 339 L89 371 L80 374 Z'],['panturrilhas','M105 339 Q110 327 121 330 L120 374 L111 371 Z']
 ];
 const fibers='<path class="anatomy-fibers" d="M73 91 Q82 96 94 104 M70 99 Q83 109 97 113 M105 104 Q118 96 127 91 M103 113 Q117 109 130 99 M79 126 Q87 133 96 133 M104 133 Q113 133 121 126 M78 148 Q87 154 96 154 M104 154 Q113 154 122 148 M78 171 Q87 176 96 176 M104 176 Q113 176 122 171 M55 111 Q59 122 57 136 M145 111 Q141 122 143 136 M48 156 Q47 170 43 180 M152 156 Q153 170 157 180 M79 240 Q87 257 86 279 M93 247 Q92 270 88 294 M121 240 Q113 257 114 279 M107 247 Q108 270 112 294 M80 341 Q83 351 83 368 M91 338 Q90 354 87 370 M120 341 Q117 351 117 368 M109 338 Q110 354 113 370" fill="none" stroke="#f3f0eb" stroke-opacity=".34" stroke-width="1" stroke-linecap="round"/>';
 const landmarks={
  front:'M89 31 Q93 28 97 31 M103 31 Q107 28 111 31 M100 33 L98 43 L102 43 M94 49 Q100 52 106 49 M84 57 Q100 65 116 57 M100 80 L100 202 M75 193 Q85 204 100 205 Q115 204 125 193 M78 221 Q90 215 98 225 M102 225 Q110 215 122 221 M31 196 L36 193 M32 201 L37 199 M33 206 L38 205 M169 196 L164 193 M168 201 L163 199 M167 206 L162 205 M79 379 Q85 382 93 380 M107 380 Q115 382 121 379',
  back:'M100 78 L100 204 M94 89 Q89 100 86 116 M106 89 Q111 100 114 116 M77 124 Q85 136 93 142 M123 124 Q115 136 107 142 M79 165 Q87 174 94 178 M121 165 Q113 174 106 178 M76 217 Q88 210 98 219 M102 219 Q112 210 124 217 M31 196 L36 193 M32 201 L37 199 M33 206 L38 205 M169 196 L164 193 M168 201 L163 199 M167 206 L162 205 M80 378 Q88 381 94 378 M106 378 Q112 381 120 378'
 };
 function svg(view,scores,max){
  if(anatomy?.[view]){
   const data=anatomy[view],id='anatomy-'+view;
   const outline=data.outline.map(part=>'<path d="'+part.d+'"'+(part.side==='LEFT'?' transform="translate(1024 0) scale(-1 1)"':'')+'/>').join('');
   const shapes=data.muscles.map(part=>{
    const key=anatomyGroups[part.group],color=colorForScore(scores[key]||0,max),title=anatomyNames[part.group]||part.group;
    const path='<path d="'+part.d+'" fill="'+color+'" fill-opacity="'+(scores[key]?'.74':'.43')+'" stroke="#282c32" stroke-opacity=".4" stroke-width="1.7" data-muscle="'+(key||'outro')+'" data-region="'+part.group+'"><title>'+title+'</title></path>';
    return '<g'+(part.side==='LEFT'?' transform="translate(1024 0) scale(-1 1)"':'')+'>'+path+'</g>';
   }).join('');
   return '<svg viewBox="0 0 1024 1536" role="img" aria-label="Corpo de '+(view==='front'?'frente':'costas')+' com regiões musculares destacadas"><defs><clipPath id="'+id+'">'+outline+'</clipPath></defs><g clip-path="url(#'+id+')"><image href="assets/muscle-'+view+'.webp" x="0" y="0" width="1024" height="1536" preserveAspectRatio="none" style="filter:grayscale(1) brightness(.78)"/></g>'+shapes+'</svg>';
  }
  const shapes=(view==='front'?front:back).map(([key,d])=>'<path d="'+d+'" fill="'+colorForScore(scores[key],max)+'" stroke="#242931" stroke-width="1.25" stroke-linejoin="round" data-muscle="'+key+'"><title>'+names[key]+'</title></path>').join('');return '<svg viewBox="20 0 160 395" role="img" aria-label="Corpo de '+(view==='front'?'frente':'costas')+' com grupos musculares destacados">'+silhouette+shapes+fibers+'<path class="anatomy-landmarks" d="'+landmarks[view]+'" fill="none" stroke="#ebe8e2" stroke-opacity=".38" stroke-width=".8" stroke-linecap="round"/></svg>';
 }
 function html(result){const scores=result.scores,max=Math.max(...Object.values(scores),0),top=Object.entries(scores).filter(([,value])=>value>0).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([key])=>names[key]);
  return '<div class="muscle-map-views"><figure><figcaption>Frente</figcaption>'+svg('front',scores,max)+'</figure><figure><figcaption>Costas</figcaption>'+svg('back',scores,max)+'</figure></div><div class="muscle-map-legend"><span><i class="idle"></i> Sem indicação</span><span><i class="medium"></i> Participação</span><span><i class="high"></i> Maior destaque</span></div><p class="calc-formula-note">'+(top.length?'Destaques: '+top.join(' · '):'Sem treino detalhado neste dia.')+(result.crossfitMovements?' · CrossFit: '+(result.crossfitMovements-result.unknownCrossfitMovements)+' de '+result.crossfitMovements+' movimentos reconhecidos.':'')+(result.unknownCrossfitMovements?' · '+result.unknownCrossfitMovements+' movimento(s) de CrossFit sem grupo identificado.':'')+(result.unknownCrossfit?' · '+result.unknownCrossfit+' treino(s) de CrossFit sem movimentos identificados.':'')+' Estimativa baseada nos movimentos e no volume registrado; não mede a ativação muscular real.</p>';
 }
 function exampleHtml(){return '<p class="calc-formula-note"><strong>Exemplo visual — Dados fictícios.</strong> Toque em um dia do calendário para voltar aos seus dados.</p>'+html(scoreDay({corrida:[{}],natacao:[{}],crossfit:[{duracao_s:1200,exercicios:[{nome:'Strict Pull Up'},{nome:'Front Squat'}]}]}));}
 function showExample(){const target=root.document?.getElementById('progress-muscle-map');if(!target)return;requestId++;target.innerHTML=exampleHtml();}
 let requestId=0;
 async function render(date){const target=root.document?.getElementById('progress-muscle-map');if(!target)return;const id=++requestId;target.textContent='Carregando mapa muscular...';
  try{const db=root.ForjaDB||(root.claude?await root.claude.use('db'):null);
   const entries=await Promise.all([...[['corrida','corridas'],['natacao','natacao'],['crossfit','crossfit']].map(async([sport,key])=>{try{const snap=await db?.collection(key).get();return [sport,snap?.docs.map(doc=>doc.data()).filter(row=>row.data===date)||[]];}catch{return [sport,[]];}}), (async()=>{try{const row=await(root.ForjaStorage||root.storage)?.get('gym-sessions-v1');return ['academia',(row?.value?JSON.parse(row.value):[]).filter(session=>session.date===date)];}catch{return ['academia',[]];}})()]);
   if(id!==requestId)return;target.innerHTML=html(scoreDay(Object.fromEntries(entries)));
  }catch{if(id===requestId)target.textContent='Não foi possível carregar o mapa muscular agora.';}
 }
 return {scoreDay,movementWeights,movementDose,colorForScore,html,exampleHtml,showExample,render};
});
