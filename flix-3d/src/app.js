import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MESH, QS } from './meshes.js';
import { PARTS, STEPS } from './data.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const P = Object.fromEntries(PARTS.map(p => [p.id, p]));
const FONT = '"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif';

// ---------- renderer / scene ----------
const view = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
view.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeef1f5);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(32, 1, 1, 4000);
camera.up.set(0, 0, 1);
camera.position.set(170, -210, 150);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0, 0);

scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa3ad, 0.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(90, -120, 260);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -150, right: 150, top: 150, bottom: -150, near: 10, far: 600 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.4;
scene.add(sun);

const FLOOR = -15.05;
const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.ShadowMaterial({ opacity: 0.16 }));
ground.position.z = FLOOR; ground.receiveShadow = true; scene.add(ground);
const grid = new THREE.GridHelper(400, 40, 0xc3cad3, 0xd9dee5);
grid.rotation.x = Math.PI / 2; grid.position.z = FLOOR - 0.05; scene.add(grid);

// ---------- helpers ----------
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, ...o });
const metal = (color, r = 0.28) => mat(color, { metalness: 1, roughness: r });
function box(w, d, h, m, x = 0, y = 0, z = 0) { // z = 底面高度
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, d, h), m); o.position.set(x, y, z + h / 2); return o;
}
function cyl(r, h, m, x = 0, y = 0, z = 0, seg = 32, r2 = r) { // 沿 z 軸，z = 底面
  const g = new THREE.CylinderGeometry(r2, r, h, seg); g.rotateX(Math.PI / 2);
  const o = new THREE.Mesh(g, m); o.position.set(x, y, z + h / 2); return o;
}
function canvasTex(w, h, draw, px = 12) {
  const c = document.createElement('canvas'); c.width = w * px; c.height = h * px;
  const g = c.getContext('2d'); g.scale(px, px); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
// 上表面貼圖的板子：box 的 +z 面用 canvas
function board(w, d, h, base, draw, x = 0, y = 0, z = 0, mOpt = {}) {
  const side = mat(base, { roughness: 0.6, ...mOpt });
  const top = new THREE.MeshStandardMaterial({ map: canvasTex(w, d, draw), roughness: 0.5, ...mOpt });
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, d, h), [side, side, side, side, top, side]);
  o.position.set(x, y, z + h / 2); return o;
}
function tube(pts, r, color) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => V(...p)), false, 'centripetal');
  return new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(24, pts.length * 14), r, 8, false),
    mat(color, { roughness: 0.45 }));
}
function stlMesh(key, m) {
  const d = MESH[key];
  const bin = s => Uint8Array.from(atob(s), c => c.charCodeAt(0)).buffer;
  const q = new Int16Array(bin(d.p)), pos = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) pos[i] = q[i] * QS;
  const ib = bin(d.i), idx = d.n < 65535 ? new Uint16Array(ib) : new Uint32Array(ib);
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1));
  g = g.toNonIndexed(); g.computeVertexNormals();
  return new THREE.Mesh(g, m);
}

// ---------- geometry constants (from the official STL) ----------
const ARM = 42.43;               // 馬達管中心（Gazebo 模型 flix.sdf 也是 ±42.43 mm）
const IMU_HOLES = [[-1.25, -6.30], [-1.25, 8.94]];
const POSTS = [[13.51, 17.5], [-13.51, 17.5], [13.51, -17.5], [-13.51, -17.5]];
const HOLDER_Z = 11;             // 支架柱底 = 機身頂面 3 mm
const HOLDER_TOP = 12.6;
const TAPE_T = 1.0;
const BOARD_Z = HOLDER_TOP + TAPE_T;
// 機頭 +X、左 +Y（與 Gazebo、motors 表一致）
const MOTORS = [
  { k: 'FL', name: '前左', sx: 1, sy: 1, cw: true, gpio: 15, idx: 3 },
  { k: 'FR', name: '前右', sx: 1, sy: -1, cw: false, gpio: 14, idx: 2 },
  { k: 'RL', name: '後左', sx: -1, sy: 1, cw: false, gpio: 12, idx: 0 },
  { k: 'RR', name: '後右', sx: -1, sy: -1, cw: true, gpio: 13, idx: 1 },
];

// ---------- part registry ----------
// item: {id, obj, base, ex (自由拆解位移), appear (出現的步驟), keys [[step, offset]], entry (進場位移)}
const items = [];
function add(id, obj, base, { ex = V(), step = 1, keys = null, entry = null, shadow = true } = {}) {
  obj.position.copy(base);
  obj.traverse(o => { o.userData.partId = id; if (o.isMesh) { o.castShadow = shadow; o.receiveShadow = true; } });
  scene.add(obj);
  const it = { id, obj, base: base.clone(), ex, appear: step, keys: keys || [[step, V()]], entry: entry || ex.clone().multiplyScalar(0.7), off: V() };
  items.push(it); return it;
}

// ===== 1. 機身 =====
const PLA = mat(0xf3f1ea, { roughness: 0.72, side: THREE.DoubleSide });
const frame = stlMesh('frame', PLA);
add('frame', frame, V(), { step: 1, entry: V(0, 0, 40) });

// ===== 2. 支架 + 雙面膠 + ESP32（先在旁邊組好，第 7 步才移入）=====
const SIDE = V(0, 92, 18);
const holderMat = mat(0xeceae2, { roughness: 0.72, side: THREE.DoubleSide });
const holder = stlMesh('holder', holderMat);
add('holder', holder, V(0, 0, HOLDER_Z), { ex: V(0, 0, 58), step: 2, keys: [[2, SIDE], [7, V()]], entry: V(0, 0, 25) });
const tape2 = new THREE.Group();
tape2.add(box(17.5, 30, TAPE_T, mat(0xf4f0d8, { roughness: 0.95 })));
add('tape2', tape2, V(0, 0, HOLDER_TOP), { ex: V(0, 0, 66), step: 2, keys: [[2, SIDE], [7, V()]], entry: V(0, 0, 30) });

