import test from 'node:test';
import assert from 'node:assert/strict';
import {createFrameProfiler} from '../public/harness/frame-profiling.mjs';

const frame=(enabled,logicFrame=10)=>({logicFrame,lastFrameMs:12,profile:{enabled,renderMs:4,logicMs:5}});
test('profiling is session-only, verified by the engine, and preserves samples after disabling',async()=>{
  const calls=[];
  const create=()=>createFrameProfiler({rpc:async(command,payload)=>{calls.push({command,payload});return {ok:true,frame:frame(payload.profile)};}});
  const profiler=create();
  assert.equal(profiler.snapshot().enabled,false);
  assert.equal(calls.length,0);
  assert.equal((await profiler.set(true)).enabled,true);
  assert.deepEqual(calls[0],{command:'realEngineFrameSummary',payload:{frames:1,profile:true}});
  profiler.observe(frame(true,20));
  assert.equal((await profiler.set(false)).enabled,false);
  assert.equal(profiler.snapshot().samples.at(-1).logicFrame,20);
  assert.equal(create().snapshot().enabled,false);
  await profiler.set(true);
  assert.equal(profiler.snapshot().samples.length,1);
});
test('missing confirmation and RPC failures remain unknown rather than claiming success',async()=>{
  for(const rpc of [async()=>({ok:true,frame:{}}),async()=>{throw Error('Engine unavailable');}]){
    const profiler=createFrameProfiler({rpc});
    await assert.rejects(profiler.set(true));
    assert.equal(profiler.snapshot().enabled,null);
    assert.equal(profiler.snapshot().samples.length,0);
  }
});
test('a refused state change reports the actual engine state',async()=>{
  const profiler=createFrameProfiler({rpc:async()=>({ok:true,frame:frame(false)})});
  await assert.rejects(profiler.set(true),/did not confirm/);
  assert.equal(profiler.snapshot().enabled,false);
});
test('concurrent changes cannot race each other',async()=>{
  let finish;
  const profiler=createFrameProfiler({rpc:()=>new Promise(resolve=>{finish=resolve;})});
  const enabling=profiler.set(true);
  await assert.rejects(profiler.set(false),/still changing/);
  finish({ok:true,frame:frame(true)});
  assert.equal((await enabling).enabled,true);
});
test('samples and report snapshots are bounded and independent',async()=>{
  const profiler=createFrameProfiler({rpc:async()=>({ok:true,frame:frame(true)})});
  await profiler.set(true);
  for(let i=0;i<100;i++)profiler.observe(frame(true,i));
  const report=profiler.snapshot();
  assert.equal(report.samples.length,60);
  assert.equal(report.samples[0].logicFrame,40);
  assert.equal(report.samples.at(-1).logicFrame,99);
  report.samples[0].profile.renderMs=999;
  assert.equal(profiler.snapshot().samples[0].profile.renderMs,4);
});
test('pausing preserves active-play samples and captures the real nested logic frame',async()=>{
  const profiler=createFrameProfiler({rpc:async()=>({ok:true,frame:frame(true)})});
  await profiler.set(true);
  for(let i=0;i<80;i++)profiler.observe({profile:{enabled:true},clientState:{gameplay:{inGame:true,gamePaused:false,logicFrame:i}}});
  for(let i=0;i<80;i++)profiler.observe({profile:{enabled:true},clientState:{gameplay:{inGame:true,gamePaused:true,logicFrame:80}}});
  const report=profiler.snapshot();
  assert.equal(report.samples.length,60);assert.equal(report.samples[0].phase,'paused');
  assert.equal(report.activeSamples.length,60);assert.equal(report.activeSamples[0].logicFrame,20);assert.equal(report.activeSamples.at(-1).logicFrame,79);
  await profiler.set(true);assert.equal(profiler.snapshot().activeSamples.length,0);
});
