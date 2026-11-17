# FutureZebra（Flix）3D 組裝教學頁｜原始碼

成品：`../index.html`（單一檔案，Three.js 與模型都內嵌，可離線開啟）。

## 重新產生

```bash
git clone --depth 1 https://github.com/okalachev/flix.git
pip install trimesh
python3 prep.py flix          # 把官方 STL（機身、支架、墊片）量化成 meshes.js
npm install
python3 build.py              # 打包 app.js → index.html
cp index.html ../index.html
```

- `data.js`：零件表（價格、連結、說明）與 10 個組裝步驟。改文字或價格只要改這個檔。
- `app.js`：3D 場景、零件建模、動畫、標籤、零件表。
- `template.html`：頁面版面與樣式。

## 注意

- 機身、支架、墊片的幾何取自 Flix 官方 STL（https://github.com/okalachev/flix）。該 repo 沒有 LICENSE 檔，Arduino Project Hub 標示 CC BY-NC，商業用途前請先確認授權。`meshes.js` 由 `prep.py` 產生，不放進 repo。
- 走線與 IMU 排針朝向為示意；NODEMCU-32S 尺寸與排針列距為估計值。
