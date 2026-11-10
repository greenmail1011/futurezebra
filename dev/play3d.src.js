// 無人機足球捲動動畫（WebGL 真 3D 版）
// 往下捲往前播、往上捲倒帶。場景內容完全由捲動進度 p（0–1）決定，只有螺旋槳與懸停晃動跟時間走。
// 原始碼：dev/play3d.src.js → 用 esbuild 打包成 play3d.js（含 Three.js，不靠外部 CDN）。
// 不支援 WebGL 的裝置會自動改載入舊版 play.js（2D 線框）。
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

(function () {
  var sec = document.getElementById('play');
  var cv = document.getElementById('play-cv');
  if (!sec || !cv) return;
  var base = ((document.currentScript && document.currentScript.src) || '').replace(/[^\/]*$/, '');
  function fallback() {
    var s = document.createElement('script'); s.src = base + 'play.js'; document.body.appendChild(s);
  }
  var renderer;
  try {
    var probe = document.createElement('canvas');
    if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) throw new Error('no webgl');
    renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
  } catch (e) { fallback(); return; }

  var caps = sec.querySelectorAll('.play-cap');
  var scoreEl = document.getElementById('play-score');
  var barEl = document.getElementById('play-bar');
  var sticky = cv.parentNode;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var W = 1, H = 1, aspect = 1;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function seg(p, a, b) { return clamp((p - a) / (b - a), 0, 1); }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function backOut(t) { var c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
  // 舊版座標（X 長邊、Y 寬、Z 高，公尺）→ three 座標（y 朝上）
  function V(X, Y, Z) { return new THREE.Vector3(X, Z, -Y); }

  var YEL = 0xFFD60A, GRY = 0xc7c7cc, WHT = 0xf5f5f7;

  renderer.setClearColor(0x000000, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.autoClear = false;
  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(35, 1, 0.05, 120);
  var pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.3;
  pm.dispose();

  var world = new THREE.Group();  // 會被地板反射的物件
  var stat = new THREE.Group();   // 不反射：地板、標線、防護網、影子
  scene.add(world, stat);

  // ---- 燈光 ----
  scene.add(new THREE.HemisphereLight(0xffffff, 0x000000, 0.35));
  var key = new THREE.DirectionalLight(0xffffff, 1.3); key.position.set(-3, 6, 5); scene.add(key);
  var spot = new THREE.SpotLight(0xffffff, 55, 0, 0.62, 0.9, 1.6); spot.position.set(0, 8, 0); scene.add(spot, spot.target);
  var goalLight = new THREE.PointLight(YEL, 2, 5, 1.8); scene.add(goalLight);

  // ---- 小工具：漸層貼圖 ----
  function radialTex(stops) {
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    stops.forEach(function (s) { gr.addColorStop(s[0], s[1]); });
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  var glowTex = radialTex([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']]);
  var shadowTex = radialTex([[0, 'rgba(0,0,0,0.85)'], [0.6, 'rgba(0,0,0,0.35)'], [1, 'rgba(0,0,0,0)']]);
  var fadeTex = radialTex([[0, '#fff'], [0.45, '#fff'], [1, '#000']]);
  function glow(color, size, opacity) {
    var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: color, transparent: true, opacity: opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.scale.setScalar(size); return s;
  }

  // ---- 地板與標線 ----
  // 場內地板半透明（看得到倒影）；場外另一片不透明並向外淡出，倒影只出現在場內
  var floor = new THREE.Mesh(new THREE.PlaneGeometry(6.06, 3.06),
    new THREE.MeshStandardMaterial({ color: 0x161619, roughness: 0.42, metalness: 0.3, envMapIntensity: 0.25, transparent: true, opacity: 0.84 }));
  floor.rotation.x = -Math.PI / 2; floor.renderOrder = -3; scene.add(floor);
  var apronShape = new THREE.Shape(); apronShape.absarc(0, 0, 16, 0, Math.PI * 2, false);
  var hole = new THREE.Path(); hole.moveTo(-3.03, -1.53); hole.lineTo(-3.03, 1.53); hole.lineTo(3.03, 1.53); hole.lineTo(3.03, -1.53); hole.closePath(); apronShape.holes.push(hole);
  var apronGeo = new THREE.ShapeGeometry(apronShape, 48), auv = apronGeo.attributes.uv;
  for (var ai = 0; ai < auv.count; ai++) auv.setXY(ai, auv.getX(ai) / 32 + 0.5, auv.getY(ai) / 32 + 0.5);
  var apron = new THREE.Mesh(apronGeo, new THREE.MeshStandardMaterial({ color: 0x161619, roughness: 0.42, metalness: 0.3, envMapIntensity: 0.25, transparent: true, alphaMap: fadeTex }));
  apron.rotation.x = -Math.PI / 2; apron.renderOrder = -3; stat.add(apron);
  var lineMat = new THREE.MeshBasicMaterial({ color: 0x55555a });
  function strip(w, d, x, z) { var m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineMat); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.003, z); stat.add(m); }
  strip(6, 0.02, 0, 1.5); strip(6, 0.02, 0, -1.5); strip(0.02, 3, 3, 0); strip(0.02, 3, -3, 0); strip(0.02, 3, 0, 0);
  var cc = new THREE.Mesh(new THREE.RingGeometry(0.49, 0.51, 72), lineMat); cc.rotation.x = -Math.PI / 2; cc.position.y = 0.003; stat.add(cc);

  // ---- 防護網（框＋網格），6 × 3 × 3 ----
  var net = new THREE.Group(); stat.add(net);
  var frameMat = new THREE.MeshStandardMaterial({ color: 0x8e8e93, roughness: 0.5, metalness: 0.6, transparent: true, opacity: 0 });
  function bar(a, b) {
    var d = b.clone().sub(a), m = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, d.length(), 6), frameMat);
    m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); net.add(m);
  }
  [[-3, -1.5], [3, -1.5], [3, 1.5], [-3, 1.5]].forEach(function (c, i, arr) {
    var n = arr[(i + 1) % 4];
    bar(new THREE.Vector3(c[0], 0, c[1]), new THREE.Vector3(c[0], 3, c[1]));
    bar(new THREE.Vector3(c[0], 3, c[1]), new THREE.Vector3(n[0], 3, n[1]));
  });
  var gc = document.createElement('canvas'); gc.width = gc.height = 64;
  var gx = gc.getContext('2d'); gx.strokeStyle = '#fff'; gx.lineWidth = 3; gx.strokeRect(0, 0, 64, 64);
  function netTex(rx, ry) { var t = new THREE.CanvasTexture(gc); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 4; return t; }
  var netMats = [];
  function wall(w, h, pos, rx, ry) {
    var mat = new THREE.MeshBasicMaterial({ color: 0xaeaeb2, alphaMap: netTex(w / 0.15, h / 0.15), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
    var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.copy(pos); m.rotation.set(rx, ry, 0); m.renderOrder = -1; net.add(m); netMats.push(mat);
  }
  wall(6, 3, new THREE.Vector3(0, 1.5, -1.5), 0, 0); wall(6, 3, new THREE.Vector3(0, 1.5, 1.5), 0, 0);
  wall(3, 3, new THREE.Vector3(-3, 1.5, 0), 0, Math.PI / 2); wall(3, 3, new THREE.Vector3(3, 1.5, 0), 0, Math.PI / 2);
  wall(6, 3, new THREE.Vector3(0, 3, 0), Math.PI / 2, 0);

  // ---- 球門 ----
  var GOAL = V(2.55, 0, 1.35), HOME = V(-2.55, 0, 1.35), GOAL_R = 0.42;
  var postMat = new THREE.MeshStandardMaterial({ color: 0x48484c, roughness: 0.5, metalness: 0.7 });
  function ring(pos, color, ei) {
    var g = new THREE.Group(); g.position.copy(pos);
    var mat = new THREE.MeshStandardMaterial({ color: color, emissive: color, emissiveIntensity: ei, roughness: 0.35, metalness: 0.2 });
    var t = new THREE.Mesh(new THREE.TorusGeometry(GOAL_R, 0.034, 18, 96), mat); t.rotation.y = Math.PI / 2; g.add(t);
    var halo = new THREE.Mesh(new THREE.TorusGeometry(GOAL_R, 0.1, 12, 72),
      new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.rotation.y = Math.PI / 2; g.add(halo);
    var h = pos.y - GOAL_R, post = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, h, 8), postMat);
    post.position.y = -GOAL_R - h / 2; g.add(post);
    world.add(g); return { g: g, mat: mat, halo: halo, t: t };
  }
  var homeRing = ring(HOME, WHT, 0.45), goalRing = ring(GOAL, YEL, 0.9);
  goalLight.position.copy(GOAL);
  // 進球：衝擊波＋火花
  var wave = new THREE.Mesh(new THREE.TorusGeometry(GOAL_R, 0.012, 8, 72),
    new THREE.MeshBasicMaterial({ color: YEL, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  wave.rotation.y = Math.PI / 2; wave.position.copy(GOAL); world.add(wave);
  var NP = 90, pDir = [], pPos = new Float32Array(NP * 3), rnd = 7;
  function rand() { rnd = (rnd * 16807) % 2147483647; return rnd / 2147483647; }
  for (var i = 0; i < NP; i++) {
    var a = rand() * Math.PI * 2, sp = 0.5 + rand() * 1.3;
    pDir.push([0.5 + rand() * 1.6, Math.cos(a) * sp, Math.sin(a) * sp, a]);
  }
  var pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  var sparks = new THREE.Points(pGeo, new THREE.PointsMaterial({ map: glowTex, color: YEL, size: 0.09, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  sparks.frustumCulled = false; world.add(sparks);

  // ---- 無人機：球型護罩＋四軸機身 ----
  var R = 0.2;
  var cageGeo = (function () {
    var e = new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(R, 1), 1).attributes.position, parts = [];
    var up = new THREE.Vector3(0, 1, 0), a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3(), q = new THREE.Quaternion(), m = new THREE.Matrix4();
    for (var i = 0; i < e.count; i += 2) {
      a.fromBufferAttribute(e, i); b.fromBufferAttribute(e, i + 1); d.subVectors(b, a);
      var c = new THREE.CylinderGeometry(0.0042, 0.0042, d.length(), 5, 1, true);
      q.setFromUnitVectors(up, d.clone().normalize());
      m.compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
      c.applyMatrix4(m); parts.push(c);
    }
    return mergeGeometries(parts);
  })();
  var bodyMat = new THREE.MeshStandardMaterial({ color: 0x2c2c2e, roughness: 0.35, metalness: 0.7 });
  var armMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.45, metalness: 0.6 });
  var bladeMat = new THREE.MeshStandardMaterial({ color: 0xe5e5ea, roughness: 0.4 });
  var discMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide });
  var armGeo = new THREE.BoxGeometry(0.27, 0.012, 0.02), bodyGeo = new THREE.BoxGeometry(0.1, 0.032, 0.07);
  var motorGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.024, 12), bladeGeo = new THREE.BoxGeometry(0.1, 0.002, 0.013), discGeo = new THREE.CircleGeometry(0.052, 24);
  var ledGeo = new THREE.SphereGeometry(0.011, 10, 8), shellGeo = new THREE.SphereGeometry(R * 0.985, 24, 16);
  var drones = [];
  function makeDrone(team) {
    var col = team === 'y' ? YEL : GRY, g = new THREE.Group(), props = [];
    g.add(new THREE.Mesh(cageGeo, new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: team === 'y' ? 0.55 : 0.12, roughness: 0.4, metalness: 0.3 })));
    g.add(new THREE.Mesh(shellGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: team === 'y' ? 0.05 : 0.025, blending: THREE.AdditiveBlending, depthWrite: false })));
    [Math.PI / 4, -Math.PI / 4].forEach(function (r) { var a = new THREE.Mesh(armGeo, armMat); a.rotation.y = r; g.add(a); });
    g.add(new THREE.Mesh(bodyGeo, bodyMat));
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (s, i) {
      var x = s[0] * 0.09, z = s[1] * 0.09;
      var mo = new THREE.Mesh(motorGeo, bodyMat); mo.position.set(x, 0.014, z); g.add(mo);
      var pr = new THREE.Group(); pr.position.set(x, 0.03, z);
      pr.add(new THREE.Mesh(bladeGeo, bladeMat));
      var di = new THREE.Mesh(discGeo, discMat); di.rotation.x = -Math.PI / 2; pr.add(di);
      pr.userData.dir = i % 3 === 0 ? 1 : -1; g.add(pr); props.push(pr);
    });
    var ledMat = new THREE.MeshBasicMaterial({ color: col });
    [0.052, -0.052].forEach(function (x) { var l = new THREE.Mesh(ledGeo, ledMat); l.position.set(x, 0, 0); g.add(l); });
    g.add(glow(col, team === 'y' ? 0.62 : 0.5, team === 'y' ? 0.32 : 0.1));
    world.add(g);
    var sh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.004; stat.add(sh);
    var d = { g: g, props: props, sh: sh, pos: new THREE.Vector3(), show: 0 };
    drones.push(d); return d;
  }
  var me = makeDrone('y');
  var others = [
    { p: V(-1.6, -0.9, 1.0), c: 'y' }, { p: V(-2.4, 0.1, 1.6), c: 'y' },
    { p: V(1.4, 0.8, 1.1), c: 'g' }, { p: V(0.4, 0.2, 1.7), c: 'g' }, { p: V(2.2, -0.6, 1.3), c: 'g' }
  ].map(function (o, i) { var d = makeDrone(o.c); d.home = o.p; d.ph = i * 1.7 + 0.6; return d; });

  // ---- 飛行路線（沿用舊版三段貝茲的控制點） ----
  var START = V(-1.9, 0.7, 1.2);
  var curve = new THREE.CurvePath();
  [[[-1.9, 0.7, 1.2], [-0.8, 1.3, 1.5], [0.2, -1.0, 0.9], [1.3, -0.4, 1.2]],
   [[1.3, -0.4, 1.2], [1.8, -0.1, 1.3], [2.2, 0, 1.35], [2.55, 0, 1.35]],
   [[2.55, 0, 1.35], [2.85, 0, 1.35], [2.9, 0.6, 1.4], [2.2, 0.9, 1.5]]].forEach(function (s) {
    curve.add(new THREE.CubicBezierCurve3(V.apply(null, s[0]), V.apply(null, s[1]), V.apply(null, s[2]), V.apply(null, s[3])));
  });
  var U_GOAL = (function () { var best = 0, bd = 1e9; for (var i = 0; i <= 600; i++) { var d = curve.getPointAt(i / 600).distanceTo(GOAL); if (d < bd) { bd = d; best = i / 600; } } return best; })();
  var FLY0 = 0.34, FLY1 = 0.6;
  var P_GOAL = (function () { var lo = FLY0, hi = FLY1; for (var i = 0; i < 30; i++) { var m = (lo + hi) / 2; ease(seg(m, FLY0, FLY1)) < U_GOAL ? lo = m : hi = m; } return hi; })();
  var TS = 260, TR = 6;
  var trail = new THREE.Mesh(new THREE.TubeGeometry(curve, TS, 0.011, TR, false),
    new THREE.MeshBasicMaterial({ color: YEL, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  trail.geometry.setDrawRange(0, 0); world.add(trail);
  var trailHead = glow(YEL, 0.5, 0); world.add(trailHead);

  // ---- 尺寸標示（HTML 疊在畫布上） ----
  var labels = [['6 公尺', new THREE.Vector3(0, 0, 1.78)], ['3 公尺', new THREE.Vector3(3.34, 0, 0)], ['高 3 公尺', new THREE.Vector3(-3.1, 1.5, 1.6)]].map(function (l) {
    var el = document.createElement('span'); el.textContent = l[0]; el.setAttribute('aria-hidden', 'true');
    el.style.cssText = 'position:absolute;left:0;top:0;font:500 14px "Noto Sans TC",sans-serif;color:#a1a1a6;white-space:nowrap;pointer-events:none;opacity:0;will-change:transform,opacity;';
    sticky.insertBefore(el, cv.nextSibling); return { el: el, p: l[1] };
  });

  // ---- 每一格 ----
  var t0 = performance.now(), tmp = new THREE.Vector3(), tan = new THREE.Vector3(), camPos = new THREE.Vector3(), camTar = new THREE.Vector3();
  var UP = new THREE.Vector3(0, 1, 0), axis = new THREE.Vector3(), qYaw = new THREE.Quaternion(), qTilt = new THREE.Quaternion();
  function place(d, show, t, spinMul) {
    d.g.visible = show > 0.001; d.sh.visible = d.g.visible;
    if (!d.g.visible) return;
    d.g.position.copy(d.pos); d.g.scale.setScalar(show);
    var hgt = clamp(d.pos.y / 3, 0, 1), s = lerp(0.42, 0.95, hgt) * show;
    d.sh.position.x = d.pos.x; d.sh.position.z = d.pos.z; d.sh.scale.set(s, s, 1); d.sh.material.opacity = lerp(0.9, 0.3, hgt) * show;
    for (var i = 0; i < 4; i++) d.props[i].rotation.y = d.props[i].userData.dir * t * 34 * spinMul + i;
  }
  function frame(p) {
    var t = reduce ? 0 : (performance.now() - t0) / 1000;
    var kW = Math.max(1, 1.5 / aspect), kC = Math.max(1, 1.25 / aspect);

    // 主角：出現 → 起飛 → 沿路線飛 → 穿門 → 脫離
    var takeoff = ease(seg(p, 0.2, 0.32)), flyT = ease(seg(p, FLY0, FLY1)), passed = flyT >= U_GOAL && p >= P_GOAL;
    var bob = Math.sin(t * 2.1) * 0.025;
    if (flyT > 0) { curve.getPointAt(flyT, me.pos); curve.getTangentAt(Math.min(flyT, 0.999), tan); }
    else { me.pos.set(START.x, lerp(R, START.y, takeoff), START.z); tan.set(1, 0, 0); }
    var speed = Math.sin(Math.PI * seg(p, FLY0, FLY1));           // 0 → 1 → 0
    if (flyT === 0 || flyT === 1) me.pos.y += bob * (flyT === 1 ? 1 : takeoff);
    qYaw.setFromAxisAngle(UP, Math.atan2(-tan.z, tan.x));
    axis.set(tan.z, 0, -tan.x).normalize(); if (!axis.lengthSq()) axis.set(0, 0, -1);
    qTilt.setFromAxisAngle(axis, -0.42 * speed);
    me.g.quaternion.copy(qTilt).multiply(qYaw);
    place(me, backOut(seg(p, 0.155, 0.215)), t, lerp(0.25, 1, seg(p, 0.17, 0.24)));

    // 其他五台：3 對 3 登場後各自巡航
    var team = seg(p, 0.64, 0.78);
    others.forEach(function (d, i) {
      var sh = backOut(clamp(team * 1.6 - i * 0.12, 0, 1));
      d.pos.set(d.home.x + Math.sin(t * 0.55 + d.ph) * 0.34, d.home.y + Math.sin(t * 1.3 + d.ph * 2) * 0.07, d.home.z + Math.cos(t * 0.45 + d.ph) * 0.26);
      d.g.rotation.set(Math.cos(t * 0.45 + d.ph) * 0.12, d.ph + Math.sin(t * 0.3 + d.ph) * 0.6, -Math.cos(t * 0.55 + d.ph) * 0.14);
      place(d, sh, t, 1);
    });

    // 軌跡
    var n = Math.floor(flyT * TS), tf = 1 - seg(p, 0.66, 0.78);
    trail.geometry.setDrawRange(0, n * TR * 6); trail.material.opacity = 0.9 * tf; trail.visible = n > 0 && tf > 0;
    trailHead.position.copy(me.pos); trailHead.material.opacity = 0.55 * speed;

    // 防護網
    var nv = seg(p, 0.05, 0.2), closeIn = seg(p, 0.17, 0.24) * (1 - seg(p, 0.31, 0.4));
    frameMat.opacity = 0.75 * nv; net.visible = nv > 0;
    netMats.forEach(function (m) { m.opacity = 0.085 * nv * (1 - 0.55 * closeIn); });

    // 球門與進球特效（全部跟著捲動進度，可倒帶）
    var flash = passed ? 1 - seg(p, P_GOAL, P_GOAL + 0.13) : 0, burst = passed ? seg(p, P_GOAL, P_GOAL + 0.1) : 0;
    var pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
    goalRing.mat.emissiveIntensity = 0.85 + 0.2 * pulse + 2.6 * flash;
    goalRing.halo.material.opacity = 0.06 + 0.03 * pulse + 0.3 * flash;
    goalRing.g.scale.setScalar(1 + 0.07 * flash);
    goalLight.intensity = 2.5 + 22 * flash;
    wave.visible = burst > 0 && burst < 1; wave.scale.setScalar(1 + 2.4 * burst); wave.material.opacity = 0.9 * (1 - burst);
    sparks.visible = wave.visible;
    if (sparks.visible) {
      var e = 1 - Math.pow(1 - burst, 2);
      for (var i = 0; i < NP; i++) {
        var d = pDir[i];
        pPos[i * 3] = GOAL.x + d[0] * e * 0.9; pPos[i * 3 + 1] = GOAL.y + Math.cos(d[3]) * GOAL_R + d[1] * e * 0.7 - 0.5 * burst * burst; pPos[i * 3 + 2] = GOAL.z + Math.sin(d[3]) * GOAL_R + d[2] * e * 0.7;
      }
      pGeo.attributes.position.needsUpdate = true; sparks.material.opacity = 1 - burst;
    }

    // 鏡頭：俯視 → 斜角全景 → 貼近主角 → 追飛 → 拉遠環繞
    var w1 = ease(seg(p, 0, 0.16)), w2 = ease(seg(p, 0.165, 0.24)), w3 = ease(seg(p, 0.31, 0.41)), w4 = ease(seg(p, 0.56, 0.7));
    camPos.set(0, 8.6 * kW, 0.7); camTar.set(0, 0, 0);
    tmp.set(-5.1 * kW, 3.9 * kW, 8.3 * kW); camPos.lerp(tmp, w1); camTar.lerp(tmp.set(0, 0.75, 0), w1);
    floor.material.opacity = lerp(1, 0.84, w1); spot.intensity = lerp(20, 55, w1);
    var oa = -0.5 + (p - 0.2) * 5.5;                                   // 近拍時繞著主角轉
    tmp.set(me.pos.x + Math.sin(oa) * 1.15 * kC, me.pos.y + 0.22 * kC, me.pos.z + Math.cos(oa) * 1.15 * kC); camPos.lerp(tmp, w2); camTar.lerp(me.pos, w2);
    var kD = Math.sqrt(kW), look = seg(p, 0.36, 0.5);
    tmp.set(me.pos.x - 0.9 * kD, me.pos.y + 0.55 * kD, me.pos.z + 3.2 * kD); camPos.lerp(tmp, w3);
    tmp.copy(me.pos).lerp(GOAL, 0.4 * look * (1 - w4)); camTar.lerp(tmp, w3);
    var th = lerp(-0.5, 0.42, seg(p, 0.56, 1)) + (reduce ? 0 : Math.sin(t * 0.25) * 0.03);
    tmp.set(Math.sin(th) * 10 * kW, 3.1 * kW, Math.cos(th) * 10 * kW); camPos.lerp(tmp, w4); camTar.lerp(tmp.set(0, 1.0, 0), w4);
    camera.position.copy(camPos); camera.lookAt(camTar);
    renderer.toneMappingExposure = lerp(1.15, 0.72, seg(p, 0.86, 0.95));

    // 先畫倒影（上下翻轉），再畫地板與實體
    renderer.clear();
    floor.visible = false; stat.visible = false; world.scale.y = -1;
    renderer.render(scene, camera);
    renderer.clearDepth();
    floor.visible = true; stat.visible = true; world.scale.y = 1;
    renderer.render(scene, camera);

    // 尺寸標示
    var dim = seg(p, 0.06, 0.14) * (1 - seg(p, 0.165, 0.21));
    labels.forEach(function (l) {
      l.el.style.opacity = dim;
      if (dim <= 0) return;
      tmp.copy(l.p).project(camera);
      l.el.style.transform = 'translate(-50%,-50%) translate(' + ((tmp.x + 1) / 2 * W).toFixed(1) + 'px,' + ((1 - tmp.y) / 2 * H).toFixed(1) + 'px)';
    });

    // 文字、比分、進度條（與舊版相同）
    var ranges = [[0, 0.02, 0.15, 0.2], [0.18, 0.22, 0.31, 0.35], [0.33, 0.37, 0.6, 0.64], [0.62, 0.67, 0.84, 0.88], [0.86, 0.9, 1.01, 1.02]];
    if (!reduce) caps.forEach(function (el, i) {
      var r = ranges[i], o = seg(p, r[0], r[1]) * (1 - seg(p, r[2], r[3]));
      el.style.opacity = o; el.style.transform = 'translateY(' + (1 - o) * 16 + 'px)';
      el.style.visibility = o > 0.01 ? 'visible' : 'hidden';
    });
    if (scoreEl) {
      scoreEl.textContent = passed ? '1' : '0';
      scoreEl.parentNode.style.opacity = seg(p, 0.3, 0.36) * (1 - seg(p, 0.88, 0.94));
      scoreEl.parentNode.classList.toggle('hit', flash > 0.2);
    }
    if (barEl) barEl.style.transform = 'scaleX(' + p + ')';
  }

  function resize() {
    var r = cv.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height); aspect = W / H;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, W < 700 ? 1.75 : 2));
    renderer.setSize(W, H, false);
    camera.aspect = aspect;
    camera.setViewOffset(W, H, 0, -H * 0.15, W, H);   // 畫面重心往下移，上方留給文字
    camera.updateProjectionMatrix();
    if (reduce) frame(0.8);
  }
  function progress() {
    var r = sec.getBoundingClientRect(), total = sec.offsetHeight - window.innerHeight;
    return clamp(-r.top / total, 0, 1);
  }
  var visible = true;
  if ('IntersectionObserver' in window) new IntersectionObserver(function (e) { visible = e[0].isIntersecting; }).observe(sec);
  function loop() { if (visible && !document.hidden) frame(progress()); requestAnimationFrame(loop); }
  window.addEventListener('resize', resize);
  cv.addEventListener('webglcontextlost', function (e) { e.preventDefault(); });
  window.__play3d = { frame: frame };
  resize();
  if (!reduce) loop();
})();