// --- MINI32（官方尺寸）
function makeMini32() {
  const g = new THREE.Group(), W = 31.4, L = 39, T = 1.2;
  const pcb = board(W, L, T, 0x1b5fa3, (c, w, h) => {
    c.fillStyle = '#1f6db7'; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(120,190,255,.35)'; c.lineWidth = 0.18;
    for (let i = 0; i < 9; i++) { c.beginPath(); c.moveTo(6, 6 + i * 3); c.bezierCurveTo(10, 8 + i * 3, 20, 4 + i * 2.8, 25, 7 + i * 3); c.stroke(); }
    const hole = (x, y) => { c.fillStyle = '#e6e6e6'; c.beginPath(); c.arc(x, y, 0.95, 0, 7); c.fill(); c.fillStyle = '#0b2a4a'; c.beginPath(); c.arc(x, y, 0.45, 0, 7); c.fill(); };
    for (let i = 0; i < 10; i++) { const y = 3.6 + i * 2.54; [1.7, 4.24, w - 4.24, w - 1.7].forEach(x => hole(x, y)); }
    c.fillStyle = '#fff'; c.font = `bold 1.6px ${FONT}`; c.textAlign = 'center';
    c.fillText('MINI32', w / 2, h - 7.4); c.font = `1.2px ${FONT}`; c.fillText('V1.0.0', w / 2, h - 5.8);
    c.textAlign = 'left'; c.fillText('RST', 1.3, h - 4.2); c.fillText('ON', w - 4, h - 1.2);
  }, 0, 0, 0);
  g.add(pcb);
  // ESP32-WROOM-32 模組：天線端朝 +y
  g.add(box(18, 25.5, 0.8, mat(0x161616), 0, L / 2 - 12.75 - 0.3, T));
  const shield = board(16.6, 17.8, 2.3, 0xbfc3c7, (c, w, h) => {
    c.fillStyle = '#c9cdd1'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#5d6166'; c.textAlign = 'center';
    c.font = `bold 2.1px ${FONT}`; c.fillText('ESPRESSIF', w / 2, 3.2);
    c.font = `bold 1.5px ${FONT}`; c.fillText('ESP32-WROOM-32', w / 2, 5.4);
    c.font = `0.9px ${FONT}`; c.fillText('CE  FCC ID: 2AC7Z-ESPWROOM32', w / 2, 8);
    c.beginPath(); c.arc(1.6, h - 1.6, 0.5, 0, 7); c.fill();
  }, 0, L / 2 - 6.8 - 8.9, T + 0.8, { metalness: 0.85, roughness: 0.32 });
  g.add(shield);
  g.add(box(6, 1.2, 0.1, metal(0xd6a23c, 0.3), 3, L / 2 - 3.2, T + 0.8));
  // USB-C、USB 晶片、按鍵、LED
  g.add(box(8.9, 7.4, 3.2, metal(0xc8ccd0, 0.25), 0, -L / 2 + 3.3, T));
  g.add(box(5, 5, 0.9, mat(0x1a1a1a, { roughness: 0.4 }), -8, -L / 2 + 10, T));
  g.add(box(3, 4.2, 1.6, mat(0xe9e9e9), -W / 2 + 2.3, -L / 2 + 3.5, T));
  g.add(box(1.2, 0.8, 0.5, mat(0xff2a2a, { emissive: 0xff1111, emissiveIntensity: 0.9 }), W / 2 - 3, -L / 2 + 2.2, T));
  [[3.2, -L / 2 + 9.5], [7, -L / 2 + 6]].forEach(([x, y]) => g.add(box(2.6, 1.6, 0.9, mat(0x1a1a1a), x, y, T)));
  g.userData.dims = { W, L };
  g.userData.pins = [];
  return g;
}
// --- NODEMCU-32S（購物車；尺寸取交接檔約 28 × 51 mm，排針列距假設 25.4 mm，待實測）
function makeNodeMCU() {
  const g = new THREE.Group(), W = 28, L = 51.5, T = 1.6;
  g.add(board(W, L, T, 0x16191d, (c, w, h) => {
    c.fillStyle = '#1b1e22'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 19; i++) { const y = 2.95 + i * 2.54; [1.3, w - 1.3].forEach(x => { c.fillStyle = '#d9b45a'; c.beginPath(); c.arc(x, y, 0.9, 0, 7); c.fill(); c.fillStyle = '#222'; c.beginPath(); c.arc(x, y, 0.45, 0, 7); c.fill(); }); }
    c.fillStyle = '#eee'; c.font = `bold 1.7px ${FONT}`; c.textAlign = 'center';
    c.fillText('NodeMCU-32S', w / 2, h - 15); c.font = `1.1px ${FONT}`; c.fillText('EN          BOOT', w / 2, h - 2.6);
  }));
  g.add(box(18, 25.5, 0.8, mat(0x161616), 0, L / 2 - 12.75, T));
  g.add(board(16.6, 17.8, 2.3, 0xbfc3c7, (c, w, h) => {
    c.fillStyle = '#c9cdd1'; c.fillRect(0, 0, w, h); c.fillStyle = '#5d6166'; c.textAlign = 'center';
    c.font = `bold 2.1px ${FONT}`; c.fillText('ESPRESSIF', w / 2, 3.2); c.font = `bold 1.4px ${FONT}`; c.fillText('ESP32-WROOM-32E', w / 2, 5.4);
  }, 0, L / 2 - 6.8 - 8.9, T + 0.8, { metalness: 0.85, roughness: 0.32 }));
  g.add(box(7.6, 5.6, 2.6, metal(0xc8ccd0, 0.25), 0, -L / 2 + 2.6, T));
  g.add(box(5, 5, 0.9, mat(0x1a1a1a), 0, -L / 2 + 11, T));
  g.add(box(6.5, 3.6, 1.6, mat(0x1a1a1a), -6, -L / 2 + 8, T));
  [-7.5, 7.5].forEach(x => g.add(box(4, 3, 1.5, mat(0xe9e9e9), x, -L / 2 + 3.5, T)));
  // 排針朝下：塑膠座 + 針
  const pins = [];
  const hdrMat = mat(0x111111, { roughness: 0.7 });
  [-12.7, 12.7].forEach(x => {
    const hdr = box(2.5, 19 * 2.54, 2.5, hdrMat, x, 0, -2.5); g.add(hdr); pins.push(hdr);
    for (let i = 0; i < 19; i++) g.add(box(0.64, 0.64, 6, metal(0xd8b25a, 0.3), x, (i - 9) * 2.54, -8.5));
  });
  g.userData.dims = { W, L }; g.userData.pins = pins;
  return g;
}
const esp32Slot = new THREE.Group();
const espIt = add('esp32', esp32Slot, V(0, 0, BOARD_Z), { ex: V(0, 0, 82), step: 2, keys: [[2, SIDE], [7, V()]], entry: V(0, 0, 32) });
// 碰撞示意（NodeMCU 排針與支架重疊處）
const clashMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.82 });
function clashBoxes() {
  const g = new THREE.Group();
  // 排針塑膠座 x 11.45–13.95 與支架橫桿 |y| 15.5–19.5、支柱 r≈1.6
  [-1, 1].forEach(sx => [-1, 1].forEach(sy => {
    const b = box(3.1, 4.6, 3.0, clashMat, sx * 12.7, sy * 17.5, -2.75); g.add(b);
  }));
  return g;
}
let boardKind = 'mini';
function setBoard(kind) {
  boardKind = kind;
  esp32Slot.clear();
  const b = kind === 'mini' ? makeMini32() : makeNodeMCU();
  b.traverse(o => { o.userData.partId = 'esp32'; if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  esp32Slot.add(b);
  if (kind !== 'mini') { const c = clashBoxes(); c.traverse(o => o.userData.partId = 'esp32'); esp32Slot.add(c); }
  document.getElementById('sizeWarn').hidden = kind === 'mini';
  highlight(selected);
}

// ===== 3. 墊片 =====
IMU_HOLES.forEach(([x, y], i) => add('washer', stlMesh('washer', mat(0xf3f1ea, { roughness: 0.72 })), V(x, y, 3), { ex: V(0, 0, 20 + i * 2), step: 3, entry: V(0, 0, 22) }));

// ===== 4. IMU（GY-91）+ M3 螺絲 =====
const IMU_W = 14.3, IMU_L = 20.6;
const imuCx = IMU_HOLES[0][0] + IMU_W / 2 - 2.35, imuCy = (IMU_HOLES[0][1] + IMU_HOLES[1][1]) / 2;
const IMU_Z = 5;
const PINS_IMU = ['VIN', '3V3', 'GND', 'SCL', 'SDA', 'SDO/SAO', 'NCS', 'CSB'];
function makeIMU() {
  const g = new THREE.Group();
  g.add(board(IMU_W, IMU_L, 1.0, 0x4a1766, (c, w, h) => {
    c.fillStyle = '#5a1d7c'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#c0367a'; c.lineWidth = 0.15;
    for (let i = 0; i < 7; i++) { c.beginPath(); c.moveTo(w - 2, 2.3 + i * 2.54); c.lineTo(w - 6, 3 + i * 2.2); c.lineTo(6, 6 + i * 1.3); c.stroke(); }
    // 排針在 +x 邊（canvas 右側），canvas y 往下＝模型 -y
    for (let i = 0; i < 8; i++) {
      const y = h / 2 + (i - 3.5) * 2.54;
      c.fillStyle = '#d9b45a'; c.beginPath(); c.arc(w - 1.4, y, 0.95, 0, 7); c.fill();
      c.fillStyle = '#2a0b3a'; c.beginPath(); c.arc(w - 1.4, y, 0.45, 0, 7); c.fill();
      c.fillStyle = '#fff'; c.font = `bold 0.85px ${FONT}`; c.textAlign = 'right'; c.fillText(PINS_IMU[i], w - 2.7, y + 0.3);
    }
    c.save(); c.translate(3.3, h / 2); c.rotate(-Math.PI / 2); c.fillStyle = '#fff'; c.font = `bold 1.4px ${FONT}`; c.textAlign = 'center'; c.fillText('GY-91', 0, 0); c.restore();
  }));
  // 晶片
  g.add(box(3, 3, 0.9, mat(0x141414, { roughness: 0.35 }), 1.2, -1.5, 1.0));                // MPU-9250
  g.add(box(2.0, 2.5, 0.95, metal(0xc9cbcf, 0.3), 1.0, 3.2, 1.0));                            // BMP280
  g.add(box(1.6, 3.0, 1.1, mat(0x1a1a1a), -2.3, 6.5, 1.0));                                   // LDO
  g.add(box(2.0, 3.2, 1.4, mat(0xe8a01c, { roughness: 0.4 }), -3.2, 2.8, 1.0));               // 鉭質電容
  for (let i = 0; i < 6; i++) g.add(box(1.6, 0.8, 0.45, mat(i % 2 ? 0x2b2b2b : 0xb08a5b), -2.8 + (i % 2) * 2.4, -7 + Math.floor(i / 2) * 1.4, 1.0));
  // 金色孔環
  const ringM = metal(0xd9b45a, 0.25);
  IMU_HOLES.forEach(([hx, hy]) => { const r = new THREE.Mesh(new THREE.RingGeometry(1.5, 2.3, 32), ringM); r.position.set(hx - imuCx, hy - imuCy, 1.01); g.add(r); });
  return g;
}
const imu = makeIMU();
add('imu', imu, V(imuCx, imuCy, IMU_Z), { ex: V(0, 0, 36), step: 4, entry: V(0, 0, 30) });
function m3Screw() {
  const g = new THREE.Group(), blk = mat(0x1d1f22, { metalness: 0.6, roughness: 0.35 });
  g.add(cyl(2.75, 3, blk, 0, 0, 0, 32));
  const hex = cyl(1.3, 1.6, mat(0x050505), 0, 0, 1.45, 6); g.add(hex);
  const sh = cyl(1.5, 5, blk, 0, 0, -5, 20); g.add(sh);
  for (let i = 0; i < 9; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.12, 6, 20), blk); t.position.z = -4.6 + i * 0.5; g.add(t); }
  return g;
}
IMU_HOLES.forEach(([x, y]) => add('m3', m3Screw(), V(x, y, IMU_Z + 1.0), { ex: V(0, 0, 54), step: 4, entry: V(0, 0, 40) }));

