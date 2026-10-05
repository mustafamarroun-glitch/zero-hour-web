// Runs in the site container, sharing only the friend's network namespace.
// Chrome's diagnostic port is container loopback and is never published.
import WebSocket from 'ws';
import {setTimeout as delay} from 'node:timers/promises';
const seconds=Number(process.argv[2]||60);
if(!Number.isInteger(seconds)||seconds<10||seconds>1800)throw Error('Choose 10 to 1800 observation seconds.');
const targets=await fetch('http://127.0.0.1:9222/json/list').then(r=>{if(!r.ok)throw Error('Chrome diagnostics unavailable');return r.json()});
const target=targets.find(t=>t.type==='page'&&/^http:\/\/localhost:8098\//.test(t.url));
if(!target)throw Error('The friend game page is not open.');
const socket=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject)});
let seq=0;const pending=new Map();
socket.on('message',raw=>{const msg=JSON.parse(raw);if(!msg.id)return;const task=pending.get(msg.id);if(!task)return;pending.delete(msg.id);clearTimeout(task.timer);if(msg.error)task.reject(Error(msg.error.message));else task.resolve(msg.result)});
socket.on('close',()=>{for(const task of pending.values()){clearTimeout(task.timer);task.reject(Error('Chrome diagnostics disconnected'))}pending.clear()});
socket.on('error',()=>{});
const command=(method,params)=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error(`Chrome ${method} timed out`))},10000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}))});
const expression=`(async()=>{const w=document.querySelector('#gameFrame')?.contentWindow;if(!w?.CnCPort?.rpc)throw Error('Launch the friend game before measuring');const result=await w.CnCPort.rpc('threadedStatus');if(result.ok===false)throw Error(result.error);return {status:result.status,world:(await w.CnCPort.rpc('agentWorldSnapshot')).result}})()`;
const samples=[];
try{
  const end=Date.now()+seconds*1000;
  do{
    const value=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if(value.exceptionDetails)throw Error(value.exceptionDetails.exception?.description||value.exceptionDetails.text);
    const sample=value.result?.value;if(!sample?.status?.loop?.active)throw Error('The engine loop is not active');
    samples.push({observedAt:Date.now(),...sample});
    if(Date.now()<end)await delay(1000);
  }while(Date.now()<end);
}finally{socket.close()}
const first=samples[0].status,last=samples.at(-1).status,elapsed=(last.now-first.now)/1000;
if(!(elapsed>0))throw Error('Not enough samples to measure FPS.');
const fps=counter=>(last.loop[counter]-first.loop[counter])/elapsed;
const intervals=samples.slice(1).map((s,i)=>{const a=samples[i].status,b=s.status;return {seconds:(b.now-a.now)/1000,presentedFrames:b.loop.presentedEngineFrameSamples-a.loop.presentedEngineFrameSamples}});
if(intervals.some(s=>!(s.seconds>0)||!Number.isFinite(s.presentedFrames)||s.presentedFrames<0)||samples.some(s=>s.status.loop.startedAt!==first.loop.startedAt))throw Error('Engine counters restarted or are unavailable; start a new observation.');
const renderers=[...new Set(samples.map(s=>s.status.graphics?.renderer).filter(Boolean))];
const hardwareRenderer=renderers.length>0&&renderers.every(r=>!/swiftshader|llvmpipe|softpipe|software/i.test(r));
const lan=samples.every(s=>s.world?.game?.mode==='lan'&&s.world?.game?.playable);
const rates=intervals.map(s=>s.presentedFrames/s.seconds).sort((a,b)=>a-b);
console.log(JSON.stringify({scope:'Friend engine only; does not measure stream encode/decode FPS or input latency',secondsObserved:elapsed,renderers,hardwareRenderer,activeMultiplayer:lan,clientLoopFps:fps('clientFrames'),presentedEngineFps:fps('presentedEngineFrameSamples'),logicFps:fps('logicFrames'),fifthPercentilePresentedFps:rates[Math.floor(rates.length*.05)],crcMismatch:samples.some(s=>s.status.loop.crcMismatch),target:60,acceptance:'pending real Mac playback, NVENC active-stream evidence, input latency and completed match',samples},null,2));
