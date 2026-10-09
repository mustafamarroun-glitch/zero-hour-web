// Probe the configured public service, not a synthetic claim of Internet gameplay.
import WebSocket from 'ws';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {PROFILES} from '../public/game-profiles.mjs';
const config=JSON.parse(await readFile('public/network-config.json','utf8'));
const report={scope:'Public service protocol from this PC; no separate-device gameplay or TURN allocation proof.',checks:[],temporaryService:config.temporaryService===true,configuredIceServers:config.iceServers?.length||0};
const sockets=[];
function request(payload){
 return new Promise((resolve,reject)=>{
  const ws=new WebSocket(config.rooms,{origin:'https://mustafamarroun-glitch.github.io',handshakeTimeout:15000});sockets.push(ws);
  const timer=setTimeout(()=>{ws.terminate();reject(Error('Public room request timed out'))},20000);
  const finish=(callback,value)=>{clearTimeout(timer);callback(value)};
  ws.once('error',e=>finish(reject,e));ws.once('message',raw=>finish(resolve,JSON.parse(raw)));
  ws.once('open',()=>ws.send(JSON.stringify({game:'shockwave',name:'ReleaseAudit',guest:randomUUID(),runtime:PROFILES.shockwave.runtime,content:'a'.repeat(64),...payload})));
 });
}
try{
 const host=await request({action:'create'});assert.ok(!host.error,host.error);assert.equal(host.game,'shockwave');report.checks.push('Configured public room service recognizes the ShockWave game and current runtime');
 const guest=await request({action:'join',code:host.code,name:'AuditGuest'});assert.ok(!guest.error,guest.error);assert.equal(guest.compatible,true);report.checks.push('Matching ShockWave peer joins through public WSS');
 const signal=await new Promise((resolve,reject)=>{const ws=new WebSocket(config.signaling,{origin:'https://mustafamarroun-glitch.github.io',handshakeTimeout:15000});sockets.push(ws);ws.once('open',()=>resolve(true));ws.once('error',reject)});assert.equal(signal,true);report.checks.push('Configured public signaling WebSocket opens');
 report.status='passed service protocol; real cross-device and cross-network gameplay pending';
}catch(e){report.status='failed';report.failure=e.message;process.exitCode=1}
finally{for(const ws of sockets){if(ws.readyState===WebSocket.OPEN)ws.close();else ws.terminate()}await mkdir('.local/shockwave',{recursive:true});await writeFile('.local/shockwave/public-service-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))}