// ===== 5. 馬達 =====
function makeMotor(cw) {
  const g = new THREE.Group();
  g.add(cyl(4.25, 2.6, mat(0xf1f1f1, { roughness: 0.5 }), 0, 0, -9));            // 尾端塑膠蓋
  g.add(cyl(4.25, 16.6, metal(0xd2d5d9, 0.22), 0, 0, -6.4, 48));                  // 外殼
  g.add(cyl(3.7, 0.7, metal(0xbfc3c8, 0.3), 0, 0, 10.2, 48));
  g.add(cyl(1.25, 0.9, metal(0xc7924a, 0.35), 0, 0, 10.9, 24));                   // 銅軸承
  g.add(cyl(0.5, 5.6, metal(0xe7e9ec, 0.18), 0, 0, 10.2, 16));                    // 軸
  [0, Math.PI].forEach(a => { const s = box(0.6, 2.2, 0.15, mat(0x333333), 2.3 * Math.cos(a), 2.3 * Math.sin(a), 10.85); s.rotation.z = a; g.add(s); });
  // 線色標示環
  const [c1, c2] = cw ? [0xd62828, 0x2b6fd6] : [0xf4f4f4, 0x111111];
  g.add(cyl(4.3, 0.9, mat(c1), 0, 0, -8.4)); g.add(cyl(4.3, 0.9, mat(c2), 0, 0, -7.4));
  return g;
}
const motorObjs = {};
MOTORS.forEach(m => {
  const o = makeMotor(m.cw); motorObjs[m.k] = o;
  add('motors', o, V(m.sx * ARM, m.sy * ARM, 1), { ex: V(0, 0, 48), step: 5, entry: V(0, 0, 38) });
});

