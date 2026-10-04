// Synthetic wire-protocol check: this does not establish native multiplayer gameplay.
import WebSocket from 'ws';
import assert from 'node:assert/strict';
const origin=process.env.YURI_SITE_URL||'http://localhost:8093/';
const code='a'.repeat(24), url=new URL('/yuri-'+code,process.env.YURI_RELAY_URL||origin);url.protocol=['https:','wss:'].includes(url.protocol)?'wss:':'ws:';
const clients=[];
function text(value){const data=Buffer.from(value),length=Buffer.alloc(2);length.writeUInt16BE(data.length);return Buffer.concat([length,data]);}
async function connect(nonce,path=url.href){const socket=new WebSocket(path,{origin:new URL(origin).origin}),messages=[];clients.push(socket);socket.on('message',data=>messages.push(Buffer.from(data)));await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject)});socket.send(Buffer.concat([Buffer.from([1]),text('test'),Buffer.alloc(32),text(nonce)]));await until(()=>messages.some(m=>m[0]===2));return {socket,messages};}
async function until(condition){const deadline=Date.now()+5000;while(Date.now()<deadline){if(condition())return;await new Promise(r=>setTimeout(r,20));}throw Error('Relay response timed out');}
try{
 const a=await connect('first'),b=await connect('second');await until(()=>a.messages.some(m=>m[0]===3));
 const other=await connect('different-room',url.href.replace(code,'b'.repeat(24)));
 const payload=Buffer.from('synthetic-yuri-payload');const packet=Buffer.alloc(13);packet[0]=5;packet.writeUInt32BE(0xffffffff,5);packet.writeUInt16BE(1234,9);packet.writeUInt16BE(1234,11);a.socket.send(Buffer.concat([packet,payload]));
 await until(()=>b.messages.some(m=>m[0]===5));const received=b.messages.find(m=>m[0]===5);assert.deepEqual(received.subarray(13),payload);assert.notEqual(received.readUInt32BE(1),0);assert.equal(other.messages.some(m=>m[0]===5),false);
 console.log('Passed: native relay hello/welcome, peer discovery, binary datagram forwarding and private session separation. Synthetic only.');
}finally{for(const socket of clients)socket.close();}
