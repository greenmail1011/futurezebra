#!/usr/bin/env python3
"""從 sky-striker 模擬器產生官網用的「3D 示範賽」嵌入頁 live/index.html。

用法：python3 dev/make-live.py <sky-striker 的 index.html> <輸出資料夾 live/>
- 預設「捲動播放」：播一段錄好的進球片段（live/clip.json），父頁面捲動進度決定播到哪，
  不捲就不動、往回捲會倒轉；GOAL 字、白閃、球門爆閃、選手歡呼都跟著捲動進度走
- ?auto=1：改成即時 AI vs AI 示範賽（自動開始、連續對戰、進球自動回放）
- ?record=1：錄影模式，用來產生 clip.json（見 dev/record-clip.py）
- 不顯示看台觀眾，室內競技場背景改藏青
- 所有選單、按鈕、操作說明、計分 HUD 都藏起來，不能操作、不能玩
- 拿掉協會字樣（HUD credit、選單 logo、場邊廣告板改成富志科技）
- 不出聲音；Three.js r128 與 GLTFLoader 改成本機檔，不靠外部 CDN
- 父頁面可用 postMessage('fz-pause') / postMessage('fz-play') 暫停／繼續（看不到時不耗電）
- 網址參數：?scene=arena|sky|meadow|neon|orbit（場景，預設 arena 室內競技場）、?lv=1~5（AI 等級，預設 4）
sky-striker 更新後重跑一次即可；每個替換都會檢查次數，對不上就停下來。
"""
import re, sys, pathlib

src, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
h = src.read_text(encoding='utf-8')

def rep(old, new, count=1, regex=False):
    global h
    n = len(re.findall(old, h)) if regex else h.count(old)
    if n != count:
        sys.exit(f'替換次數不符（預期 {count}，實際 {n}）：{old[:70]}')
    h = re.sub(old, new, h) if regex else h.replace(old, new)

EARLY = r"""<script>
/* ===== 富志官網嵌入模式（dev/make-live.py 產生）===== */
window.FZ_EMBED = true;
(function(){
  var q = new URLSearchParams(location.search);
  window.FZ_RECORD = q.has('record');
  window.FZ_SCRUB = !q.has('auto') && !window.FZ_RECORD;
  window.FZ_P = 0;
  var scene = q.get('scene') || 'arena', lv = Math.max(1, Math.min(5, +(q.get('lv') || 4)));
  try{
    localStorage.setItem('hsinchuDroneSoccerSceneV1', scene);
    localStorage.setItem('hsinchuDroneAiLvDemoV1', JSON.stringify({blue: lv, red: lv}));
    localStorage.setItem('hsinchuDroneDemoLoopV1', '1');
    localStorage.setItem('hsinchuDroneReplayOnV1', window.FZ_RECORD ? '0' : '1');
  }catch(e){}
  // 繪圖控制：父頁面看不到時暫停；捲動播放模式只在畫面需要變的時候才畫（不捲就完全不動）
  var raf = window.requestAnimationFrame.bind(window), paused = false, queued = null;
  var budget = window.FZ_SCRUB ? 600 : Infinity;
  window.requestAnimationFrame = function(cb){
    if(paused || budget <= 0){ queued = cb; return 0; }
    budget--; return raf(cb);
  };
  window.FZ_KICK = function(n){
    budget = Math.max(budget, n);
    if(!paused && queued && budget > 0){ var c = queued; queued = null; budget--; raf(c); }
  };
  addEventListener('resize', function(){ window.FZ_KICK(3); });
  addEventListener('message', function(e){
    var m = e.data;
    if(typeof m !== 'string') return;
    if(m === 'fz-pause') paused = true;
    else if(m === 'fz-play'){ paused = false; window.FZ_KICK(window.FZ_SCRUB ? 3 : Infinity); }
    else if(m.indexOf('fz-p:') === 0){ var v = +m.slice(5); if(v >= 0 && v <= 1){ window.FZ_P = v; window.FZ_KICK(3); } }
  });
  // 模組程式跑完後開始：示範賽先開起來，捲動模式再切成播放錄好的片段
  document.addEventListener('DOMContentLoaded', function(){
    var b = document.getElementById('btnDemo'); if(b) b.click();
    if(window.FZ_SCRUB && window.FZ_SETUP) window.FZ_SETUP();
  });
})();
</script>
"""

