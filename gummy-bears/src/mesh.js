// Render-mesh helpers kept free of Three.js so Node tests can check them: vertex normals for one bear's
// slot in a merged buffer, and the shared index buffer for a mesh that holds many bears.
export function mergedIndex(indices, vertexCount, slots) {
  const out = new Uint32Array(slots * indices.length);
  for (let s = 0; s < slots; s++) for (let k = 0; k < indices.length; k++) out[s * indices.length + k] = indices[k] + s * vertexCount;
  return out;
}
// Area-weighted vertex normals for the bear in `slot` (vertices slot*NV .. slot*NV+NV-1).
export function computeNormals(p, nrm, indices, NV, slot) {
  const v0 = slot * NV, a0 = v0 * 3;
  nrm.fill(0, a0, a0 + NV * 3);
  for (let t = 0; t < indices.length; t += 3) {
    const a = (v0 + indices[t]) * 3, b = (v0 + indices[t + 1]) * 3, c = (v0 + indices[t + 2]) * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    nrm[a] += nx; nrm[a + 1] += ny; nrm[a + 2] += nz; nrm[b] += nx; nrm[b + 1] += ny; nrm[b + 2] += nz; nrm[c] += nx; nrm[c + 1] += ny; nrm[c + 2] += nz;
  }
  for (let i = a0; i < a0 + NV * 3; i += 3) { const l = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) || 1; nrm[i] /= l; nrm[i + 1] /= l; nrm[i + 2] /= l; }
  return nrm;
}
