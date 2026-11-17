import subprocess
subprocess.run(['npx','esbuild','app.js','--bundle','--minify','--format=iife','--outfile=app.min.js','--log-level=warning'],check=True)
js=open('app.min.js').read().replace('</script','<\\/script')
html=open('template.html').read().replace('/*APP*/',js)
open('index.html','w').write(html); print(len(html))