EMBED_CSS = r"""<style>
/* ===== 富志官網嵌入模式：只留 3D 畫面與 GOAL 特效 ===== */
html,body{background:#0b1d3a!important;overflow:hidden!important}
body > *:not(canvas):not(#rpUI):not(#bootCover):not(script):not(style){display:none!important}
#rpUI > *:not(#rpFlash):not(#rpGoal){display:none!important}
#rpUI{pointer-events:none!important}
canvas{pointer-events:none!important}
#rpGoal{font-family:"Noto Sans TC",system-ui,sans-serif!important}
#bootCover{background:#0b1d3a!important}
#bootCover .bcT,#bootCover .bcS,#bootCover .bcM,#bootCover .bcH,#bootCover small,#bootCover p{display:none!important}
#bootCover .bcBar{background:rgba(255,255,255,.12)!important}
#bootCover .bcBar i{background:#FFD60A!important}
</style>
</head>"""

FZ_MODULE = r"""
// ============================================================
// 富志官網嵌入：捲動播放（FZ_SCRUB）與錄影（FZ_RECORD）——由 futurezebra/dev/make-live.py 插入
// ============================================================
const FZ = {clip:null, ps:0, pG:0.5, gz:0.35, cheer:false};
if(window.FZ_RECORD){ window.__REC = REC; window.__goals = []; }
if(window.FZ_SCRUB) FZ.ready = fetch('clip.json').then(r=>r.json()).then(j=>{ FZ.clip = j; });
const fzLerp = (a,b,t)=>a+(b-a)*t;
const fzSm = t=>{ t = Math.max(0, Math.min(1, t)); return t*t*(3-2*t); };
// 捲動進度 p → 片段時間 ph（進球前後放慢；進球在 p=0.5）
function fzPh(p){
  const c = FZ.clip, g = c.goalAt, D = c.dur;
  const K = [[0,0],[0.2,g*0.3],[0.35,g*0.6],[0.44,g-0.8],[0.5,g],[0.56,g+0.4],[0.85,D],[1,D]];
  for(let i=1;i<K.length;i++) if(p <= K[i][0]){ const a = K[i-1], b = K[i]; return fzLerp(a[1], b[1], (p-a[0])/(b[0]-a[0])); }
  return D;
}
function fzScorerAt(t){
  const c = FZ.clip, [f0, f1, k] = rpFrameAt(c, Math.max(0, Math.min(c.dur, t)));
  const a = f0.d[c.scorer], b = f1.d[c.scorer];
  return V3(a[0]+(b[0]-a[0])*k, a[1]+(b[1]-a[1])*k, a[2]+(b[2]-a[2])*k);
}
function fzWide(yaw, pitch, R){
  const f = Math.min(2.4, Math.max(1.12, 1.5/camera.aspect)), dl = V3(0, 0.9, 0);
  R *= f;
  return [dl.clone().add(V3(Math.sin(yaw)*Math.cos(pitch)*R, Math.sin(pitch)*R, Math.cos(yaw)*Math.cos(pitch)*R)), dl, 58];
}
function fzInside(v){ v.x = clamp(v.x, -FIELD.hx+0.12, FIELD.hx-0.12); v.z = clamp(v.z, -FIELD.hz+0.12, FIELD.hz-0.12); v.y = clamp(v.y, 0.15, FIELD.h-0.12); return v; }
function fzCam(name, p, ph){
  const c = FZ.clip;
  if(name === 'wide') return fzWide(fzLerp(-0.75, -0.25, p/0.2), 0.47, 6.2);
  if(name === 'end')  return fzWide(fzLerp(0.15, 0.55, fzSm((p-0.74)/0.26)), 0.52, 6.4);
  const s = fzScorerAt(ph);
  if(name === 'chase'){   // 跟拍：在防護網正上方斜斜往下看射手（不會被充氣管擋住）
    const h = fzScorerAt(ph+0.6).sub(fzScorerAt(ph-0.6)); h.y = 0;
    if(h.length() < 0.05) h.set(c.scorer===0 ? -1 : 1, 0, 0);
    h.normalize();
    const f = Math.min(1.6, Math.max(1, 1.2/camera.aspect));
    return [V3(clamp(s.x - h.x*1.3*f, -FIELD.hx+0.45, FIELD.hx-0.45), FIELD.h + 0.8*f, clamp(s.z*0.4 + 0.8, -FIELD.hz+0.45, FIELD.hz-0.45)), V3(s.x + h.x*0.5, s.y - 0.3, s.z), 55];
  }
  const R = c.ring==='E' ? ringEast : ringWest, rp = R.grp.position, dir = c.scorer===0 ? -1 : 1;
  if(name === 'goal') return [fzInside(V3(rp.x + dir*0.75, rp.y + 0.28, rp.z + FZ.gz)), s, 50];
  const ang = (ph - c.goalAt)*0.7 + (dir>0 ? Math.PI*0.75 : -Math.PI*0.25);   // ring：繞球門
  return [fzInside(V3(rp.x + Math.cos(ang)*1.6, rp.y + 0.35, rp.z + Math.sin(ang)*1.6)), rp.clone(), 55];
}
const FZ_CAMS = [['wide',0],['wide',0.17],['chase',0.23],['chase',0.43],['goal',0.46],['goal',0.55],['ring',0.6],['ring',0.74],['end',0.86],['end',1.01]];
function fzCamera(){
  const p = FZ.ps, ph = REPLAY.ph;
  let i = 0; while(i < FZ_CAMS.length-2 && p >= FZ_CAMS[i+1][1]) i++;
  const A = FZ_CAMS[i], B = FZ_CAMS[i+1];
  let r = fzCam(A[0], p, ph);
  if(A[0] !== B[0]){
    const w = fzSm((p - A[1])/(B[1] - A[1])), q = fzCam(B[0], p, ph);
    r = [r[0].lerp(q[0], w), r[1].lerp(q[1], w), fzLerp(r[2], q[2], w)];
  }
  camera.position.copy(r[0]); camera.lookAt(r[1]);
  if(Math.abs(camera.fov - r[2]) > 0.01){ camera.fov = r[2]; camera.updateProjectionMatrix(); }
}
function fzAdvance(dt, c){
  const tgt = window.FZ_P || 0, d = tgt - FZ.ps;
  FZ.ps = Math.abs(d) < 0.0004 ? tgt : FZ.ps + d*Math.min(1, dt*9);
  if(FZ.ps !== tgt) window.FZ_KICK(2);
  const p = FZ.ps; REPLAY.ph = fzPh(p);
  // GOAL 大字＋白閃：跟著捲動進度，倒捲也會倒回去
  const u = (p - FZ.pG)/0.09, g = document.getElementById('rpGoal'), fl = document.getElementById('rpFlash');
  if(u >= 0 && u <= 1){
    const sc = u < 0.12 ? 3 - 2.1*(u/0.12) : u < 0.25 ? 0.9 + 0.1*((u-0.12)/0.13) : 1;
    g.style.opacity = u < 0.12 ? u/0.12 : u > 0.7 ? 1 - (u-0.7)/0.3 : 1;
    g.style.transform = 'translate(-50%,-50%) scale(' + sc.toFixed(3) + ')';
  }else{ g.style.opacity = 0; g.style.transform = 'translate(-50%,-50%) scale(0)'; }
  fl.style.opacity = (u >= 0 && u < 0.15) ? (0.5*(1 - u/0.15)).toFixed(3) : 0;
  // 球門爆閃、球門計分板、場邊選手反應：都由片段時間決定
  const x = REPLAY.ph - c.goalAt, R = c.ring==='E' ? ringEast : ringWest;
  if(x >= 0 && x < 1.6) ringPulse = {ring:R, t:x}; else if(ringPulse) ringPulse.t = 99;
  score.red.g = 0; score.blue.g = 0; if(x >= 0) score[c.team].g = 1;
  if(PILOT.state === 'ready') PILOT.list.forEach(P=>{
    const win = P.d.team === c.team, rt = (win ? 1.3 : 1.6) - x*0.9;
    if(x >= 0 && rt > 0){ P.react = win ? 'cheer' : 'sad'; P.reactT = rt + dt; } else { P.react = null; P.reactT = 0; }
  });
  REPLAY.lastPh = REPLAY.ph;
}
window.FZ_SETUP = async ()=>{
  await FZ.ready;
  const j = FZ.clip;
  const c = {frames:j.frames, t0:0, dur:j.dur, goalAt:j.goalAt, team:j.team, ring:j.ring, scorer:j.scorer, n:1, sb:0, sr:0, tl:0};
  FZ.clip = c;
  REPLAY.enabled = false; REPLAY.autoAt = 0; REPLAY.pending = [];
  REPLAY.clips = [c]; REPLAY.idx = 0; REPLAY.on = true; REPLAY.playing = false; REPLAY.auto = false;
  REPLAY.ph = 0; REPLAY.lastPh = 0; REPLAY.prevState = 'play';
  state = 'replay';
  document.getElementById('rpUI').classList.add('on');
  FZ.gz = fzScorerAt(c.goalAt).z >= 0 ? -0.35 : 0.35;
  FZ.ps = window.FZ_P || 0;
  window.FZ_KICK(240);
};

"""

