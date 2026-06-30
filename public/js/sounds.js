const AudioCtx = window.AudioContext || window.webkitAudioContext;
let actx;

function ctx() {
  if (!actx) actx = new AudioCtx();
  return actx;
}

function tone(freq, duration, type = 'square', startGain = 0.08, glideTo = null) {
  try {
    const c = ctx();
    const o = c.createOscillator();
    const g = c.createGain();
    o.connect(g); g.connect(c.destination);
    o.type = type;
    o.frequency.setValueAtTime(freq, c.currentTime);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, c.currentTime + duration);
    g.gain.setValueAtTime(startGain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    o.start();
    o.stop(c.currentTime + duration);
  } catch (e) {}
}

function sndClick() { tone(880, 0.08, 'square', 0.07, 440); }
function sndKey() { tone(1400 + Math.random() * 200, 0.03, 'square', 0.025); }
function sndSuccess() {
  tone(660, 0.1, 'sine', 0.08);
  setTimeout(() => tone(880, 0.15, 'sine', 0.08), 90);
}
function sndError() { tone(220, 0.18, 'sawtooth', 0.07, 140); }
function sndBell() {
  tone(1200, 0.4, 'sine', 0.06);
  setTimeout(() => tone(1600, 0.3, 'sine', 0.04), 120);
}
function sndBoot() {
  [440, 554, 659, 880].forEach((f, i) => {
    setTimeout(() => tone(f, 0.3, 'sine', 0.07), i * 140);
  });
}
function sndTick() { tone(500, 0.02, 'square', 0.02); }

window.CYBERX_SOUNDS = { sndClick, sndKey, sndSuccess, sndError, sndBell, sndBoot, sndTick };