// ===== 6. MOSFET、電阻、膠帶、走線 =====
const diag = m => V(m.sx, m.sy, 0).normalize();
function makeMosfet() {
  const g = new THREE.Group();
  g.add(box(6.6, 6.1, 2.3, mat(0x1a1a1a, { roughness: 0.45 }), 0, 0, 0));
  g.add(box(5.4, 1.4, 0.5, metal(0xc9ccd0, 0.3), 0, 3.6, 0.4));             // 散熱片
  [-2.28, 2.28].forEach(x => g.add(box(0.8, 2.8, 0.5, metal(0xc9ccd0, 0.3), x, -4.4, 0.4)));
  return g;
}
function makeResistor() {
  const g = new THREE.Group();
  const body = cyl(1.15, 6.3, mat(0xd9c39a, { roughness: 0.6 }), 0, 0, -3.15, 20); body.rotation.y = Math.PI / 2; body.position.set(0, 0, 1.15);
  g.add(body);
  [[-2.1, 0x7a4a1c], [-1.1, 0x111111], [-0.1, 0xff7a00], [2.0, 0xd4af37]].forEach(([x, c]) => {
    const b = cyl(1.2, 0.5, mat(c), 0, 0, -0.25, 20); b.rotation.y = Math.PI / 2; b.position.set(x, 0, 1.15); g.add(b);
  });
  [-1, 1].forEach(s => { const l = cyl(0.25, 3.5, metal(0xcfd2d6), 0, 0, -1.75, 8); l.rotation.y = Math.PI / 2; l.position.set(s * 4.9, 0, 1.15); g.add(l); });
  return g;
}
MOTORS.forEach(m => {
  const d = diag(m), ang = Math.atan2(m.sy, m.sx);
  const mo = makeMosfet(); mo.rotation.z = ang + Math.PI / 2;
  add('mosfet', mo, d.clone().multiplyScalar(33).setZ(3), { ex: V(0, 0, 26), step: 6, entry: V(0, 0, 22) });
  const r = makeResistor(); r.rotation.z = ang;
  const side = V(-m.sy, m.sx, 0).normalize();
  add('resistor', r, d.clone().multiplyScalar(24).add(side.clone().multiplyScalar(-2.2)).setZ(3), { ex: V(0, 0, 30), step: 6, entry: V(0, 0, 24) });
  const t = box(8.2, 16, 0.12, new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 0.6, transparent: true, opacity: 0.35, roughness: 0.15 }), 0, 0, 0);
  t.rotation.z = ang + Math.PI / 2;
  add('tape', t, d.clone().multiplyScalar(29).setZ(5.45), { ex: V(0, 0, 34), step: 6, entry: V(0, 0, 26), shadow: false });
});
// 走線（示意）
const wires = new THREE.Group();
const espPinX = 13.7, espPinZ = BOARD_Z - 0.2;
MOTORS.forEach(m => {
  const d = diag(m), side = V(-m.sy, m.sx, 0).normalize();
  const at = (r, s, z) => d.clone().multiplyScalar(r).add(side.clone().multiplyScalar(s)).setZ(z).toArray();
  const R = 60; // 馬達管中心距中心
  const [cp, cn] = m.cw ? [0xd62828, 0x2b6fd6] : [0xf4f4f4, 0x111111];
  // 馬達兩條線：從馬達底部經管壁開槽拉出，沿機臂到 MOSFET 與電源匯流
  wires.add(tube([at(R - 1, 0.6, -8.8), at(R - 4.6, 0.6, -6), at(R - 4.9, 0.6, 2), at(R - 6.2, 0.8, 3.7), at(R - 14, 0.8, 3.8), at(37.4, 0.8, 4.2), at(36.6, 0.8, 4.1)], 0.32, cn));
  wires.add(tube([at(R - 1, -0.6, -8.8), at(R - 4.6, -0.6, -6), at(R - 4.9, -0.6, 2), at(R - 6.2, -1.6, 3.7), at(R - 18, -3.2, 3.8), at(28, -3.6, 3.9), at(18, -2.6, 4.2), at(11, -1.6, 4.4)], 0.32, cp));
  // Gate（黃）→ ESP32 GPIO；Source（黑）→ GND
  const gpioY = { 15: 8.7, 14: -8.7, 12: 11.2, 13: -11.2 }[m.gpio];
  const ex = m.sx * espPinX;
  wires.add(tube([at(29.6, 2.3, 4.0), at(26, 2.6, 4.6), at(19, 1.5, 6), [m.sx * 17, gpioY + m.sy * 1, 9], [ex + m.sx * 1.2, gpioY, espPinZ - 1.5], [ex, gpioY, espPinZ - 0.4]], 0.3, 0xf2c200));
  wires.add(tube([at(29.6, -2.3, 4.0), at(26.5, -2.8, 4.3), at(20, -3.0, 4.2), at(12, -2.2, 4.3)], 0.3, 0x111111));
});
// IMU SPI 線：GY-91 排針 → ESP32 板底
const imuColors = [null, 0xd62828, 0x111111, 0xf2c200, 0x2b6fd6, 0x8e44ad, 0x27ae60, null];
const imuPinTo = { 1: -6.1, 2: -3.6, 3: 3.6, 4: 1.1, 5: -1.4, 6: 6.1 };
for (let i = 1; i <= 6; i++) {
  const y = imuCy + (i - 3.5) * 2.54, x = imuCx + IMU_W / 2 - 1.4;
  wires.add(tube([[x, y, IMU_Z + 1.0], [x + 0.6, y, IMU_Z + 2.4], [x + 2.4, y * 0.9, 9], [11.3, imuPinTo[i], espPinZ - 1.6], [11.2, imuPinTo[i], espPinZ - 0.4]], 0.28, imuColors[i]));
}
// 電源匯流：中央紅黑
wires.add(tube([[11, -1.6, 4.4], [9, -9, 4.6], [-9, -9, 4.6], [-11, -1.6, 4.4]], 0.36, 0xd62828));
wires.add(tube([[12, -2.2, 4.3], [10, -11, 4.2], [-10, -11, 4.2], [-12, -2.2, 4.3]], 0.36, 0x111111));
wires.add(tube([[0, -9, 4.6], [-3, -14, 6], [-espPinX, -15, 10], [-espPinX, -16.5, espPinZ - 0.4]], 0.36, 0xd62828));
wires.add(tube([[0, -11, 4.2], [3, -15, 6], [espPinX, -15.5, 10], [espPinX, -16.5, espPinZ - 0.4]], 0.36, 0x111111));
add('wire', wires, V(), { ex: V(0, 0, 0), step: 6, entry: V(0, 0, 14) });

