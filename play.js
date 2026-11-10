// 無人機足球捲動動畫：往下捲往前播，往上捲倒帶（canvas 即時繪製，不是影片）
(function () {
  var sec = document.getElementById('play');
  var cv = document.getElementById('play-cv');
  if (!sec || !cv) return;
  var ctx = cv.getContext('2d');
  var caps = sec.querySelectorAll('.play-cap');
  var scoreEl = document.getElementById('play-score');
  var barEl = document.getElementById('play-bar');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var W = 0, H = 0, DPR = 1;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function seg(p, a, b) { return clamp((p - a) / (b - a), 0, 1); }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // ---- 3D 投影（單位：公尺；場地 6 × 3，高 3） ----
  var cam = { e: 1.5, a: 0, scale: 1 };
  function proj(X, Y, Z) {
    var ca = Math.cos(cam.a), sa = Math.sin(cam.a), ce = Math.cos(cam.e), se = Math.sin(cam.e);
    var x1 = X * ca - Y * sa, y1 = X * sa + Y * ca, z1 = Z - 1;
    var up = z1 * ce + y1 * se, depth = y1 * ce - z1 * se;
    var s = 9 / (9 + depth) * cam.scale;
    return { x: W / 2 + x1 * s, y: H * 0.64 - up * s, s: s };
  }
  function poly(pts, close) {
    ctx.beginPath();
    pts.forEach(function (p, i) { var q = proj(p[0], p[1], p[2]); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); });
    if (close) ctx.closePath();
  }
  function circlePts(cx, cy, cz, r, plane, n) {
    var out = [];
    for (var i = 0; i <= n; i++) {
      var t = i / n * Math.PI * 2, c = Math.cos(t) * r, s = Math.sin(t) * r;
      out.push(plane === 'floor' ? [cx + c, cy + s, cz] : [cx, cy + c, cz + s]);
    }
    return out;
  }

  // ---- 飛行路線（三次貝茲，三段） ----
  var GOAL = [2.55, 0, 1.35], GOAL_R = 0.42;
  var segs = [
    [[-1.9, 0.7, 1.2], [-0.8, 1.3, 1.5], [0.2, -1.0, 0.9], [1.3, -0.4, 1.2]],
    [[1.3, -0.4, 1.2], [1.8, -0.1, 1.3], [2.2, 0, 1.35], GOAL],
    [GOAL, [2.85, 0, 1.35], [2.9, 0.6, 1.4], [2.2, 0.9, 1.5]]
  ];
  function bez(s, t) {
    var u = 1 - t, r = [];
    for (var k = 0; k < 3; k++) r.push(u*u*u*s[0][k] + 3*u*u*t*s[1][k] + 3*u*t*t*s[2][k] + t*t*t*s[3][k]);
    return r;
  }
  var path = [];
  segs.forEach(function (s, i) { for (var j = (i ? 1 : 0); j <= 40; j++) path.push(bez(s, j / 40)); });
  var GOAL_IDX = 80; // 第二段結尾＝穿門瞬間
  function at(t) { var f = t * (path.length - 1), i = Math.floor(f), r = f - i, a = path[i], b = path[Math.min(i + 1, path.length - 1)]; return [lerp(a[0], b[0], r), lerp(a[1], b[1], r), lerp(a[2], b[2], r)]; }

  // 其他 5 台（3 對 3）
  var others = [
    { p: [-1.6, -0.9, 1.0], c: 'y' }, { p: [-2.4, 0.1, 1.6], c: 'y' },
    { p: [1.4, 0.8, 1.1], c: 'g' }, { p: [0.4, 0.2, 1.7], c: 'g' }, { p: [2.2, -0.6, 1.3], c: 'g' }
  ];

  function drone(X, Y, Z, col, alpha, spin) {
    if (alpha <= 0) return;
    var sh = proj(X, Y, 0), q = proj(X, Y, Z), r = 0.2 * q.s;
    ctx.globalAlpha = alpha * 0.35 * clamp(1 - Z / 3.2, 0.2, 1);
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(sh.x, sh.y, 0.2 * sh.s, 0.2 * sh.s * Math.max(0.15, Math.sin(cam.e)), 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = alpha;
    var main = col === 'y' ? '#FFD60A' : '#8e8e93';
    ctx.fillStyle = col === 'y' ? 'rgba(255,214,10,0.12)' : 'rgba(142,142,147,0.12)';
    ctx.strokeStyle = main; ctx.lineWidth = Math.max(1.2, r * 0.09);
    ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // 護罩經線（隨時間轉動）
    ctx.lineWidth = Math.max(0.8, r * 0.05);
    for (var k = 0; k < 3; k++) {
      var w = Math.abs(Math.cos(spin + k * Math.PI / 3)) * r;
      ctx.beginPath(); ctx.ellipse(q.x, q.y, w, r, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.beginPath(); ctx.ellipse(q.x, q.y, r, r * 0.32, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = main; ctx.beginPath(); ctx.arc(q.x, q.y, r * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  function ring(c, glow) {
    var pts = circlePts(c[0], c[1], c[2], GOAL_R, 'wall', 48);
    // 支柱
    ctx.strokeStyle = '#3a3a3c'; ctx.lineWidth = 2;
    poly([[c[0], c[1], 0], [c[0], c[1], c[2] - GOAL_R]]); ctx.stroke();
    if (glow > 0) { ctx.strokeStyle = 'rgba(255,214,10,' + (0.35 * glow) + ')'; ctx.lineWidth = 18 * cam.scale / 120; poly(pts); ctx.stroke(); }
    ctx.strokeStyle = c[0] > 0 ? '#FFD60A' : '#f5f5f7'; ctx.lineWidth = Math.max(3, 7 * cam.scale / 160);
    poly(pts); ctx.stroke();
  }

  var t0 = performance.now();
  function draw(p) {
    // 鏡頭：俯視 → 斜角，最後左右擺動
    var c1 = ease(seg(p, 0, 0.16)), c2 = ease(seg(p, 0.62, 0.86));
    cam.e = lerp(1.5, 0.42, c1);
    cam.a = lerp(0, -0.72, c1) + lerp(0, 0.3, c2);
    cam.scale = Math.min(W / (W < 700 ? 7.2 : 8.6), H / 6.4) * lerp(0.95, 1.05, c1);

    ctx.clearRect(0, 0, W, H);
    // 地板
    poly([[-3, -1.5, 0], [3, -1.5, 0], [3, 1.5, 0], [-3, 1.5, 0]], true);
    ctx.fillStyle = '#0d0d0f'; ctx.fill();
    ctx.strokeStyle = '#3a3a3c'; ctx.lineWidth = 1.5; ctx.stroke();
    poly([[0, -1.5, 0], [0, 1.5, 0]]); ctx.stroke();
    poly(circlePts(0, 0, 0, 0.5, 'floor', 48)); ctx.stroke();
    // 防護網框（高 3 公尺）
    var net = seg(p, 0.05, 0.2);
    if (net > 0) {
      ctx.strokeStyle = 'rgba(120,120,128,' + (0.45 * net) + ')'; ctx.lineWidth = 1;
      [[-3, -1.5], [3, -1.5], [3, 1.5], [-3, 1.5]].forEach(function (c) { poly([[c[0], c[1], 0], [c[0], c[1], 3]]); ctx.stroke(); });
      poly([[-3, -1.5, 3], [3, -1.5, 3], [3, 1.5, 3], [-3, 1.5, 3]], true); ctx.stroke();
    }
    // 尺寸標示
    var dim = seg(p, 0.06, 0.14) * (1 - seg(p, 0.2, 0.26));
    if (dim > 0) {
      ctx.globalAlpha = dim; ctx.fillStyle = '#a1a1a6'; ctx.font = '500 ' + Math.round(Math.max(12, cam.scale * 0.11)) + 'px "Noto Sans TC", sans-serif'; ctx.textAlign = 'center';
      var a = proj(0, -1.5, 0); ctx.fillText('6 公尺', a.x, a.y + cam.scale * 0.22);
      var b = proj(3, 0, 0); ctx.fillText('3 公尺', b.x + cam.scale * 0.36, b.y);
      var h = proj(-3, -1.5, 1.5); ctx.fillText('高 3 公尺', Math.max(36, h.x - cam.scale * 0.42), h.y);
      ctx.globalAlpha = 1;
    }

    var flyT = ease(seg(p, 0.34, 0.6));
    var passed = flyT * (path.length - 1) >= GOAL_IDX;
    var glow = passed ? 1 - seg(p, 0.6, 0.72) : 0;
    ring([-2.55, 0, 1.35], 0);
    // 路線殘影
    var n = Math.floor(flyT * (path.length - 1));
    if (n > 0) {
      ctx.setLineDash([6, 7]); ctx.strokeStyle = 'rgba(255,214,10,0.8)'; ctx.lineWidth = 2;
      poly(path.slice(0, n + 1)); ctx.stroke(); ctx.setLineDash([]);
    }

    // 其他隊員（3 對 3）
    var team = seg(p, 0.64, 0.78), spin = (performance.now() - t0) / 260;
    var bob = Math.sin(spin / 3) * 0.04;
    // 依深度排序後畫：先畫遠的
    var list = others.map(function (o, i) { return { X: o.p[0], Y: o.p[1], Z: o.p[2] + bob * (i % 2 ? 1 : -1), c: o.c, a: team }; });
    var takeoff = ease(seg(p, 0.2, 0.32));
    var me = flyT > 0 ? at(flyT) : [-1.9, 0.7, lerp(0, 1.2, takeoff)];
    list.push({ X: me[0], Y: me[1], Z: me[2] + (flyT === 0 && takeoff === 1 ? bob : 0), c: 'y', a: seg(p, 0.16, 0.22) });
    list.sort(function (u, v) { return proj(v.X, v.Y, v.Z).s - proj(u.X, u.Y, u.Z).s; });
    list.forEach(function (d) { drone(d.X, d.Y, d.Z, d.c, d.a, spin); });
    ring(GOAL, glow);
    // 穿門前無人機要在球門前面：若還沒穿門，再畫一次主角
    if (!passed && (flyT > 0)) drone(me[0], me[1], me[2], 'y', 1, spin);

    // 文字
    var ranges = [[0, 0.02, 0.15, 0.2], [0.18, 0.22, 0.31, 0.35], [0.33, 0.37, 0.6, 0.64], [0.62, 0.67, 0.84, 0.88], [0.86, 0.9, 1.01, 1.02]];
    if (!reduce) caps.forEach(function (el, i) {
      var r = ranges[i], o = seg(p, r[0], r[1]) * (1 - seg(p, r[2], r[3]));
      el.style.opacity = o; el.style.transform = 'translateY(' + (1 - o) * 16 + 'px)';
      el.style.visibility = o > 0.01 ? 'visible' : 'hidden';
    });
    scoreEl.textContent = passed ? '1' : '0';
    scoreEl.parentNode.style.opacity = seg(p, 0.3, 0.36) * (1 - seg(p, 0.88, 0.94));
    scoreEl.parentNode.classList.toggle('hit', glow > 0.2);
    barEl.style.transform = 'scaleX(' + p + ')';
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    var r = cv.getBoundingClientRect(); W = r.width; H = r.height;
    cv.width = W * DPR; cv.height = H * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  function progress() {
    if (reduce) return 0.8;
    var r = sec.getBoundingClientRect(), total = sec.offsetHeight - window.innerHeight;
    return clamp(-r.top / total, 0, 1);
  }
  var visible = true;
  if ('IntersectionObserver' in window) new IntersectionObserver(function (e) { visible = e[0].isIntersecting; }).observe(sec);
  function loop() { if (visible) draw(progress()); requestAnimationFrame(loop); }
  window.addEventListener('resize', resize);
  resize(); loop();
})();
