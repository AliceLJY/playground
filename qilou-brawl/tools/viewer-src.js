// 最小验证页：加载一个 .vsplat 角色，循环播放一个动作。?char=wusheng&anim=Standing%20Idle
import { Scene, Character, Animation, OrbitControls, SkyDome, Grid } from '@viggle/splat-engine';
const q = new URLSearchParams(location.search);
const char = q.get('char') || 'wusheng', anim = q.get('anim') || 'standing_idle';
const s = document.getElementById('s');
window.__viewer = { ready: false, error: null };
try {
  const canvas = document.getElementById('c');
  const scene = await Scene.create(canvas, { fov: 40, preserveDrawingBuffer: true });
  scene.start();
  const controls = new OrbitControls({ distance: 3.2, pitch: 8, target: { x: 0, y: 0.9, z: 0 } });
  controls.attach({ canvas, cameraEntity: scene.cameraEntity });
  scene.app.on('update', () => controls.update());
  SkyDome.create(scene, { topColor: '#3B3A6B', bottomColor: '#F6A96B' });
  Grid.create(scene);
  const c = await Character.load(scene, `../public/assets/chars/${char}.vsplat`); c.setRotation(0, +(q.get('yaw') ?? 60), 0);
  await Animation.loadGlb(scene, `../public/assets/motions/${anim}.glb`, 'a');
  c.playAnimation('a', { loop: true });
  window.__viewer = { ready: true, error: null, char: c };
  s.textContent = `${char} · ${anim}`;
} catch (e) { window.__viewer = { ready: false, error: String(e && e.stack || e) }; s.textContent = 'ERROR ' + e; }