// ===== 7. M1.4 螺絲（由下往上）=====
function m14Screw() {
  const g = new THREE.Group(), s = metal(0x9da3aa, 0.3);
  g.add(cyl(1.25, 0.9, s, 0, 0, -0.9, 24)); g.add(box(0.3, 2.2, 0.35, mat(0x222), 0, 0, -1.0));
  g.add(cyl(0.7, 5, s, 0, 0, 0, 12)); return g;
}
POSTS.forEach(([x, y]) => add('m14', m14Screw(), V(x, y, 0), { ex: V(0, 0, -34), step: 7, entry: V(0, 0, -26) }));

// ===== 8. 電池 + MX2.0 =====
function makeBattery() {
  const g = new THREE.Group(), W = 25, L = 40, T = 9.5;
  const wrap = canvasTex(W, L, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#2d6a4f'); gr.addColorStop(1, '#1b4332');
    c.fillStyle = gr; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(255,255,255,.9)'; c.textAlign = 'center';
    c.save(); c.translate(w / 2, h / 2); c.rotate(-Math.PI / 2);
    c.font = `bold 3px ${FONT}`; c.fillText('3.7V 1000mAh', 0, -1.6); c.font = `2.1px ${FONT}`; c.fillText('25C  Li-Po  952540', 0, 2.2); c.restore();
  });
  const side = mat(0x22553f, { roughness: 0.5, side: THREE.DoubleSide });
  const top = new THREE.MeshStandardMaterial({ map: wrap, roughness: 0.45, side: THREE.DoubleSide });
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, L, T), [side, side, side, side, top, top]);
  body.position.z = T / 2; g.add(body);
  g.add(box(16, 3, 2, mat(0xe7e3d6), 0, -L / 2 - 1.2, 3.8)); // 保護板（包在熱縮內）
  g.add(tube([[-2, -L / 2 - 2.6, 4.8], [-3, -L / 2 - 9, 4.2], [-2, -L / 2 - 15, 4.5], [-1, -L / 2 - 18, 4.8]], 0.5, 0xd62828));
  g.add(tube([[2, -L / 2 - 2.6, 4.8], [3, -L / 2 - 9, 4.2], [2, -L / 2 - 15, 4.5], [1, -L / 2 - 18, 4.8]], 0.5, 0x111111));
  g.add(box(5.6, 6, 4, mat(0xf3f3f3, { roughness: 0.6 }), 0, -L / 2 - 21, 2.8)); // MX2.0 公頭
  return g;
}
add('battery', makeBattery(), V(0, 0, -10), { ex: V(0, -70, -10), step: 8, entry: V(0, -70, 0) });
function makeConnector() {
  const g = new THREE.Group();
  g.add(box(5.6, 5, 4.4, mat(0xf3f3f3, { roughness: 0.6 }), 0, -46.5, -7.4)); // 母座
  g.add(tube([[-1, -49, -5.2], [-2, -55, -2], [-6, -48, 4], [-12, -30, 9], [-espPinX, -17.5, espPinZ - 1.5], [-espPinX + 0.3, -17.5, espPinZ - 0.4]], 0.45, 0xd62828));
  g.add(tube([[1, -49, -5.2], [2, -55, -2], [6, -48, 4], [12, -30, 9], [espPinX, -17.6, espPinZ - 1.5], [espPinX - 0.3, -17.6, espPinZ - 0.4]], 0.45, 0x111111));
  return g;
}
add('connector', makeConnector(), V(), { ex: V(0, -30, -6), step: 8, entry: V(0, -16, -8) });

// ===== 9. 轉向箭頭 =====
const arrows = new THREE.Group(); scene.add(arrows);
MOTORS.forEach(m => {
  const col = m.cw ? 0xff8a00 : 0x1f7ae0, M = mat(col, { emissive: col, emissiveIntensity: 0.25 });
  const g = new THREE.Group(), R = 15, a0 = 0.5, a1 = 2 * Math.PI - 0.5;
  const arc = new THREE.Mesh(new THREE.TorusGeometry(R, 0.7, 8, 64, a1 - a0), M); arc.rotation.z = a0; g.add(arc);
  const tipA = m.cw ? a0 : a1, cone = new THREE.Mesh(new THREE.ConeGeometry(2.0, 5, 16), M);
  cone.position.set(R * Math.cos(tipA), R * Math.sin(tipA), 0);
  cone.rotation.z = tipA + (m.cw ? Math.PI : 0); g.add(cone);
  g.position.set(m.sx * ARM, m.sy * ARM, 22); g.userData.m = m; arrows.add(g);
});
arrows.visible = false;