# --- head：標題、不收錄、拿掉 PWA ---
rep(r'<title>.*?</title>', '<title>富志科技｜無人機足球 3D 示範賽</title>\n<meta name="robots" content="noindex">', regex=True)
rep('<link rel="manifest" href="manifest.webmanifest">\n', '')
rep('<link rel="apple-touch-icon" href="assets/icon-180.png">\n', '')
rep('<link rel="icon" type="image/png" href="assets/icon-192.png">\n', '')
rep('</head>', EMBED_CSS)
# --- Three.js 改本機 ---
rep('<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>',
    EARLY + '<script src="lib/three.min.js"></script>')
rep("'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js'", "'lib/GLTFLoader.js'")
rep("'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/utils/SkeletonUtils.js'", "'lib/SkeletonUtils.js'")
# --- 協會字樣 ---
rep('<div class="hud" id="credit">新竹市無人機創新科技協會©</div>\n', '')
rep('<div class="credit">新竹市無人機創新科技協會©</div>', '')
rep('<img src="assets/logo.webp" alt="新竹市無人機創新科技協會">', '')
rep('無人機足球模擬器 — 新竹市無人機創新科技協會©', '無人機足球 3D 示範賽（富志科技官網嵌入版）')
rep("g.fillText('新竹市無人機創新科技協會©', 256, 45);", "g.fillText('富志科技  FUTURE ZEBRA', 256, 45);")
# --- 不出聲、不預載連線模組、畫質上限 1.5 倍 ---
rep("  function init(){\n    if(ctx) return;", "  function init(){\n    if(ctx || window.FZ_EMBED) return;")
rep("setTimeout(()=>{ loadTrystero().catch(()=>{}); }, 2500);", "if(!window.FZ_EMBED) setTimeout(()=>{ loadTrystero().catch(()=>{}); }, 2500);")
rep("renderer.setPixelRatio(Math.min(devicePixelRatio,2));", "renderer.setPixelRatio(Math.min(devicePixelRatio, window.FZ_EMBED ? 1.5 : 2));")
# --- 全場鏡頭：嵌入時緩慢左右擺動；直式畫面自動拉遠，整個場地都看得到 ---
rep("const p = 0.4495 + cv.pitch, R = 6.217*cv.zoom, by = cv.yaw;",
    "const p = 0.4495 + cv.pitch, R = 6.217*cv.zoom*(window.FZ_EMBED ? Math.min(2.4, Math.max(1.12, 1.5/camera.aspect)) : 1), by = cv.yaw + (window.FZ_EMBED ? Math.sin(envTime*0.09)*0.55 : 0);")

