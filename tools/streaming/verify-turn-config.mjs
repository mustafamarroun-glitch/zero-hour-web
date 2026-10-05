import assert from 'node:assert/strict';
import {createHmac,timingSafeEqual,randomBytes} from 'node:crypto';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';

const root=resolve(import.meta.dirname,'../..');
const secret=randomBytes(48).toString('base64url');
const temp=await mkdtemp(join(tmpdir(),'zh-turn-config-'));
const secretPath=join(temp,'secret');
await writeFile(secretPath,secret,{mode:0o600});

async function freePort(){
  const server=createServer();
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const {port}=server.address();
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  return port;
}

async function startServer(overrides={}){
  const port=await freePort();
  const child=spawn(process.execPath,[join(root,'tools/server.mjs')],{
    cwd:root,windowsHide:true,stdio:'ignore',
    env:{...process.env,HOST:'127.0.0.1',PORT:String(port),SITE_ROOT:join(root,'public'),ICE_SERVERS:'[]',...overrides},
  });
  const url=`http://127.0.0.1:${port}/network-config.json`;
  const deadline=Date.now()+5000;
  try{
    while(Date.now()<deadline){
      if(child.exitCode!==null)throw Error(`server exited with ${child.exitCode}`);
      try{return {child,response:await fetch(url)};}catch{}
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    throw Error('server did not become ready');
  }catch(error){child.kill();await once(child,'exit').catch(()=>{});throw error;}
}

async function stop(child){
  if(child.exitCode!==null)return;
  child.kill('SIGTERM');
  await Promise.race([once(child,'exit'),new Promise((_,reject)=>setTimeout(()=>reject(Error('server did not stop')),3000))]);
}

let active;
try{
  active=await startServer({TURN_URL:'turn:192.168.1.67:3478?transport=udp',TURN_SECRET_FILE:secretPath});
  assert.equal(active.response.status,200);
  const configured=await active.response.json();
  assert.equal(configured.runtime,'3ccaa0e9-compiled-combined-v6');
  assert.equal(configured.iceServers.length,1);
  const server=configured.iceServers[0];
  assert.deepEqual(server.urls,['turn:192.168.1.67:3478?transport=udp','turn:127.0.0.1:3478?transport=udp']);
  const expiry=Number(server.username.split(':',1)[0]);
  assert.ok(expiry>=Math.floor(Date.now()/1000)+11*60*60);
  assert.ok(expiry<=Math.floor(Date.now()/1000)+12*60*60);
  const expected=createHmac('sha1',secret).update(server.username).digest();
  const actual=Buffer.from(server.credential,'base64');
  assert.equal(actual.length,expected.length);
  assert.ok(timingSafeEqual(actual,expected));
  await stop(active.child);active=null;

  const disabled=await startServer();
  assert.equal(disabled.response.status,200);
  assert.deepEqual((await disabled.response.json()).iceServers,[]);
  await stop(disabled.child);

  const broken=await startServer({TURN_URL:'turn:192.168.1.67:3478?transport=udp',TURN_SECRET_FILE:join(temp,'missing-secret')});
  assert.equal(broken.response.status,503);
  assert.match((await broken.response.json()).error,/private game relay is not ready/i);
  await stop(broken.child);
  console.log('TURN config verified: expiring HMAC credentials, Windows/Docker URLs, disabled mode, and missing-secret error.');
}finally{
  if(active)await stop(active.child).catch(()=>{});
  await rm(temp,{recursive:true,force:true});
}
