export function perspective(fovY, aspect, near, far, out = new Float32Array(16)) {
  const f = 1 / Math.tan(fovY * 0.5);
  const nf = 1 / (near - far);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[14] = 2 * far * near * nf;
  return out;
}

export function lookAt(eye, target, up = [0, 1, 0], out = new Float32Array(16)) {
  let zx = eye[0] - target[0];
  let zy = eye[1] - target[1];
  let zz = eye[2] - target[2];
  const zLength = Math.hypot(zx, zy, zz) || 1;
  zx /= zLength;
  zy /= zLength;
  zz /= zLength;

  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  const xLength = Math.hypot(xx, xy, xz) || 1;
  xx /= xLength;
  xy /= xLength;
  xz /= xLength;

  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;

  out[0] = xx;
  out[1] = yx;
  out[2] = zx;
  out[3] = 0;
  out[4] = xy;
  out[5] = yy;
  out[6] = zy;
  out[7] = 0;
  out[8] = xz;
  out[9] = yz;
  out[10] = zz;
  out[11] = 0;
  out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  out[15] = 1;
  return out;
}

export function multiply(left, right, out = new Float32Array(16)) {
  for (let column = 0; column < 4; column++) {
    const offset = column * 4;
    const r0 = right[offset];
    const r1 = right[offset + 1];
    const r2 = right[offset + 2];
    const r3 = right[offset + 3];
    out[offset] = left[0] * r0 + left[4] * r1 + left[8] * r2 + left[12] * r3;
    out[offset + 1] = left[1] * r0 + left[5] * r1 + left[9] * r2 + left[13] * r3;
    out[offset + 2] = left[2] * r0 + left[6] * r1 + left[10] * r2 + left[14] * r3;
    out[offset + 3] = left[3] * r0 + left[7] * r1 + left[11] * r2 + left[15] * r3;
  }
  return out;
}

