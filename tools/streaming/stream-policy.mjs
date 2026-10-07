// Playback policy is independent of game simulation and transport credentials.
export const QUALITY_ORDER=['low','balanced','fast'];
export const QUALITY_LABELS={low:'Data saver · 480p30',balanced:'Balanced · 720p30',fast:'Smooth · 720p60'};
export function playbackPlan({begin,end,currentTime}) {
  const depth=end-currentTime;
  if(currentTime<begin||depth>.8)return {seek:Math.max(begin,end-.35),rate:1};
  return {seek:null,rate:1};
}
export function autoQuality(current,sample,state,now) {
  // Hidden tabs, missing counters and startup cannot establish spare capacity.
  if(!sample.receiverVisible||!Number.isFinite(sample.decodedFps)||!Number.isFinite(sample.bufferMs)||!Number.isFinite(sample.targetFps)||sample.intervalSeconds<.5){state.good=0;state.bad=0;return null}
  const drops=sample.framesInInterval>0?sample.dropsInInterval/sample.framesInInterval:0;
  const struggling=sample.bufferMs>800||sample.stalled||drops>.1||sample.decodedFps<sample.targetFps*.65;
  state.bad=struggling?(state.bad||0)+1:0;
  state.good=!struggling&&sample.bufferMs<750&&drops<.02&&sample.decodedFps>=sample.targetFps*.9?(state.good||0)+1:0;
  const index=QUALITY_ORDER.indexOf(current);
  if(index<0)return null;
  if(state.bad>=3&&index>0){state.bad=state.good=0;state.retryAfter=now+90000;return QUALITY_ORDER[index-1]}
  // Higher quality is a cautious trial, not an inferred bandwidth measurement.
  if(state.good>=30&&now>=(state.retryAfter||0)&&index<QUALITY_ORDER.length-1){state.bad=state.good=0;state.retryAfter=now+90000;return QUALITY_ORDER[index+1]}
  return null;
}
export function videoPoint(rect,width,height,clientX,clientY) {
  if(!width||!height||!rect.width||!rect.height)return null;
  const scale=Math.min(rect.width/width,rect.height/height);
  const x=(clientX-rect.left-(rect.width-width*scale)/2)/scale;
  const y=(clientY-rect.top-(rect.height-height*scale)/2)/scale;
  return {x:Math.max(0,Math.min(width-1,Math.round(x))),y:Math.max(0,Math.min(height-1,Math.round(y))),inside:x>=0&&y>=0&&x<width&&y<height};
}
