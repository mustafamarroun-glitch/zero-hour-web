import {VERSION} from './preferences.mjs';

const recentErrors=[];
export function recordError(message){
  if(!message)return;
  recentErrors.push({date:new Date().toISOString(),message:String(message).slice(0,2000)});
  if(recentErrors.length>20)recentErrors.shift();
}
window.addEventListener('error',event=>recordError(event.message));
window.addEventListener('unhandledrejection',event=>recordError(event.reason?.message||event.reason));
export function diagnosticReport(details){
  return {version:VERSION,date:new Date().toISOString(),userAgent:navigator.userAgent,isolation:crossOriginIsolated,recentErrors:[...recentErrors],...details};
}