// ===== 10. 螺旋槳 =====
function bladeGeometry(ccw) {
  const NR = 34, NC = 12, r0 = 2.2, r1 = 27.5, pitch = 22;
  const pos = [], idx = [];
  for (let i = 0; i <= NR; i++) {
    const t = i / NR, r = r0 + (r1 - r0) * t;
    let c = 2.6 + 3.6 * Math.sin(Math.PI * Math.min(1, Math.pow(t, 0.75) * 1.02));
    if (t > 0.86) c *= Math.sqrt(Math.max(0.02, 1 - Math.pow((t - 0.86) / 0.14, 2)));
    c = Math.max(c, 0.35);
    const th = Math.min(0.42, Math.atan(pitch / (2 * Math.PI * r)));
    const tk = 0.75 - 0.4 * t;
    for (const surf of [1, -1]) for (let j = 0; j <= NC; j++) {
      const s = j / NC - 0.5;                              // 前緣 s=-0.5
      const thick = surf * tk * Math.sqrt(Math.max(0, 1 - 4 * s * s)) * 0.5 + 0.18 * (1 - 4 * s * s);
      const yy = s * c, zz = thick;
      let y = yy * Math.cos(th) - zz * Math.sin(th), z = -yy * Math.sin(th) + zz * Math.cos(th);
      if (ccw) y = -y;
      pos.push(r, y, z);
    }
  }
  const row = 2 * (NC + 1);
  for (let i = 0; i < NR; i++) for (const off of [0, NC + 1]) for (let j = 0; j < NC; j++) {
    const a = i * row + off + j, b = a + 1, c2 = a + row, d = c2 + 1; idx.push(a, c2, b, b, c2, d);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
const propSpin = [];
function makeProp(type, ccw) {
  const g = new THREE.Group(), dark = type === 'A';
  const M = mat(dark ? 0x26282b : 0xf4f4f2, { roughness: 0.45, side: THREE.DoubleSide });
  const bg = bladeGeometry(ccw);
  [0, Math.PI].forEach(a => { const b = new THREE.Mesh(bg, M); b.rotation.z = a; g.add(b); });
  g.add(cyl(2.3, 4.6, M, 0, 0, -1.9, 24));
  const lab = new THREE.Mesh(new THREE.CircleGeometry(2.25, 32), new THREE.MeshBasicMaterial({
    map: canvasTex(4.5, 4.5, (c, w) => { c.fillStyle = dark ? '#26282b' : '#f4f4f2'; c.fillRect(0, 0, w, w); c.fillStyle = dark ? '#ffb347' : '#1f7ae0'; c.font = `bold 3.4px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(type, w / 2, w / 2 + 0.2); }, 30) }));
  lab.position.z = 2.72; g.add(lab);
  return g;
}
MOTORS.forEach(m => {
  const p = makeProp(m.cw ? 'A' : 'B', !m.cw);
  const it = add('props', p, V(m.sx * ARM, m.sy * ARM, 14.2), { ex: V(0, 0, 105), step: 10, entry: V(0, 0, 30) });
  propSpin.push({ obj: p, dir: m.cw ? -1 : 1 });
});

// ---------- 尺寸標註 ----------
const dimGroup = new THREE.Group(); scene.add(dimGroup); dimGroup.visible = false;
const dimLabels = [];
function dimLine(a, b, text) {
  const g = new THREE.BufferGeometry().setFromPoints([V(...a), V(...b)]);
  dimGroup.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x2c5fb3 })));
  [a, b].forEach(p => { const s = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), new THREE.MeshBasicMaterial({ color: 0x2c5fb3 })); s.position.set(...p); dimGroup.add(s); });
  const el = document.createElement('div'); el.className = 'dim'; el.textContent = text; view.appendChild(el);
  dimLabels.push({ el, p: V(...a).add(V(...b)).multiplyScalar(0.5) });
}
dimLine([ARM, ARM, 26], [ARM, -ARM, 26], '相鄰軸距 84.9 mm');
dimLine([-ARM, -ARM, 40], [ARM, ARM, 40], '對角軸距 120 mm');
dimLine([ARM, -ARM - 27.5, 15], [ARM, -ARM + 27.5, 15], '槳徑 55 mm');
dimLine([-ARM, ARM - 27.5, 15], [-ARM, -ARM + 27.5, 15], '槳尖間距 ≈ 29.9 mm');
dimLine([-62, -62, FLOOR], [-62, -62, 17.4], '高約 32 mm（不含軸）');

// ---------- labels ----------
const labelIds = ['frame', 'holder', 'esp32', 'imu', 'washer', 'm3', 'motors', 'mosfet', 'resistor', 'm14', 'battery', 'connector', 'props'];
const labels = {};
const LOFF = { motors: V(0, 0, -4), battery: V(0, -8, 6), holder: V(0, -19, -6), esp32: V(0, 10, 8), m3: V(0, 0, 4), imu: V(5, -6, 0), washer: V(0, 0, 3), connector: V(0, -46, -6), mosfet: V(0, 0, 3), resistor: V(0, 0, -1), m14: V(0, 0, -2) };
labelIds.forEach(id => {
  const el = document.createElement('div'); el.className = 'lbl'; el.textContent = P[id].name.replace(/（.*?）/g, '');
  el.onclick = () => select(id); view.appendChild(el); labels[id] = el;
});
const motorTags = MOTORS.map(m => {
  const el = document.createElement('div'); el.className = 'mtag ' + (m.cw ? 'cw' : 'ccw');
  el.innerHTML = `${m.name}<br><b>${m.cw ? '順時針 CW' : '逆時針 CCW'}</b><br>${m.cw ? 'A 槳・藍紅線' : 'B 槳・黑白線'}<br>GPIO${m.gpio}`;
  view.appendChild(el); return { el, m };
});
const frontTag = document.createElement('div'); frontTag.className = 'front'; frontTag.textContent = '▲ 機頭（+X）'; view.appendChild(frontTag);
const frontArrow = new THREE.Mesh(new THREE.ConeGeometry(4, 9, 3), new THREE.MeshBasicMaterial({ color: 0x2c5fb3 }));
frontArrow.rotation.z = -Math.PI / 2; frontArrow.position.set(78, 0, FLOOR + 0.3); scene.add(frontArrow);

// ---------- state & animation ----------
const ui = id => document.getElementById(id);
let mode = 'step';           // 'step' | 'free'
let step = STEPS.length;     // 目前步驟（1-based）
let anim = null;             // {t0, dur}
let free = 0;                // 0..1 自由拆解
const offAt = (it, s) => { let o = null; for (const [k, v] of it.keys) if (k <= s) o = v; return o; };
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function applyStep(s, u) {   // u：此步驟的動畫進度 0..1
  for (const it of items) {
    if (it.appear > s) { it.obj.visible = false; continue; }
    it.obj.visible = true;
    const to = offAt(it, s);
    const from = it.appear === s ? to.clone().add(it.entry) : offAt(it, s - 1);
    it.obj.position.copy(it.base).add(from.clone().lerp(to, ease(u)));
  }
  arrows.visible = s === 9;
}
function applyFree(t) {
  const order = [...new Set(items.map(i => i.appear))].sort((a, b) => a - b);
  for (const it of items) {
    it.obj.visible = it.id !== 'wire' || t < 0.05;
    let k = t;
    if (ui('stagger').checked && order.length > 1) {
      const n = order.length, r = order.indexOf(it.appear);
      k = Math.min(1, Math.max(0, t * n - (n - 1 - r)));
    }
    it.obj.position.copy(it.base).addScaledVector(it.ex, ease(k));
  }
  arrows.visible = false;
}
let camGoal = null;
function goStep(s, animate = true) {
  mode = 'step'; step = Math.max(1, Math.min(STEPS.length, s));
  anim = animate ? { t0: performance.now(), dur: 1500 } : null;
  if (!animate) applyStep(step, 1);
  const c = STEPS[step - 1].cam, dir = V(c[3], c[4], c[5]).normalize();
  camGoal = { target: V(c[0], c[1], c[2]), pos: V(c[0], c[1], c[2]).addScaledVector(dir, c[6]) };
  renderStepPanel();
  document.querySelectorAll('.chip').forEach((b, i) => { b.classList.toggle('on', i + 1 === step); b.classList.toggle('done', i + 1 < step); });
  ui('free').value = 0; free = 0;
}
let playAll = null;
function startPlayAll() {
  stopPlayAll(); goStep(1);
  playAll = setInterval(() => { if (step >= STEPS.length) return stopPlayAll(); goStep(step + 1); }, 3600);
  ui('playAll').textContent = '■ 停止';
}
function stopPlayAll() { clearInterval(playAll); playAll = null; ui('playAll').textContent = '▶ 從頭播放'; }

// ---------- panels ----------
function renderStepPanel() {
  const st = STEPS[step - 1];
  ui('stepTitle').textContent = `步驟 ${step}／${STEPS.length}　${st.t}`;
  ui('stepHow').textContent = st.how;
  ui('stepCheck').innerHTML = st.check.map(c => `<li>${c}</li>`).join('');
  ui('stepParts').innerHTML = st.parts.length ? '本步零件：' + st.parts.map(id => `<a href="#" data-p="${id}">${P[id].name}</a>`).join('、') : '';
  ui('stepParts').querySelectorAll('a').forEach(a => a.onclick = e => { e.preventDefault(); select(a.dataset.p); });
}
const money = n => 'NT$' + n.toLocaleString();
const badge = s => s === 'cart' ? '<span class="b cart">已在購物車</span>' : s === 'print' ? '<span class="b print">自行列印</span>' : '<span class="b todo">待購／待選</span>';
let selected = null;
function highlight(id) {
  scene.traverse(o => { if (o.isMesh && o.material && o.material.emissive && !o.userData.keepEmissive) {
    if (o.userData.e0 === undefined) o.userData.e0 = o.material.emissive.getHex();
    o.material.emissive.setHex(o.userData.partId === id && id ? 0x2a5fd0 : o.userData.e0);
    if (o.userData.partId === id && id) o.material.emissiveIntensity = 0.55; } });
}
function select(id) {
  selected = id; highlight(id);
  document.querySelectorAll('tr[data-id]').forEach(r => r.classList.toggle('sel', r.dataset.id === id));
  const box = ui('info');
  if (!id) { box.innerHTML = '<p class="hint">點 3D 零件、名稱標籤或表格列，查看規格與購買連結。</p>'; return; }
  const p = P[id], tot = p.unit == null ? (p.status === 'print' ? '自備耗材' : '未定') : `${money(p.unit)} × ${p.n} = ${money(p.unit * p.n)}`;
  const st = items.find(i => i.id === id)?.appear;
  box.innerHTML = `<h3>${p.name} ${badge(p.status)}</h3><p class="en">${p.en}</p>${p.spec ? `<p>${p.spec}</p>` : ''}<p><b>組裝：</b>${p.note}</p><p><b>價格：</b>${tot}</p>`
    + (st ? `<p><a href="#" id="gostep">跳到步驟 ${st}：${STEPS[st - 1].t}</a></p>` : '')
    + (p.url ? `<p><a href="${p.url}" target="_blank" rel="noopener">開啟${p.url.includes('shopee') ? '蝦皮商品頁' : p.url.includes('github') ? ' Flix GitHub' : '商品頁'} ↗</a></p>` : '');
  const g = ui('gostep'); if (g) g.onclick = e => { e.preventDefault(); stopPlayAll(); goStep(st); };
}

// ---------- picking ----------
const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(); let down = null;
renderer.domElement.addEventListener('pointerdown', e => down = [e.clientX, e.clientY]);
renderer.domElement.addEventListener('pointerup', e => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
  const r = renderer.domElement.getBoundingClientRect();
  ptr.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ptr, camera);
  const hit = ray.intersectObjects(items.filter(i => i.obj.visible).map(i => i.obj), true).find(h => h.object.visible && h.object.userData.partId);
  select(hit ? hit.object.userData.partId : null);
});
controls.addEventListener('start', () => { camGoal = null; });

// ---------- toggles ----------
const clipPlane = new THREE.Plane(V(0, -1, 0), 0);
ui('section').onchange = e => { renderer.clippingPlanes = e.target.checked ? [clipPlane] : [];
  if (e.target.checked) camGoal = { target: V(0, 0, -2), pos: V(30, 125, 38) }; };
ui('xray').onchange = e => { [PLA, holderMat].forEach(m => { m.transparent = e.target.checked; m.opacity = e.target.checked ? 0.32 : 1; m.depthWrite = !e.target.checked; m.needsUpdate = true; }); };
ui('dims').onchange = e => { dimGroup.visible = e.target.checked; };
ui('free').oninput = e => { stopPlayAll(); mode = 'free'; free = +e.target.value / 100; anim = null; applyFree(free);
  document.querySelectorAll('.chip').forEach(b => b.classList.remove('on', 'done'));
  ui('stepTitle').textContent = free < 0.01 ? '已組裝完成' : '自由拆解模式'; ui('stepHow').textContent = '拖拉滑桿可以拆開或合起所有零件。點上方步驟按鈕回到組裝教學。'; ui('stepCheck').innerHTML = ''; ui('stepParts').innerHTML = ''; };
ui('stagger').onchange = () => mode === 'free' && applyFree(free);
ui('prev').onclick = () => { stopPlayAll(); goStep(step - 1); };
ui('next').onclick = () => { stopPlayAll(); goStep(step + 1); };
ui('playAll').onclick = () => playAll ? stopPlayAll() : startPlayAll();
ui('spin').onchange = () => mode === 'step' && applyStep(step, 1);
document.querySelectorAll('input[name=board]').forEach(r => r.onchange = e => setBoard(e.target.value));
const chips = ui('chips');
STEPS.forEach((s, i) => { const b = document.createElement('button'); b.className = 'chip'; b.innerHTML = `<i>${i + 1}</i>${s.t}`; b.onclick = () => { stopPlayAll(); goStep(i + 1); }; chips.appendChild(b); });

// ---------- table + thumbnails ----------
function thumb(id) {
  const objs = items.filter(i => i.id === id).map(i => i.obj).slice(0, 1);
  if (!objs.length) return '';
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); r.setSize(168, 126); r.toneMapping = THREE.ACESFilmicToneMapping;
  const s = new THREE.Scene(); s.environment = scene.environment; s.add(new THREE.HemisphereLight(0xffffff, 0x99a, 0.9));
  const l = new THREE.DirectionalLight(0xffffff, 1.4); l.position.set(1, -1.5, 2.5); s.add(l);
  const g = new THREE.Group();
  objs.forEach(o => { const c = o.clone(true); c.position.copy(o.position); c.visible = true; c.traverse(k => k.visible = !(k.material === clashMat)); g.add(c); });
  s.add(g);
  const b = new THREE.Box3().setFromObject(g), ctr = b.getCenter(V()), size = b.getSize(V());
  const cam = new THREE.PerspectiveCamera(30, 4 / 3, 0.1, 3000); cam.up.set(0, 0, 1);
  const d = Math.max(size.x, size.y, size.z) * 2.2 + 6;
  cam.position.copy(ctr).add(V(1, -1.2, 0.95).normalize().multiplyScalar(d)); cam.lookAt(ctr);
  r.render(s, cam); const url = r.domElement.toDataURL('image/png'); r.dispose(); r.forceContextLoss(); return url;
}
function renderTable() {
  let sum = 0;
  ui('rows').innerHTML = PARTS.map(p => {
    const sub = p.unit == null ? null : p.unit * p.n; if (p.status === 'cart' && sub != null) sum += sub;
    const t = thumb(p.id);
    return `<tr data-id="${p.id}"><td>${t ? `<img src="${t}" width="84" height="63" alt="">` : '<div class="noimg">—</div>'}</td>
      <td><b>${p.name}</b><br><small>${p.en}</small></td><td class="n">${p.qty}</td>
      <td class="n">${p.unit == null ? '—' : money(p.unit)}</td><td class="n">${sub == null ? (p.status === 'print' ? '自印' : '未定') : money(sub)}</td>
      <td>${badge(p.status)}</td><td>${p.url ? `<a href="${p.url}" target="_blank" rel="noopener">連結 ↗</a>` : '—'}</td></tr>`;
  }).join('');
  ui('total').textContent = money(sum); ui('budget').textContent = money(5000 - sum);
  document.querySelectorAll('tr[data-id]').forEach(r => r.onclick = e => { if (e.target.tagName !== 'A') select(r.dataset.id); });
}

// ---------- loop ----------
const tmp = V();
function place(el, p, show) {
  if (!show) { el.style.display = 'none'; return; }
  tmp.copy(p).project(camera);
  if (tmp.z > 1) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.style.left = (tmp.x * 0.5 + 0.5) * view.clientWidth + 'px';
  el.style.top = (-tmp.y * 0.5 + 0.5) * view.clientHeight + 'px';
}
function resize() { const w = view.clientWidth, h = view.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize);
let last = performance.now();
function frameLoop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (mode === 'step') {
    const u = anim ? Math.min(1, (now - anim.t0) / anim.dur) : 1;
    applyStep(step, u); if (u >= 1) anim = null;
  }
  if (camGoal) {
    const k = 1 - Math.pow(0.002, dt);
    controls.target.lerp(camGoal.target, k); camera.position.lerp(camGoal.pos, k);
    if (camera.position.distanceTo(camGoal.pos) < 0.3) camGoal = null;
  }
  const spinning = (mode === 'step' && (step === 9 || step === 10) && ui('spin').checked);
  propSpin.forEach(p => { if (spinning) p.obj.rotation.z += p.dir * dt * 7; });
  arrows.children.forEach(a => { a.rotation.z += (a.userData.m.cw ? -1 : 1) * dt * 1.4; });
  controls.update();
  grid.visible = ground.visible = frontArrow.visible = camera.position.z > FLOOR + 2;
  renderer.render(scene, camera);
  // labels
  const showL = ui('labels').checked;
  labelIds.forEach(id => {
    const it = items.find(i => i.id === id);
    const p = it.obj.getWorldPosition(V()).add(LOFF[id] || V());
    place(labels[id], p, showL && it.obj.visible && (mode === 'free' ? free > 0.12 : STEPS[step - 1].parts.includes(id)));
  });
  const showTags = (mode === 'step' && step >= 5) && ui('labels').checked;
  motorTags.forEach(({ el, m }) => place(el, V(m.sx * (ARM + 16), m.sy * (ARM + 16), 30), showTags && (step === 5 || step === 9)));
  place(frontTag, V(92, 0, FLOOR), frontArrow.visible);
  dimLabels.forEach(d => place(d.el, d.p, dimGroup.visible));
  requestAnimationFrame(frameLoop);
}

// ---------- boot ----------
setBoard('mini');
resize();
applyStep(STEPS.length, 1);
renderTable();
select(null);
goStep(STEPS.length, false);
camera.position.copy(camGoal.pos); controls.target.copy(camGoal.target); camGoal = null;
requestAnimationFrame(frameLoop);
window.__fz = { goStep, setBoard, camera, controls, scene, get step() { return step; } };
