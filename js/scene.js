/* ============ 3D-сцена: рендер, камера, стакан, материалы ============ */
NT.scene = (function () {
  var CFG = NT.CFG, PIECES = NT.PIECES, util = NT.util;
  var COLS = CFG.COLS, ROWS = CFG.ROWS, HIDDEN = CFG.HIDDEN, VISIBLE = CFG.VISIBLE;

  var canvas = document.getElementById('scene');
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05060f);
  scene.fog = new THREE.FogExp2(0x05060f, 0.0085);

  var camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 400);

  /* ---------- Орбитальная камера ---------- */
  var ORBIT_DEF = { theta: 0, phi: 1.32, radius: 27 };
  var orbit = {
    theta: 0, phi: 1.32, radius: 27,
    tTheta: 0, tPhi: 1.32, tRadius: 27,
    auto: false,
  };
  var shake = 0;

  function updateCamera(dt) {
    if (orbit.auto) orbit.tTheta += dt * 0.00025;
    var k = 1 - Math.pow(0.0018, dt / 1000); // плавное догоняние
    orbit.theta += (orbit.tTheta - orbit.theta) * k;
    orbit.phi += (orbit.tPhi - orbit.phi) * k;
    orbit.radius += (orbit.tRadius - orbit.radius) * k;

    var sp = Math.sin(orbit.phi), cp = Math.cos(orbit.phi);
    camera.position.set(
      orbit.radius * sp * Math.sin(orbit.theta),
      orbit.radius * cp + 1.5,
      orbit.radius * sp * Math.cos(orbit.theta)
    );
    if (shake > 0.001) {
      camera.position.x += util.rnd(-shake, shake);
      camera.position.y += util.rnd(-shake, shake);
      shake *= Math.pow(0.0025, dt / 1000);
    } else shake = 0;
    camera.lookAt(0, 1.5, 0);
  }

  /* ---------- Свет ---------- */
  scene.add(new THREE.AmbientLight(0x223044, 1.4));
  var dirLight = new THREE.DirectionalLight(0xffffff, 1.05);
  dirLight.position.set(8, 18, 14);
  scene.add(dirLight);
  var rimLight = new THREE.PointLight(0x00e5ff, 1.4, 80);
  rimLight.position.set(0, 4, -16);
  scene.add(rimLight);
  var pieceLight = new THREE.PointLight(0xffffff, 1.1, 9);
  scene.add(pieceLight);

  NT.events.on('levelup', function (e) {
    rimLight.color.setHSL((0.52 + e.level * 0.07) % 1, 1, 0.55);
  });

  /* ---------- Процедурная текстура блока: фаска + блик ---------- */
  function makeBlockTexture() {
    var s = 128, cv = document.createElement('canvas');
    cv.width = cv.height = s;
    var ctx = cv.getContext('2d');
    var g = ctx.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.5, '#cfd6e0');
    g.addColorStop(1, '#9aa4b5');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(10,15,30,0.85)';
    for (var i = 0; i < 10; i++) {
      ctx.globalAlpha = 0.09;
      ctx.lineWidth = 20 - i * 2;
      ctx.strokeRect(0, 0, s, s);
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 3;
    ctx.strokeRect(14, 14, s - 28, s - 28);
    var hl = ctx.createRadialGradient(s * 0.3, s * 0.3, 4, s * 0.3, s * 0.3, s * 0.55);
    hl.addColorStop(0, 'rgba(255,255,255,0.75)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl;
    ctx.fillRect(0, 0, s, s);
    var tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return tex;
  }

  var blockTex = makeBlockTexture();
  var blockGeo = new THREE.BoxGeometry(0.94, 0.94, 0.94);

  /* ---------- Материалы ---------- */
  var lockedMat = new THREE.MeshStandardMaterial({
    map: blockTex, roughness: 0.32, metalness: 0.55,
    emissive: 0x151a2a, emissiveIntensity: 0.6,
  });
  var activeMats = PIECES.map(function (p) {
    return new THREE.MeshStandardMaterial({
      map: blockTex, color: p.color, roughness: 0.2, metalness: 0.45,
      emissive: p.color, emissiveIntensity: 0.42,
    });
  });
  var miniMats = PIECES.map(function (p) {
    return new THREE.MeshStandardMaterial({
      map: blockTex, color: p.color, roughness: 0.25, metalness: 0.5,
      emissive: p.color, emissiveIntensity: 0.3,
    });
  });
  var ghostMats = PIECES.map(function (p) {
    return new THREE.MeshBasicMaterial({
      color: p.color, transparent: true, opacity: 0.14, depthWrite: false,
    });
  });
  var holdGrayMat = new THREE.MeshStandardMaterial({
    map: blockTex, color: 0x5a6272, roughness: 0.5, metalness: 0.3,
  });

  /* Координаты: клетка -> мир. Видимые ряды r=2..21 занимают y от +9.5 до -9.5. */
  function wx(c) { return c - (COLS - 1) / 2; }
  function wy(r) { return (VISIBLE - 1) / 2 - (r - HIDDEN); }

  /* ---------- Зафиксированные блоки: InstancedMesh (1 draw call) ---------- */
  var boardMesh = new THREE.InstancedMesh(blockGeo, lockedMat, COLS * VISIBLE);
  boardMesh.count = 0;
  scene.add(boardMesh);
  var _m4 = new THREE.Matrix4();
  var _color = new THREE.Color();

  function refreshBoard(board) {
    var n = 0;
    for (var r = HIDDEN; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var v = board[r][c];
        if (!v) continue;
        _m4.makeTranslation(wx(c), wy(r), 0);
        boardMesh.setMatrixAt(n, _m4);
        boardMesh.setColorAt(n, _color.setHex(PIECES[v - 1].color));
        n++;
      }
    }
    boardMesh.count = n;
    boardMesh.instanceMatrix.needsUpdate = true;
    if (boardMesh.instanceColor) boardMesh.instanceColor.needsUpdate = true;
  }

  /* ---------- Активная фигура и призрак ---------- */
  var curMeshes = [], ghostMeshes = [];
  for (var i = 0; i < 4; i++) {
    var m = new THREE.Mesh(blockGeo, activeMats[0]);
    m.visible = false; scene.add(m); curMeshes.push(m);
    var gm = new THREE.Mesh(blockGeo, ghostMats[0]);
    gm.visible = false; scene.add(gm); ghostMeshes.push(gm);
  }

  function refreshCurrent(visible) {
    var game = NT.game;
    var cur = game && game.getCur();
    if (!visible || !cur) {
      for (var i = 0; i < 4; i++) {
        curMeshes[i].visible = false;
        ghostMeshes[i].visible = false;
      }
      pieceLight.intensity = 0;
      return;
    }
    var cells = PIECES[cur.type].rots[cur.rot];
    var gr = game.ghostRow();
    var cx = 0, cy = 0;
    for (var k = 0; k < 4; k++) {
      var c = cells[k][0], r = cells[k][1];
      var mesh = curMeshes[k];
      mesh.material = activeMats[cur.type];
      mesh.position.set(wx(cur.col + c), wy(cur.row + r), 0);
      mesh.visible = true;
      cx += mesh.position.x; cy += mesh.position.y;
      var g = ghostMeshes[k];
      g.material = ghostMats[cur.type];
      g.position.set(wx(cur.col + c), wy(gr + r), 0);
      g.visible = gr !== cur.row;
    }
    pieceLight.intensity = 1.1;
    pieceLight.color.setHex(PIECES[cur.type].color);
    pieceLight.position.set(cx / 4, cy / 4, 2.2);
  }

  /* ---------- Стакан: каркас, стены, пол ---------- */
  (function buildWell() {
    var W = COLS, H = VISIBLE;
    var frameMat = new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.55 });
    var gridMat = new THREE.LineBasicMaterial({ color: 0x0e5f78, transparent: true, opacity: 0.28 });

    var box = new THREE.BoxGeometry(W, H, 1);
    scene.add(new THREE.LineSegments(new THREE.EdgesGeometry(box), frameMat));
    box.dispose();

    var pts = [];
    for (var c = 0; c <= W; c++) pts.push(-W / 2 + c, -H / 2, -0.5, -W / 2 + c, H / 2, -0.5);
    for (var r = 0; r <= H; r++) pts.push(-W / 2, -H / 2 + r, -0.5, W / 2, -H / 2 + r, -0.5);
    var gGeo = new THREE.BufferGeometry();
    gGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    scene.add(new THREE.LineSegments(gGeo, gridMat));

    var wallMat = new THREE.MeshBasicMaterial({
      color: 0x06202e, transparent: true, opacity: 0.4,
      side: THREE.DoubleSide, depthWrite: false,
    });
    var back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), wallMat);
    back.position.z = -0.51;
    scene.add(back);
    var sl = new THREE.Mesh(new THREE.PlaneGeometry(1, H), wallMat);
    sl.rotation.y = Math.PI / 2;
    sl.position.x = -W / 2 - 0.001;
    scene.add(sl);
    var sr = sl.clone();
    sr.position.x = W / 2 + 0.001;
    scene.add(sr);

    var floor = new THREE.Mesh(
      new THREE.CylinderGeometry(24, 26, 1.2, 48),
      new THREE.MeshStandardMaterial({ color: 0x0a0f1e, roughness: 0.85, metalness: 0.3 })
    );
    floor.position.y = -H / 2 - 0.62;
    scene.add(floor);
    var grid = new THREE.GridHelper(46, 23, 0x0e5f78, 0x0a2a3a);
    grid.position.y = -H / 2 - 0.01;
    grid.material.transparent = true;
    grid.material.opacity = 0.35;
    scene.add(grid);
  })();

  /* ---------- Звёздное небо ---------- */
  var stars = (function buildStars() {
    var N = 900, pos = new Float32Array(N * 3);
    for (var i = 0; i < N; i++) {
      var R = util.rnd(60, 140);
      var a = util.rnd(0, Math.PI * 2), b = Math.acos(util.rnd(-1, 1));
      pos[i * 3] = R * Math.sin(b) * Math.cos(a);
      pos[i * 3 + 1] = R * Math.cos(b) * 0.6 + 10;
      pos[i * 3 + 2] = R * Math.sin(b) * Math.sin(a);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    var m = new THREE.PointsMaterial({
      color: 0x9fc4ff, size: 0.7, sizeAttenuation: true,
      transparent: true, opacity: 0.85, fog: false,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    var p = new THREE.Points(g, m);
    scene.add(p);
    return p;
  })();

  /* ---------- Панели NEXT / HOLD (живут в 3D, вращаются со сценой) ---------- */
  var NEXT_X = 8.6, HOLD_X = -8.6;
  var nextGroups = [];
  var holdGroup = new THREE.Group();
  var labelSprites = [];

  function makeLabelTexture(text) {
    var cv = document.createElement('canvas');
    cv.width = 256; cv.height = 80;
    var ctx = cv.getContext('2d');
    ctx.font = '400 40px "Russo One", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#bfeaff';
    ctx.fillText(text, 128, 42);
    var tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }
  function makeTextSprite(text) {
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeLabelTexture(text), transparent: true, depthWrite: false,
    }));
    sp.scale.set(3.4, 1.06, 1);
    sp.userData.text = text;
    labelSprites.push(sp);
    return sp;
  }

  (function buildSidePanels() {
    var panelMat = new THREE.MeshBasicMaterial({
      color: 0x081226, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false,
    });
    var edgeMat = new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.4 });

    function panel(x, y, w, h) {
      var p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), panelMat);
      p.position.set(x, y, 0);
      scene.add(p);
      var e = new THREE.LineSegments(new THREE.EdgesGeometry(p.geometry), edgeMat);
      e.position.copy(p.position);
      scene.add(e);
    }
    panel(NEXT_X, 4.4, 4.2, 10.6);
    panel(HOLD_X, 7.1, 4.2, 4.6);

    var nl = makeTextSprite('NEXT'); nl.position.set(NEXT_X, 10.4, 0); scene.add(nl);
    var hl = makeTextSprite('HOLD'); hl.position.set(HOLD_X, 10.1, 0); scene.add(hl);

    for (var i = 0; i < 3; i++) {
      var g = new THREE.Group();
      g.position.set(NEXT_X, 7.6 - i * 3.1, 0.3);
      g.scale.setScalar(0.62);
      scene.add(g);
      nextGroups.push(g);
    }
    holdGroup.position.set(HOLD_X, 6.7, 0.3);
    holdGroup.scale.setScalar(0.62);
    scene.add(holdGroup);
  })();

  /* Когда Russo One загрузится — перерисовать надписи NEXT/HOLD этим шрифтом */
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      labelSprites.forEach(function (sp) {
        var old = sp.material.map;
        sp.material.map = makeLabelTexture(sp.userData.text);
        sp.material.needsUpdate = true;
        if (old) old.dispose();
      });
    });
  }

  function fillMiniGroup(group, type, mat) {
    group.clear();
    if (type < 0) return;
    var p = PIECES[type];
    var cells = p.rots[0];
    var minC = 9, maxC = -9, minR = 9, maxR = -9;
    cells.forEach(function (cr) {
      minC = Math.min(minC, cr[0]); maxC = Math.max(maxC, cr[0]);
      minR = Math.min(minR, cr[1]); maxR = Math.max(maxR, cr[1]);
    });
    var ox = (minC + maxC) / 2, oy = (minR + maxR) / 2;
    cells.forEach(function (cr) {
      var m = new THREE.Mesh(blockGeo, mat || miniMats[type]);
      m.position.set(cr[0] - ox, oy - cr[1], 0);
      group.add(m);
    });
  }

  function refreshSide() {
    var game = NT.game;
    var q = game.getQueue();
    for (var i = 0; i < 3; i++) {
      fillMiniGroup(nextGroups[i], q[i] !== undefined ? q[i] : -1);
    }
    fillMiniGroup(holdGroup, game.getHoldType(), game.getCanHold() ? null : holdGrayMat);
  }

  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return {
    canvas: canvas,
    scene: scene,
    camera: camera,
    orbit: orbit,
    blockGeo: blockGeo,
    wx: wx,
    wy: wy,
    updateCamera: updateCamera,
    refreshBoard: refreshBoard,
    refreshCurrent: refreshCurrent,
    refreshSide: refreshSide,
    addShake: function (v) { shake = Math.max(shake, v); },
    resetView: function () {
      orbit.tTheta = ORBIT_DEF.theta;
      orbit.tPhi = ORBIT_DEF.phi;
      orbit.tRadius = ORBIT_DEF.radius;
    },
    toggleAuto: function () { orbit.auto = !orbit.auto; return orbit.auto; },
    render: function (dt) {
      updateCamera(dt);
      stars.rotation.y += dt * 0.000012;
      renderer.render(scene, camera);
    },
  };
})();
