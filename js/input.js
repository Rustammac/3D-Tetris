/* ============ Ввод: клавиатура, камера, сенсор, кнопки ============ */
NT.input = (function () {
  var util = NT.util;
  var canvas = NT.scene.canvas;
  var orbit = NT.scene.orbit;

  var GAME_KEYS = {
    ArrowLeft: 1, ArrowRight: 1, ArrowDown: 1, ArrowUp: 1, Space: 1,
    KeyZ: 1, KeyX: 1, KeyC: 1, KeyP: 1, KeyR: 1, KeyM: 1, KeyV: 1, KeyA: 1,
    Escape: 1, Enter: 1,
  };

  /* ---------- Клавиатура ---------- */
  window.addEventListener('keydown', function (e) {
    if (!GAME_KEYS[e.code]) return;
    e.preventDefault();
    NT.audio.ensure();
    var app = NT.app, game = NT.game;

    // глобальные
    if (e.code === 'KeyM' && !e.repeat) {
      var m = NT.audio.toggleMuted();
      NT.hud.syncSoundIcon();
      NT.hud.popup(m ? 'Звук выкл' : 'Звук вкл', 'mini');
      return;
    }
    if (e.code === 'KeyV' && !e.repeat) { NT.scene.resetView(); return; }
    if (e.code === 'KeyA' && !e.repeat) { NT.hud.syncSpinIcon(NT.scene.toggleAuto()); return; }

    if (app.state === 'menu') {
      if (e.code === 'Enter' || e.code === 'Space') app.start();
      return;
    }
    if (app.state === 'gameover') {
      if (e.code === 'KeyR' || e.code === 'Enter' || e.code === 'Space') app.start();
      return;
    }
    if (app.state === 'paused') {
      if (e.code === 'KeyP' || e.code === 'Escape' || e.code === 'Enter') app.resume();
      else if (e.code === 'KeyR') app.start();
      return;
    }

    // playing
    switch (e.code) {
      case 'ArrowLeft':
        if (!e.repeat) { game.move(-1); game.startDas(-1); }
        break;
      case 'ArrowRight':
        if (!e.repeat) { game.move(1); game.startDas(1); }
        break;
      case 'ArrowDown':
        game.setSoft(true);
        break;
      case 'ArrowUp':
      case 'KeyX':
        if (!e.repeat) game.rotate(1);
        break;
      case 'KeyZ':
        if (!e.repeat) game.rotate(-1);
        break;
      case 'Space':
        if (!e.repeat) game.hardDrop();
        break;
      case 'KeyC':
        if (!e.repeat) game.hold();
        break;
      case 'KeyP':
      case 'Escape':
        if (!e.repeat) app.pause();
        break;
      case 'KeyR':
        if (!e.repeat) app.start();
        break;
    }
  });

  window.addEventListener('keyup', function (e) {
    if (e.code === 'ArrowDown') NT.game.setSoft(false);
    if (e.code === 'ArrowLeft') NT.game.stopDas(-1);
    if (e.code === 'ArrowRight') NT.game.stopDas(1);
  });

  /* ---------- Камера: мышь / палец ---------- */
  var dragging = false, lastX = 0, lastY = 0;

  canvas.addEventListener('pointerdown', function (e) {
    dragging = true;
    lastX = e.clientX; lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('dragging');
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    var dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    orbit.tTheta -= dx * 0.0052;
    orbit.tPhi = util.clamp(orbit.tPhi - dy * 0.0038, 0.35, 1.52);
  });
  canvas.addEventListener('pointerup', function (e) {
    dragging = false;
    canvas.classList.remove('dragging');
    canvas.releasePointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointercancel', function () {
    dragging = false;
    canvas.classList.remove('dragging');
  });
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    orbit.tRadius = util.clamp(orbit.tRadius * (e.deltaY > 0 ? 1.1 : 0.9), 14, 55);
  }, { passive: false });
  canvas.addEventListener('dblclick', function () { NT.scene.resetView(); });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  /* ---------- Кнопки экранов ---------- */
  function on(id, fn) { document.getElementById(id).addEventListener('click', fn); }
  on('btn-start', function () { NT.app.start(); });
  on('btn-resume', function () { NT.app.resume(); });
  on('btn-restart', function () { NT.app.start(); });
  on('btn-restart-p', function () { NT.app.start(); });
  on('btn-menu', function () { NT.app.toMenu(); });

  /* ---------- Кнопки-иконки HUD ---------- */
  on('btn-sound', function () {
    NT.audio.ensure();
    NT.audio.toggleMuted();
    NT.hud.syncSoundIcon();
  });
  on('btn-cam', function () { NT.scene.resetView(); });
  on('btn-spin', function () { NT.hud.syncSpinIcon(NT.scene.toggleAuto()); });
  on('btn-pause', function () { NT.app.pause(); });

  /* ---------- Сенсорные кнопки ---------- */
  document.querySelectorAll('.t-btn').forEach(function (btn) {
    var act = btn.dataset.act;
    btn.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      NT.audio.ensure();
      var app = NT.app, game = NT.game;
      if (app.state === 'menu' || app.state === 'gameover') { app.start(); return; }
      if (app.state === 'paused') { if (act === 'pause') app.resume(); return; }
      switch (act) {
        case 'left':  game.move(-1); game.startDas(-1); break;
        case 'right': game.move(1); game.startDas(1); break;
        case 'soft':  game.setSoft(true); break;
        case 'cw':    game.rotate(1); break;
        case 'ccw':   game.rotate(-1); break;
        case 'hard':  game.hardDrop(); break;
        case 'hold':  game.hold(); break;
        case 'pause': app.pause(); break;
      }
    });
    function release() {
      if (act === 'soft') NT.game.setSoft(false);
      if (act === 'left') NT.game.stopDas(-1);
      if (act === 'right') NT.game.stopDas(1);
    }
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointerleave', release);
    btn.addEventListener('pointercancel', release);
  });

  return {};
})();
