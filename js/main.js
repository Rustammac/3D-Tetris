/* ============ Приложение: состояния, игровой цикл, связка модулей ============ */
NT.app = (function () {
  var util = NT.util;

  var app = {
    state: 'menu', // menu | playing | paused | gameover

    start: function () {
      NT.audio.ensure();
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      NT.hud.hideCombo();
      NT.hud.clearVignette();
      NT.game.reset();
      app.state = 'playing';
      NT.hud.showHud();
      NT.hud.refresh();
      NT.hud.hideScreens();
    },

    pause: function () {
      if (app.state !== 'playing') return;
      app.state = 'paused';
      NT.game.setSoft(false);
      NT.game.stopDas(-1); NT.game.stopDas(1);
      NT.hud.showPause();
    },

    resume: function () {
      if (app.state !== 'paused') return;
      NT.audio.ensure();
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      app.state = 'playing';
      NT.hud.hideScreens();
    },

    toMenu: function () {
      app.state = 'menu';
      NT.hud.showStart();
    },
  };

  /* ---------- Связка модулей через события ---------- */
  NT.events.on('spawn', NT.scene.refreshSide);
  NT.events.on('hold', NT.scene.refreshSide);
  NT.events.on('topout', function () {
    app.state = 'gameover';
    NT.hud.showGameOver();
  });

  /* ---------- Игровой цикл ---------- */
  var lastTime = performance.now();

  function loop(now) {
    requestAnimationFrame(loop);
    var dt = util.clamp(now - lastTime, 0, 100);
    lastTime = now;

    if (app.state === 'playing') {
      NT.game.update(dt);
      NT.hud.refreshTime();
    }

    if (NT.game.isDirty()) {
      NT.scene.refreshBoard(NT.game.getBoard());
      NT.game.clearDirty();
    }
    NT.scene.refreshCurrent(app.state === 'playing');
    NT.effects.update(dt);
    NT.scene.render(dt);
  }

  /* ---------- Автопауза при уходе со вкладки ---------- */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) app.pause();
  });
  window.addEventListener('blur', function () { app.pause(); });

  /* ---------- Старт ---------- */
  NT.hud.refresh();
  NT.hud.showStart();
  requestAnimationFrame(loop);

  /* Дымовой тест: index.html?smoketest — авто-игра + повёрнутая камера */
  if (location.search.indexOf('smoketest') >= 0) {
    app.start();
    for (var i = 0; i < 14; i++) {
      var target = (i * 3) % 8 - 4;
      for (var k = 0; k < Math.abs(target); k++) NT.game.move(target > 0 ? 1 : -1);
      if (i % 2) NT.game.rotate(1);
      if (app.state !== 'playing') break;
      NT.game.hardDrop();
    }
    NT.scene.orbit.theta = NT.scene.orbit.tTheta = 0.55;
    NT.scene.orbit.phi = NT.scene.orbit.tPhi = 1.2;
  }

  return app;
})();
