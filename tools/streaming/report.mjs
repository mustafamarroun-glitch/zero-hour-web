// Explicit allowlists: no SDP, ICE addresses, URLs, credentials or game data.
const number = value => Number.isFinite(value) ? value : null;
export function rate(current, previous, seconds) {
  return seconds > 0 && Number.isFinite(current) && Number.isFinite(previous) && current >= previous
    ? (current - previous) / seconds : null;
}
export function hostSnapshot(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    connected: raw.connected === true,
    sampleTimeMs: number(raw.sampleTimeMs),
    captureMs: number(raw.captureMs), capturedFrames: number(raw.capturedFrames),
    width: number(raw.width), height: number(raw.height), targetFps: number(raw.targetFps),
    targetBitrate: number(raw.targetBitrate),
    diagnosticProbe: raw.diagnosticProbe === 'video-marker-v1',
    encoding: { encoder: raw.encoding?.encoder === 'h264_nvenc' ? 'h264_nvenc' : 'unavailable',
      encodedFrames: number(raw.encoding?.encodedFrames), lastEncodeMs: number(raw.encoding?.lastEncodeMs),
      error: Boolean(raw.encoding?.error) },
    outbound: { bytesSent: number(raw.outbound?.bytesSent), packetsSent: number(raw.outbound?.packetsSent),
      rttMs: number(raw.outbound?.rttMs), packetsLost: number(raw.outbound?.packetsLost) }
  };
}
export function readMarker(pixels) {
  const level = (x, y) => {
    const offset = (y * 48 + x) * 4;
    return (pixels[offset] + pixels[offset + 1] + pixels[offset + 2]) / 3;
  };
  if (level(1,1) < 200 || level(46,46) < 200 || level(5,5) > 55 || level(42,42) > 55) return null;
  let nonce = 0;
  for (let bit = 0; bit < 16; bit++) {
    const brightness = level(12 + (bit % 4) * 8, 12 + Math.floor(bit / 4) * 8);
    if (brightness > 200) nonce |= 1 << bit;
    else if (brightness > 55) return null;
  }
  return nonce;
}
function distribution(values) {
  const sorted = values.filter(Number.isFinite).sort((a,b) => a-b);
  return { count: sorted.length, mean: sorted.length ? sorted.reduce((a,b)=>a+b,0)/sorted.length : null,
    min: sorted[0] ?? null, max: sorted.at(-1) ?? null,
    p50: sorted.length ? sorted[Math.ceil(sorted.length * .5)-1] : null,
    p95: sorted.length ? sorted[Math.ceil(sorted.length * .95)-1] : null };
}
export function buildReport({sessionId, startedAt, samples, probes, browser, interrupted = false}) {
  return {
    schemaVersion: 1, kind: 'zero-hour-private-stream-report', sessionId, startedAt,
    finishedAt: new Date().toISOString(), browser,
    scope: 'Receiver video playback and host stream transport during an operator-selected session window.',
    privacy: 'Local receiver download only. No report upload, screenshots, game data, addresses or credentials.',
    verification: { matchConfirmedByReport: false, macGameplayProven: false,
      note: 'Operator must confirm both humans are in a visible, responsive match. Stream counters cannot prove gameplay.' },
    interrupted, durationSeconds: samples.length > 1 ? (samples.at(-1).atMs - samples[0].atMs)/1000 : 0,
    summary: Object.fromEntries(['decodedFps','displayedFps','rttMs','hostCaptureFps','hostEncodeFps'].map(key =>
      [key, distribution(samples.map(sample => sample[key]))])),
    inputToVisibleResponse: {
      method: 'input DataChannel → host copied-video marker → receiver video-frame callback',
      scope: 'Diagnostic stream-path estimate; excludes game simulation response, physical input hardware and physical display scanout.',
      timing: 'Receiver performance clock only; detection callback time (best-effort browser estimate). No host clock subtraction or RTT substitution.',
      status: probes.some(probe => probe.status === 'measured') ? 'measured' : 'unavailable',
      latencyMs: distribution(probes.map(probe => probe.latencyMs)), probes
    },
    samples
  };
}
