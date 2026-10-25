(function(root){
 'use strict';
 const macros=['protein_g','carbs_g','fat_g'];
 function parse(text){
  const raw=String(text||'').trim();
  const plain=raw.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[*_`#]/g,'');
  const num='(-?\\d[\\d.,]*\\d|-?\\d)';
  function numeric(raw){
   if(/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(raw))return Number(raw.replace(/\./g,'').replace(',','.'));
   if(/^\d{1,3}(?:,\d{3})+\.\d+$/.test(raw))return Number(raw.replace(/,/g,''));
   return Number(raw.replace(',','.'));
  }
  const labels={protein_g:'proteinas?(?:\\s+(?:total|totais))?',carbs_g:'(?:carboidratos?|carbos?)(?:\\s+(?:total|totais))?',fat_g:'(?:gorduras?|lipidios?)(?:\\s+(?:total|totais))?'};
  function values(expressions){
   const found=[];
   for(const re of expressions)for(const m of plain.matchAll(re)){const value=numeric(m[1]);if(Number.isFinite(value)&&value>=0)found.push(value);}
   return [...new Set(found)];
  }
  function extractKcal(){
   const explicit=values([
    new RegExp('\\b(?:calorias?(?:\\s+(?:total|totais))?|valor\\s+energetico|energia(?:\\s+total)?)\\s*(?:[:=|–-]\\s*)?'+num+'\\s*(?:kcal|cal)?\\b','gi'),
    new RegExp('(?:^|\\n)\\s*(?:[-•]\\s*)?total(?:\\s+(?:da refeicao|estimado|geral))?\\s*(?:[:=|–-]\\s*)?'+num+'\\s*kcal\\b','gi')
   ]);
   if(explicit.length===1)return explicit[0];
   const loose=values([new RegExp(num+'\\s*kcal\\b','gi')]);
   return loose.length===1?loose[0]:null;
  }
  function extractMacro(key){
   const label=labels[key],short={protein_g:'P',carbs_g:'C',fat_g:'G'}[key];
   const explicit=values([
    new RegExp('\\b'+label+'[ \\t]*(?:[:=|–-][ \\t]*)?'+num+'[ \\t]*g\\b','gi'),
    new RegExp(num+'[ \\t]*g[ \\t]*(?:de[ \\t]+)?'+label+'\\b','gi'),
    new RegExp('(?:^|[\\n;|])[ \\t]*'+short+'[ \\t]*[:=][ \\t]*'+num+'[ \\t]*g?\\b','gi')
   ]);
   return explicit.length===1?explicit[0]:null;
  }
  const value={items:[],note:'Valores informados ou estimados fora do aplicativo; conferidos pelo usuário.'};
  value.kcal=extractKcal();for(const key of macros)value[key]=extractMacro(key);
  const named=raw.match(/(?:^|\n)\s*(?:Alimentos\/produto|Alimentos|Produto|Descri[cç][aã]o)\s*:\s*(.+)/i);
  const quantity=raw.match(/(?:^|\n)\s*Quantidade considerada\s*:\s*(.+)/i);
  value.description=(named?named[1]+(quantity?' · '+quantity[1]:''):raw.split(/\n|[—]/)[0]).trim().slice(0,500);
  return value;
 }
 function validate(value){
  if(value.kcal===null||value.kcal===''||value.kcal===undefined||!Number.isFinite(Number(value.kcal))||Number(value.kcal)<0)throw Error('Preencha as calorias com um número igual ou maior que zero.');
  if(!String(value.description||'').trim())throw Error('Preencha a descrição da refeição.');
  for(const key of macros){if(value[key]===null||value[key]===undefined||value[key]===''){value[key]=null;continue;}if(!Number.isFinite(Number(value[key]))||Number(value[key])<0)throw Error('Use nutrientes positivos ou deixe em branco quando não souber.');}
  return value;
 }
 root.ForjaNutrition={parse,validate};
})(globalThis);
