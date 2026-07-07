// rules/spatial/hash2d.js

function keyOf(ix, iy) {
  return ix + ':' + iy;
}

export function createSpatialHash(cellSize = 96) {
  const buckets = new Map();

  function clear() {
    buckets.clear();
  }

  function insert(id, x, y, radius = 0, payload = null) {
    const minX = Math.floor((x - radius) / cellSize);
    const maxX = Math.floor((x + radius) / cellSize);
    const minY = Math.floor((y - radius) / cellSize);
    const maxY = Math.floor((y + radius) / cellSize);

    for (let iy = minY; iy <= maxY; iy += 1) {
      for (let ix = minX; ix <= maxX; ix += 1) {
        const key = keyOf(ix, iy);
        if (buckets.has(key) === false) buckets.set(key, []);
        buckets.get(key).push({ id, x, y, radius, payload });
      }
    }
  }

  function queryAABB(minX, minY, maxX, maxY) {
    const out = [];
    const seen = new Set();

    const ix0 = Math.floor(minX / cellSize);
    const ix1 = Math.floor(maxX / cellSize);
    const iy0 = Math.floor(minY / cellSize);
    const iy1 = Math.floor(maxY / cellSize);

    for (let iy = iy0; iy <= iy1; iy += 1) {
      for (let ix = ix0; ix <= ix1; ix += 1) {
        const bucket = buckets.get(keyOf(ix, iy));
        if (bucket === undefined) continue;
        for (const item of bucket) {
          if (seen.has(item.id)) continue;
          seen.add(item.id);
          out.push(item);
        }
      }
    }

    return out;
  }

  function queryRadius(x, y, radius) {
    const r2 = radius * radius;
    const candidates = queryAABB(x - radius, y - radius, x + radius, y + radius);
    return candidates.filter((item) => {
      const dx = item.x - x;
      const dy = item.y - y;
      const rr = radius + item.radius;
      return (dx * dx + dy * dy) <= Math.max(r2, rr * rr);
    });
  }

  return { clear, insert, queryAABB, queryRadius, buckets, cellSize };
}
