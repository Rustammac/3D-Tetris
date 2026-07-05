/* ============ Игровая логика (SRS, 7-bag, hold, T-spin) ============
   Чистая механика: ни DOM, ни Three.js. Общение с миром — через NT.events. */
NT.game = (function () {
  var CFG = NT.CFG, PIECES = NT.PIECES, util = NT.util;
  var COLS = CFG.COLS, ROWS = CFG.ROWS, HIDDEN = CFG.HIDDEN;
  var emit = NT.events.emit;

  /* ---------- Состояние ---------- */
  var board = [];
  var cur = null;              // { type, rot, col, row }
  var queue = [], bag = [];
  var holdType = -1, canHold = true;

  var score = 0, level = 1, lines = 0, combo = -1, b2b = false;
  var best = parseInt(localStorage.getItem(CFG.BEST_KEY) || '0', 10) || 0;
  var recordBeaten = false;
  var stats = { timeMs: 0, maxCombo: 0 };

  var gravityTimer = 0, lockTimer = 0, lockResets = 0;
  var grounded = false, lastMoveRotate = false, softHeld = false;
  var dasDir = 0, dasTimer = 0, dasRepeat = false, arrTimer = 0;
  var dirty = true;
  var alive = false;

  /* ---------- Вспомогательные ---------- */
  function gravityInterval() { return Math.max(60, 1000 * Math.pow(0.82, level - 1)); }
  function softInterval() { return Math.min(40, gravityInterval() / 20); }

  function newBag() {
    var b = [0, 1, 2, 3, 4, 5, 6];
    for (var i = b.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = b[i]; b[i] = b[j]; b[j] = t;
    }
    return b;
  }
  function refillQueue() {
    while (queue.length < 4) {
      if (bag.length === 0) bag = newBag();
      queue.push(bag.shift());
    }
  }

  function cellsOf(type, rot) { return PIECES[type].rots[rot]; }

  function collides(type, rot, col, row) {
    var cells = cellsOf(type, rot);
    for (var i = 0; i < 4; i++) {
      var x = col + cells[i][0], y = row + cells[i][1];
      if (x < 0 || x >= COLS || y >= ROWS) return true;
      if (y >= 0 && board[y][x]) return true; // выше поля — свободно
    }
    return false;
  }

  function ghostRow() {
    var r = cur.row;
    while (!collides(cur.type, cur.rot, cur.col, r + 1)) r++;
    return r;
  }

  function addScore(pts) {
    score += pts;
    if (score > best) {
      best = score;
      recordBeaten = true;
      localStorage.setItem(CFG.BEST_KEY, String(best));
    }
  }

  /* ---------- Управление фигурой ---------- */
  function tryMove(dc, dr) {
    if (!cur || !alive) return false;
    if (collides(cur.type, cur.rot, cur.col + dc, cur.row + dr)) return false;
    cur.col += dc; cur.row += dr;
    lastMoveRotate = false;
    if (grounded && lockResets < CFG.MAX_LOCK_RESETS) { lockTimer = 0; lockResets++; }
    grounded = collides(cur.type, cur.rot, cur.col, cur.row + 1);
    return true;
  }

  function move(dc) {
    if (tryMove(dc, 0)) { emit('move'); return true; }
    return false;
  }

  function rotate(dir) {
    if (!cur || !alive) return false;
    var p = PIECES[cur.type];
    if (p.name === 'O') { emit('rotate'); return true; }
    var from = cur.rot, to = (cur.rot + dir + 4) % 4;
    var table = (p.name === 'I' ? NT.KICKS_I : NT.KICKS_JLSTZ)[from + '>' + to];
    for (var i = 0; i < table.length; i++) {
      var nc = cur.col + table[i][0];
      var nr = cur.row - table[i][1]; // dy хранится в системе y-вверх
      if (!collides(cur.type, to, nc, nr)) {
        cur.rot = to; cur.col = nc; cur.row = nr;
        lastMoveRotate = true;
        if (grounded && lockResets < CFG.MAX_LOCK_RESETS) { lockTimer = 0; lockResets++; }
        grounded = collides(cur.type, cur.rot, cur.col, cur.row + 1);
        emit('rotate');
        return true;
      }
    }
    return false;
  }

  function hold() {
    if (!canHold || !cur || !alive) return;
    var prev = holdType;
    holdType = cur.type;
    if (prev < 0) spawn(-1);
    else spawn(prev);
    canHold = false; // после spawn: он выставляет canHold = true
    emit('hold');
  }

  function hardDrop() {
    if (!cur || !alive) return;
    var gr = ghostRow();
    var dist = gr - cur.row;
    addScore(dist * 2);
    cur.row = gr;
    emit('harddrop', { dist: dist });
    lock();
  }

  /* ---------- Спавн ---------- */
  function spawn(forcedType) {
    var type = forcedType >= 0 ? forcedType : queue.shift();
    refillQueue();
    var size = PIECES[type].size;
    cur = { type: type, rot: 0, col: size === 2 ? 4 : 3, row: 0 };
    gravityTimer = 0; lockTimer = 0; lockResets = 0;
    grounded = false; lastMoveRotate = false;
    if (forcedType < 0) canHold = true;
    emit('spawn');
    if (collides(cur.type, cur.rot, cur.col, cur.row)) {
      topOut();
      return false;
    }
    return true;
  }

  function topOut() {
    alive = false;
    cur = null;
    dirty = true;
    emit('topout');
  }

  /* ---------- T-spin: правило трёх углов ---------- */
  function isTSpin() {
    if (cur.type !== NT.T_INDEX || !lastMoveRotate) return false;
    var cx = cur.col + 1, cy = cur.row + 1;
    var n = 0;
    var corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (var i = 0; i < 4; i++) {
      var x = cx + corners[i][0], y = cy + corners[i][1];
      if (x < 0 || x >= COLS || y >= ROWS || (y >= 0 && board[y][x])) n++;
    }
    return n >= 3;
  }

  /* ---------- Фиксация и сжигание линий ---------- */
  function lock() {
    var tspin = isTSpin();
    var cells = cellsOf(cur.type, cur.rot);
    var allHidden = true;
    for (var i = 0; i < 4; i++) {
      var y = cur.row + cells[i][1];
      if (y >= HIDDEN) allHidden = false;
      if (y >= 0) board[y][cur.col + cells[i][0]] = cur.type + 1;
    }
    dirty = true;
    if (allHidden) { topOut(); return; }

    // полные ряды
    var full = [];
    for (var r = 0; r < ROWS; r++) {
      var isFull = true;
      for (var c = 0; c < COLS; c++) if (!board[r][c]) { isFull = false; break; }
      if (isFull) full.push(r);
    }
    var n = full.length;

    if (n > 0) {
      // снапшот цветов для эффектов — до удаления рядов
      var rowsSnapshot = full.map(function (fr) {
        return {
          r: fr,
          colors: board[fr].map(function (v) { return PIECES[v - 1].color; }),
        };
      });
      full.forEach(function (fr) {
        board.splice(fr, 1);
        board.unshift(new Array(COLS).fill(0));
      });
      combo++;
      stats.maxCombo = Math.max(stats.maxCombo, combo + 1);
      lines += n;

      var pts;
      var hard = n === 4 || tspin;
      pts = tspin ? CFG.SCORE_TSPIN[n] : CFG.SCORE_LINES[n];
      var withB2b = hard && b2b;
      if (withB2b) pts = Math.floor(pts * 1.5);
      b2b = hard;

      pts *= level;
      if (combo > 0) pts += 50 * combo * level;
      addScore(pts);

      emit('clear', {
        n: n, tspin: tspin, b2b: withB2b, pts: pts, combo: combo, rows: rowsSnapshot,
      });

      var newLevel = 1 + Math.floor(lines / 10);
      if (newLevel > level) {
        level = newLevel;
        emit('levelup', { level: level });
      }
    } else {
      if (tspin) { // T-spin без линий тоже даёт очки
        var tpts = CFG.SCORE_TSPIN[0] * level;
        addScore(tpts);
        emit('clear', { n: 0, tspin: true, b2b: false, pts: tpts, combo: -1, rows: [] });
      } else {
        emit('lock');
      }
      combo = -1;
    }

    emit('scored');

    // предупреждение об опасной высоте стека
    var top = ROWS;
    outer:
    for (var tr = 0; tr < ROWS; tr++) {
      for (var tc = 0; tc < COLS; tc++) {
        if (board[tr][tc]) { top = tr; break outer; }
      }
    }
    emit('danger', { on: ROWS - top > 16 });

    spawn(-1);
  }

  /* ---------- Игровой апдейт ---------- */
  function update(dt) {
    if (!cur || !alive) return;
    stats.timeMs += dt;

    // DAS / ARR — автоповтор влево-вправо
    if (dasDir !== 0) {
      dasTimer += dt;
      if (!dasRepeat && dasTimer >= CFG.DAS) { dasRepeat = true; arrTimer = 0; }
      if (dasRepeat) {
        arrTimer += dt;
        while (arrTimer >= CFG.ARR) {
          arrTimer -= CFG.ARR;
          if (!move(dasDir)) { arrTimer = 0; break; }
        }
      }
    }

    // гравитация
    var interval = softHeld ? softInterval() : gravityInterval();
    gravityTimer += dt;
    while (gravityTimer >= interval) {
      gravityTimer -= interval;
      if (!collides(cur.type, cur.rot, cur.col, cur.row + 1)) {
        cur.row++;
        if (softHeld) { addScore(1); emit('scored'); }
        lastMoveRotate = false;
        grounded = false;
        lockTimer = 0;
        lockResets = 0;
      } else {
        grounded = true;
        gravityTimer = 0; // иначе при сходе с уступа фигура рухнет на несколько рядов
        break;
      }
    }

    // фиксация
    if (grounded) {
      lockTimer += dt;
      if (lockTimer >= CFG.LOCK_DELAY) lock();
    }
  }

  /* ---------- Сброс ---------- */
  function reset() {
    board = [];
    for (var r = 0; r < ROWS; r++) board.push(new Array(COLS).fill(0));
    bag = []; queue = []; refillQueue();
    holdType = -1; canHold = true;
    score = 0; level = 1; lines = 0; combo = -1; b2b = false;
    recordBeaten = false;
    stats.timeMs = 0; stats.maxCombo = 0;
    softHeld = false; dasDir = 0;
    dirty = true;
    alive = true;
    spawn(-1);
  }

  // пустая доска до первого запуска
  for (var r0 = 0; r0 < ROWS; r0++) board.push(new Array(COLS).fill(0));

  return {
    reset: reset,
    update: update,
    move: move,
    rotate: rotate,
    hold: hold,
    hardDrop: hardDrop,
    ghostRow: ghostRow,
    setSoft: function (b) { softHeld = b; },
    startDas: function (dir) { dasDir = dir; dasTimer = 0; dasRepeat = false; },
    stopDas: function (dir) { if (dasDir === dir) dasDir = 0; },

    isDirty: function () { return dirty; },
    clearDirty: function () { dirty = false; },
    isAlive: function () { return alive; },

    getBoard: function () { return board; },
    getCur: function () { return cur; },
    getQueue: function () { return queue; },
    getHoldType: function () { return holdType; },
    getCanHold: function () { return canHold; },
    getScore: function () { return score; },
    getLevel: function () { return level; },
    getLines: function () { return lines; },
    getBest: function () { return best; },
    getCombo: function () { return combo; },
    getStats: function () { return stats; },
    isRecordBeaten: function () { return recordBeaten; },
  };
})();
