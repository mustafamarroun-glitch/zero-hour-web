// Session-only profiling. Keep confirmed engine state separate from a request.
export function createFrameProfiler({rpc,now=()=>new Date().toISOString()}){
  let enabled=false,startedAt=null,changedAt=null,busy=false;
  const samples=[],activeSamples=[];
  function observe(frame){
    const actual=frame?.profile?.enabled;
    if(typeof actual!=='boolean')return;
    if(actual!==enabled){enabled=actual;changedAt=now();if(actual){startedAt=changedAt;samples.length=0;activeSamples.length=0;}}
    if(actual){
      const gameplay=frame.clientState?.gameplay;
      const phase=gameplay?.loadingMap?'loading':gameplay?.inGame===true?(gameplay.gamePaused?'paused':'playing'):gameplay?.inGame===false?'menu':'unknown';
      const sample={at:now(),phase,logicFrame:frame.logicFrame??gameplay?.logicFrame??frame.clientState?.logicFrame??null,lastFrameMs:frame.lastFrameMs??null,profile:structuredClone(frame.profile)};
      samples.push(sample);
      if(samples.length>60)samples.shift();
      if(phase==='playing'){activeSamples.push(sample);if(activeSamples.length>60)activeSamples.shift();}
    }
  }
  async function set(value){
    if(typeof value!=='boolean')throw Error('Profiling requires an on or off value.');
    if(busy)throw Error('Profiling is still changing. Wait for the engine, or exit and relaunch.');
    busy=true;
    try{
      // The threaded bridge retains this setting for subsequent loop frames.
      enabled=null;
      const result=await rpc('realEngineFrameSummary',{frames:1,profile:value});
      observe(result?.frame);
      if(result?.ok===false)throw Error(result.error||'The engine rejected the profiling change.');
      if(enabled!==value)throw Error('The engine did not confirm the requested profiling state. Exit and relaunch if retrying fails.');
      return snapshot();
    }finally{busy=false;}
  }
  function snapshot(){return {enabled,startedAt,changedAt,sampleIntervalMs:2000,sampleLimit:60,samples:structuredClone(samples),activeSamples:structuredClone(activeSamples)};}
  return {set,observe,snapshot};
}
