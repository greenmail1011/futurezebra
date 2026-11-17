import trimesh, numpy as np, base64, json
import sys
A=(sys.argv[1] if len(sys.argv)>1 else 'flix')+'/docs/assets/'
out={}
for k,f in [('frame','flix-frame-1.1.stl'),('holder','esp32-holder.stl'),('washer','washer-m3.stl')]:
    m=trimesh.load(A+f); m.merge_vertices()
    q=np.round(m.vertices/0.004).astype(np.int16)
    assert np.abs(m.vertices/0.004).max()<32000
    idx=m.faces.astype(np.uint16 if len(m.vertices)<65535 else np.uint32)
    out[k]={'n':int(len(m.vertices)),'f':int(len(m.faces)),'p':base64.b64encode(q.tobytes()).decode(),'i':base64.b64encode(idx.tobytes()).decode()}
    print(k,len(m.vertices),len(m.faces),len(out[k]['p'])+len(out[k]['i']))
open('meshes.js','w').write('export const MESH='+json.dumps(out)+';export const QS=0.004;')
