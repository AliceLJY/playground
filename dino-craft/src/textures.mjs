// A single nearest-filtered atlas. Each face repeats one 16 × 16 pixel tile.
export function createTerrainAtlas(THREE) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(canvas.width, canvas.height);
  const bases = [[92,128,60],[120,87,57],[120,87,57],[121,135,127],[199,185,128],[160,120,72],[105,76,47],[173,129,76],[57,98,52],[242,147,35],[121,135,127],[223,147,49],[241,191,86],[255,255,255],[255,255,255],[255,255,255]];
  for (let tile = 0; tile < 16; tile++) {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const hash = (Math.imul(x + 17 * tile, 374761393) ^ Math.imul(y, 668265263)) >>> 0;
        const grain = ((hash ^ hash >>> 13) % 19) - 9;
        let rgb = bases[tile].map(v => v + grain), alpha = 255;
        if (tile === 0) {
          if ((x * 3 + y * 7) % 13 < 3) rgb = [109 + grain,145 + grain,69 + grain];
          if ((x + y * 3) % 19 === 0) rgb = [65,103,48];
        }
        if (tile === 1 && y < 3 + (x * 7 % 3)) rgb = [85 + grain,124 + grain,56 + grain];
        if ([1,2].includes(tile) && (x + y * 5) % 23 < 2 && y > 4) rgb = [85,62,46];
        if ([3,10].includes(tile)) {
          if (y === (Math.floor(x / 5) % 2 ? 10 : 6) || (x + y * 2) % 31 === 0) rgb = [90,105,100];
          if (y === 2 && x > 2 && x < 12) rgb = [149,158,143];
          if (tile === 10 && ((x - 5) ** 2 + (y - 5) ** 2 < 7 || (x - 11) ** 2 + (y - 11) ** 2 < 9)) rgb = [76 + grain,138 + grain,147 + grain];
        }
        if (tile === 4 && (x * 3 + y) % 17 === 0) rgb = [159,143,95];
        if (tile === 5) {
          const ring = Math.floor(Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)));
          if (ring % 3 === 0 || x === 1 || y === 1 || x === 14 || y === 14) rgb = [104,73,45];
        }
        if (tile === 6) {
          const stripe = (x + Math.floor(y / 5)) % 5;
          rgb = stripe < 2 ? [74 + grain,56 + grain,36 + grain] : [126 + grain,91 + grain,53 + grain];
        }
        if (tile === 7) {
          if (y % 5 === 0 || (x === (Math.floor(y / 5) % 2 ? 11 : 4) && y % 5 < 4)) rgb = [99,71,43];
          else if (y % 5 === 1) rgb = [197,155,97];
          else if ((x * 2 + y) % 17 < 2) rgb = [143,100,58];
        }
        if (tile === 8) {
          if ((x-3)**2+(y-5)**2 < 3 || (x-12)**2+(y-11)**2 < 3) alpha = 0;
          if ((x + y) % 5 === 0) rgb = [82,127,60];
          if ((x - y + 16) % 7 === 0) rgb = [43,80,42];
        }
        if (tile === 9) {
          alpha = 168;
          if (x === 2 || y === 2) rgb = [255,214,104];
          if (Math.abs(x - y - 2) < 2 && x > 5 && x < 12) rgb = [159,78,22];
        }
        const i = (y * 256 + tile * 16 + x) * 4;
        image.data.set([...rgb.map(v => Math.max(0,Math.min(255,v))), alpha], i);
      }
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}
