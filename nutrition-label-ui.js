(function(root){
 'use strict';
 const el=id=>document.getElementById(id);
 function status(message){el('diet-custom-label-status').textContent=message;}
 const keys=['kcal','carbs_g','protein_g','fat_g'];
 const pretty=value=>Number(value).toLocaleString('pt-BR',{maximumFractionDigits:1});
 function preview(){
  const basis=Number(el('diet-custom-basis').value),quantity=Number(el('diet-custom-quantity').value),unit=el('diet-custom-unit').value||'g';
  const output=el('diet-label-summary');
  if(!Number.isFinite(basis)||basis<=0||!Number.isFinite(quantity)||quantity<=0){output.textContent='Informe a porção do rótulo e a quantidade consumida para ver o cálculo antes de adicionar.';return;}
  const kcal=Number(el('diet-custom-kcal').value);
  if(!el('diet-custom-kcal').value.trim()||!Number.isFinite(kcal)){output.textContent='Confira e informe as calorias do rótulo para ver o cálculo.';return;}
  const parts=[`${pretty(kcal*quantity/basis)} kcal`];
  for(const [key,label] of [['carbs_g','carboidratos'],['protein_g','proteínas'],['fat_g','gorduras']]){
   const raw=el('diet-custom-'+key).value;if(raw.trim()&&Number.isFinite(Number(raw)))parts.push(`${pretty(Number(raw)*quantity/basis)} g de ${label}`);
  }
  output.textContent=`Rótulo: ${pretty(basis)} ${unit} · Você consumiu: ${pretty(quantity)} ${unit} · Total calculado: ${parts.join(' · ')}. Confira antes de adicionar.`;
 }
 function flagReview(parsed){
  const required=['basis','kcal',...parsed.warnings.filter(key=>keys.includes(key))];let first=null;
  for(const key of ['basis',...keys]){
   const input=el('diet-custom-'+key),needs=required.includes(key)&&(key==='basis'?!parsed.basis:parsed[key]==null);
   input.classList.toggle('label-needs-review',needs);if(needs&&!first)first=input;
  }
  if(first)first.focus();
 }
 function apply(){
  const parsed=root.ForjaNutritionLabel.parse(el('diet-label-text').value);
  el('diet-custom-basis').value=parsed.basis||'';
  if(parsed.kcal==null)el('diet-custom-kcal').value='';
  let filled=0;
  for(const key of keys)if(parsed[key]!=null){el('diet-custom-'+key).value=parsed[key];filled++;}
  flagReview(parsed);preview();
  if(!filled){status('Não encontrei valores seguros. Os campos destacados precisam de preenchimento.');return;}
  status(`Preenchi ${filled} valor${filled===1?'':'es'}. ${parsed.warnings.length?'Algumas colunas ficaram ambíguas e precisam de conferência. ':''}${parsed.basis?'Confira a porção do rótulo e quanto você consumiu.':'Informe o tamanho da porção do rótulo antes de adicionar.'}`);
 }
 async function read(file){
  if(!file)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)){status('Escolha uma foto JPG, PNG ou WebP.');return;}
  const plugin=root.Capacitor?.Plugins?.NutritionLabel;
  if(!plugin){status('A leitura de foto fica disponível no APK Android atualizado. Você pode colar o texto do rótulo abaixo.');return;}
  status('Lendo a tabela nutricional no celular…');
  try{
   const bitmap=await root.createImageBitmap(file),canvas=document.createElement('canvas');
   const scale=Math.min(1,1800/Math.max(bitmap.width,bitmap.height));
   canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
   canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
   const image=canvas.toDataURL('image/jpeg',.85).split(',')[1];
   const result=await plugin.recognize({image});
   el('diet-label-text').value=result.text||'';
   if(!result.text?.trim()){status('Não consegui ler o texto. Tire outra foto, mais próxima e com boa luz.');return;}
   apply();
  }catch(error){status(error.message||'Não foi possível ler o rótulo. Cole o texto ou preencha manualmente.');}
  finally{el('diet-label-photo').value='';}
 }
 function init(){const input=el('diet-label-photo'),button=el('diet-label-parse');if(!input||!button)return;input.addEventListener('change',event=>read(event.target.files?.[0]));button.addEventListener('click',apply);for(const key of ['basis','quantity','unit',...keys])el('diet-custom-'+key).addEventListener('input',()=>{el('diet-custom-'+key).classList.remove('label-needs-review');preview();});preview();}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
 root.ForjaNutritionLabelUI={apply,read,preview};
})(globalThis);
