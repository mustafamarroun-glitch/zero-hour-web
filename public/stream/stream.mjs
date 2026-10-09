import {streamAddress,streamTransport} from './address.mjs';
const form=document.querySelector('#streamForm'),input=document.querySelector('#streamAddress');
const error=document.querySelector('#streamError'),host=document.querySelector('#streamHost');
const invite=new URL(location.href).searchParams.get('host');
function preview(){
  error.hidden=true;
  try{const url=streamAddress(input.value);host.textContent=`You’ll connect to ${url.host}. Use the private login supplied by this host.`;host.hidden=false}
  catch{host.hidden=true}
}
if(invite){input.value=invite;preview()}
input.addEventListener('input',preview);
form.addEventListener('submit',event=>{
  event.preventDefault();
  try{
    const url=streamAddress(input.value);
    url.searchParams.set('transport',streamTransport(url));
    location.assign(url.href);
  }catch(problem){error.textContent=problem.message;error.hidden=false;input.focus()}
});
