// 穆柯寨 · 背景与后期。底图是 assets/stage.webp（1920×1080，铺满 960×540 逻辑画布）。
// 想换底图：换文件，并按 ART.md 的坐标改下面 LANTERNS 和 GROUND。
// draw()    画底图 + 灯笼呼吸（在角色之前）
// front()   画前景虚影、浮尘、颗粒、暗角（在角色之后）
// lightAt() 某个 x 位置的灯光强度 0–1，给角色打光用
(function (root) {
  const W = 960, H = 540, GROUND = 448;
  // 灯笼中心（逻辑坐标）：x 占 18/33/50/67/82%，y 占 24%
  const LANTERNS = [0.18, 0.33, 0.5, 0.67, 0.82].map((f, i) => ({
    x: W * f, y: H * 0.245, ph: i * 1.37 + 0.4,
  }));
  const img = new Image();
  let loaded = false;
  const noise = [];

  function load() {
    return new Promise((ok) => {
      img.onload = () => { loaded = true; ok(); };
      img.onerror = () => ok();
      img.src = 'assets/stage.webp';
      makeNoise();
    });
  }

  // 四张颗粒图，每隔几帧换一张。用固定种子的随机数，截图可复现。
  function makeNoise() {
    if (noise.length) return;
    let a = 12345;
    const rnd = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
    for (let k = 0; k < 4; k++) {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d'), d = g.createImageData(128, 128);
      for (let i = 0; i < d.data.length; i += 4) {
        const v = rnd() < 0.5 ? 20 : 235;
        d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255;
      }
      g.putImageData(d, 0, 0);
      noise.push(c);
    }
  }

  // 灯下亮、灯间暗
  function lightAt(x) {
    let best = 0;
    for (const l of LANTERNS) best = Math.max(best, Math.exp(-Math.pow((x - l.x) / 150, 2)));
    return best;
  }

  // 底图随角色位置做 2–4 px 的视差，所以多画一圈边
  function draw(g, t, camX) {
    const par = ((camX == null ? W / 2 : camX) - W / 2) / (W / 2) * -3;
    g.fillStyle = '#0b0a14'; g.fillRect(0, 0, W, H);
    if (loaded) g.drawImage(img, -12 + par, -7, W + 24, H + 14);
    // 灯笼的呼吸：很轻的暖光，幅度小；另给灯笼一点点摆动的错觉（光晕中心微动）
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const l of LANTERNS) {
      const k = 0.5 + 0.5 * Math.sin(t / 900 + l.ph);
      const sway = Math.sin(t / 1700 + l.ph) * 1.5;
      const r = 150 + 8 * k;
      const gr = g.createRadialGradient(l.x + sway + par, l.y + 8, 4, l.x + sway + par, l.y + 8, r);
      gr.addColorStop(0, `rgba(255,170,80,${0.10 + 0.05 * k})`);
      gr.addColorStop(0.4, `rgba(220,120,50,${0.035 + 0.015 * k})`);
      gr.addColorStop(1, 'rgba(160,70,30,0)');
      g.fillStyle = gr; g.fillRect(l.x - r + par, l.y - r, r * 2, r * 2);
    }
    g.restore();
  }

  // 浮尘：位置只由时间决定（不用随机数），截图可复现
  function dust(g, t) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 16; i++) {
      const sp = 0.004 + (i % 5) * 0.0012;
      const x = (i * 173.7 + t * sp * (i % 2 ? 1 : -0.6) + 960 * 3) % W;
      const y = 120 + ((i * 97.3 + t * 0.006 * (1 + (i % 3) * 0.4)) % 300);
      const near = lightAt(x);
      const a = 0.05 + 0.28 * near * (0.5 + 0.5 * Math.sin(t / 1300 + i));
      g.fillStyle = `rgba(255,200,130,${a.toFixed(3)})`;
      g.fillRect(x, y, 1.6, 1.6);
    }
    g.restore();
  }

  // 最前面一层很暗很虚的东西：两侧垂下的幕边、台口的栏杆影、一盏离镜头很近的灯笼
  function silhouettes(g, t, vw) {
    // 左右幕边：深色竖向渐变，边缘柔
    for (const side of [0, 1]) {
      const x0 = side ? vw - 46 : 0;
      const gr = g.createLinearGradient(side ? vw : 0, 0, side ? vw - 46 : 46, 0);
      gr.addColorStop(0, 'rgba(8,5,12,.82)'); gr.addColorStop(1, 'rgba(8,5,12,0)');
      g.fillStyle = gr; g.fillRect(x0, 0, 46, H);
    }
    // 台口前沿的栏杆影：底部一条暗带，带几根柱影
    const bar = g.createLinearGradient(0, H - 56, 0, H);
    bar.addColorStop(0, 'rgba(6,4,10,0)'); bar.addColorStop(1, 'rgba(6,4,10,.78)');
    g.fillStyle = bar; g.fillRect(0, H - 56, vw, 56);
    g.fillStyle = 'rgba(6,4,10,.55)';
    for (let x = 30; x < vw; x += 120) g.fillRect(x, H - 30, 10, 30);
    // 左上角离镜头很近的一盏灯，只看见虚掉的一团暖光
    const k = 0.5 + 0.5 * Math.sin(t / 1100);
    const gr = g.createRadialGradient(34, 18, 2, 34, 18, 90);
    gr.addColorStop(0, `rgba(190,100,45,${0.30 + 0.06 * k})`);
    gr.addColorStop(1, 'rgba(110,50,25,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 130, 120);
  }

  // 屏幕空间的后期（不随镜头平移）：前景虚影、颗粒、暗角。vw 是当前取景窗的逻辑宽度。
  function front(g, t, vw) {
    vw = vw || W;
    silhouettes(g, t, vw);
    // 颗粒：每 4 帧（约 70ms）换一张，透明度 0.05
    if (noise.length) {
      g.save();
      g.globalAlpha = 0.05;
      g.globalCompositeOperation = 'overlay';
      const pat = g.createPattern(noise[Math.floor(t / 70) % noise.length], 'repeat');
      g.fillStyle = pat; g.fillRect(0, 0, vw, H);
      g.restore();
    }
    // 四角暗角
    const v = g.createRadialGradient(vw / 2, H * 0.52, H * 0.35, vw / 2, H * 0.52, Math.max(vw * 0.66, H * 0.8));
    v.addColorStop(0, 'rgba(6,4,12,0)'); v.addColorStop(1, 'rgba(6,4,12,.55)');
    g.fillStyle = v; g.fillRect(0, 0, vw, H);
  }

  root.MKZ_BACKDROP = { load, draw, front, dust, lightAt, LANTERNS, W, H, GROUND };
})(typeof self !== 'undefined' ? self : this);
