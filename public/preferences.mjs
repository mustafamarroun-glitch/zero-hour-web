import './harness/storage-scope.js';
export const VERSION='3.2.0';
export const DEFAULTS=Object.freeze({dark:true,autoHide:true,resolution:'1280x720',scaling:'fit',edgeScroll:true,music:75,effects:75,performance:false,graphics:'ff'});
export function gameDefaults(game='zero-hour'){
  return {...DEFAULTS,...(game==='yuri'?{resolution:'800x600'}:{})};
}
export function loadPreferences(game='zero-hour'){
  let saved={};try{saved=JSON.parse(localStorage.getItem(game==='yuri'?'zhweb-yuri-settings-v1':game==='shockwave'?'zhweb-shockwave-settings-v1':'zhweb-settings-v2')||'{}')||{}}catch{}
  const defaults=gameDefaults(game),values={...defaults,...saved};
  try{if(game==='zero-hour'&&!('graphics' in saved))values.graphics=localStorage.getItem('zhweb-graphics')||DEFAULTS.graphics;const volume=game==='shockwave'?null:localStorage.getItem('zhweb-volume');if(volume!==null){if(!('music' in saved))values.music=volume;if(!('effects' in saved))values.effects=volume}}catch{}
  for(const k of ['dark','autoHide','edgeScroll','performance'])if(typeof values[k]!=='boolean')values[k]=DEFAULTS[k];
  for(const k of ['music','effects'])values[k]=Number.isFinite(Number(values[k]))?Math.max(0,Math.min(100,Number(values[k]))):75;
  if(!['800x600','1024x768','1280x720','1600x900','1920x1080','native'].includes(values.resolution))values.resolution=defaults.resolution;
  if(!['fit','actual'].includes(values.scaling))values.scaling='fit';
  if(!['ff','ps11'].includes(values.graphics))values.graphics='ff';
  return values;
}
export function savePreferences(values,game='zero-hour'){try{localStorage.setItem(game==='yuri'?'zhweb-yuri-settings-v1':game==='shockwave'?'zhweb-shockwave-settings-v1':'zhweb-settings-v2',JSON.stringify(values));return true}catch{return false}}
export function resolutionSize(value,width=1280,height=720){
  if(value==='native'){const scale=Math.min(1,1920/width,1080/height);return {width:Math.max(800,Math.round(width*scale/2)*2),height:Math.max(600,Math.round(height*scale/2)*2)}}
  const [w,h]=value.split('x').map(Number);return {width:w,height:h};
}