# --- 捲動播放／錄影 ---
rep("\nfunction loop(){\n", "\n" + FZ_MODULE + "\nfunction loop(){\n")
rep("  if(duoOn) duoRender(); else renderer.render(scene, camera);", "  if(window.FZ_RECORD) {} else if(duoOn) duoRender(); else renderer.render(scene, camera);")   # 錄影時不畫，跑比較快
rep("const RP_FPS = 30, RP_KEEP = 12,", "const RP_FPS = 30, RP_KEEP = window.FZ_RECORD ? 600 : 12,")
rep("function rpOnGoal(data){\n", "function rpOnGoal(data){\n  if(window.FZ_RECORD) window.__goals.push({t:REC.t, team:data.team, ring:data.ring, scorer: data.team==='red' ? 0 : 3});\n")
rep("  // 推進播放頭\n  if(REPLAY.playing){", "  // 推進播放頭\n  if(window.FZ_SCRUB) fzAdvance(dt, c);\n  else if(REPLAY.playing){")
rep("  if(REPLAY.lastPh < c.goalAt && REPLAY.ph >= c.goalAt && REPLAY.ph - REPLAY.lastPh < 0.5){",
    "  if(!window.FZ_SCRUB && REPLAY.lastPh < c.goalAt && REPLAY.ph >= c.goalAt && REPLAY.ph - REPLAY.lastPh < 0.5){")
rep("function rpCamera(dt){\n", "function rpCamera(dt){\n  if(window.FZ_SCRUB){ fzCamera(); return; }\n")
rep("    ringPulse.t += dt;\n", "    if(!window.FZ_SCRUB) ringPulse.t += dt;\n")
rep("    PILOT.state = 'ready';", "    PILOT.state = 'ready'; if(window.FZ_KICK) window.FZ_KICK(30);")
rep("    try{ ok(t); } finally { fin(); }", "    try{ ok(t); } finally { fin(); if(window.FZ_KICK) window.FZ_KICK(5); }")
# --- 不要看台觀眾；室內競技場背景改藏青 ---
rep("standGroups.forEach(g=>g.visible = S.stands);", "standGroups.forEach(g=>g.visible = S.stands && !window.FZ_EMBED);")
rep("bg:0x070a14, fog:[0x070a14,12,40],  stands:true,", "bg:window.FZ_EMBED ? 0x0b1d3a : 0x070a14, fog:[window.FZ_EMBED ? 0x0b1d3a : 0x070a14,12,40],  stands:true,")

left = [m.start() for m in re.finditer('協會', h)]
vis = [h[max(0,i-40):i+20].replace('\n',' ') for i in left if '//' not in h[h.rfind('\n',0,i):i]]
if vis: print('注意：還有非註解的「協會」字樣：', *vis, sep='\n  ')
out.mkdir(parents=True, exist_ok=True)
(out / 'index.html').write_text(h, encoding='utf-8')
print('OK →', out / 'index.html', len(h), 'bytes')
