export function createChamberField({ x, y, r, aspect, angle }) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return (px, py) => {
    const dx = px - x;
    const dy = py - y;
    const localX = (dx * cos + dy * sin) / aspect;
    const localY = (-dx * sin + dy * cos) * aspect;
    return r - Math.hypot(localX, localY);
  };
}
