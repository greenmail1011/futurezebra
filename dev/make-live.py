#!/usr/bin/env python3
"""從 sky-striker 模擬器產生官網用的「3D 示範賽」嵌入頁 live/index.html。

用法：python3 dev/make-live.py <sky-striker 的 index.html> <輸出資料夾 live/>
- 只留 AI vs AI 示範賽：自動開始、連續對戰、進球自動回放（GOAL 特效）
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
  var scene = q.get('scene') || 'arena', lv = Math.max(1, Math.min(5, +(q.get('lv') || 4)));
  try{
    localStorage.setItem('hsinchuDroneSoccerSceneV1', scene);
    localStorage.setItem('hsinchuDroneAiLvDemoV1', JSON.stringify({blue: lv, red: lv}));
    localStorage.setItem('hsinchuDroneDemoLoopV1', '1');
    localStorage.setItem('hsinchuDroneReplayOnV1', '1');
  }catch(e){}
  // 暫停：父頁面看不到這塊時停止繪圖
  var raf = window.requestAnimationFrame.bind(window), paused = false, queued = null;
  window.requestAnimationFrame = function(cb){ if(paused){ queued = cb; return 0; } return raf(cb); };
  addEventListener('message', function(e){
    if(e.data === 'fz-pause') paused = true;
    else if(e.data === 'fz-play' && paused){ paused = false; if(queued){ var c = queued; queued = null; raf(c); } }
  });
  // 模組程式跑完後自動開始示範賽
  document.addEventListener('DOMContentLoaded', function(){
    var b = document.getElementById('btnDemo'); if(b) b.click();
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

left = [m.start() for m in re.finditer('協會', h)]
vis = [h[max(0,i-40):i+20].replace('\n',' ') for i in left if '//' not in h[h.rfind('\n',0,i):i]]
if vis: print('注意：還有非註解的「協會」字樣：', *vis, sep='\n  ')
out.mkdir(parents=True, exist_ok=True)
(out / 'index.html').write_text(h, encoding='utf-8')
print('OK →', out / 'index.html', len(h), 'bytes')
