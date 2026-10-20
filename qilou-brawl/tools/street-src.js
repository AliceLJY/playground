import * as pc from 'playcanvas';
import { Scene, Character, Animation, SkyDome } from '@viggle/splat-engine';
import { buildStreet, addLights } from '../src/street.js';
window.__viewer = { ready: false };
try {
  const canvas = document.getElementById('c');
  const scene = await Scene.create(canvas, { fov: 50, depth: true, preserveDrawingBuffer: true, far: 200 });
  scene.start();
  SkyDome.create(scene, { topColor: '#3B3A6B', bottomColor: '#F6A96B' });
  const st = buildStreet(scene.app); scene.app.root.addChild(st.root); addLights(scene.app, scene.app.root);
  const c = await Character.load(scene, '../public/assets/chars/wusheng.vsplat');
  await Animation.loadGlb(scene, '../public/assets/motions/fighting_stance_idle.glb', 'idle');
  c.playAnimation('idle', { loop: true, rootMotion: false });
  const q = new URLSearchParams(location.search), yaw = +(q.get('yaw') || 0);
  c.setPosition(0, 0, 2); c.setRotation(0, yaw, 0);
  // camera behind (at -z) looking toward +z
  scene.cameraEntity.setPosition(1.2, 2.2, -2.6); scene.cameraEntity.lookAt(0, 1.1, 3.5);
  window.__viewer = { ready: true, low: c.getLowestWorldY(), pos: c.getPosition().toString() };
} catch (e) { window.__viewer = { ready: false, error: String(e && e.stack || e) }; }
