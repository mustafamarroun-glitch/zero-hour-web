import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {createHmac,randomBytes} from 'node:crypto';
import {WebSocketServer} from 'ws';
import {createRequire} from 'node:module';
const {createGameRelay}=createRequire(import.meta.url)('./yuri-relay/relay.cjs');
const yuriRelay=createGameRelay({maxConnections:8});
const root=resolve(process.env.SITE_ROOT||'public'),host=process.env.HOST||'127.0.0.1',port=Number(process.env.PORT||8093);
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.wasm':'application/wasm','.woff2':'font/woff2','.ttf':'font/ttf','.svg':'image/svg+xml','.md':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8','.zip':'application/zip'};
const server=createServer(async(req,res)=>{
  const headers={'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'};
  try{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/yuri-health'){
      res.writeHead(200,{...headers,'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,service:'yuri-relay',...yuriRelay.getHealth()}));return;
    }
    if(url.pathname==='/network-config.json'){
      try{
        let iceServers=JSON.parse(process.env.ICE_SERVERS||'[]');
        if(process.env.TURN_URL||process.env.TURN_SECRET_FILE){
          if(!process.env.TURN_URL||!process.env.TURN_SECRET_FILE)throw Error('TURN_URL and TURN_SECRET_FILE must both be configured');
          const secret=(await readFile(process.env.TURN_SECRET_FILE,'utf8')).trim();
          if(secret.length<32)throw Error('The private TURN secret is missing or too short');
          const username=`${Math.floor(Date.now()/1000)+12*60*60}:zhweb-${randomBytes(8).toString('hex')}`;
          const credential=createHmac('sha1',secret).update(username).digest('base64');
          iceServers=[...iceServers,{urls:[process.env.TURN_URL,'turn:127.0.0.1:3478?transport=udp'],username,credential}];
        }
        res.writeHead(200,{...headers,'Content-Type':'application/json'});res.end(JSON.stringify({rooms:process.env.ROOMS_URL||'/rooms',signaling:process.env.SIGNALING_URL||'/nostr',iceServers,runtime:'3ccaa0e9-compiled-combined-v6-rf1'}));return;
      }catch(error){
        console.error(`Zero Hour TURN configuration error: ${error.message}`);
        res.writeHead(503,{...headers,'Content-Type':'application/json'});res.end(JSON.stringify({error:'The private game relay is not ready. Restart the Zero Hour streaming session.'}));return;
      }
    }
    let path=resolve(root,'.'+decodeURIComponent(url.pathname));
    if(path!==root&&!path.startsWith(root+'/')&&!path.startsWith(root+'\\'))throw Error('Forbidden');
    if((await stat(path)).isDirectory()){
      if(!url.pathname.endsWith('/')){res.writeHead(308,{...headers,Location:url.pathname+'/'+url.search});res.end();return;}
      path=resolve(path,'index.html');
    }
    const bytes=await readFile(path);res.writeHead(200,{...headers,'Content-Type':types[extname(path)]||'application/octet-stream'});res.end(bytes);
  }catch{res.writeHead(404,headers);res.end('Not found');}
});
const rooms=new Map();
const roomWss=new WebSocketServer({noServer:true,maxPayload:4096});
const signalWss=new WebSocketServer({noServer:true,maxPayload:256*1024});
const signals=new Set(),events=[];
function send(socket,msg){if(socket.readyState===1)socket.send(JSON.stringify(msg))}
function publishRoom(room){const players=room.players.map(p=>({name:p.name,host:p.host}));const compatible=room.players.length===2&&room.players.every(p=>p.content===room.players[0].content&&p.runtime===room.players[0].runtime);for(const p of room.players)send(p.socket,{code:room.code,players,compatible,game:room.game,relayCode:room.relayCode});}
server.on('upgrade',(req,socket,head)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const origin=req.headers.origin;
  const allowed=process.env.ALLOWED_ORIGINS?.split(',')||[`http://localhost:${port}`,`http://127.0.0.1:${port}`];
  if(!origin||!allowed.includes(origin)){socket.destroy();return;}
  if(/^\/yuri-[a-f0-9]{24}$/.test(pathname)){yuriRelay.handleUpgrade(req,socket,head);return;}
  const wss=pathname==='/rooms'?roomWss:pathname==='/nostr'?signalWss:null;
  if(!wss){socket.destroy();return;}wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
});
roomWss.on('connection',socket=>{
  let joined,member;const timer=setTimeout(()=>{if(!joined)socket.close(1008,'Join timeout')},15000);
  socket.on('message',raw=>{
    try{
      if(joined)throw Error('Already in a room. Leave before joining another.');
      const msg=JSON.parse(raw);msg.game=msg.game||'zero-hour';const expectedRuntime={'zero-hour':'3ccaa0e9-compiled-combined-v6-rf1',yuri:'ra2-vm-a10ac989',shockwave:'3ccaa0e9-compiled-combined-v6-rf1-shockwave-1.201-v1'}[msg.game];if(!/^[A-Za-z0-9 _-]{2,12}$/.test(msg.name)||!/^[a-f0-9-]{36}$/.test(msg.guest)||!/^[a-f0-9]{64}$/.test(msg.content)||!expectedRuntime||msg.runtime!==expectedRuntime)throw Error('Invalid commander identity or incompatible runtime.');
      if(msg.action==='create'){
        if(rooms.size>=100)throw Error('Room service is full. Try again later.');
        let code;do{code=randomBytes(4).toString('hex').toUpperCase()}while(rooms.has(code));joined={code,game:msg.game,relayCode:msg.game==='yuri'?randomBytes(12).toString('hex'):undefined,players:[]};rooms.set(code,joined);
      }else if(msg.action==='join'){
        joined=rooms.get(String(msg.code||'').toUpperCase());if(!joined)throw Error('Room not found. Check the code or ask the host for a new invite.');
        if(joined.game!==msg.game)throw Error('This room belongs to a different game. Select the host’s game and retry.');
        if(joined.players.length>=2)throw Error('This two-player room is full.');
        if(joined.players.some(p=>p.name.toLowerCase()===msg.name.toLowerCase()))throw Error('That commander name is already in this room. Change your name and retry.');
        if(joined.players.some(p=>p.guest===msg.guest))throw Error('This guest is already connected. Use a separate browser profile for a second player.');
        if(joined.players[0].content!==msg.content||joined.players[0].runtime!==msg.runtime)throw Error('Game content or engine version differs from the host. Import matching compatible files.');
      }else throw Error('Unknown room action.');
      member={...msg,host:joined.players.length===0,socket};joined.players.push(member);clearTimeout(timer);publishRoom(joined);
    }catch(e){send(socket,{error:e.message});socket.close(1008,'Room rejected');joined=null;}
  });
  socket.on('close',()=>{clearTimeout(timer);if(!joined||!member)return;joined.players=joined.players.filter(p=>p!==member);if(member.host||!joined.players.length){for(const p of joined.players){send(p.socket,{error:'The host disconnected. Create or join a new room.'});p.socket.close();}rooms.delete(joined.code);}else publishRoom(joined)});
});
function matches(event,filter){if(!event||!filter)return false;if(filter.kinds&&!filter.kinds.includes(event.kind))return false;const tags=event.tags?.filter(t=>t[0]==='x').map(t=>t[1])||[];return !filter['#x']||filter['#x'].some(t=>tags.includes(t));}
signalWss.on('connection',socket=>{
  const client={socket,subscriptions:new Map(),count:0,window:Date.now()};signals.add(client);
  socket.on('message',(raw,binary)=>{
    if(binary){socket.close(1003,'Text signaling only');return;}
    if(Date.now()-client.window>10000){client.count=0;client.window=Date.now();}if(++client.count>300){socket.close(1008,'Rate limit');return;}
    try{
      const msg=JSON.parse(raw);
      if(msg[0]==='REQ'&&typeof msg[1]==='string'&&msg[2]&&client.subscriptions.size<16){client.subscriptions.set(msg[1],msg[2]);for(const event of events)if(matches(event,msg[2]))send(socket,['EVENT',msg[1],event]);send(socket,['EOSE',msg[1]]);}
      else if(msg[0]==='CLOSE')client.subscriptions.delete(msg[1]);
      else if(msg[0]==='EVENT'){
        const event=msg[1];if(!event||!Number.isInteger(event.kind)||typeof event.content!=='string'||!Array.isArray(event.tags)||event.tags.length>32)throw Error('Malformed event');
        const cutoff=Math.floor(Date.now()/1000)-120;while(events.length&&(events[0].created_at<cutoff||events.length>=512))events.shift();
        events.push(event);for(const receiver of signals)for(const[id,filter]of receiver.subscriptions)if(matches(event,filter))send(receiver.socket,['EVENT',id,event]);send(socket,['OK',event.id,true,'']);
      }
    }catch{send(socket,['NOTICE','Invalid signaling message']);}
  });socket.on('close',()=>signals.delete(client));
});
server.listen(port,host,()=>console.log(`Zero Hour Web: http://localhost:${port} (separate origin; room and signaling service active)`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{yuriRelay.close();for(const client of signals)client.socket.close();for(const room of rooms.values())for(const p of room.players)p.socket.close();server.close(()=>process.exit());setTimeout(()=>process.exit(),1000).unref()});
