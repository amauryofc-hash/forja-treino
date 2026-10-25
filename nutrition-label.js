(function(root){
 'use strict';
 const number=value=>Number(String(value).replace(',','.'));
 const fields=[['kcal',/valor\s+energ[eé]tico|calorias?/i],['carbs_g',/carboidratos?/i],['protein_g',/prote[ií]nas?/i],['fat_g',/gorduras?\s+totais|lip[ií]dios?/i]];
 function parse(text){
  const lines=String(text||'').split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  const result={basis:null,kcal:null,carbs_g:null,protein_g:null,fat_g:null,warnings:[]};
  const portion=lines.join(' ').match(/por[cç][aã]o\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*(g|ml)\b/i);
  if(portion)result.basis=number(portion[1]);
  const twoColumns=lines.some(line=>/100\s*(?:g|ml)\s*[|\/;,\s]+\s*\d+(?:[.,]\d+)?\s*(?:g|ml)\s*[|\/;,\s]*%?\s*vd/i.test(line));
  for(const [key,label] of fields){
   const line=lines.find(value=>label.test(value));if(!line)continue;
   const after=line.replace(label,'').replace(/^\s*\((?:kcal|g)\)/i,'');
   const values=[...after.matchAll(/(\d+(?:[.,]\d+)?)\s*(kcal|g|%|\b)/gi)].filter(match=>match[2]!=='%'&&match[2]!=='').map(match=>number(match[1]));
   // Unitless columns need the table header; otherwise their meaning is ambiguous.
   if(twoColumns){const all=[...after.matchAll(/\d+(?:[.,]\d+)?/g)].map(match=>number(match[0]));if(all.length>=2)result[key]=all[1];else result.warnings.push(key);}
   else if(values.length===1)result[key]=values[0];
   else if(values.length>1)result.warnings.push(key);
   else {const all=[...after.matchAll(/\d+(?:[.,]\d+)?/g)].map(match=>number(match[0]));if(all.length===1)result[key]=all[0];else if(all.length>1)result.warnings.push(key);}
  }
  return result;
 }
 root.ForjaNutritionLabel={parse};
})(globalThis);
