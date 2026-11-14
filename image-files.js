(function(root){
  'use strict';
  let decoderPromise;
  async function kind(file){
    const bytes=new Uint8Array(await file.slice(0,16).arrayBuffer());
    if(bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return 'jpeg';
    if(bytes.length>=8&&bytes.slice(0,8).every((v,i)=>v===[137,80,78,71,13,10,26,10][i]))return 'png';
    const ascii=String.fromCharCode(...bytes);
    if(ascii.startsWith('RIFF')&&ascii.slice(8,12)==='WEBP')return 'webp';
    if(ascii.slice(4,8)==='ftyp'&&/hei[cf]|mi[fm]1/i.test(ascii.slice(8)))return 'heic';
    return null;
  }
  function decoder(){
    if(root.heic2any)return Promise.resolve(root.heic2any);
    if(!decoderPromise)decoderPromise=new Promise((resolve,reject)=>{
      const script=root.document.createElement('script');
      script.src='heic2any.min.js';
      script.onload=()=>root.heic2any?resolve(root.heic2any):reject(Error('Conversor HEIC indisponível.'));
      script.onerror=()=>reject(Error('Não foi possível carregar o conversor HEIC.'));
      root.document.head.appendChild(script);
    }).catch(error=>{decoderPromise=null;throw error;});
    return decoderPromise;
  }
  async function prepare(file){
    if(!file)throw Error('Selecione uma imagem.');
    if(file.size>20*1024*1024)throw Error('Escolha uma imagem menor que 20 MB.');
    const format=await kind(file);
    if(!format)throw Error('Formato de imagem não reconhecido. Use JPG, PNG, WebP ou HEIC.');
    if(format!=='heic')return new File([file],(file.name||'imagem').replace(/\.(heic|heif)$/i,'.jpg'),{type:'image/'+format});
    try{
      const convert=await decoder();
      const result=await convert({blob:file,toType:'image/jpeg',quality:0.9});
      const blob=Array.isArray(result)?result[0]:result;
      if(!blob||await kind(blob)!=='jpeg')throw Error('Conversão HEIC inválida.');
      return new File([blob],(file.name||'foto').replace(/\.(heic|heif)$/i,'')+'.jpg',{type:'image/jpeg'});
    }catch{
      throw Error('Não foi possível abrir a foto HEIC. No celular, use JPG ou escolha outra imagem.');
    }
  }
  root.ForjaImageFiles={prepare,kind};
})(globalThis);
