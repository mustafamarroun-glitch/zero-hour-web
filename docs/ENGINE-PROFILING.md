# Detailed engine profiling

Zero Hour Settings includes **Performance diagnosis → Detailed engine profiling**.
Launch a game and wait for the skirmish menu, enable the checkbox, and wait for
**On · confirmed by the engine** before starting a short test match. Reproduce
the slowdown and use **Download diagnostics** before exiting the game. Turning
profiling off keeps the collected samples available until the game closes.

The setting is session-only and off on every launch. The engine must confirm
the change; a missing response shows an unknown state rather than success.
If retrying fails, exit and relaunch. The control is hidden for Yuri, which has
its own Record performance tool.

The report includes `engine.profiling` with confirmed state, activation time,
and up to 60 recent profiled frame snapshots. `activeSamples` separately retains
up to 60 snapshots taken during unpaused gameplay, so pausing does not replace
them with paused rendering. Each snapshot records its phase and logic frame.
Snapshots reuse the existing
two-second health checks; enabling and exporting also capture a frame. These
samples are not a complete match trace or a frame-rate distribution. The
existing engine status still includes its slowest 50 frames since launch;
those can include loading or menu transitions recorded before profiling began.
Earlier frames cannot acquire timing breakdowns retroactively.

Profiling adds timing overhead, so compare a short profiled reproduction with
an ordinary run at the same resolution, renderer, map, and opponent count.
Reports download locally through the existing diagnostics flow. No upload or
telemetry endpoint is added.

Developer checks: `node --test tools/test-engine-profiling.mjs` and
`npm run check`. Runtime acceptance still requires a real launch, verified
on/off responses, a short match, and a downloaded report containing timing
buckets. Unit tests use simulated engine responses and do not prove native
WebAssembly behavior.
