/* ============ Эффекты: частицы, вспышки рядов, тряска ============ */
NT.effects = (function () {
  var CFG = NT.CFG, PIECES = NT.PIECES, util = NT.util;
  var scene3 = NT.scene.scene;
  var wx = NT.scene.wx, wy = NT.scene.wy;

  /* ---------- Частицы (пул с компактированием) ---------- */
  var P_MAX = 700;
  var pPos = new Float32Array(P_MAX * 3);
  var pCol = new Float32Array(P_MAX * 3);
  var pVel = new Float32Array(P_MAX * 3);
  var pLife = new Float32Array(P_MAX);
  var pAlive = 0;
  var _color = new THREE.Color();

  var pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  var pMat = new THREE.PointsMaterial({
    size: 0.32, vertexColors: true, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  });
  var pPoints = new THREE.Points(pGeo, pMat);
  pPoints.frustumCulled = false;
  scene3.add(pPoints);

  function spawnParticles(x, y, z, colorHex, count, speed) {
    _color.setHex(colorHex);
    for (var i = 0; i < count && pAlive < P_MAX; i++) {
      var k = pAlive++;
      pPos[k * 3] = x + util.rnd(-0.4, 0.4);
      pPos[k * 3 + 1] = y + util.rnd(-0.4, 0.4);
      pPos[k * 3 + 2] = z + util.rnd(-0.4, 0.4);
      pVel[k * 3] = util.rnd(-1, 1) * speed;
      pVel[k * 3 + 1] = util.rnd(0.2, 1.4) * speed;
      pVel[k * 3 + 2] = util.rnd(-1, 1) * speed;
      pCol[k * 3] = _color.r; pCol[k * 3 + 1] = _color.g; pCol[k * 3 + 2] = _color.b;
      pLife[k] = util.rnd(0.6, 1.15);
    }
  }

  function updateParticles(dt) {
    var s = dt / 1000;
    for (var i = 0; i < pAlive; i++) {
      pLife[i] -= s;
      if (pLife[i] <= 0) {
        var last = --pAlive; // компактируем: последнюю живую на место умершей
        if (i !== last) {
          for (var a = 0; a < 3; a++) {
            pPos[i * 3 + a] = pPos[last * 3 + a];
            pVel[i * 3 + a] = pVel[last * 3 + a];
            pCol[i * 3 + a] = pCol[last * 3 + a];
          }
          pLife[i] = pLife[last];
          i--;
        }
        continue;
      }
      pVel[i * 3 + 1] -= 9 * s; // гравитация
      pPos[i * 3] += pVel[i * 3] * s;
      pPos[i * 3 + 1] += pVel[i * 3 + 1] * s;
      pPos[i * 3 + 2] += pVel[i * 3 + 2] * s;
    }
    pGeo.setDrawRange(0, pAlive);
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;
  }

  /* ---------- Вспышки сожжённых рядов ---------- */
  var flashes = [];
  var flashGeo = new THREE.BoxGeometry(CFG.COLS, 1, 1.05);

  function rowFlash(r) {
    var mat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    var m = new THREE.Mesh(flashGeo, mat);
    m.position.set(0, wy(r), 0);
    scene3.add(m);
    flashes.push({ m: m, t: 0 });
  }

  function updateFlashes(dt) {
    for (var i = flashes.length - 1; i >= 0; i--) {
      var f = flashes[i];
      f.t += dt;
      var k = f.t / 300;
      if (k >= 1) {
        scene3.remove(f.m);
        f.m.material.dispose();
        flashes.splice(i, 1);
      } else {
        f.m.material.opacity = 0.9 * (1 - k);
        f.m.scale.y = 1 + k * 0.8;
      }
    }
  }

  /* ---------- Реакция на игровые события ---------- */
  NT.events.on('clear', function (e) {
    e.rows.forEach(function (row) {
      rowFlash(row.r);
      for (var c = 0; c < CFG.COLS; c++) {
        spawnParticles(wx(c), wy(row.r), 0, row.colors[c], 6, e.n >= 4 ? 7 : 4.5);
      }
    });
    if (e.n === 4) NT.scene.addShake(0.45);
  });

  NT.events.on('harddrop', function (e) {
    NT.scene.addShake(Math.min(0.5, 0.18 + e.dist * 0.012));
  });

  NT.events.on('topout', function () {
    NT.scene.addShake(0.5);
  });

  return {
    update: function (dt) {
      updateParticles(dt);
      updateFlashes(dt);
    },
  };
})();
