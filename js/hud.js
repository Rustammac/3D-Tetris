/* ============ HUD и экраны: весь DOM ============ */
NT.hud = (function () {
  var util = NT.util;

  function $(id) { return document.getElementById(id); }

  var el = {
    hud: $('hud'),
    score: $('score'), level: $('level'), lines: $('lines'),
    time: $('time'), best: $('best'), levelBar: $('level-bar'),
    combo: $('combo'), comboText: $('combo-text'), b2bBadge: $('b2b-badge'),
    popups: $('popups'), vignette: $('vignette'),
    overlay: $('overlay'),
    screenStart: $('screen-start'), screenPause: $('screen-pause'), screenOver: $('screen-over'),
    startBest: $('start-best'),
    finalScore: $('final-score'), finalBest: $('final-best'),
    finalLines: $('final-lines'), finalLevel: $('final-level'),
    finalTime: $('final-time'), finalCombo: $('final-combo'),
    newRecord: $('new-record'),
    volume: $('volume'),
    btnSound: $('btn-sound'), btnSpin: $('btn-spin'),
  };

  var lastTimeText = '';

  function bump(node) {
    node.classList.remove('bump');
    void node.offsetWidth;
    node.classList.add('bump');
  }

  function refresh() {
    var g = NT.game;
    el.score.textContent = util.fmtNum(g.getScore());
    el.level.textContent = g.getLevel();
    el.lines.textContent = g.getLines();
    el.best.textContent = util.fmtNum(g.getBest());
    el.levelBar.style.width = (g.getLines() % 10) * 10 + '%';
  }

  function refreshTime() {
    var t = util.fmtTime(NT.game.getStats().timeMs);
    if (t !== lastTimeText) {
      lastTimeText = t;
      el.time.textContent = t;
    }
  }

  function popup(text, cls) {
    var d = document.createElement('div');
    d.className = 'popup ' + (cls || '');
    d.textContent = text;
    el.popups.appendChild(d);
    setTimeout(function () { d.remove(); }, 1150);
  }

  function showScreen(which) {
    el.screenStart.classList.add('hidden');
    el.screenPause.classList.add('hidden');
    el.screenOver.classList.add('hidden');
    if (!which) { el.overlay.classList.add('hidden'); return; }
    el.overlay.classList.remove('hidden');
    which.classList.remove('hidden');
  }

  function hideCombo() {
    el.combo.classList.remove('on');
    el.b2bBadge.classList.add('hidden');
  }

  /* ---------- Реакция на игровые события ---------- */

  NT.events.on('clear', function (e) {
    var label, cls = '';
    if (e.tspin) {
      label = 'T-SPIN' + (e.n > 1 ? ' ×' + e.n : '');
      cls = 'purple' + (e.n === 0 ? ' mini' : '');
    } else {
      label = ['', 'ЛИНИЯ', 'ДВОЙНАЯ!', 'ТРОЙНАЯ!', 'ТЕТРИС!!!'][e.n];
      if (e.n === 4) cls = 'gold';
    }
    if (e.b2b) label = 'B2B ' + label;
    popup(label + '  +' + util.fmtNum(e.pts), cls);

    if (e.combo > 0) {
      el.comboText.textContent = 'КОМБО ×' + (e.combo + 1);
      el.combo.classList.add('on');
      el.b2bBadge.classList.toggle('hidden', !e.b2b);
    } else {
      hideCombo();
    }
    bump(el.score);
  });

  NT.events.on('lock', hideCombo);

  NT.events.on('scored', refresh);

  NT.events.on('levelup', function (e) {
    popup('УРОВЕНЬ ' + e.level, 'gold');
  });

  NT.events.on('danger', function (e) {
    el.vignette.classList.toggle('on', e.on);
  });

  /* ---------- Экраны ---------- */

  function showStart() {
    var best = NT.game.getBest();
    if (best > 0) {
      el.startBest.classList.remove('hidden');
      el.startBest.querySelector('b').textContent = util.fmtNum(best);
    }
    showScreen(el.screenStart);
  }

  function showGameOver() {
    var g = NT.game, s = g.getStats();
    el.finalScore.textContent = util.fmtNum(g.getScore());
    el.finalBest.textContent = util.fmtNum(g.getBest());
    el.finalLines.textContent = g.getLines();
    el.finalLevel.textContent = g.getLevel();
    el.finalTime.textContent = util.fmtTime(s.timeMs);
    el.finalCombo.textContent = s.maxCombo;
    el.newRecord.classList.toggle('hidden', !(g.isRecordBeaten() && g.getScore() > 0));
    hideCombo();
    el.vignette.classList.remove('on');
    showScreen(el.screenOver);
  }

  /* ---------- Кнопки-иконки: визуальные состояния ---------- */
  function syncSoundIcon() {
    el.btnSound.classList.toggle('off', NT.audio.isMuted());
  }
  function syncSpinIcon(on) {
    el.btnSpin.classList.toggle('active', on);
  }

  /* громкость */
  el.volume.value = Math.round(NT.audio.getVolume() * 100);
  el.volume.addEventListener('input', function () {
    NT.audio.ensure();
    NT.audio.setVolume(el.volume.value / 100);
  });

  syncSoundIcon();

  return {
    el: el,
    refresh: refresh,
    refreshTime: refreshTime,
    popup: popup,
    showScreen: showScreen,
    showStart: showStart,
    showGameOver: showGameOver,
    showPause: function () { showScreen(el.screenPause); },
    hideScreens: function () { showScreen(null); },
    showHud: function () { el.hud.classList.remove('hidden'); },
    hideCombo: hideCombo,
    clearVignette: function () { el.vignette.classList.remove('on'); },
    syncSoundIcon: syncSoundIcon,
    syncSpinIcon: syncSpinIcon,
  };
})();
