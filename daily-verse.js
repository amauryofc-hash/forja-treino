(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.ForjaDailyVerse=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const VERSES=root.ForjaDailyVerses||(typeof require==='function'?require('./daily-verses-data.js'):null);
  const EPOCH=Date.UTC(2026,0,1)/86400000;
  function dateKey(date=new Date()){
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }
  function verseFor(date=new Date()){
    if(!Array.isArray(VERSES)||VERSES.length!==366)throw Error('Acervo de versículos incompleto');
    const day=Math.floor(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate())/86400000)-EPOCH;
    const [reference,text]=VERSES[((day%VERSES.length)+VERSES.length)%VERSES.length];
    return {date:dateKey(date),reference,text,source:'Almeida 1911'};
  }
  function render(date=new Date()){
    const text=root.document?.getElementById('quote-text-extra');
    const reference=root.document?.getElementById('quote-verse-reference');
    const status=root.document?.getElementById('home-sync-verse');
    if(!text||!reference)return;
    try{
      const verse=verseFor(date);
      text.textContent=verse.text;
      reference.textContent=`${verse.reference} · ${verse.source}`;
      if(status){status.textContent='Versículo: hoje';status.classList.remove('is-stale');}
    }catch{
      text.textContent='Versículo indisponível nesta instalação.';
      reference.textContent='Atualize o aplicativo para recuperar o acervo.';
      if(status){status.textContent='Versículo: indisponível';status.classList.add('is-stale');}
    }
  }
  return {dateKey,verseFor,render};
});
