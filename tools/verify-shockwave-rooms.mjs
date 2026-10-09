import WebSocket from 'ws';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {PROFILES} from '../public/game-profiles.mjs';

const sockets=[];
async function request(game, action, extras={}) {
 const socket=new WebSocket('ws://localhost:8093/rooms',{origin:'http://localhost:8093'});sockets.push(socket);
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('Room request timed out')),10000);
  socket.once('error',error=>{clearTimeout(timer);reject(error)});
  socket.once('message',message=>{clearTimeout(timer);resolve(JSON.parse(message))});
  socket.once('open',()=>socket.send(JSON.stringify({game,action,name:action==='create'?'RoomTest':'GuestTest',guest:randomUUID(),content:'a'.repeat(64),runtime:PROFILES[game].runtime,...extras})));
 });
}
try {
 const host=await request('shockwave','create');assert.equal(host.game,'shockwave');
 const other=await request('zero-hour','join',{code:host.code});assert.match(other.error,/different game/);
 const changed=await request('shockwave','join',{code:host.code,content:'b'.repeat(64)});assert.match(changed.error,/content or engine version differs/);
 const old=await request('shockwave','join',{code:host.code,runtime:PROFILES['zero-hour'].runtime});assert.match(old.error,/incompatible runtime/);
 const peer=await request('shockwave','join',{code:host.code});assert.equal(peer.compatible,true);assert.equal(peer.players.length,2);
 console.log('ShockWave protocol: cross-game, content and runtime mismatches rejected; matching peer accepted.');
}finally{for(const socket of sockets)socket.close()}
