/* ============ Звук: WebAudio-синтез, без файлов ============ */
NT.audio = (function () {
  var CFG = NT.CFG;
  var actx = null, master = null;
  var muted = localStorage.getItem(CFG.MUTE_KEY) === '1';
  var volume = (function () {
    var v = parseFloat(localStorage.getItem(CFG.VOL_KEY));
    return isNaN(v) ? 0.6 : NT.util.clamp(v, 0, 1);
  })();

  var BASE_GAIN = 0.36; // volume=1 -> gain 0.36

  function applyGain() {
    if (master) master.gain.value = muted ? 0 : BASE_GAIN * volume;
  }

  function ensure() {
    if (!actx) {
      try {
        actx = new (window.AudioContext || window.webkitAudioContext)();
        master = actx.createGain();
        master.connect(actx.destination);
        applyGain();
      } catch (e) { /* нет аудио — играем молча */ }
    }
    if (actx && actx.state === 'suspended') actx.resume();
  }

  function tone(freq, dur, type, vol, delay, slide) {
    if (!actx || muted) return;
    var t0 = actx.currentTime + (delay || 0);
    var osc = actx.createOscillator();
    var g = actx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime((vol || 1) * 0.5, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function thud(vol) {
    if (!actx || muted) return;
    var len = Math.floor(actx.sampleRate * 0.12);
    var buf = actx.createBuffer(1, len, actx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
    var src = actx.createBufferSource();
    src.buffer = buf;
    var f = actx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 320;
    var g = actx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(master);
    src.start(actx.currentTime);
    tone(70, 0.15, 'sine', vol * 0.9);
  }

  var sfx = {
    move:    function () { tone(210, 0.04, 'square', 0.35); },
    rotate:  function () { tone(340, 0.06, 'square', 0.4); },
    hold:    function () { tone(500, 0.08, 'triangle', 0.5); },
    lock:    function () { thud(0.5); },
    hard:    function () { thud(1); },
    clear1:  function () { tone(420, 0.14, 'sawtooth', 0.55, 0, 350); },
    clear2:  function () { tone(420, 0.14, 'sawtooth', 0.6, 0, 350); tone(630, 0.14, 'sawtooth', 0.5, 0.06, 350); },
    clear3:  function () { tone(420, 0.13, 'sawtooth', 0.6, 0, 300); tone(560, 0.13, 'sawtooth', 0.55, 0.05, 300); tone(700, 0.16, 'sawtooth', 0.5, 0.1, 380); },
    tetris:  function () { [523, 659, 784, 1046].forEach(function (f, i) { tone(f, 0.22, 'square', 0.5, i * 0.07); }); },
    tspin:   function () { [740, 880, 1108].forEach(function (f, i) { tone(f, 0.18, 'triangle', 0.6, i * 0.05); }); },
    levelup: function () { [392, 523, 659, 784].forEach(function (f, i) { tone(f, 0.16, 'triangle', 0.55, i * 0.06); }); },
    over:    function () { [660, 520, 392, 262].forEach(function (f, i) { tone(f, 0.3, 'sawtooth', 0.5, i * 0.16); }); },
  };

  /* Озвучка игровых событий */
  NT.events.on('move', sfx.move);
  NT.events.on('rotate', sfx.rotate);
  NT.events.on('hold', sfx.hold);
  NT.events.on('lock', sfx.lock);
  NT.events.on('harddrop', sfx.hard);
  NT.events.on('levelup', sfx.levelup);
  NT.events.on('topout', sfx.over);
  NT.events.on('clear', function (e) {
    if (e.tspin) sfx.tspin();
    else if (e.n === 4) sfx.tetris();
    else if (e.n === 3) sfx.clear3();
    else if (e.n === 2) sfx.clear2();
    else if (e.n === 1) sfx.clear1();
  });

  return {
    ensure: ensure,
    isMuted: function () { return muted; },
    toggleMuted: function () {
      muted = !muted;
      localStorage.setItem(CFG.MUTE_KEY, muted ? '1' : '0');
      applyGain();
      return muted;
    },
    getVolume: function () { return volume; },
    setVolume: function (v) {
      volume = NT.util.clamp(v, 0, 1);
      localStorage.setItem(CFG.VOL_KEY, String(volume));
      applyGain();
    },
  };
})();
