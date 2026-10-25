(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.ForjaGymExerciseGuide=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
 'use strict';
 let rows=root.ForjaGymGuideData||(typeof module==='object'&&module.exports?require('./gym-guide-data.js'):[]);
 const clean=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'');
 let byName=new Map(rows.map(row=>[clean(row.name),row]));
 let byId=new Map(rows.map(row=>[row.id,row]));
 let loading;
 async function ensureLoaded(){
  if(typeof module==='object'&&module.exports){root.ForjaGymInstructionsPt||=require('./gym-instructions-pt.js');return;}
  if(rows.length&&root.ForjaGymInstructionsPt)return;
  if(!root.document)throw Error('Biblioteca de exercícios indisponível.');
  if(!loading)loading=(async()=>{
   const fetchScript=src=>new Promise((resolve,reject)=>{const script=root.document.createElement('script');script.src=src;script.onload=resolve;script.onerror=()=>reject(Error('Não foi possível carregar as demonstrações de exercícios.'));root.document.head.append(script);});
   if(!rows.length)await fetchScript('gym-guide-data.js?v=20261006-catalog');
   if(!root.ForjaGymInstructionsPt)await fetchScript('gym-instructions-pt.js?v=20261002-pt');
   rows=root.ForjaGymGuideData||[];byName=new Map(rows.map(row=>[clean(row.name),row]));byId=new Map(rows.map(row=>[row.id,row]));
   if(!rows.length)throw Error('A biblioteca de exercícios está vazia.');
  })().catch(error=>{loading=null;throw error;});
  return loading;
 }
 const aliases={
  'Abs wheel rollout':'Ab_Roller','Dumbbell Lateral Raise':'Side_Lateral_Raise','Machine Pec Fly':'Butterfly',
  'Pull Up':'Pullups','Push Up':'Pushups','Squat':'Bodyweight_Squat','Upright Row':'Upright_Barbell_Row',
  'Supino reto':'Barbell_Bench_Press_-_Medium_Grip','Supino inclinado':'Incline_Dumbbell_Press','Crucifixo':'Dumbbell_Flyes',
  'Crossover':'Cable_Crossover','Flexão de braços':'Pushups','Remada baixa':'Seated_Cable_Rows','Remada curvada':'Bent_Over_Barbell_Row',
  'Puxada frontal':'Wide-Grip_Lat_Pulldown','Barra fixa':'Pullups','Desenvolvimento':'Dumbbell_Shoulder_Press',
  'Elevação lateral':'Side_Lateral_Raise','Rosca direta':'Barbell_Curl','Rosca alternada':'Alternate_Incline_Dumbbell_Curl',
  'Tríceps corda':'Triceps_Pushdown_-_Rope_Attachment','Tríceps francês':'Seated_Triceps_Press','Agachamento livre':'Barbell_Squat','Leg press':'Leg_Press',
  'Cadeira extensora':'Leg_Extensions','Avanço':'Dumbbell_Lunges','Levantamento terra':'Barbell_Deadlift',
  'Stiff':'Stiff-Legged_Barbell_Deadlift','Mesa flexora':'Lying_Leg_Curls','Elevação pélvica':'Barbell_Hip_Thrust',
  'Panturrilha em pé':'Standing_Calf_Raises','Abdominal crunch':'Crunches','Prancha':'Plank'
 };
 const normalizedAliases=new Map(Object.entries(aliases).map(([name,id])=>[clean(name),id]));
 const equipment={machine:'maquina',cable:'polia',barbell:'barra',dumbbell:'halteres',bodyonly:'pesocorporal',bodyweight:'pesocorporal',kettlebells:'kettlebell',bands:'elastico',ezcurlbar:'barraw',foamroll:'rolodeliberacao',exerciseball:'bolasuica',medicineball:'bolamedicinal',other:'outro'};
 const muscles={quadriceps:'Quadríceps',hamstrings:'Posteriores da coxa',glutes:'Glúteos',calves:'Panturrilhas',chest:'Peito',pectorals:'Peito',lats:'Costas',middleback:'Costas',lowerback:'Lombar',shoulders:'Ombros',biceps:'Bíceps',triceps:'Tríceps',abdominals:'Abdômen',forearms:'Antebraços',traps:'Trapézio',adductors:'Adutores',abductors:'Abdutores',neck:'Pescoço'};
 const tips={
  Kettlebell_Halo:['Fique em pé com os pés na largura do quadril. Segure o kettlebell pelas alças, próximo ao peito, e estabilize o tronco.','Passe o kettlebell lentamente ao redor da cabeça, mantendo os cotovelos próximos e evitando movimentar a lombar.','Complete as voltas em um sentido e repita a mesma quantidade no sentido oposto. Reduza a carga se perder o controle.'],
  Kettlebell_Halo_With_Overhead_Extension:['Segure o kettlebell pelas alças próximo ao peito e mantenha o tronco estável.','Faça meia volta ao redor da cabeça até deixar o kettlebell atrás dela; então estenda os cotovelos acima da cabeça.','Volte com controle à posição atrás da cabeça e complete o círculo até o peito. Alterne o sentido a cada repetição.'],
  Kettlebell_Overhead_Triceps_Extension:['Segure o kettlebell com as duas mãos acima da cabeça, mantendo os braços próximos e o abdômen firme.','Flexione os cotovelos para descer o kettlebell atrás da cabeça até uma amplitude confortável.','Estenda os cotovelos sem arquear a lombar e retorne à posição inicial.'],
  Leg_Press:['Ajuste o banco e posicione os pés na plataforma, aproximadamente na largura dos ombros.','Flexione os joelhos de forma controlada, mantendo costas e quadris apoiados.','Empurre a plataforma sem travar completamente os joelhos.'],
  'Barbell_Bench_Press_-_Medium_Grip':['Deite no banco com os pés firmes no chão e segure a barra um pouco além da largura dos ombros.','Desça a barra com controle até a linha do peito.','Empurre de volta, mantendo ombros estáveis e quadris no banco.'],
  Leg_Extensions:['Ajuste o encosto e o apoio sobre a parte inferior das pernas.','Estenda os joelhos de forma controlada.','Volte lentamente sem soltar o peso de uma vez.'],
  Lying_Leg_Curls:['Deite na máquina e ajuste o apoio próximo aos tornozelos.','Flexione os joelhos trazendo o apoio em direção aos glúteos.','Retorne devagar, sem tirar o quadril do banco.'],
  Seated_Cable_Rows:['Apoie os pés e mantenha o tronco estável.','Puxe a pegada em direção ao abdômen, aproximando as escápulas.','Estenda os braços de forma controlada, sem arredondar excessivamente as costas.'],
  Machine_Bench_Press:['Ajuste o banco para deixar as pegadas próximas da altura do peito.','Empurre as pegadas à frente, mantendo as costas apoiadas.','Retorne devagar até uma amplitude confortável.'],
  'Wide-Grip_Lat_Pulldown':['Ajuste o apoio das coxas e segure a barra com pegada aberta.','Puxe a barra em direção à parte alta do peito, levando os cotovelos para baixo.','Suba de forma controlada sem jogar o tronco para trás.'],
  'Seated_Triceps_Press':['Sente-se com as costas apoiadas e segure um halter acima da cabeça.','Flexione os cotovelos para baixar o halter atrás da cabeça, mantendo os braços próximos.','Estenda os cotovelos de forma controlada.'],
  'Triceps_Pushdown_-_Rope_Attachment':['Ajuste a corda na polia alta e mantenha os cotovelos próximos ao tronco.','Estenda os cotovelos puxando a corda para baixo.','Volte de forma controlada sem balançar o corpo.'],
  'Barbell_Squat':['Posicione a barra com firmeza sobre a parte alta das costas e mantenha os pés estáveis.','Flexione quadris e joelhos de forma controlada, mantendo o tronco firme.','Suba empurrando o chão, sem deixar os joelhos colapsarem para dentro.'],
  Incline_Dumbbell_Press:['Ajuste o banco inclinado e mantenha os pés apoiados.','Desça os halteres com controle ao lado do peito.','Empurre para cima sem bater os halteres.'],
  Dumbbell_Flyes:['Deite no banco e mantenha uma leve flexão nos cotovelos.','Abra os braços até uma amplitude confortável.','Aproxime os halteres de forma controlada, sem transformar o movimento em supino.'],
  Cable_Crossover:['Ajuste as polias e avance um pé para estabilizar o corpo.','Traga as mãos à frente do tronco, mantendo os cotovelos levemente flexionados.','Retorne devagar sem deixar os ombros perderem estabilidade.'],
  Bent_Over_Barbell_Row:['Incline o tronco com quadris para trás e coluna estável.','Puxe a barra em direção ao abdômen, levando os cotovelos para trás.','Desça a barra com controle sem balançar o tronco.'],
  Dumbbell_Shoulder_Press:['Sente-se ou fique em pé com o tronco estável e halteres à altura dos ombros.','Empurre os halteres para cima de forma controlada.','Retorne à altura dos ombros sem perder a postura.'],
  Side_Lateral_Raise:['Mantenha os cotovelos levemente flexionados e o tronco estável.','Eleve os braços lateralmente até uma amplitude confortável.','Desça devagar, sem usar impulso.'],
  Barbell_Curl:['Segure a barra com as palmas para cima e cotovelos próximos ao tronco.','Flexione os cotovelos sem balançar o corpo.','Desça a barra de forma controlada.'],
  Dumbbell_Lunges:['Dê um passo e mantenha o tronco estável.','Flexione os joelhos até uma amplitude confortável.','Empurre o chão para retornar, controlando o equilíbrio.'],
  Barbell_Deadlift:['Posicione a barra próxima às pernas e mantenha a coluna estável.','Estenda quadris e joelhos para levantar a barra, mantendo-a perto do corpo.','Retorne com controle, levando primeiro os quadris para trás.'],
  Crunches:['Deite de costas, flexione os joelhos e mantenha os pés apoiados.','Eleve o tronco com a contração do abdômen, sem puxar a cabeça.','Retorne devagar ao chão.']
 };
 function find(exercise){const name=String(exercise?.name||''),id=exercise?.sourceId||normalizedAliases.get(clean(name));const row=id?byId.get(id):byName.get(clean(name));if(!row)return null;
  const requested=clean(exercise?.equipment),source=clean(equipment[clean(row.equipment)]||row.equipment);
  if(!exercise?.sourceId&&requested&&source&&requested!==source&&!(clean(name)===clean('Remada baixa')&&requested==='maquina'&&source==='polia'))return null;
  const translated=root.ForjaGymInstructionsPt||(typeof module==='object'&&module.exports?require('./gym-instructions-pt.js'):{});
  return {sourceId:row.id,name,primary:(row.primary||[]).map(x=>muscles[clean(x)]||x),secondary:(row.secondary||[]).map(x=>muscles[clean(x)]||x),equipment:exercise.equipment||row.equipment,
   instructions:tips[row.id]||translated[row.id]||[],originalInstructions:row.instructions||[],images:(row.images||[]).filter(path=>/^[a-zA-Z0-9_()\-./]+\.jpg$/.test(path)).map(path=>'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/'+path)};
 }
 return {find,ensureLoaded};
});
