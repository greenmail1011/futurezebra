#!/usr/bin/env python3
"""錄一段 AI 示範賽的進球片段 → live/clip.json（首頁捲動播放用）。

需要：playwright（chromium）、先在 futurezebra 根目錄開 `python3 -m http.server 8802`。
用法：python3 dev/record-clip.py [第幾個合格進球，預設 1] [AI 等級，預設 4]
片段＝進球前 PRE 秒～進球後 POST 秒；進球太早（前面不夠 PRE 秒）的會跳過。
"""
import sys, json, asyncio
from playwright.async_api import async_playwright
PRE, POST = 12.0, 2.8
NTH = int(sys.argv[1]) if len(sys.argv) > 1 else 1
LV = sys.argv[2] if len(sys.argv) > 2 else '4'

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader'])
        pg = await b.new_page(viewport={'width': 320, 'height': 180})
        await pg.route('**/*', lambda r: r.continue_() if r.request.url.startswith('http://localhost') else r.abort())
        await pg.goto(f'http://localhost:8802/live/?record=1&lv={LV}', wait_until='load')
        goal = None
        for i in range(3000):
            await pg.wait_for_timeout(500)
            st = await pg.evaluate("({t: window.__REC ? __REC.t : 0, g: window.__goals || []})")
            ok = [g for g in st['g'] if g['t'] >= PRE + 1]
            if i % 20 == 0: print(f"比賽時間 {st['t']:.1f}s，進球 {len(st['g'])}", flush=True)
            if len(ok) >= NTH and st['t'] >= ok[NTH-1]['t'] + POST + 0.2:
                goal = ok[NTH-1]; break
        if not goal: sys.exit('沒錄到合格進球')
        buf = await pg.evaluate(f"__REC.buf.filter(f => f.t >= {goal['t']-PRE} && f.t <= {goal['t']+POST})")
        await b.close()
    t0 = buf[0]['t']
    r4 = lambda a: [round(x, 4) for x in a]
    frames = [{'t': round(f['t'] - t0, 4), 'd': [r4(d) for d in f['d']], 'r': [r4(x) for x in f['r']]} for f in buf]
    clip = {'goalAt': round(goal['t'] - t0, 4), 'dur': frames[-1]['t'], 'team': goal['team'], 'ring': goal['ring'],
            'scorer': goal['scorer'], 'frames': frames}
    with open('live/clip.json', 'w') as fp: json.dump(clip, fp, separators=(',', ':'))
    print('OK live/clip.json', len(frames), 'frames，進球在', clip['goalAt'], '秒，', goal['team'], '隊')
asyncio.run(main())
