var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// public/src/shared/net/protocol.js
var NET_VERSION = "0.3.0";
var MESSAGE = Object.freeze({
  HELLO: "hello",
  WELCOME: "welcome",
  INPUT: "input",
  SNAPSHOT: "snapshot",
  PEER_JOINED: "peer.joined",
  PEER_LEFT: "peer.left",
  PING: "ping",
  PONG: "pong",
  ERROR: "error"
});
var DEFAULT_ROOM_ID = "lobby";
function normalizeRoomId(raw = DEFAULT_ROOM_ID) {
  return String(raw).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || DEFAULT_ROOM_ID;
}
__name(normalizeRoomId, "normalizeRoomId");
function seedFromString(str) {
  let h = 2166136261 >>> 0;
  const text = String(str);
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
__name(seedFromString, "seedFromString");
function makeRoomSeed(roomId = DEFAULT_ROOM_ID) {
  return seedFromString(`room:${normalizeRoomId(roomId)}`);
}
__name(makeRoomSeed, "makeRoomSeed");
function encodeMessage(type, payload = {}) {
  return JSON.stringify({
    v: NET_VERSION,
    type,
    t: Date.now(),
    ...payload
  });
}
__name(encodeMessage, "encodeMessage");
function decodeMessage(raw) {
  const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
  const msg = JSON.parse(text);
  if (!msg || typeof msg !== "object") throw new Error("message must be an object");
  if (msg.v !== NET_VERSION) throw new Error(`net version mismatch: ${msg.v || "missing"}`);
  if (typeof msg.type !== "string" || msg.type.length === 0) throw new Error("message type missing");
  return msg;
}
__name(decodeMessage, "decodeMessage");
function makeInputFrame({
  seq,
  tick,
  moveX = 0,
  moveY = 0,
  aimX = 0,
  aimY = 0,
  fire = false,
  spellSlot = null
} = {}) {
  return {
    seq: Number.isFinite(seq) ? seq : 0,
    tick: Number.isFinite(tick) ? tick : 0,
    moveX: clampUnit(moveX),
    moveY: clampUnit(moveY),
    aimX: clampUnit(aimX),
    aimY: clampUnit(aimY),
    fire: Boolean(fire),
    spellSlot: Number.isInteger(spellSlot) ? spellSlot : null
  };
}
__name(makeInputFrame, "makeInputFrame");
function clampUnit(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-1, Math.min(1, n));
}
__name(clampUnit, "clampUnit");

// public/src/rules/geometry/caveGen.js
function mulberry32(seed) {
  let t = seed >>> 0;
  return function() {
    t = t + 1831565813 | 0;
    let x = Math.imul(t ^ t >>> 15, 1 | t);
    x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x;
    return ((x ^ x >>> 14) >>> 0) / 4294967296;
  };
}
__name(mulberry32, "mulberry32");
function buildPermutation(rng) {
  const p = new Uint8Array(512);
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i++) base[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = rng() * (i + 1) | 0;
    const tmp = base[i];
    base[i] = base[j];
    base[j] = tmp;
  }
  for (let i = 0; i < 256; i++) {
    p[i] = base[i];
    p[i + 256] = base[i];
  }
  return p;
}
__name(buildPermutation, "buildPermutation");
var GRAD2 = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
function createPerlin2D(seed) {
  const rng = mulberry32(seed);
  const perm = buildPermutation(rng);
  function fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }
  __name(fade, "fade");
  function lerp(a, b, t) {
    return a + t * (b - a);
  }
  __name(lerp, "lerp");
  return /* @__PURE__ */ __name(function noise(x, y) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const u = fade(xf), v = fade(yf);
    const aa = perm[perm[X] + Y], ab = perm[perm[X] + Y + 1];
    const ba = perm[perm[X + 1] + Y], bb = perm[perm[X + 1] + Y + 1];
    function dot(hash, fx, fy) {
      const g = GRAD2[hash & 7];
      return g[0] * fx + g[1] * fy;
    }
    __name(dot, "dot");
    return lerp(
      lerp(dot(aa, xf, yf), dot(ba, xf - 1, yf), u),
      lerp(dot(ab, xf, yf - 1), dot(bb, xf - 1, yf - 1), u),
      v
    );
  }, "noise");
}
__name(createPerlin2D, "createPerlin2D");
function fbm(noise, x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
  let amp = 1, freq = 1, sum = 0, max = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(x * freq, y * freq);
    max += amp;
    freq *= lacunarity;
    amp *= gain;
  }
  return sum / max;
}
__name(fbm, "fbm");
var CaveProfile = Object.freeze({
  CAVERNS: {
    // Dual-layer: caverns (low freq) + tunnels (high freq)
    cavern: { threshold: -0.12, octaves: 3, scale: 5e-3 },
    // big open rooms
    tunnel: { threshold: 0.02, octaves: 5, scale: 0.018 }
    // narrow winding paths
  },
  TUNNELS: {
    cavern: { threshold: 0.05, octaves: 4, scale: 8e-3 },
    tunnel: { threshold: 0.06, octaves: 6, scale: 0.025 }
  },
  GROTTOS: {
    cavern: { threshold: -0.2, octaves: 3, scale: 4e-3 },
    tunnel: { threshold: -0.05, octaves: 4, scale: 0.014 }
  },
  WARRENS: {
    cavern: { threshold: 0.05, octaves: 4, scale: 0.012 },
    tunnel: { threshold: 0.1, octaves: 6, scale: 0.03 }
  }
});
function bakeGrid(seed, width, height, profile, cellSize) {
  const noiseCavern = createPerlin2D(seed);
  const noiseTunnel = createPerlin2D(seed ^ 32570);
  const cols = Math.ceil(width / cellSize) + 1;
  const rows = Math.ceil(height / cellSize) + 1;
  const total = cols * rows;
  const moveGrid = new Float32Array(total);
  const cav = profile.cavern;
  const tun = profile.tunnel;
  const margin = 80;
  for (let gy = 0; gy < rows; gy++) {
    const wy = gy * cellSize;
    const rowOff = gy * cols;
    for (let gx = 0; gx < cols; gx++) {
      const wx = gx * cellSize;
      const edgeDist = Math.min(
        wx - margin,
        width - margin - wx,
        wy - margin,
        height - margin - wy
      );
      const edgeFade = Math.max(0, Math.min(1, edgeDist / (margin * 2)));
      const nc = fbm(noiseCavern, wx * cav.scale, wy * cav.scale, cav.octaves);
      const vc = nc * edgeFade - cav.threshold;
      const nt = fbm(noiseTunnel, wx * tun.scale, wy * tun.scale, tun.octaves);
      const vt = nt * edgeFade - tun.threshold;
      const val = Math.max(vc, vt);
      moveGrid[rowOff + gx] = val > 0 ? val * 200 : 0;
    }
  }
  const invCell = 1 / cellSize;
  function distanceMove(px, py) {
    const fx = px * invCell;
    const fy = py * invCell;
    const gx = Math.floor(fx);
    const gy = Math.floor(fy);
    if (gx < 0 || gy < 0 || gx >= cols - 1 || gy >= rows - 1) return 0;
    const tx = fx - gx;
    const ty = fy - gy;
    const i00 = gy * cols + gx;
    const i10 = i00 + 1;
    const i01 = i00 + cols;
    const i11 = i01 + 1;
    const top = moveGrid[i00] * (1 - tx) + moveGrid[i10] * tx;
    const bottom = moveGrid[i01] * (1 - tx) + moveGrid[i11] * tx;
    return top * (1 - ty) + bottom * ty;
  }
  __name(distanceMove, "distanceMove");
  return { distanceMove, cellSize, cols, rows, width, height, moveGrid };
}
__name(bakeGrid, "bakeGrid");
function findSpawns(grid, width, height, count, minSpacing) {
  const spawns = [];
  const cx = width / 2, cy = height / 2;
  const candidates = [];
  const step = grid.cellSize * 4;
  for (let y = 100; y < height - 100; y += step) {
    for (let x = 100; x < width - 100; x += step) {
      const d = grid.distanceMove(x, y);
      if (d >= 20) {
        candidates.push({ x, y, clearance: d, dc: Math.hypot(x - cx, y - cy) });
      }
    }
  }
  candidates.sort((a, b) => b.clearance - a.clearance || a.dc - b.dc);
  for (const c of candidates) {
    if (spawns.length >= count) break;
    let ok = true;
    for (const s of spawns) {
      if (Math.hypot(s.x - c.x, s.y - c.y) < minSpacing) {
        ok = false;
        break;
      }
    }
    if (ok) spawns.push({ x: c.x, y: c.y });
  }
  if (spawns.length === 0) spawns.push({ x: cx, y: cy });
  return spawns;
}
__name(findSpawns, "findSpawns");
function generateCave(opts) {
  const {
    seed = 42,
    width = 4e3,
    height = 4e3,
    profile = CaveProfile.CAVERNS,
    cellSize = 4,
    spawnCount = 4,
    spawnSpacing = 400
  } = opts;
  const grid = bakeGrid(seed, width, height, profile, cellSize);
  const spawns = findSpawns(grid, width, height, spawnCount, spawnSpacing);
  return {
    grid,
    bounds: { w: width, h: height },
    spawns
  };
}
__name(generateCave, "generateCave");

// public/src/lib/ecs-js/systems.js
var _systems = /* @__PURE__ */ Object.create(null);
var _explicitOrder = /* @__PURE__ */ Object.create(null);
var globalConsole = typeof console !== "undefined" ? console : null;
var logError = globalConsole && typeof globalConsole.error === "function" ? globalConsole.error.bind(globalConsole) : () => {
};
function escapeLabel(label) {
  return String(label).replace(/"/g, '\\"');
}
__name(escapeLabel, "escapeLabel");
function registerSystem(system, phase, opts = {}) {
  if (typeof system !== "function") throw new Error("registerSystem: system must be a function");
  if (typeof phase !== "string" || !phase) throw new Error("registerSystem: phase must be a non-empty string");
  const rec = { system, before: new Set(opts.before || []), after: new Set(opts.after || []) };
  (_systems[phase] ||= []).push(rec);
  return rec;
}
__name(registerSystem, "registerSystem");
function setSystemOrder(phase, systemList) {
  if (typeof phase !== "string" || !phase) throw new Error("setSystemOrder: phase must be a non-empty string");
  if (!Array.isArray(systemList)) throw new Error("setSystemOrder: systemList must be an array of functions");
  _explicitOrder[phase] = systemList;
}
__name(setSystemOrder, "setSystemOrder");
function getOrderedSystems(phase) {
  if (_explicitOrder[phase]) return _explicitOrder[phase];
  const nodes = _systems[phase] || [];
  const graph = /* @__PURE__ */ new Map();
  nodes.forEach(({ system }) => graph.set(system, /* @__PURE__ */ new Set()));
  nodes.forEach(({ system, before, after }) => {
    for (const dep of after) if (graph.has(dep)) graph.get(dep).add(system);
    for (const dep of before) if (graph.has(dep)) graph.get(system).add(dep);
  });
  const out = [];
  const visited = /* @__PURE__ */ new Set();
  function dfs(n) {
    if (visited.has(n)) return;
    visited.add(n);
    for (const m of graph.get(n) || []) dfs(m);
    out.push(n);
  }
  __name(dfs, "dfs");
  graph.forEach((_, n) => dfs(n));
  return out.reverse();
}
__name(getOrderedSystems, "getOrderedSystems");
function runSystems(phase, world, dt) {
  const list = getOrderedSystems(phase);
  for (let i = 0; i < list.length; i++) {
    const fn = list[i];
    try {
      fn(world, dt);
    } catch (e) {
      logError(`[systems] error in phase "${phase}"`, e);
    }
  }
}
__name(runSystems, "runSystems");
function composeScheduler(...steps) {
  const norm = steps.flat().filter(Boolean).map((s) => {
    if (typeof s === "string") return (w, dt) => runSystems(s, w, dt);
    if (typeof s === "function") return s;
    throw new Error("composeScheduler: steps must be phase names or functions");
  });
  return (world, dt) => {
    for (const f of norm) f(world, dt);
  };
}
__name(composeScheduler, "composeScheduler");
function clearSystems() {
  for (const k of Object.keys(_systems)) delete _systems[k];
  for (const k of Object.keys(_explicitOrder)) delete _explicitOrder[k];
}
__name(clearSystems, "clearSystems");
function _visualizePhases(phases) {
  const lines = ["digraph Systems {", "  rankdir=TB;"];
  const edges = [];
  const seenEdges = /* @__PURE__ */ new Set();
  const nodeIds = /* @__PURE__ */ new Map();
  const phaseFirstNodes = /* @__PURE__ */ new Map();
  const phaseLastNodes = /* @__PURE__ */ new Map();
  function addEdge(from, to, label, attrs = {}) {
    if (!from || !to) return;
    const key = `${from}::${to}::${label}::${JSON.stringify(attrs)}`;
    if (seenEdges.has(key)) return;
    seenEdges.add(key);
    edges.push({ from, to, label, attrs });
  }
  __name(addEdge, "addEdge");
  for (const phase of phases) {
    const ordered = getOrderedSystems(phase);
    if (!ordered.length) continue;
    const clusterId = `cluster_${phase}`;
    lines.push(`  subgraph "${escapeLabel(clusterId)}" {`);
    lines.push(`    label=<<FONT POINT-SIZE="16"><B>${escapeLabel(phase)}</B></FONT>>;`);
    lines.push('    fontname="Helvetica";');
    lines.push("    rank=same;");
    lines.push("    { rank=same;");
    ordered.forEach((system, idx) => {
      const nodeId = `${phase}_${idx}`;
      nodeIds.set(system, nodeId);
      const baseLabel = system && system.name ? system.name : `fn@${idx}`;
      lines.push(`      "${escapeLabel(nodeId)}" [label="${escapeLabel(baseLabel)}"];`);
    });
    lines.push("    }");
    lines.push("  }");
    if (ordered.length) {
      phaseFirstNodes.set(phase, nodeIds.get(ordered[0]));
      phaseLastNodes.set(phase, nodeIds.get(ordered[ordered.length - 1]));
    }
  }
  for (const phase of phases) {
    const nodes = _systems[phase] || [];
    nodes.forEach(({ system, before, after }) => {
      const fromId = nodeIds.get(system);
      if (!fromId) return;
      for (const dep of before) {
        const depId = nodeIds.get(dep);
        addEdge(depId, fromId, "before", { style: "dotted", color: "gray50", constraint: false, arrowhead: "lvee", arrowsize: 0.8 });
      }
      for (const dep of after) {
        const depId = nodeIds.get(dep);
        addEdge(fromId, depId, "after", { style: "dotted", color: "gray50", constraint: false, arrowhead: "lvee", arrowsize: 0.8 });
      }
    });
    const ordered = getOrderedSystems(phase);
    for (let i = 0; i < ordered.length - 1; i++) {
      const a = nodeIds.get(ordered[i]);
      const b = nodeIds.get(ordered[i + 1]);
      addEdge(a, b, "order");
    }
  }
  for (let i = 0; i < phases.length - 1; i++) {
    const from = phaseLastNodes.get(phases[i]);
    const to = phaseFirstNodes.get(phases[i + 1]);
    addEdge(from, to, "phase");
  }
  for (const { from, to, label, attrs } of edges) {
    const parts = [`label="${escapeLabel(label)}"`];
    if (attrs.style) parts.push(`style="${attrs.style}"`);
    if (attrs.color) parts.push(`color="${attrs.color}"`);
    if (attrs.constraint === false) parts.push("constraint=false");
    if (attrs.arrowhead) parts.push(`arrowhead="${attrs.arrowhead}"`);
    if (attrs.arrowsize) parts.push(`arrowsize=${attrs.arrowsize}`);
    const attrStr = parts.join(", ");
    lines.push(`  "${escapeLabel(from)}" -> "${escapeLabel(to)}" [${attrStr}];`);
  }
  lines.push("}");
  return lines.join("\n");
}
__name(_visualizePhases, "_visualizePhases");
function visualizeGraph(options = {}) {
  const { phase, phases } = options || {};
  let phaseList;
  if (Array.isArray(phase)) phaseList = phase;
  else if (phase) phaseList = [phase];
  else if (Array.isArray(phases)) phaseList = phases;
  else phaseList = Object.keys(_systems);
  return _visualizePhases(phaseList);
}
__name(visualizeGraph, "visualizeGraph");
var PhaseBuilder = class {
  static {
    __name(this, "PhaseBuilder");
  }
  constructor(phase) {
    if (typeof phase !== "string" || !phase) throw new Error("Systems.phase: phase must be a non-empty string");
    this.phase = phase;
  }
  add(system, opts = {}) {
    const rec = registerSystem(system, this.phase, opts);
    return new StepConfig(this, rec);
  }
  clear() {
    delete _systems[this.phase];
    delete _explicitOrder[this.phase];
    return this;
  }
  list() {
    return (_systems[this.phase] || []).map(({ system }) => system);
  }
  order(...systems) {
    const flat = systems.flat();
    setSystemOrder(this.phase, flat);
    return this;
  }
};
var StepConfig = class {
  static {
    __name(this, "StepConfig");
  }
  constructor(phase, record) {
    this._phase = phase;
    this._record = record;
  }
  before(...systems) {
    this.#addToSet(this._record.before, systems);
    return this;
  }
  after(...systems) {
    this.#addToSet(this._record.after, systems);
    return this;
  }
  add(system, opts = {}) {
    return this._phase.add(system, opts);
  }
  list() {
    return this._phase.list();
  }
  clear() {
    return this._phase.clear();
  }
  order(...systems) {
    return this._phase.order(...systems);
  }
  #addToSet(target, systems) {
    for (const fn of systems.flat()) {
      if (typeof fn !== "function") throw new Error("Systems dependency must be a function");
      target.add(fn);
    }
  }
};
var Systems = {
  phase(name) {
    return new PhaseBuilder(name);
  },
  clear() {
    clearSystems();
    return this;
  },
  list(name) {
    return this.phase(name).list();
  },
  visualizeGraph(options = {}) {
    return visualizeGraph(options);
  }
};

// public/src/lib/ecs-js/extensions.js
function defineExtension(name, installer, options = {}) {
  if (typeof name !== "string" || !name) {
    throw new Error("defineExtension: name must be a non-empty string");
  }
  if (typeof installer !== "function") {
    throw new Error("defineExtension: installer must be a function");
  }
  const key = Object.prototype.hasOwnProperty.call(options, "key") ? options.key : Symbol(name);
  return Object.freeze({ key, name, install: installer });
}
__name(defineExtension, "defineExtension");
function isExtensionLike(extension) {
  return typeof extension === "function" || !!(extension && typeof extension === "object" && typeof extension.install === "function");
}
__name(isExtensionLike, "isExtensionLike");
function installWorldExtensionAPI(WorldCtor, options = {}) {
  const logError3 = typeof options.logError === "function" ? options.logError : () => {
  };
  Object.assign(WorldCtor.prototype, {
    /** Attach a runtime extension once.
     * @param {Function|{ key?:any, name?:string, install:(world:any)=>(void|Function) }} extension
     * @returns {any}
     */
    install(extension) {
      const key = extensionKey(extension, "install");
      if (this._extensions.has(key)) return this;
      const name = extensionName(extension);
      let cleanup = null;
      try {
        const result = runExtensionInstaller(extension, this);
        cleanup = typeof result === "function" ? result : null;
      } catch (e) {
        logError3(`[ecs] extension "${name}" failed to install`, e);
        throw e;
      }
      this._extensions.set(key, {
        key,
        name,
        extension,
        uninstall: cleanup
      });
      return this;
    },
    /** Remove a runtime extension, invoking its cleanup if one was returned.
     * @param {Function|{ key?:any, name?:string, install?:Function }} extension
     * @returns {boolean}
     */
    uninstall(extension) {
      const key = extensionKey(extension, "uninstall");
      const rec = this._extensions.get(key);
      if (!rec) return false;
      this._extensions.delete(key);
      if (typeof rec.uninstall === "function") {
        try {
          rec.uninstall(this);
        } catch (e) {
          logError3(`[ecs] extension "${rec.name}" uninstall failed`, e);
        }
      }
      return true;
    },
    /** Check whether a runtime extension is attached.
     * @param {Function|{ key?:any }} extension
     * @returns {boolean}
     */
    hasExtension(extension) {
      return this._extensions.has(extensionKey(extension, "hasExtension"));
    },
    /** Return diagnostic records for attached runtime extensions.
     * @returns {Array<{ name:string, key:any, extension:any, uninstallable:boolean }>}
     */
    extensions() {
      return Array.from(this._extensions.values()).map((rec) => ({
        name: rec.name,
        key: rec.key,
        extension: rec.extension,
        uninstallable: typeof rec.uninstall === "function"
      }));
    }
  });
}
__name(installWorldExtensionAPI, "installWorldExtensionAPI");
function extensionKey(extension, label = "install") {
  if (!extension) throw new Error(`${label}: extension required`);
  if (typeof extension === "function") return extension;
  if (typeof extension === "object") {
    if (Object.prototype.hasOwnProperty.call(extension, "key")) return extension.key;
    return extension;
  }
  throw new Error(`${label}: expected function or extension object`);
}
__name(extensionKey, "extensionKey");
function extensionName(extension) {
  if (typeof extension === "function") return extension.name || "<anonymous extension>";
  if (extension && typeof extension === "object") return String(extension.name || "<anonymous extension>");
  return "<invalid extension>";
}
__name(extensionName, "extensionName");
function runExtensionInstaller(extension, world) {
  if (typeof extension === "function") return extension(world);
  if (extension && typeof extension.install === "function") return extension.install(world);
  throw new Error("install: expected function or object with install(world)");
}
__name(runExtensionInstaller, "runExtensionInstaller");

// public/src/lib/ecs-js/resources.js
function installWorldResourceAPI(WorldCtor, options = {}) {
  const logError3 = typeof options.logError === "function" ? options.logError : () => {
  };
  Object.assign(WorldCtor.prototype, {
    /** Get a world-local resource value, lazily creating it if needed.
     * @param {{ key:any, name:string, create?:Function }} resource
     * @returns {any}
     */
    resource(resource) {
      const key = resourceKey(resource, "resource");
      if (this._resources.has(key)) return this._resources.get(key).value;
      this._resourceDefs.set(key, resource);
      const create = typeof resource.create === "function" ? resource.create : (() => void 0);
      const value = create(this, resource);
      this._resources.set(key, {
        key,
        name: resourceName(resource),
        resource,
        value
      });
      return value;
    },
    /** Check whether a world-local resource has been created or explicitly set.
     * @param {{ key:any }} resource
     * @returns {boolean}
     */
    hasResource(resource) {
      return this._resources.has(resourceKey(resource, "hasResource"));
    },
    /** Explicitly set or replace a world-local resource value.
     * Replacing an existing value invokes the resource dispose hook first.
     * @param {{ key:any, name:string, dispose?:Function }} resource
     * @param {any} value
     * @returns {any}
     */
    setResource(resource, value) {
      const key = resourceKey(resource, "setResource");
      this._resourceDefs.set(key, resource);
      const existing = this._resources.get(key);
      if (existing && existing.value !== value) this._disposeResourceRecord(existing);
      this._resources.set(key, {
        key,
        name: resourceName(resource),
        resource,
        value
      });
      return value;
    },
    /** Reset a resource using its reset hook, or dispose and recreate it.
     * @param {{ key:any, name:string, create?:Function, reset?:Function, dispose?:Function }} resource
     * @returns {any}
     */
    resetResource(resource) {
      const key = resourceKey(resource, "resetResource");
      if (!this._resources.has(key)) return this.resource(resource);
      const rec = this._resources.get(key);
      this._resourceDefs.set(key, resource);
      const reset = typeof resource.reset === "function" ? resource.reset : null;
      if (reset) {
        const next = reset(rec.value, this, resource);
        if (next !== void 0 && next !== rec.value) {
          this._disposeResourceRecord(rec);
          rec.value = next;
        }
        rec.resource = resource;
        rec.name = resourceName(resource);
        return rec.value;
      }
      this._disposeResourceRecord(rec);
      this._resources.delete(key);
      return this.resource(resource);
    },
    /** Delete a created resource, invoking its dispose hook if present.
     * @param {{ key:any }} resource
     * @returns {boolean}
     */
    deleteResource(resource) {
      const key = resourceKey(resource, "deleteResource");
      const rec = this._resources.get(key);
      if (!rec) return false;
      this._resources.delete(key);
      this._disposeResourceRecord(rec);
      return true;
    },
    _disposeResourceRecord(rec) {
      const dispose = typeof rec?.resource?.dispose === "function" ? rec.resource.dispose : null;
      if (!dispose) return;
      try {
        dispose(rec.value, this, rec.resource);
      } catch (e) {
        logError3(`[ecs] resource "${rec.name}" dispose failed`, e);
      }
    },
    /** Return diagnostic records for created world-local resources.
     * @returns {Array<{ name:string, key:any, resource:any, value:any, serializable:boolean, resettable:boolean, disposable:boolean }>}
     */
    resources() {
      return Array.from(this._resources.values()).map((rec) => ({
        name: rec.name,
        key: rec.key,
        resource: rec.resource,
        value: rec.value,
        serializable: rec.resource?.serializable === true,
        resettable: typeof rec.resource?.reset === "function",
        disposable: typeof rec.resource?.dispose === "function"
      }));
    }
  });
}
__name(installWorldResourceAPI, "installWorldResourceAPI");
function resourceRegistryFromWorld(world) {
  const map = /* @__PURE__ */ new Map();
  for (const resource of world._resourceDefs?.values?.() || []) {
    if (resource?.name) map.set(resource.name, resource);
  }
  for (const rec of world._resources?.values?.() || []) {
    if (rec?.resource?.name) map.set(rec.resource.name, rec.resource);
  }
  return map;
}
__name(resourceRegistryFromWorld, "resourceRegistryFromWorld");
function applyResourceSnapshot(world, resources, registry, opts = {}) {
  if (!resources) return;
  const context = opts.context || "applyResourceSnapshot";
  for (const [name, payload] of Object.entries(resources || {})) {
    const resource = registry.get(name);
    if (!resource) {
      if (!opts.skipUnknown) throw new Error(`${context}: unknown resource '${name}'`);
      continue;
    }
    if (resource.serializable !== true) {
      throw new Error(`${context}: resource '${name}' is not serializable`);
    }
    const value = typeof resource.deserialize === "function" ? resource.deserialize(clonePlain(payload), world, resource) : clonePlain(payload);
    world.setResource(resource, value);
  }
}
__name(applyResourceSnapshot, "applyResourceSnapshot");
function resourceKey(resource, label = "resource") {
  if (!resource || typeof resource !== "object") throw new Error(`${label}: resource definition required`);
  if (!Object.prototype.hasOwnProperty.call(resource, "key")) throw new Error(`${label}: resource definition requires a key`);
  if (typeof resource.name !== "string" || !resource.name) throw new Error(`${label}: resource definition requires a non-empty name`);
  return resource.key;
}
__name(resourceKey, "resourceKey");
function resourceName(resource) {
  return String(resource?.name || "<anonymous resource>");
}
__name(resourceName, "resourceName");
function clonePlain(x) {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(x);
    } catch {
    }
  }
  if (!x || typeof x !== "object") return x;
  if (Array.isArray(x)) return x.map(clonePlain);
  const proto = Object.getPrototypeOf(x);
  const isPlain = proto === Object.prototype || proto === null;
  if (!isPlain) return x;
  const out = {};
  for (const key of Object.keys(x)) out[key] = clonePlain(x[key]);
  return out;
}
__name(clonePlain, "clonePlain");

// public/src/lib/ecs-js/scripts.js
var PHASE_SCRIPTS = "scripts";
var ScriptRef = defineComponent("ScriptRef", { id: "", args: {} }, {
  validate(rec) {
    return typeof rec.id === "string";
  }
});
var ScriptMeta = defineComponent("ScriptMeta", { lastError: "", invoked: 0, version: 0 });
var _registry = /* @__PURE__ */ new Map();
var _handlersByEntity = /* @__PURE__ */ new Map();
function _sanitizeHandlers(h) {
  const o = {};
  for (const k in h || {}) if (typeof h[k] === "function") o[k] = h[k];
  return o;
}
__name(_sanitizeHandlers, "_sanitizeHandlers");
function _ctx(world, _id) {
  return { rand: world.rand, emit: /* @__PURE__ */ __name((ev, p) => world.emit(ev, p), "emit") };
}
__name(_ctx, "_ctx");
function _noteErr(world, id, e) {
  const msg = e && e.stack ? e.stack : String(e);
  world.has(id, ScriptMeta) ? world.set(id, ScriptMeta, { lastError: msg }) : world.add(id, ScriptMeta, { lastError: msg });
}
__name(_noteErr, "_noteErr");
function _bump(world, id) {
  if (world.has(id, ScriptMeta)) world.mutate(id, ScriptMeta, (m) => {
    m.invoked++;
  });
}
__name(_bump, "_bump");
function _ensureScriptPhase(phase) {
  const systems = Systems.list(phase);
  if (!systems.includes(ScriptAttachSystem)) {
    registerSystem(ScriptAttachSystem, phase, { before: [ScriptTickSystem] });
  }
  if (!systems.includes(ScriptTickSystem)) {
    registerSystem(ScriptTickSystem, phase);
  }
}
__name(_ensureScriptPhase, "_ensureScriptPhase");
function _makeHelper(world, eid, args) {
  const handlers = {};
  const pendingKeys = /* @__PURE__ */ new Set();
  let helper = null;
  const bag = {
    world,
    entity: eid,
    args: args && typeof args === "object" ? args : {},
    on(name, fn) {
      if (typeof name !== "string" || !name) throw new Error("script helper on(name, fn) requires a name");
      if (typeof fn !== "function") throw new Error(`script handler for ${name} must be a function`);
      handlers[name] = fn;
      return helper || bag;
    },
    use(source) {
      if (!source) return helper || bag;
      if (typeof source === "function") {
        const res = source(world, eid, args) || {};
        Object.assign(handlers, _sanitizeHandlers(res));
      } else {
        Object.assign(handlers, _sanitizeHandlers(source));
      }
      return helper || bag;
    }
  };
  helper = new Proxy(bag, {
    get(target, key) {
      if (key in target) return target[key];
      if (typeof key !== "string") return void 0;
      const keyName = String(key);
      pendingKeys.add(keyName);
      return (fn) => {
        if (typeof fn !== "function") throw new Error(`script handler for ${keyName} must be a function`);
        pendingKeys.delete(keyName);
        handlers[keyName] = fn;
        return helper;
      };
    }
  });
  const assertHandlersUsed = /* @__PURE__ */ __name(() => {
    if (pendingKeys.size === 0) return;
    const unused = Array.from(pendingKeys).join(", ");
    throw new Error(`script helper properties accessed without assigning handlers: ${unused}`);
  }, "assertHandlersUsed");
  return [helper, handlers, assertHandlersUsed];
}
__name(_makeHelper, "_makeHelper");
var ScriptEntityHandle = class {
  static {
    __name(this, "ScriptEntityHandle");
  }
  constructor(world, id) {
    this.world = world;
    this.id = id;
  }
  addScript(scriptId, args = {}) {
    this.world.add(this.id, ScriptRef, { id: String(scriptId), args: args || {} });
    return this;
  }
  removeScript() {
    if (this.world.has(this.id, ScriptRef)) this.world.remove(this.id, ScriptRef);
    return this;
  }
  script() {
    return this.world.get(this.id, ScriptRef) || null;
  }
};
function ScriptAttachSystem(world, _dt) {
  for (const [id, sref] of world.query(ScriptRef, Changed(ScriptRef))) {
    try {
      const f = _registry.get(sref.id);
      if (!f) throw new Error(`Missing script: ${sref.id}`);
      _handlersByEntity.set(id, _sanitizeHandlers(f(world, id, sref.args || {})));
      if (world.has(id, ScriptMeta)) world.set(id, ScriptMeta, { lastError: "", version: world.step, invoked: 0 });
      else world.add(id, ScriptMeta, { lastError: "", invoked: 0, version: world.step });
    } catch (e) {
      _handlersByEntity.delete(id);
      _noteErr(world, id, e);
    }
  }
  if (_handlersByEntity.size) {
    for (const eid of Array.from(_handlersByEntity.keys())) {
      if (!world.isAlive(eid) || !world.has(eid, ScriptRef)) _handlersByEntity.delete(eid);
    }
  }
}
__name(ScriptAttachSystem, "ScriptAttachSystem");
function ScriptTickSystem(world, dt) {
  for (const [id] of world.query(ScriptRef)) {
    const h = _handlersByEntity.get(id);
    const fn = h && h.onTick;
    if (typeof fn === "function") {
      try {
        fn(world, id, dt, _ctx(world, id));
        _bump(world, id);
      } catch (e) {
        _noteErr(world, id, e);
      }
    }
  }
}
__name(ScriptTickSystem, "ScriptTickSystem");
_ensureScriptPhase(PHASE_SCRIPTS);
function installScriptsAPI(world, options = {}) {
  const phase = options.phase || PHASE_SCRIPTS;
  _ensureScriptPhase(phase);
  world.scripts = {
    /** Register a script factory under a string id. */
    register(id, factory) {
      _registry.set(String(id), factory);
    },
    /** Clear all registered scripts and per-entity handler tables (hot-reload/test helper). */
    clear() {
      _registry.clear();
      _handlersByEntity.clear();
    },
    /** Retrieve the sanitized handler table for an entity if available. */
    handlersOf(eid) {
      return _handlersByEntity.get(eid) || null;
    },
    /** Force re-attachment by touching ScriptRef so Changed() matches next frame. */
    refresh() {
      for (const [eid, sref] of world.query(ScriptRef)) world.set(eid, ScriptRef, { id: sref.id, args: sref.args });
    }
  };
  world.script = /* @__PURE__ */ __name(function script(id, configure) {
    if (typeof id !== "string" || !id) throw new Error("world.script: id must be a non-empty string");
    if (configure == null) return world;
    if (typeof configure === "object" && !Array.isArray(configure)) {
      const handlers = _sanitizeHandlers(configure);
      world.scripts.register(id, () => handlers);
      return world;
    }
    if (typeof configure !== "function") throw new Error("world.script: configure must be a function or object");
    world.scripts.register(id, (w, eid, args) => {
      const [helper, handlers, assertHandlersUsed] = _makeHelper(w, eid, args);
      const result = configure(helper, w, eid, args);
      if (result && typeof result === "object") Object.assign(handlers, _sanitizeHandlers(result));
      assertHandlersUsed();
      return _sanitizeHandlers(handlers);
    });
    return world;
  }, "script");
  world.addScript = /* @__PURE__ */ __name(function addScript(eid, scriptId, args = {}) {
    world.add(eid, ScriptRef, { id: String(scriptId), args: args || {} });
    return world;
  }, "addScript");
  world.removeScript = /* @__PURE__ */ __name(function removeScript(eid) {
    if (world.has(eid, ScriptRef)) world.remove(eid, ScriptRef);
    return world;
  }, "removeScript");
  if (typeof world.entity !== "function") {
    world.entity = /* @__PURE__ */ __name(function entityHandle(id) {
      if (!world.isAlive(id)) throw new Error("entity: id must be alive");
      return new ScriptEntityHandle(world, id);
    }, "entityHandle");
  }
  return world;
}
__name(installScriptsAPI, "installScriptsAPI");

// public/src/lib/ecs-js/rng.js
function mulberry322(seed) {
  let t = seed >>> 0;
  return function() {
    t += 1831565813;
    let r = Math.imul(t ^ t >>> 15, 1 | t);
    r ^= r + Math.imul(r ^ r >>> 7, r | 61);
    return ((r ^ r >>> 14) >>> 0) / 4294967296;
  };
}
__name(mulberry322, "mulberry32");

// public/src/lib/ecs-js/core.js
var globalConsole2 = typeof console !== "undefined" ? console : null;
var logError2 = globalConsole2 && typeof globalConsole2.error === "function" ? globalConsole2.error.bind(globalConsole2) : () => {
};
var EcsEvent = class _EcsEvent {
  static {
    __name(this, "EcsEvent");
  }
  constructor() {
    if (new.target === _EcsEvent) {
      throw new Error("EcsEvent is abstract");
    }
  }
  /**
   * Human-readable event name for debugging/logging.
   * Routing uses constructor identity, not this string.
   */
  static get eventName() {
    return this.name;
  }
};
function isEventClass(value) {
  return typeof value === "function" && (value === EcsEvent || value.prototype instanceof EcsEvent);
}
__name(isEventClass, "isEventClass");
function isEventInstance(value) {
  return value instanceof EcsEvent;
}
__name(isEventInstance, "isEventInstance");
function eventKey(ref) {
  if (typeof ref === "string" && ref.length > 0) return ref;
  if (isEventClass(ref) && ref !== EcsEvent) {
    return ref;
  }
  throw new Error("event key must be a non-empty string event name or concrete EcsEvent class");
}
__name(eventKey, "eventKey");
var WorldDebug = class {
  static {
    __name(this, "WorldDebug");
  }
  constructor(world) {
    this.world = world;
    this.enabled = !!world?._debug;
    this._history = /* @__PURE__ */ new Map();
  }
  enable(on = true) {
    this.enabled = !!on;
    return this;
  }
  inspect(id) {
    const world = this.world;
    const alive = world.isAlive(id);
    const components = {};
    const removed = [];
    const prev = this._history.get(id) || /* @__PURE__ */ new Map();
    const nextHistory = /* @__PURE__ */ new Map();
    for (const [ckey, Comp] of world._components) {
      const rec = world.get(id, Comp);
      if (rec != null) {
        const snapshot = deepClone(rec);
        const previous = prev.has(ckey) ? prev.get(ckey) : null;
        const diff = previous ? diffRecords(previous, snapshot) : null;
        nextHistory.set(ckey, snapshot);
        components[Comp.name] = {
          value: snapshot,
          changed: world.changed(id, Comp),
          previous,
          diff
        };
      } else if (prev.has(ckey)) {
        removed.push(Comp.name);
      }
    }
    if (nextHistory.size) this._history.set(id, nextHistory);
    else this._history.delete(id);
    return Object.freeze({ id, alive, components, removed });
  }
  forget(id) {
    this._history.delete(id);
    return this;
  }
  resources() {
    return this.world.resources();
  }
};
var $NOT = /* @__PURE__ */ Symbol("Not");
var $CHANGED = /* @__PURE__ */ Symbol("Changed");
var Changed = /* @__PURE__ */ __name((Comp) => ({ kind: $CHANGED, Comp }), "Changed");
function defineComponent(name, defaults, options = {}) {
  const key = Symbol(name);
  const shape = Object.freeze({ ...defaults ?? {} });
  const validate = typeof options.validate === "function" ? options.validate : void 0;
  return Object.freeze({ key, name, defaults: shape, validate });
}
__name(defineComponent, "defineComponent");
function defineTag(name) {
  const C = defineComponent(name, Object.freeze({}));
  return Object.freeze({ ...C, isTag: true });
}
__name(defineTag, "defineTag");
var World = class {
  static {
    __name(this, "World");
  }
  constructor(opts = {}) {
    this.scheduler = null;
    this.onTick = opts.onTick || null;
    this.seed = (opts.seed ?? Math.random() * 2 ** 32 | 0) >>> 0;
    this.rand = mulberry322(this.seed);
    this.storeMode = opts.store || "map";
    this._store = /* @__PURE__ */ new Map();
    this._cache = /* @__PURE__ */ new Map();
    this._changed = /* @__PURE__ */ new Map();
    this._components = /* @__PURE__ */ new Map();
    this._extensions = /* @__PURE__ */ new Map();
    this._resources = /* @__PURE__ */ new Map();
    this._resourceDefs = /* @__PURE__ */ new Map();
    this._cmd = [];
    this._free = [];
    this._nextId = 1;
    this.alive = /* @__PURE__ */ new Set();
    this._inTick = false;
    this.strict = !!opts.strict;
    this._debug = !!opts.debug;
    this._strictHandler = null;
    this.time = 0;
    this.step = 0;
    this.debug = new WorldDebug(this);
    this.debug.enable(this._debug);
  }
  static create(opts = {}) {
    return new WorldBuilder(opts);
  }
  /** Construct a new world from a snapshot and component registry.
   * Similar to deserialize helpers, but available from the core API.
   * @param {object} json - A v1 snapshot ({@link import('./serialization.js').Snapshot}).
   * @param {Map<string, Component>|Record<string, Component>} registry
   * @param {{ seed?: number, store?: string, skipUnknown?: boolean }} [opts]
   * @returns {World}
   */
  static fromSnapshot(json2, registry, opts = {}) {
    const { seed: seedOpt, store: storeOpt, skipUnknown, ...worldOpts } = opts || {};
    const store = storeOpt || json2?.meta?.store;
    const seed = seedOpt != null ? seedOpt >>> 0 : json2?.meta?.seed >>> 0;
    const world = new this({ ...worldOpts, seed, store });
    const reg = _registryToMap(registry, "fromSnapshot");
    for (const Comp of reg.values()) {
      if (Comp?.key && typeof Comp.name === "string") world._components.set(Comp.key, Comp);
    }
    world.load(json2, { skipUnknown: !!skipUnknown });
    return world;
  }
  /** Install/replace the scheduler. Must be (world, dt) => void.
   * @param {(world:World, dt:number)=>void} fn
   * @returns {this}
   */
  setScheduler(fn) {
    if (typeof fn !== "function") throw new Error("setScheduler: scheduler must be a function (world, dt) => void");
    this.scheduler = fn;
    return this;
  }
  /** System registration pass-through (core does not know phase semantics).
   * @param {(world:World, dt:number)=>void} fn
   * @param {string} [phase='default']
   * @param {{ before?:Function[], after?:Function[] }} [opts]
   * @returns {this}
   */
  system(fn, phase = "default", opts = {}) {
    try {
      registerSystem(fn, phase, opts);
    } catch (e) {
      logError2("[ecs] system registration failed", e);
    }
    return this;
  }
  /** Advance the world by a discrete dt using the installed scheduler.
   * Flushes deferred operations and clears change marks at the end of the tick.
   * @param {number} dt
   */
  tick(dt) {
    if (!this.scheduler) throw new Error("tick: no scheduler installed. Call world.setScheduler(...) first.");
    this.time += dt;
    this.step++;
    this._inTick = true;
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    try {
      this.scheduler(this, dt);
    } catch (e) {
      logError2("[ecs] scheduler error", e);
    }
    if (this._cmd.length) {
      const cmds = this._cmd;
      this._cmd = [];
      const prev = this._inTick;
      this._inTick = false;
      try {
        for (let i = 0; i < cmds.length; i++) this._applyOp(cmds[i]);
      } finally {
        this._inTick = prev;
      }
    }
    this._changed.clear();
    this._inTick = false;
    const took = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
    if (typeof this.onTick === "function") {
      try {
        this.onTick(took, this);
      } catch (e) {
        logError2("[ecs] onTick error", e);
      }
    }
  }
  /** ===== Entity lifecycle ===== */
  /** Create a new entity id and mark it alive.
   * @returns {number}
   */
  create() {
    const id = this._free.length ? this._free.pop() : this._nextId++;
    this.alive.add(id);
    return id;
  }
  /** Replace world state from a JSON snapshot, preserving original entity IDs
   * so that cross-entity references embedded in component payloads remain valid.
   * Builds a component registry automatically from previously seen components.
   * @param {object} json - A v1 snapshot ({@link import('./serialization.js').Snapshot}).
   * @param {{ skipUnknown?: boolean }} [opts]
   * @returns {World}
   */
  load(json2, opts = {}) {
    if (this._inTick) throw new Error("load: cannot be called during tick");
    if (!json2 || typeof json2 !== "object" || json2.v !== 1 || !json2.comps || typeof json2.comps !== "object")
      throw new Error("load: invalid snapshot format");
    const reg = /* @__PURE__ */ new Map();
    for (const Comp of this._components.values()) {
      if (Comp?.name) reg.set(Comp.name, Comp);
    }
    if (!opts.skipUnknown) {
      for (const name of Object.keys(json2.comps)) {
        if (!reg.has(name)) throw new Error(`load: unknown component '${name}'`);
      }
    }
    const resourceReg = resourceRegistryFromWorld(this);
    if (!opts.skipUnknown && json2.resources) {
      for (const name of Object.keys(json2.resources)) {
        if (!resourceReg.has(name)) throw new Error(`load: unknown resource '${name}'`);
      }
    }
    const _apply = /* @__PURE__ */ __name(() => {
      for (const id of Array.from(this.alive)) this.destroy(id);
      const sourceAlive = (json2.alive || _aliveFromComps(json2.comps)).slice().sort((a, b) => a - b);
      for (const id of sourceAlive) {
        if (!Number.isInteger(id) || id <= 0) throw new Error(`load: invalid entity id '${id}'`);
      }
      this._free.length = 0;
      const maxId = sourceAlive.length ? sourceAlive[sourceAlive.length - 1] : 0;
      this._nextId = maxId + 1;
      for (const id of sourceAlive) this.alive.add(id);
      for (const [name, rows] of Object.entries(json2.comps)) {
        const Comp = reg.get(name);
        if (!Comp) continue;
        for (const [id, payload] of rows) {
          if (!this.alive.has(id)) continue;
          this.add(id, Comp, payload);
        }
      }
      if (json2.meta && typeof json2.meta === "object") {
        if (Object.prototype.hasOwnProperty.call(json2.meta, "time")) {
          const t = Number(json2.meta.time);
          this.time = Number.isFinite(t) ? t : 0;
        }
        if (Object.prototype.hasOwnProperty.call(json2.meta, "frame")) {
          const f = Number(json2.meta.frame);
          this.frame = Number.isFinite(f) ? f | 0 : 0;
        }
      }
      applyResourceSnapshot(this, json2.resources, resourceReg, {
        context: "load",
        skipUnknown: !!opts.skipUnknown
      });
      return this;
    }, "_apply");
    return this.batch?.(() => _apply()) ?? _apply();
  }
  /** Destroy an entity immediately or defer if inside a tick.
   * @param {number} id
   * @returns {boolean|null}
   */
  destroy(id) {
    if (!this.alive.has(id)) return false;
    if (this._inTick) {
      if (this.strict) {
        const outcome = this._handleStrictDuringTick("destroy", [id], () => {
          this.command(["destroy", id]);
        });
        if (outcome) return null;
      } else {
        this.command(["destroy", id]);
        return null;
      }
    }
    for (const [k, store] of this._store) {
      if (store.delete(id)) this._markChanged(k, id);
    }
    this.alive.delete(id);
    this._free.push(id);
    this._invalidateCaches();
    return true;
  }
  /** Destroy an entity immediately, bypassing intratick deferral/strict checks.
   * Use sparingly for helper-local invariants and temporary entities.
   * @param {number} id
   * @returns {boolean}
   */
  destroyImmediate(id) {
    if (!this.alive.has(id)) return false;
    this._dropQueuedEntityOps(id);
    const prev = this._inTick;
    this._inTick = false;
    try {
      return this.destroy(id) === true;
    } finally {
      this._inTick = prev;
    }
  }
  /** Check if an entity id is currently alive.
   * @param {number} id
   * @returns {boolean}
   */
  isAlive(id) {
    return this.alive.has(id);
  }
  /** ===== Components ===== */
  _mapFor(Comp) {
    const k = Comp.key;
    if (!this._store.has(k)) {
      const store = this.storeMode === "soa" ? makeSoAStore(Comp) : makeMapStore();
      this._store.set(k, store);
    }
    if (!this._components.has(k)) this._components.set(k, Comp);
    return this._store.get(k);
  }
  _markChanged(ckey, id) {
    if (!this._changed.has(ckey)) this._changed.set(ckey, /* @__PURE__ */ new Set());
    this._changed.get(ckey).add(id);
  }
  _dropQueuedComponentOps(id, Comp) {
    if (!this._cmd.length) return 0;
    const key = Comp?.key;
    if (!key) return 0;
    let write = 0;
    let dropped = 0;
    for (let i = 0; i < this._cmd.length; i++) {
      const op = this._cmd[i];
      if (!Array.isArray(op)) {
        this._cmd[write++] = op;
        continue;
      }
      const kind = op[0];
      if (kind !== "add" && kind !== "remove" && kind !== "set" && kind !== "mutate") {
        this._cmd[write++] = op;
        continue;
      }
      if (op[1] !== id || op[2]?.key !== key) {
        this._cmd[write++] = op;
        continue;
      }
      dropped++;
    }
    if (dropped) this._cmd.length = write;
    return dropped;
  }
  _dropQueuedEntityOps(id) {
    if (!this._cmd.length) return 0;
    let write = 0;
    let dropped = 0;
    for (let i = 0; i < this._cmd.length; i++) {
      const op = this._cmd[i];
      if (!Array.isArray(op)) {
        this._cmd[write++] = op;
        continue;
      }
      const kind = op[0];
      if (kind !== "destroy" && kind !== "add" && kind !== "remove" && kind !== "set" && kind !== "mutate") {
        this._cmd[write++] = op;
        continue;
      }
      if (op[1] !== id) {
        this._cmd[write++] = op;
        continue;
      }
      dropped++;
    }
    if (dropped) this._cmd.length = write;
    return dropped;
  }
  /**
   * Add a component record to an entity (structural change).
   * Deep-clones defaults and provided data; validates if component has a validator.
   * Immediate even if called inside {@link World#tick}. To queue an add for the
   * post-scheduler flush, use {@link World#addDeferred}.
   * @param {number} id
   * @param {Component} Comp
   * @param {object} [data]
   * @returns {object} The stored record
   */
  add(id, Comp, data) {
    if (!this.alive.has(id)) throw new Error("add: entity not alive");
    this._dropQueuedComponentOps(id, Comp);
    const rec = Object.assign({}, deepClone(Comp.defaults), deepClone(data || {}));
    assertNoFunctions(rec, Comp.name, "");
    if (typeof Comp.validate === "function" && !Comp.validate(rec)) throw new Error(`Validation failed for component ${Comp.name}`);
    this._mapFor(Comp).set(id, rec);
    this._markChanged(Comp.key, id);
    this._invalidateCaches();
    return rec;
  }
  /** Queue a component add for the post-scheduler flush / next-tick readers.
   * Useful when you explicitly do not want later systems in the current tick to
   * observe the newly attached component.
   * @param {number} id
   * @param {Component} Comp
   * @param {object} [data]
   * @returns {this}
   */
  addDeferred(id, Comp, data) {
    if (!this.alive.has(id)) throw new Error("addDeferred: entity not alive");
    this.command(["add", id, Comp, data]);
    return this;
  }
  /** Get a component record or null if absent.
   * @param {number} id
   * @param {Component} Comp
   * @returns {object|null}
   */
  get(id, Comp) {
    return this._mapFor(Comp).get(id) || null;
  }
  /** Get the backing record instance if available (SoA may return a live view object).
   * @param {number} id
   * @param {Component} Comp
   * @returns {object|null}
   */
  getInstance(id, Comp) {
    const store = this._store.get(Comp.key);
    if (!store) return null;
    if (store.fast) return store.fast[id] || null;
    if (store.get) return store.get(id) || null;
    return null;
  }
  /** Test whether an entity has a component.
   * @param {number} id
   * @param {Component} Comp
   * @returns {boolean}
   */
  has(id, Comp) {
    return this._mapFor(Comp).has(id);
  }
  /** Remove a component from an entity (structural change). Deferred during tick unless strict.
   * @param {number} id
   * @param {Component} Comp
   * @returns {boolean|null}
   */
  remove(id, Comp) {
    if (this._inTick) {
      if (this.strict) {
        const outcome = this._handleStrictDuringTick("remove", [id, Comp], () => {
          this.command(["remove", id, Comp]);
        });
        if (outcome) return null;
      } else {
        this.command(["remove", id, Comp]);
        return null;
      }
    }
    const ok = this._mapFor(Comp).delete(id);
    if (ok) {
      this._markChanged(Comp.key, id);
      this._invalidateCaches();
    }
    return ok;
  }
  /** Remove a component immediately, bypassing intratick deferral/strict checks.
   * Use sparingly for helper-local invariants where synchronous absence matters.
   * @param {number} id
   * @param {Component} Comp
   * @returns {boolean}
   */
  removeImmediate(id, Comp) {
    this._dropQueuedComponentOps(id, Comp);
    const prev = this._inTick;
    this._inTick = false;
    try {
      return this.remove(id, Comp) === true;
    } finally {
      this._inTick = prev;
    }
  }
  /** Patch-assign fields on a component record (non-structural change). Validates before assignment.
   * Immediate during tick and visible to later phases in the same step.
   * @param {number} id
   * @param {Component} Comp
   * @param {object} patch
   * @returns {object}
   */
  set(id, Comp, patch) {
    const rec = this.get(id, Comp);
    if (!rec) throw new Error("set: entity lacks component");
    this._dropQueuedComponentOps(id, Comp);
    const next = Object.assign({}, rec, patch);
    assertNoFunctions(next, Comp.name, "");
    if (typeof Comp.validate === "function" && !Comp.validate(next)) throw new Error(`Validation failed for component ${Comp.name}`);
    Object.assign(rec, patch);
    this._markChanged(Comp.key, id);
    return rec;
  }
  /** Mutate a component record in place (non-structural change).
   * @param {number} id
   * @param {Component} Comp
   * @param {(rec:object)=>void} fn
   * @returns {object}
   */
  mutate(id, Comp, fn) {
    const rec = this.get(id, Comp);
    if (!rec) throw new Error("mutate: entity lacks component");
    this._dropQueuedComponentOps(id, Comp);
    fn(rec);
    assertNoFunctions(rec, Comp.name, "");
    this._markChanged(Comp.key, id);
    return rec;
  }
  /** ===== Queries ===== */
  _isOpts(o) {
    return o && typeof o === "object" && !("key" in o) && !("kind" in o);
  }
  /** Query entities by component presence/absence and change status.
   * Returns a lazy iterable of [id, ...components] tuples, augmented with run(fn) and count({cheap?:boolean}).
   * With options object, supports where/project/orderBy/offset/limit.
   * @param {...(Component|ReturnType<typeof Not>|ReturnType<typeof Changed>|object)} terms
   * @returns {Iterable & { run(fn:Function): World, count(opts?:{cheap?:boolean}): number }}
   */
  query(...terms) {
    let opts = null;
    if (terms.length && this._isOpts(terms[terms.length - 1])) opts = terms.pop();
    const spec = normalizeTerms(terms);
    return this._executeQuery(spec, opts);
  }
  defineQuery(...terms) {
    let opts = null;
    if (terms.length && this._isOpts(terms[terms.length - 1])) opts = terms.pop();
    const spec = normalizeTerms(terms);
    const baseOpts = opts ? { ...opts } : null;
    const mergeOpts = /* @__PURE__ */ __name((a, b) => {
      if (!a && !b) return null;
      const res = { ...a || {} };
      if (b) Object.assign(res, b);
      return res;
    }, "mergeOpts");
    const makeHandle = /* @__PURE__ */ __name((state) => {
      const snapshot = state ? { ...state } : null;
      const handle = /* @__PURE__ */ __name((runtime) => {
        const finalOpts = mergeOpts(snapshot, runtime);
        return this._executeQuery(spec, finalOpts);
      }, "handle");
      const chain = /* @__PURE__ */ __name((key, value) => {
        const nextState = Object.assign({}, snapshot || {});
        nextState[key] = value;
        return makeHandle(nextState);
      }, "chain");
      handle.where = (fn) => chain("where", fn);
      handle.project = (fn) => chain("project", fn);
      handle.orderBy = (fn) => chain("orderBy", fn);
      handle.offset = (n) => chain("offset", n);
      handle.limit = (n) => chain("limit", n);
      handle.options = () => snapshot ? { ...snapshot } : {};
      handle.spec = spec;
      handle.world = this;
      return handle;
    }, "makeHandle");
    return makeHandle(baseOpts);
  }
  /** Generator form of query yielding [id, ...components].
   * @param {...(Component|ReturnType<typeof Not>|ReturnType<typeof Changed>)} terms
   */
  *queryGen(...terms) {
    const spec = normalizeTerms(terms);
    const list = this._cachedEntityList(spec, spec.cacheKey);
    for (let i = 0; i < list.length; i++) {
      const id = list[i];
      if (!passesDynamicFilters(this, id, spec)) continue;
      yield [id, ...spec.all.map((c) => this.get(id, c))];
    }
  }
  _executeQuery(spec, opts) {
    const key = spec.cacheKey;
    const baseList = this._cachedEntityList(spec, key);
    if (!opts) {
      const tuples2 = this._tuplesFromList(baseList, spec);
      tuples2._world = this;
      tuples2.run = function(fn) {
        for (const row of tuples2) fn(...row);
        return this._world;
      };
      tuples2.count = function(o) {
        return o && o.cheap ? baseList.length : countFiltered(this._world, baseList, spec);
      };
      return tuples2;
    }
    const where = typeof opts.where === "function" ? opts.where : null;
    const project = typeof opts.project === "function" ? opts.project : null;
    let list = baseList;
    if (opts.orderBy) {
      const rows = [];
      for (let i = 0; i < list.length; i++) {
        const id = list[i];
        if (!passesDynamicFilters(this, id, spec)) continue;
        const comps = spec.all.map((c) => this.get(id, c));
        if (where && !where(...comps, id)) continue;
        rows.push({ id, comps });
      }
      rows.forEach((r) => r.p = project ? project(r.id, ...r.comps) : r);
      rows.sort((A, B) => opts.orderBy(A, B));
      list = rows.map((r) => r.id);
      let idx = 0, start2 = Math.max(0, ~~(opts.offset || 0));
      const lim2 = opts.limit == null ? Infinity : Math.max(0, ~~opts.limit);
      return {
        _world: this,
        [Symbol.iterator]() {
          let used = 0;
          return {
            next() {
              while (idx < rows.length && used < lim2) {
                const r = rows[idx++];
                if (start2-- > 0) continue;
                used++;
                const out = project ? project(r.id, ...r.comps) : [r.id, ...r.comps];
                return { value: out, done: false };
              }
              return { done: true };
            }
          };
        },
        run(fn) {
          for (const row of this) fn(row);
          return this._world;
        },
        count(o) {
          return o && o.cheap ? baseList.length : rows.length;
        }
      };
    }
    const start = Math.max(0, ~~(opts.offset || 0));
    const lim = opts.limit == null ? Infinity : Math.max(0, ~~opts.limit);
    const iter = function* () {
      let seen = 0, used = 0;
      for (let i = 0; i < list.length; i++) {
        const id = list[i];
        if (!passesDynamicFilters(this, id, spec)) continue;
        const comps = spec.all.map((c) => this.get(id, c));
        if (where && !where(...comps, id)) continue;
        if (seen++ < start) continue;
        if (used++ >= lim) break;
        yield project ? project(id, ...comps) : [id, ...comps];
      }
    }.bind(this);
    const tuples = { _world: this, [Symbol.iterator]: iter };
    tuples.run = function(fn) {
      for (const row of tuples) fn(row);
      return this._world;
    };
    tuples.count = (o) => o && o.cheap ? list.length : countFiltered(this, list, spec, where);
    return tuples;
  }
  _tuplesFromList(list, spec) {
    const iter = function* () {
      for (let i = 0; i < list.length; i++) {
        const id = list[i];
        if (!passesDynamicFilters(this, id, spec)) continue;
        yield [id, ...spec.all.map((c) => this.get(id, c))];
      }
    }.bind(this);
    return { [Symbol.iterator]: iter };
  }
  _cachedEntityList(spec, key) {
    if (this._cache.has(key)) return this._cache.get(key);
    let result = null;
    for (const c of spec.all) {
      const store = this._mapFor(c);
      const arr = store.entityIds();
      result = result ? intersectSorted(result, arr) : arr;
      if (!result.length) break;
    }
    if (spec.all.length === 0) result = Array.from(this.alive).sort((a, b) => a - b);
    this._cache.set(key, result);
    return result;
  }
  _invalidateCaches() {
    this._cache.clear();
  }
  /** ===== Events ===== */
  /** Subscribe to a string event or concrete EcsEvent class.
   * @param {string|typeof EcsEvent} event
   * @param {(payload:any, world:World)=>void} fn
   * @returns {()=>void} unsubscribe
   */
  on(event, fn) {
    if (typeof fn !== "function") throw new Error("on: listener must be a function");
    const key = eventKey(event);
    this._ev ||= /* @__PURE__ */ new Map();
    if (!this._ev.has(key)) this._ev.set(key, /* @__PURE__ */ new Set());
    this._ev.get(key).add(fn);
    return () => this.off(event, fn);
  }
  /** Unsubscribe a listener. @param {string|typeof EcsEvent} event @param {(payload:any)=>void} fn */
  off(event, fn) {
    const key = eventKey(event);
    const set = this._ev?.get(key);
    if (set) set.delete(fn);
  }
  /** Emit an event to listeners. @param {string|EcsEvent} event @param {any} payload @returns {number} count of listeners invoked */
  emit(event, payload) {
    if (isEventInstance(event)) {
      return this._emitByKey(event.constructor, event);
    }
    if (typeof event === "string") {
      if (event.length === 0) throw new Error("emit: expected non-empty string event name or EcsEvent instance");
      return this._emitByKey(event, payload);
    }
    throw new Error("emit: expected non-empty string event name or EcsEvent instance");
  }
  _emitByKey(key, payload) {
    const set = this._ev?.get(key);
    if (!set) return 0;
    let n = 0;
    for (const f of set) {
      try {
        f(payload, this);
        n++;
      } catch (e) {
        logError2("event error", e);
      }
    }
    return n;
  }
  /** ===== Deferral ===== */
  /** Queue a deferred operation or function to run outside of tick context. @param {any} opOrFn */
  command(opOrFn) {
    this._cmd.push(opOrFn);
    return this;
  }
  /** Return a snapshot of pending deferred operations. Useful for debugging. */
  pendingOps() {
    return this._cmd.slice();
  }
  /** Install a strict-mode handler invoked when structural mutations occur mid-tick in strict worlds.
   * Handler receives a context object ({ op, args, world, error, defer }).
   * Call ctx.defer() or return 'defer' to queue the operation despite strict mode.
   * Return 'ignore' (or false) to swallow the mutation. Throw to propagate custom errors.
   * @param {(ctx:{ op:string, args:readonly any[], world:World, error:Error, defer:()=>void })=>('defer'|'ignore'|false|void)} fn
   * @returns {this}
   */
  onStrictError(fn) {
    if (fn != null && typeof fn !== "function") throw new Error("onStrictError: handler must be a function or null");
    this._strictHandler = fn || null;
    return this;
  }
  _handleStrictDuringTick(op, args, fallback) {
    const error = new Error(`${op}: structural mutation during tick (strict)`);
    if (typeof this._strictHandler === "function") {
      let deferred = false;
      const ctx = {
        op,
        args: Object.freeze([...args]),
        world: this,
        error,
        defer: /* @__PURE__ */ __name(() => {
          if (!deferred && typeof fallback === "function") fallback();
          deferred = true;
        }, "defer")
      };
      try {
        const res = this._strictHandler(ctx);
        if (res === "defer" && !deferred) ctx.defer();
        if (deferred) return "defer";
        if (res === "ignore" || res === false) return "ignore";
      } catch (handlerErr) {
        logError2("[ecs] strict handler error", handlerErr);
      }
    }
    throw error;
  }
  _applyOp(op) {
    try {
      if (typeof op === "function") return op();
      const t = op[0];
      if (t === "destroy") return this.destroy(op[1]);
      if (t === "add") return this.add(op[1], op[2], op[3]);
      if (t === "remove") return this.remove(op[1], op[2]);
      if (t === "set") return this.set(op[1], op[2], op[3]);
      if (t === "mutate") return this.mutate(op[1], op[2], op[3]);
    } catch (e) {
      logError2("applyOp error", e);
    }
  }
  /** ===== Diagnostics ===== */
  /** Mark a component as changed (diagnostics/testing). @param {number} id @param {Component} Comp */
  markChanged(id, Comp) {
    this._markChanged(Comp.key, id);
  }
  /** Has the entity's component changed since last tick? @param {number} id @param {Component} Comp @returns {boolean} */
  changed(id, Comp) {
    const s = this._changed.get(Comp.key);
    return !!(s && s.has(id));
  }
  /** Enable or disable debug mode. @param {boolean} [on=true] @returns {this} */
  enableDebug(on = true) {
    this._debug = !!on;
    if (this.debug) this.debug.enable(this._debug);
    return this;
  }
};
installWorldResourceAPI(World, { logError: logError2 });
installWorldExtensionAPI(World, { logError: logError2 });
var WorldBuilder = class {
  static {
    __name(this, "WorldBuilder");
  }
  constructor(opts = {}) {
    this._opts = { ...opts || {} };
    this._systems = [];
    this._installers = [];
    this._schedulerSteps = [];
    this._customScheduler = null;
    this._requiredPhases = /* @__PURE__ */ new Set();
    this._strictHandlers = [];
  }
  useSoA() {
    this._opts.store = "soa";
    return this;
  }
  useMap() {
    this._opts.store = "map";
    return this;
  }
  withSeed(seed) {
    this._opts.seed = seed >>> 0;
    return this;
  }
  enableStrict(on = true) {
    this._opts.strict = !!on;
    return this;
  }
  enableDebug(on = true) {
    this._opts.debug = !!on;
    return this;
  }
  withOptions(opts = {}) {
    Object.assign(this._opts, opts || {});
    return this;
  }
  withScheduler(...steps) {
    this._customScheduler = null;
    this._schedulerSteps = steps.flat().filter(Boolean);
    return this;
  }
  withSchedulerFn(fn) {
    if (typeof fn !== "function") throw new Error("withSchedulerFn: scheduler must be a function");
    this._customScheduler = fn;
    return this;
  }
  withPhases(...phases) {
    phases.flat().forEach((ph) => {
      if (typeof ph === "string" && ph) this._requiredPhases.add(ph);
    });
    return this;
  }
  system(fn, phase = "default", opts = {}) {
    this._systems.push({ fn, phase, opts });
    return this;
  }
  install(installer) {
    if (!isExtensionLike(installer)) throw new Error("install: extension must be a function or extension object");
    this._installers.push(installer);
    return this;
  }
  onStrictError(fn) {
    this._strictHandlers.push(fn);
    return this;
  }
  useScripts(options = {}) {
    const scriptOptions = { ...options || {} };
    const phase = scriptOptions.phase || PHASE_SCRIPTS;
    this._installers.push(defineExtension(`scripts:${phase}`, (world) => installScriptsAPI(world, scriptOptions), {
      key: /* @__PURE__ */ Symbol.for(`ecs-js:scripts:${String(phase)}`)
    }));
    if (scriptOptions.autoPhase !== false) {
      this.withPhases(phase);
    }
    return this;
  }
  build() {
    const world = new World(this._opts);
    for (const fn of this._strictHandlers) world.onStrictError(fn);
    for (const { fn, phase, opts } of this._systems) world.system(fn, phase, opts);
    if (this._customScheduler) {
      world.setScheduler(this._customScheduler);
    } else {
      const steps = [...this._schedulerSteps];
      this._requiredPhases.forEach((ph) => {
        if (!steps.includes(ph)) steps.push(ph);
      });
      if (steps.length) world.setScheduler(composeScheduler(...steps));
    }
    for (const inst of this._installers) world.install(inst);
    return world;
  }
};
function normalizeTerms(terms) {
  const all = [], none = [], changed = [];
  for (const t of terms) {
    if (!t) continue;
    if (t.kind === $NOT) none.push(t.Comp);
    else if (t.kind === $CHANGED) changed.push(t.Comp);
    else all.push(t);
  }
  const cacheKey = all.map((c) => c.key.description || "c").sort().join("|") || "*";
  return { all, none, changed, cacheKey };
}
__name(normalizeTerms, "normalizeTerms");
function passesDynamicFilters(world, id, spec) {
  for (const c of spec.none) if (world.has(id, c)) return false;
  for (const c of spec.changed) if (!world.changed(id, c)) return false;
  return true;
}
__name(passesDynamicFilters, "passesDynamicFilters");
function countFiltered(world, list, spec, where = null) {
  let c = 0;
  for (let i = 0; i < list.length; i++) {
    const id = list[i];
    if (!passesDynamicFilters(world, id, spec)) continue;
    if (where) {
      const comps = spec.all.map((k) => world.get(id, k));
      if (!where(...comps, id)) continue;
    }
    c++;
  }
  return c;
}
__name(countFiltered, "countFiltered");
function makeMapStore() {
  const map = /* @__PURE__ */ new Map();
  const fast = /* @__PURE__ */ Object.create(null);
  return {
    set(id, rec) {
      map.set(id, rec);
      fast[id] = rec;
    },
    get(id) {
      return map.get(id);
    },
    has(id) {
      return map.has(id);
    },
    delete(id) {
      const ok = map.delete(id);
      delete fast[id];
      return ok;
    },
    entityIds() {
      const arr = Array.from(map.keys());
      arr.sort((a, b) => a - b);
      return arr;
    },
    fast
  };
}
__name(makeMapStore, "makeMapStore");
function makeSoAStore(Comp) {
  const fields = Object.keys(Comp.defaults || {});
  const arrays = Object.fromEntries(fields.map((f) => [f, []]));
  const present = /* @__PURE__ */ new Set();
  const views = /* @__PURE__ */ new Map();
  function view(id) {
    if (views.has(id)) return views.get(id);
    const obj = {};
    for (const f of fields) {
      Object.defineProperty(obj, f, {
        enumerable: true,
        get() {
          return arrays[f][id] ?? Comp.defaults[f];
        },
        set(v) {
          arrays[f][id] = v;
        }
      });
    }
    views.set(id, obj);
    return obj;
  }
  __name(view, "view");
  const fast = void 0;
  return {
    set(id, rec) {
      present.add(id);
      for (const f of fields) arrays[f][id] = rec[f] ?? Comp.defaults[f];
    },
    get(id) {
      return present.has(id) ? view(id) : void 0;
    },
    has(id) {
      return present.has(id);
    },
    delete(id) {
      const had = present.delete(id);
      views.delete(id);
      return had;
    },
    entityIds() {
      const arr = Array.from(present.values());
      arr.sort((a, b) => a - b);
      return arr;
    },
    fast
  };
}
__name(makeSoAStore, "makeSoAStore");
function assertNoFunctions(obj, compName, path) {
  if (typeof obj === "function") {
    throw new TypeError(
      `Component "${compName}": function values are not allowed in component data (at "${path || "root"}")`
    );
  }
  if (obj !== null && typeof obj === "object" && !ArrayBuffer.isView(obj)) {
    const keys = Array.isArray(obj) ? obj.keys() : Object.keys(obj);
    for (const k of keys) assertNoFunctions(obj[k], compName, path ? `${path}.${k}` : String(k));
  }
}
__name(assertNoFunctions, "assertNoFunctions");
function deepClone(v) {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(v);
    } catch {
    }
  }
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(deepClone);
  const proto = Object.getPrototypeOf(v);
  const isPlain = proto === Object.prototype || proto === null;
  if (!isPlain) return v;
  const out = {};
  for (const k of Object.keys(v)) out[k] = deepClone(v[k]);
  return out;
}
__name(deepClone, "deepClone");
function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  if (a && b && typeof a === "object") {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    const seen = /* @__PURE__ */ new Set([...keysA, ...keysB]);
    for (const key of seen) {
      if (!Object.prototype.hasOwnProperty.call(a, key) || !Object.prototype.hasOwnProperty.call(b, key)) return false;
      if (!deepEqual(a[key], b[key])) return false;
    }
    return true;
  }
  return false;
}
__name(deepEqual, "deepEqual");
function diffRecords(prev = {}, next = {}) {
  const added = {};
  const removed = {};
  const changed = {};
  const keys = /* @__PURE__ */ new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const key of keys) {
    const inPrev = Object.prototype.hasOwnProperty.call(prev, key);
    const inNext = Object.prototype.hasOwnProperty.call(next, key);
    if (!inPrev && inNext) {
      added[key] = next[key];
    } else if (inPrev && !inNext) {
      removed[key] = prev[key];
    } else if (inPrev && inNext && !deepEqual(prev[key], next[key])) {
      changed[key] = { before: prev[key], after: next[key] };
    }
  }
  const result = {};
  if (Object.keys(added).length) result.added = added;
  if (Object.keys(removed).length) result.removed = removed;
  if (Object.keys(changed).length) result.changed = changed;
  return Object.keys(result).length ? result : null;
}
__name(diffRecords, "diffRecords");
function _aliveFromComps(comps) {
  const s = /* @__PURE__ */ new Set();
  for (const rows of Object.values(comps || {})) for (const [id] of rows) s.add(id);
  return Array.from(s);
}
__name(_aliveFromComps, "_aliveFromComps");
function _registryToMap(registry, context = "registry") {
  if (!registry) throw new Error(`${context}: registry required`);
  if (registry instanceof Map) return registry;
  const map = /* @__PURE__ */ new Map();
  for (const [name, Comp] of Object.entries(registry)) map.set(name, Comp);
  return map;
}
__name(_registryToMap, "_registryToMap");
function intersectSorted(a, b) {
  let i = 0, j = 0;
  const out = [];
  while (i < a.length && j < b.length) {
    const A = a[i], B = b[j];
    if (A === B) {
      out.push(A);
      i++;
      j++;
    } else if (A < B) i++;
    else j++;
  }
  return out;
}
__name(intersectSorted, "intersectSorted");

// public/src/lib/ecs-js/hierarchy.js
var KEY = Object.freeze({ Parent: /* @__PURE__ */ Symbol("Parent"), Sibling: /* @__PURE__ */ Symbol("Sibling") });
var Parent = { key: KEY.Parent, name: "Parent", defaults: Object.freeze({ first: 0, last: 0, count: 0 }) };
var Sibling = { key: KEY.Sibling, name: "Sibling", defaults: Object.freeze({ parent: 0, prev: 0, next: 0, index: 0 }) };

// public/src/lib/ecs-js/scriptsPhasesExtra.js
var ScriptPhase = defineComponent("ScriptPhase", { tick: "scripts" }, {
  validate(rec) {
    return typeof rec?.tick === "string" && rec.tick.length > 0;
  }
});

// public/src/lib/ecs-js/adapters/raf-adapters.js
var DEFAULT_MAX_DT = 1 / 15;

// public/src/rules/components/Position.js
var Position = defineComponent("Position", { x: 0, y: 0 });

// public/src/rules/components/Velocity.js
var Velocity = defineComponent("Velocity", { vx: 0, vy: 0 });

// public/src/rules/components/Facing.js
var Facing = defineComponent("Facing", { angle: 0 });

// public/src/rules/components/Collider.js
var Collider = defineComponent("Collider", { radius: 14 }, {
  validate(rec) {
    if (typeof rec.radius !== "number" || rec.radius <= 0)
      throw new Error("Collider.radius must be a positive number");
    return true;
  }
});

// public/src/rules/components/Health.js
var Health = defineComponent("Health", {
  hp: 100,
  maxHp: 100,
  shield: 0,
  maxShield: 0
});

// public/src/rules/components/Speed.js
var Speed = defineComponent("Speed", { max: 200 });

// public/src/rules/components/Input.js
var Input = defineComponent("Input", {
  moveX: 0,
  // left-stick X  [-1, 1]
  moveY: 0,
  // left-stick Y  [-1, 1]
  aimX: 0,
  // right-stick X [-1, 1]
  aimY: 0,
  // right-stick Y [-1, 1]
  fire: false
  // trigger held
});

// public/src/rules/components/Actor.js
var ActorKind = Object.freeze({
  PLAYER: "player",
  MOB: "mob",
  NPC: "npc"
});
var Actor = defineComponent("Actor", {
  kind: ActorKind.PLAYER,
  name: "",
  glyph: "@"
});

// public/src/rules/components/FOV.js
var FOV = defineComponent("FOV", {
  distance: 220,
  angle: 1.4
  // radians (~80°)
});

// public/src/rules/components/Lifetime.js
var Lifetime = defineComponent("Lifetime", { ttl: 1 });

// public/src/rules/components/Projectile.js
var Projectile = defineComponent("Projectile", {
  damage: 10,
  owner: null,
  // entity ID of shooter (for friendly-fire checks)
  team: "neutral",
  // stable faction even if the owner dies first
  speed: 400,
  piercing: false,
  trailColor: "#8cd8ff",
  burstColor: "#b0e0ff"
});

// public/src/rules/components/Knockback.js
var Knockback = defineComponent("Knockback", {
  dx: 0,
  dy: 0,
  decay: 8
  // how fast it fades (units/s²)
});

// public/src/rules/components/Cooldown.js
var Cooldown = defineComponent("Cooldown", {
  primary: 0,
  secondary: 0,
  dash: 0
});

// public/src/rules/components/Spawn.js
var Spawn = defineComponent("Spawn", {
  team: 0,
  index: 0
});

// public/src/rules/components/PointLight.js
var PointLight = defineComponent("PointLight", {
  radius: 350,
  r: 255,
  g: 190,
  b: 120,
  enabled: true
});

// public/src/rules/components/AI.js
var AIBehavior = Object.freeze({
  CASTER: "caster",
  MELEE: "melee"
});
var AI = defineComponent("AI", {
  behavior: AIBehavior.CASTER,
  target: null,
  // entity ID to track
  preferredDist: 140,
  // ideal distance from target
  castCooldown: 0,
  // time until next cast
  castRate: 1.2,
  // seconds between casts
  projSpeed: 250,
  aggroRange: 300,
  sight: true
  // has LOS to target this frame
});

// public/src/rules/components/Inventory.js
var Inventory = defineComponent("Inventory", {
  capacity: 10
});

// public/src/rules/components/ItemInfo.js
var ItemSlot = Object.freeze({
  NONE: "none",
  HAND: "hand",
  OFFHAND: "offhand"
});
var ItemInfo = defineComponent("ItemInfo", {
  name: "",
  glyph: "?",
  slot: ItemSlot.NONE,
  count: 1
});

// public/src/rules/components/PlayerTag.js
var PlayerTag = defineTag("PlayerTag");

// public/src/rules/components/Spellbook.js
var SpellId = Object.freeze({
  FROST_BOLT: "frost_bolt",
  LIGHTNING: "lightning"
});
var Spellbook = defineComponent("Spellbook", {
  spells: [],
  // array of SpellId values
  activeIndex: 0,
  // currently selected spell
  cooldown: 0
  // shared cooldown timer
});

// public/src/rules/components/Consumable.js
var Consumable = defineComponent("Consumable", {
  effect: "heal",
  // 'heal', 'mana', etc.
  potency: 30
  // amount
});

// public/src/rules/components/GroundItem.js
var GroundItem = defineTag("GroundItem");

// public/src/rules/components/MeleeWeapon.js
var MeleeWeapon = defineComponent("MeleeWeapon", {
  damage: 5,
  name: "Fists",
  glyph: "\u270A"
  // ✊
});

// public/src/rules/data/lootTable.js
var Rarity = Object.freeze({
  COMMON: "common",
  UNCOMMON: "uncommon",
  RARE: "rare",
  EPIC: "epic",
  LEGENDARY: "legendary"
});
var rarityColors = {
  [Rarity.COMMON]: { r: 160, g: 160, b: 160 },
  [Rarity.UNCOMMON]: { r: 100, g: 220, b: 100 },
  [Rarity.RARE]: { r: 80, g: 140, b: 255 },
  [Rarity.EPIC]: { r: 200, g: 80, b: 255 },
  [Rarity.LEGENDARY]: { r: 255, g: 200, b: 50 }
};
var rarityTextColors = {
  [Rarity.COMMON]: "#aaaaaa",
  [Rarity.UNCOMMON]: "#44dd44",
  [Rarity.RARE]: "#5588ff",
  [Rarity.EPIC]: "#cc55ff",
  [Rarity.LEGENDARY]: "#ffcc00"
};
var mobDropTable = [
  { weight: 25, type: "nothing" },
  { weight: 10, type: "bow", rarity: Rarity.COMMON },
  { weight: 12, type: "sword", tier: 0, rarity: Rarity.COMMON },
  { weight: 10, type: "sword", tier: 1, rarity: Rarity.UNCOMMON },
  { weight: 7, type: "sword", tier: 2, rarity: Rarity.RARE },
  { weight: 8, type: "arrows", count: 5 },
  { weight: 8, type: "epic_chest", rarity: Rarity.EPIC },
  { weight: 5, type: "epic_sword", rarity: Rarity.EPIC },
  { weight: 4, type: "epic_bow", rarity: Rarity.EPIC },
  { weight: 2, type: "legendary_sword", rarity: Rarity.LEGENDARY },
  { weight: 1, type: "legendary_bow", rarity: Rarity.LEGENDARY }
];
var mobDropTotalWeight = mobDropTable.reduce((s, e) => s + e.weight, 0);
var epicChestTable = [
  { weight: 25, type: "epic_sword", rarity: Rarity.EPIC },
  { weight: 20, type: "epic_bow", rarity: Rarity.EPIC },
  { weight: 20, type: "sword", tier: 2, rarity: Rarity.RARE },
  { weight: 15, type: "arrows", count: 10 },
  { weight: 10, type: "potion", potency: 50 },
  { weight: 5, type: "legendary_sword", rarity: Rarity.LEGENDARY },
  { weight: 5, type: "legendary_bow", rarity: Rarity.LEGENDARY }
];
var epicChestTotalWeight = epicChestTable.reduce((s, e) => s + e.weight, 0);
function rollTable(table, totalWeight, random) {
  if (typeof random !== "function") throw new Error("rollTable requires an authoritative RNG");
  let roll = random() * totalWeight;
  for (const entry of table) {
    roll -= entry.weight;
    if (roll <= 0) return entry;
  }
  return table[table.length - 1];
}
__name(rollTable, "rollTable");

// public/src/rules/geometry/carve.js
function createGridCarver(grid) {
  const { moveGrid, cols, rows, cellSize } = grid;
  return /* @__PURE__ */ __name(function carveGrid(wx, wy, radius) {
    const clearance = 40;
    const invCell = 1 / cellSize;
    const gx0 = Math.max(0, Math.floor((wx - radius) * invCell));
    const gy0 = Math.max(0, Math.floor((wy - radius) * invCell));
    const gx1 = Math.min(cols - 1, Math.ceil((wx + radius) * invCell));
    const gy1 = Math.min(rows - 1, Math.ceil((wy + radius) * invCell));
    const radiusSquared = radius * radius;
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const dx = gx * cellSize - wx;
        const dy = gy * cellSize - wy;
        if (dx * dx + dy * dy <= radiusSquared) moveGrid[gy * cols + gx] = clearance;
      }
    }
  }, "carveGrid");
}
__name(createGridCarver, "createGridCarver");

// public/src/rules/spawner.js
function findOpenNear(grid, x, y, searchRadius = 200) {
  for (let r = 0; r < searchRadius; r += 8) {
    for (let a = 0; a < Math.PI * 2; a += 0.4) {
      const tx = x + Math.cos(a) * r, ty = y + Math.sin(a) * r;
      if (grid.distanceMove(tx, ty) >= 20) return { x: tx, y: ty };
    }
  }
  return { x, y };
}
__name(findOpenNear, "findOpenNear");
function spawnPlayer(world, x, y) {
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, Velocity, { vx: 0, vy: 0 });
  world.add(id, Facing, { angle: 0 });
  world.add(id, Collider, { radius: 14 });
  world.add(id, Speed, { max: 200 });
  world.add(id, Input);
  world.add(id, Actor, { kind: ActorKind.PLAYER, name: "Player", glyph: "@" });
  world.add(id, Health, { hp: 100, maxHp: 100 });
  world.add(id, FOV, { distance: 220, angle: 1.4 });
  world.add(id, PointLight, { radius: 350, r: 255, g: 190, b: 120 });
  world.add(id, Inventory, { items: [], capacity: 10 });
  world.add(id, MeleeWeapon, { damage: 5, name: "Fists", glyph: "\u270A" });
  world.add(id, Spellbook, {
    spells: [SpellId.FROST_BOLT, SpellId.LIGHTNING],
    activeIndex: 0,
    cooldown: 0
  });
  return id;
}
__name(spawnPlayer, "spawnPlayer");
function spawnCaster(world, grid, nearX, nearY, targetId) {
  const pos = findOpenNear(grid, nearX, nearY, 400);
  const id = world.create();
  world.add(id, Position, { x: pos.x, y: pos.y });
  world.add(id, Velocity, { vx: 0, vy: 0 });
  world.add(id, Facing, { angle: 0 });
  world.add(id, Collider, { radius: 12 });
  world.add(id, Speed, { max: 80 });
  world.add(id, Actor, { kind: ActorKind.MOB, name: "Wraith", glyph: "W" });
  world.add(id, Health, { hp: 60, maxHp: 60 });
  world.add(id, AI, {
    behavior: AIBehavior.CASTER,
    target: targetId,
    preferredDist: 140,
    castRate: 1.5,
    projSpeed: 220,
    aggroRange: 300
  });
  world.add(id, MeleeWeapon, { damage: 10, name: "Claws", glyph: "\u{1F43E}" });
  return id;
}
__name(spawnCaster, "spawnCaster");
function spawnPotion(world, x, y, potency = 30) {
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, ItemInfo, { name: "Health Potion", glyph: "!", slot: "none", count: 1 });
  world.add(id, Consumable, { effect: "heal", potency });
  world.add(id, GroundItem);
  world.add(id, Collider, { radius: 10 });
  world.add(id, PointLight, { radius: 60, r: 255, g: 50, b: 80 });
  return id;
}
__name(spawnPotion, "spawnPotion");
function spawnBow(world, x, y) {
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, ItemInfo, { name: "Short Bow", glyph: ")", slot: "hand", count: 1 });
  world.add(id, Consumable, { effect: "add_spell", potency: 0 });
  world.add(id, GroundItem);
  world.add(id, Collider, { radius: 10 });
  world.add(id, PointLight, { radius: 50, r: 200, g: 180, b: 100 });
  return id;
}
__name(spawnBow, "spawnBow");
function spawnSword(world, x, y, tier = 1) {
  const swords = [
    { name: "Rusty Sword", glyph: "/", damage: 12, r: 160, g: 160, b: 160 },
    { name: "Steel Blade", glyph: "/", damage: 20, r: 200, g: 220, b: 255 },
    { name: "Flame Brand", glyph: "/", damage: 28, r: 255, g: 140, b: 60 }
  ];
  const s = swords[Math.min(tier, swords.length - 1)];
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, ItemInfo, { name: s.name, glyph: s.glyph, slot: "hand", count: 1 });
  world.add(id, Consumable, { effect: "melee_upgrade", potency: s.damage });
  world.add(id, GroundItem);
  world.add(id, Collider, { radius: 10 });
  world.add(id, PointLight, { radius: 55, r: s.r, g: s.g, b: s.b });
  return id;
}
__name(spawnSword, "spawnSword");
function spawnEpicSword(world, x, y) {
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, ItemInfo, { name: "Void Reaver", glyph: "\u2020", slot: "hand", count: 1 });
  world.add(id, Consumable, { effect: "melee_upgrade", potency: 42 });
  world.add(id, GroundItem);
  world.add(id, Collider, { radius: 10 });
  world.add(id, PointLight, { radius: 80, r: 200, g: 80, b: 255 });
  return id;
}
__name(spawnEpicSword, "spawnEpicSword");
function spawnEpicBow(world, x, y) {
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, ItemInfo, { name: "Shadow Longbow", glyph: "}", slot: "hand", count: 1 });
  world.add(id, Consumable, { effect: "add_spell", potency: 0 });
  world.add(id, GroundItem);
  world.add(id, Collider, { radius: 10 });
  world.add(id, PointLight, { radius: 70, r: 160, g: 60, b: 255 });
  return id;
}
__name(spawnEpicBow, "spawnEpicBow");
function spawnArrows(world, x, y, count = 5) {
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, ItemInfo, { name: `Arrows (${count})`, glyph: "\u2191", slot: "none", count });
  world.add(id, Consumable, { effect: "heal", potency: 5 });
  world.add(id, GroundItem);
  world.add(id, Collider, { radius: 10 });
  world.add(id, PointLight, { radius: 35, r: 200, g: 180, b: 100 });
  return id;
}
__name(spawnArrows, "spawnArrows");
function spawnEpicChest(world, x, y) {
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, ItemInfo, { name: "Epic Chest", glyph: "\u2302", slot: "none", count: 1 });
  world.add(id, Consumable, { effect: "epic_chest", potency: 0 });
  world.add(id, GroundItem);
  world.add(id, Collider, { radius: 12 });
  world.add(id, PointLight, { radius: 100, r: 200, g: 80, b: 255 });
  return id;
}
__name(spawnEpicChest, "spawnEpicChest");
function spawnLegendarySword(world, x, y) {
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, ItemInfo, { name: "Godslayer", glyph: "\u2694", slot: "hand", count: 1 });
  world.add(id, Consumable, { effect: "melee_upgrade", potency: 60 });
  world.add(id, GroundItem);
  world.add(id, Collider, { radius: 10 });
  world.add(id, PointLight, { radius: 120, r: 255, g: 200, b: 50 });
  return id;
}
__name(spawnLegendarySword, "spawnLegendarySword");
function spawnLegendaryBow(world, x, y) {
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, ItemInfo, { name: "Sunfire Longbow", glyph: "}", slot: "hand", count: 1 });
  world.add(id, Consumable, { effect: "add_spell", potency: 0 });
  world.add(id, GroundItem);
  world.add(id, Collider, { radius: 10 });
  world.add(id, PointLight, { radius: 110, r: 255, g: 200, b: 50 });
  return id;
}
__name(spawnLegendaryBow, "spawnLegendaryBow");

// public/src/rules/geometry/sweep.js
function sweepMaxFree(kernel, ax, ay, bx, by, r) {
  const L = Math.hypot(bx - ax, by - ay);
  if (L === 0) return 1;
  const sx = (bx - ax) / L;
  const sy = (by - ay) / L;
  if (!sampleCollides(1)) return 1;
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (sampleCollides(mid)) hi = mid;
    else lo = mid;
  }
  return lo;
  function sampleCollides(t) {
    const steps = Math.max(6, Math.ceil(L * t / Math.max(1, r * 0.5)));
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const x = ax + sx * L * t * u;
      const y = ay + sy * L * t * u;
      if (kernel.distanceMove(x, y) + 1e-3 < r) return true;
    }
    return false;
  }
  __name(sampleCollides, "sampleCollides");
}
__name(sweepMaxFree, "sweepMaxFree");
function moveWithSlide(kernel, x, y, dx, dy, radius) {
  if (Math.abs(dx) < 1e-3 && Math.abs(dy) < 1e-3) return { x, y };
  const t = sweepMaxFree(kernel, x, y, x + dx, y + dy, radius);
  if (t >= 0.999) return { x: x + dx, y: y + dy };
  let nx = x, ny = y;
  if (Math.abs(dx) > 1e-3) {
    const tx = sweepMaxFree(kernel, x, y, x + dx, y, radius);
    nx = x + dx * tx;
  }
  if (Math.abs(dy) > 1e-3) {
    const ty = sweepMaxFree(kernel, nx, y, nx, y + dy, radius);
    ny = y + dy * ty;
  }
  return { x: nx, y: ny };
}
__name(moveWithSlide, "moveWithSlide");

// public/src/rules/ai/pathfind.js
function astar(grid, sx, sy, gx, gy, radius, maxSteps = 600) {
  const { moveGrid, cols, rows, cellSize } = grid;
  const invCell = 1 / cellSize;
  const startX = sx * invCell | 0;
  const startY = sy * invCell | 0;
  const goalX = gx * invCell | 0;
  const goalY = gy * invCell | 0;
  if (startX === goalX && startY === goalY) return [];
  const idx = /* @__PURE__ */ __name((x, y) => y * cols + x, "idx");
  function passable(gx2, gy2) {
    if (gx2 < 0 || gy2 < 0 || gx2 >= cols || gy2 >= rows) return false;
    return moveGrid[gy2 * cols + gx2] > radius;
  }
  __name(passable, "passable");
  if (!passable(goalX, goalY)) return null;
  const gCost = new Float32Array(cols * rows);
  gCost.fill(Infinity);
  const cameFrom = new Int32Array(cols * rows);
  cameFrom.fill(-1);
  const SQRT2 = 1.414;
  const open = [];
  const inOpen = new Uint8Array(cols * rows);
  function heuristic(x, y) {
    const dx = Math.abs(x - goalX), dy = Math.abs(y - goalY);
    return dx + dy - 0.586 * Math.min(dx, dy);
  }
  __name(heuristic, "heuristic");
  gCost[idx(startX, startY)] = 0;
  open.push({ x: startX, y: startY, f: heuristic(startX, startY) });
  inOpen[idx(startX, startY)] = 1;
  const DX = [-1, 0, 1, -1, 1, -1, 0, 1];
  const DY = [-1, -1, -1, 0, 0, 1, 1, 1];
  const DC = [SQRT2, 1, SQRT2, 1, 1, SQRT2, 1, SQRT2];
  let steps = 0;
  while (open.length > 0 && steps++ < maxSteps) {
    let bestI = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[bestI].f) bestI = i;
    }
    const cur = open[bestI];
    open[bestI] = open[open.length - 1];
    open.pop();
    const ci = idx(cur.x, cur.y);
    inOpen[ci] = 0;
    if (cur.x === goalX && cur.y === goalY) {
      const path = [];
      let pi = ci;
      while (pi !== idx(startX, startY) && pi !== -1) {
        const py = pi / cols | 0;
        const px = pi - py * cols;
        path.push({ x: px * cellSize + cellSize * 0.5, y: py * cellSize + cellSize * 0.5 });
        pi = cameFrom[pi];
      }
      path.reverse();
      return path;
    }
    const curG = gCost[ci];
    for (let d = 0; d < 8; d++) {
      const nx = cur.x + DX[d], ny = cur.y + DY[d];
      if (!passable(nx, ny)) continue;
      if (DC[d] > 1) {
        if (!passable(cur.x + DX[d], cur.y) || !passable(cur.x, cur.y + DY[d])) continue;
      }
      const ni = idx(nx, ny);
      const ng = curG + DC[d];
      if (ng < gCost[ni]) {
        gCost[ni] = ng;
        cameFrom[ni] = ci;
        if (!inOpen[ni]) {
          open.push({ x: nx, y: ny, f: ng + heuristic(nx, ny) });
          inOpen[ni] = 1;
        }
      }
    }
  }
  return null;
}
__name(astar, "astar");

// public/src/rules/systems/aiSystem.js
var PATH_REFRESH = 0.5;
function hasLOS(grid, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const dist = Math.hypot(dx, dy);
  const steps = Math.ceil(dist / (grid.cellSize * 2));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (grid.distanceMove(ax + dx * t, ay + dy * t) < 6) return false;
  }
  return true;
}
__name(hasLOS, "hasLOS");
function createAISystem(ctx) {
  const { grid } = ctx;
  const aiPaths = /* @__PURE__ */ new Map();
  return /* @__PURE__ */ __name(function aiSystem(world, dt) {
    for (const id of aiPaths.keys()) if (!world.alive.has(id)) aiPaths.delete(id);
    for (const [id, pos, vel, spd, fac, ai, col] of world.query(Position, Velocity, Speed, Facing, AI, Collider)) {
      if (ai.target === null) continue;
      if (!world.alive.has(ai.target)) {
        ai.target = null;
        continue;
      }
      const tpos = world.get(ai.target, Position);
      const dx = tpos.x - pos.x, dy = tpos.y - pos.y;
      const dist = Math.hypot(dx, dy);
      ai.sight = dist < ai.aggroRange && hasLOS(grid, pos.x, pos.y, tpos.x, tpos.y);
      if (ai.sight) {
        aiPaths.delete(id);
        const tooClose = dist < ai.preferredDist * 0.7;
        const tooFar = dist > ai.preferredDist * 1.3;
        if (tooClose) {
          vel.vx = -(dx / dist) * spd.max;
          vel.vy = -(dy / dist) * spd.max;
        } else if (tooFar) {
          vel.vx = dx / dist * spd.max * 0.6;
          vel.vy = dy / dist * spd.max * 0.6;
        } else {
          vel.vx = -(dy / dist) * spd.max * 0.4;
          vel.vy = dx / dist * spd.max * 0.4;
        }
        fac.angle = Math.atan2(dy, dx);
        ai.castCooldown -= dt;
        if (ai.castCooldown <= 0) {
          ai.castCooldown = ai.castRate;
          const angle = Math.atan2(dy, dx);
          const boltId = world.create();
          world.add(boltId, Position, { x: pos.x + Math.cos(angle) * 18, y: pos.y + Math.sin(angle) * 18 });
          world.add(boltId, Velocity, { vx: Math.cos(angle) * ai.projSpeed, vy: Math.sin(angle) * ai.projSpeed });
          world.add(boltId, Projectile, {
            damage: 12,
            owner: id,
            team: "enemies",
            speed: ai.projSpeed,
            piercing: false,
            trailColor: "#b060ff",
            burstColor: "#d0a0ff"
          });
          world.add(boltId, Lifetime, { ttl: 2.5 });
          world.add(boltId, Collider, { radius: 5 });
        }
      } else {
        let cached = aiPaths.get(id);
        if (!cached || cached.age > PATH_REFRESH || cached.path.length === 0) {
          const path = astar(grid, pos.x, pos.y, tpos.x, tpos.y, col.radius);
          cached = { path: path || [], age: 0 };
          aiPaths.set(id, cached);
        }
        cached.age += dt;
        if (cached.path.length > 0) {
          const wp = cached.path[0];
          const wdx = wp.x - pos.x, wdy = wp.y - pos.y;
          const wdist = Math.hypot(wdx, wdy);
          if (wdist < grid.cellSize * 2) {
            cached.path.shift();
          } else {
            vel.vx = wdx / wdist * spd.max;
            vel.vy = wdy / wdist * spd.max;
            fac.angle = Math.atan2(wdy, wdx);
          }
        } else {
          vel.vx = 0;
          vel.vy = 0;
        }
      }
      const mdx = vel.vx * dt, mdy = vel.vy * dt;
      if (Math.abs(mdx) > 0.01 || Math.abs(mdy) > 0.01) {
        const moved = moveWithSlide(grid, pos.x, pos.y, mdx, mdy, col.radius);
        pos.x = moved.x;
        pos.y = moved.y;
      }
    }
  }, "aiSystem");
}
__name(createAISystem, "createAISystem");

// public/src/rules/systems/bumpSystem.js
var BUMP_COOLDOWN = 0.4;
var BASE_DAMAGE = 5;
function createBumpSystem() {
  const cooldowns = /* @__PURE__ */ new Map();
  let time = 0;
  return /* @__PURE__ */ __name(function bumpSystem(world, dt) {
    time += dt;
    for (const [key, lastHit] of cooldowns) {
      if (time - lastHit > BUMP_COOLDOWN * 4) cooldowns.delete(key);
    }
    const bodies = [];
    for (const [id, position, collider] of world.query(Position, Collider)) {
      if (world.has(id, Projectile) || world.has(id, GroundItem)) continue;
      bodies.push({ id, position, collider });
    }
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        resolvePair(world, bodies[i], bodies[j], cooldowns, time);
      }
    }
  }, "bumpSystem");
}
__name(createBumpSystem, "createBumpSystem");
function resolvePair(world, a, b, cooldowns, time) {
  const dx = b.position.x - a.position.x;
  const dy = b.position.y - a.position.y;
  const distance = Math.hypot(dx, dy);
  const overlap = a.collider.radius + b.collider.radius - distance;
  if (overlap <= 0) return;
  const nx = distance > 0.01 ? dx / distance : 1;
  const ny = distance > 0.01 ? dy / distance : 0;
  const push = overlap * 0.5;
  a.position.x -= nx * push;
  a.position.y -= ny * push;
  b.position.x += nx * push;
  b.position.y += ny * push;
  const aPlayer = world.has(a.id, PlayerTag);
  const bPlayer = world.has(b.id, PlayerTag);
  const aMob = world.has(a.id, AI);
  const bMob = world.has(b.id, AI);
  if (!(aPlayer && bMob || bPlayer && aMob)) return;
  const key = Math.min(a.id, b.id) + ":" + Math.max(a.id, b.id);
  if (time - (cooldowns.get(key) ?? -Infinity) < BUMP_COOLDOWN) return;
  cooldowns.set(key, time);
  const playerId = aPlayer ? a.id : b.id;
  const mobId = aMob ? a.id : b.id;
  dealDamage(world, mobId, playerId, positionOf(aPlayer ? a : b));
  dealDamage(world, playerId, mobId, positionOf(aMob ? a : b));
}
__name(resolvePair, "resolvePair");
function dealDamage(world, sourceId, targetId, position) {
  const health = world.get(targetId, Health);
  if (!health) return;
  const damage = world.has(sourceId, MeleeWeapon) ? world.get(sourceId, MeleeWeapon).damage : BASE_DAMAGE;
  health.hp = Math.max(0, health.hp - damage);
  world.emit("damage.dealt", {
    target: targetId,
    source: sourceId,
    amount: damage,
    x: position.x,
    y: position.y
  });
}
__name(dealDamage, "dealDamage");
function positionOf(body) {
  return body.position;
}
__name(positionOf, "positionOf");

// public/src/rules/systems/deathSystem.js
function deathSystem(world, _dt) {
  const destroy = /* @__PURE__ */ new Set();
  for (const [id, position, health, actor] of world.query(Position, Health, Actor)) {
    if (health.hp > 0 || world.has(id, PlayerTag)) continue;
    world.emit("entity.died", {
      id,
      kind: actor.kind,
      x: position.x,
      y: position.y,
      glyph: actor.glyph
    });
    destroy.add(id);
  }
  for (const [id, lifetime] of world.query(Lifetime)) {
    if (world.has(id, Projectile)) continue;
    lifetime.ttl -= _dt;
    if (lifetime.ttl <= 0) destroy.add(id);
  }
  for (const id of destroy) world.destroy(id);
}
__name(deathSystem, "deathSystem");

// public/src/rules/systems/movementSystem.js
function createMovementSystem(ctx) {
  const { grid } = ctx;
  return /* @__PURE__ */ __name(function movementSystem(world, dt) {
    for (const [id, pos, vel, spd, col, inp, fac] of world.query(Position, Velocity, Speed, Collider, Input, Facing)) {
      vel.vx = inp.moveX * spd.max;
      vel.vy = inp.moveY * spd.max;
      if (Math.abs(inp.aimX) > 0.1 || Math.abs(inp.aimY) > 0.1) {
        fac.angle = Math.atan2(inp.aimY, inp.aimX);
      } else if (Math.abs(vel.vx) > 1 || Math.abs(vel.vy) > 1) {
        fac.angle = Math.atan2(vel.vy, vel.vx);
      }
      const mdx = vel.vx * dt;
      const mdy = vel.vy * dt;
      if (Math.abs(mdx) > 0.01 || Math.abs(mdy) > 0.01) {
        const moved = moveWithSlide(grid, pos.x, pos.y, mdx, mdy, col.radius);
        pos.x = moved.x;
        pos.y = moved.y;
      }
    }
  }, "movementSystem");
}
__name(createMovementSystem, "createMovementSystem");

// public/src/rules/systems/pickupSystem.js
function pickupSystem(world, dt) {
  const players = [];
  for (const [id, pos, col, hp] of world.query(Position, Collider, Health, Input)) {
    players.push({ id, pos, col, hp });
  }
  const toDestroy = [];
  for (const [itemId, ipos, icol, gi] of world.query(Position, Collider, GroundItem)) {
    for (const p of players) {
      const dx = p.pos.x - ipos.x, dy = p.pos.y - ipos.y;
      const dist = Math.hypot(dx, dy);
      if (dist < p.col.radius + icol.radius + 6) {
        if (world.has(itemId, Consumable)) {
          const c = world.get(itemId, Consumable);
          const info = world.has(itemId, ItemInfo) ? world.get(itemId, ItemInfo) : null;
          if (c.effect === "heal") {
            p.hp.hp = Math.min(p.hp.maxHp, p.hp.hp + c.potency);
            world.emit("damage.dealt", {
              target: p.id,
              source: itemId,
              amount: -c.potency,
              x: p.pos.x,
              y: p.pos.y
            });
          } else if (c.effect === "add_spell" && world.has(p.id, Spellbook)) {
            const book = world.get(p.id, Spellbook);
            const spellId = info && (info.name === "Short Bow" || info.name === "Shadow Longbow" || info.name === "Sunfire Longbow") ? "arrow" : null;
            if (spellId && !book.spells.includes(spellId)) {
              book.spells.push(spellId);
            }
            world.emit("item.pickup", { entity: p.id, item: info?.name, spellId });
          } else if (c.effect === "melee_upgrade" && world.has(p.id, MeleeWeapon)) {
            const mw = world.get(p.id, MeleeWeapon);
            if (c.potency > mw.damage) {
              mw.damage = c.potency;
              mw.name = info?.name || mw.name;
              mw.glyph = info?.glyph || mw.glyph;
            }
            world.emit("item.pickup", { entity: p.id, item: info?.name });
          } else if (c.effect === "epic_chest") {
            world.emit("chest.opened", { entity: p.id, x: ipos.x, y: ipos.y });
            world.emit("item.pickup", { entity: p.id, item: info?.name });
          }
        }
        toDestroy.push(itemId);
        break;
      }
    }
  }
  for (const id of toDestroy) world.destroy(id);
}
__name(pickupSystem, "pickupSystem");

// public/src/rules/data/spellCatalog.js
var spells = {
  frost_bolt: {
    type: "projectile",
    name: "Frost Bolt",
    glyph: "\u2744",
    // ❄
    cooldown: 0.25,
    damage: 15,
    speed: 320,
    radius: 5,
    ttl: 2,
    light: { radius: 120, r: 140, g: 200, b: 255 },
    trailColor: "#8cd8ff",
    burstColor: "#b0e0ff"
  },
  arrow: {
    type: "projectile",
    name: "Arrow",
    glyph: "\u2192",
    // →
    cooldown: 0.18,
    damage: 10,
    speed: 450,
    radius: 3,
    ttl: 1.5,
    light: null,
    trailColor: "#c8a050",
    burstColor: "#a08040"
  },
  lightning: {
    type: "bolt",
    name: "Lightning",
    glyph: "\u26A1",
    // ⚡
    cooldown: 0.6,
    damage: 25,
    range: 280,
    // max range to first target
    chainRadius: 120,
    // max hop distance between targets
    maxTargets: 3
    // chain up to 3 enemies
  }
};

// public/src/rules/systems/playerCombatSystem.js
function createPlayerCombatSystem({ grid }) {
  return /* @__PURE__ */ __name(function playerCombatSystem(world, dt) {
    for (const [playerId, , input, book, position] of world.query(
      PlayerTag,
      Input,
      Spellbook,
      Position
    )) {
      book.cooldown = Math.max(0, book.cooldown - dt);
      const aiming = Math.abs(input.aimX) > 0.1 || Math.abs(input.aimY) > 0.1;
      if (!input.fire || !aiming || book.cooldown > 0 || book.spells.length === 0) continue;
      const spellId = book.spells[book.activeIndex];
      const spell = spells[spellId];
      if (!spell) continue;
      const angle = Math.atan2(input.aimY, input.aimX);
      if (spell.type === "bolt") {
        if (!castChainBolt(world, grid, playerId, position, spell)) continue;
      } else {
        spawnSpellProjectile(world, playerId, position, angle, spell);
      }
      book.cooldown = spell.cooldown;
      world.emit("spell.cast", { playerId, spellId, x: position.x, y: position.y, angle });
    }
  }, "playerCombatSystem");
}
__name(createPlayerCombatSystem, "createPlayerCombatSystem");
function castChainBolt(world, grid, playerId, position, spell) {
  const candidates = [];
  for (const [id, targetPosition, health] of world.query(Position, Health, AI)) {
    const distance = Math.hypot(targetPosition.x - position.x, targetPosition.y - position.y);
    if (distance <= spell.range && hasLineOfSight(grid, position.x, position.y, targetPosition.x, targetPosition.y)) {
      candidates.push({ id, position: targetPosition, health, distance });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance || a.id - b.id);
  if (candidates.length === 0) return false;
  const hit = /* @__PURE__ */ new Set();
  let fromX = position.x;
  let fromY = position.y;
  for (let chain = 0; chain < (spell.maxTargets || 1); chain++) {
    let best = null;
    let bestDistance = chain === 0 ? spell.range : spell.chainRadius;
    for (const candidate of candidates) {
      if (hit.has(candidate.id)) continue;
      const distance = Math.hypot(candidate.position.x - fromX, candidate.position.y - fromY);
      if (distance <= bestDistance && hasLineOfSight(grid, fromX, fromY, candidate.position.x, candidate.position.y)) {
        best = candidate;
        bestDistance = distance;
      }
    }
    if (!best) break;
    hit.add(best.id);
    const damage = Math.round(spell.damage * Math.pow(0.7, chain));
    best.health.hp = Math.max(0, best.health.hp - damage);
    world.emit("spell.bolt", {
      source: playerId,
      target: best.id,
      fromX,
      fromY,
      toX: best.position.x,
      toY: best.position.y,
      chain
    });
    world.emit("damage.dealt", {
      target: best.id,
      source: playerId,
      amount: damage,
      x: best.position.x,
      y: best.position.y
    });
    fromX = best.position.x;
    fromY = best.position.y;
  }
  return hit.size > 0;
}
__name(castChainBolt, "castChainBolt");
function spawnSpellProjectile(world, playerId, position, angle, spell) {
  const projectileId = world.create();
  world.add(projectileId, Position, {
    x: position.x + Math.cos(angle) * 20,
    y: position.y + Math.sin(angle) * 20
  });
  world.add(projectileId, Velocity, {
    vx: Math.cos(angle) * spell.speed,
    vy: Math.sin(angle) * spell.speed
  });
  world.add(projectileId, Projectile, {
    damage: spell.damage,
    owner: playerId,
    team: "players",
    speed: spell.speed,
    piercing: false,
    trailColor: spell.trailColor,
    burstColor: spell.burstColor
  });
  world.add(projectileId, Lifetime, { ttl: spell.ttl });
  world.add(projectileId, Collider, { radius: spell.radius });
}
__name(spawnSpellProjectile, "spawnSpellProjectile");
function hasLineOfSight(grid, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const distance = Math.hypot(dx, dy);
  const steps = Math.ceil(distance / (grid.cellSize * 2));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (grid.distanceMove(ax + dx * t, ay + dy * t) < 6) return false;
  }
  return true;
}
__name(hasLineOfSight, "hasLineOfSight");

// public/src/rules/systems/projectileSystem.js
function createProjectileSystem({ grid, carve = null }) {
  return /* @__PURE__ */ __name(function projectileSystem(world, dt) {
    const targets = [];
    for (const [id, position, collider, health] of world.query(Position, Collider, Health)) {
      targets.push({ id, position, collider, health, team: teamOf(world, id) });
    }
    const destroy = /* @__PURE__ */ new Set();
    for (const [id, position, velocity, projectile, lifetime, collider] of world.query(
      Position,
      Velocity,
      Projectile,
      Lifetime,
      Collider
    )) {
      position.x += velocity.vx * dt;
      position.y += velocity.vy * dt;
      const projectileTeam = projectile.team || teamOf(world, projectile.owner);
      for (const target of targets) {
        if (target.id === projectile.owner || target.team === projectileTeam) continue;
        const dx = target.position.x - position.x;
        const dy = target.position.y - position.y;
        const radius = collider.radius + target.collider.radius;
        if (dx * dx + dy * dy >= radius * radius) continue;
        target.health.hp = Math.max(0, target.health.hp - projectile.damage);
        world.emit("damage.dealt", {
          target: target.id,
          source: projectile.owner,
          amount: projectile.damage,
          x: position.x,
          y: position.y
        });
        world.emit("projectile.hit", {
          projectile: id,
          target: target.id,
          x: position.x,
          y: position.y,
          vx: velocity.vx,
          vy: velocity.vy,
          color: projectile.burstColor
        });
        if (!projectile.piercing) destroy.add(id);
        break;
      }
      if (destroy.has(id)) continue;
      if (grid.distanceMove(position.x, position.y) < collider.radius) {
        const radius = projectile.damage * 0.5;
        if (carve) carve(position.x, position.y, radius);
        world.emit("projectile.wall", {
          projectile: id,
          x: position.x,
          y: position.y,
          vx: velocity.vx,
          vy: velocity.vy,
          radius,
          color: projectile.burstColor
        });
        if (carve) world.emit("terrain.carved", { x: position.x, y: position.y, radius });
        destroy.add(id);
        continue;
      }
      lifetime.ttl -= dt;
      if (lifetime.ttl <= 0) {
        world.emit("projectile.expired", { projectile: id, x: position.x, y: position.y });
        destroy.add(id);
      }
    }
    for (const id of destroy) world.destroy(id);
  }, "projectileSystem");
}
__name(createProjectileSystem, "createProjectileSystem");
function teamOf(world, id) {
  if (id != null && world.alive.has(id)) {
    if (world.has(id, PlayerTag)) return "players";
    if (world.has(id, AI)) return "enemies";
  }
  return "neutral";
}
__name(teamOf, "teamOf");

// public/src/rules/sim/arenaSim.js
var SIM_TICK_HZ = 20;
var SIM_DT = 1 / SIM_TICK_HZ;
var SIM_SNAPSHOT_VERSION = 2;
var SIM_MODE = Object.freeze({
  AUTHORITY: "authority",
  REPLICA: "replica"
});
var PRESENTATION_EVENTS = Object.freeze([
  "damage.dealt",
  "entity.died",
  "item.pickup",
  "projectile.expired",
  "projectile.hit",
  "projectile.wall",
  "spell.bolt",
  "spell.cast",
  "terrain.carved"
]);
var EVENT_HISTORY_LIMIT = 96;
function createArenaSimulation({
  seed,
  grid,
  spawns = [],
  mode = SIM_MODE.AUTHORITY,
  enemyCount = 1,
  respawnEnemies = true
} = {}) {
  if (!grid) throw new Error("arena simulation requires a collision grid");
  if (!Object.values(SIM_MODE).includes(mode)) throw new Error(`invalid arena simulation mode: ${mode}`);
  const world = new World({ seed });
  const playerByPeer = /* @__PURE__ */ new Map();
  const lastInputSeqByPeer = /* @__PURE__ */ new Map();
  const networkIdByEntity = /* @__PURE__ */ new Map();
  const entityByNetworkId = /* @__PURE__ */ new Map();
  const eventHistory = [];
  let tick = 0;
  let revision = 0;
  let eventSequence = 0;
  let lastAppliedRevision = -1;
  let lastAppliedEventSequence = -1;
  let populationStarted = false;
  if (mode === SIM_MODE.AUTHORITY) {
    installAuthoritativeRules(world, grid);
    installEventJournal(world, eventHistory, () => ({ tick, sequence: ++eventSequence }));
    installLootRules(world);
  }
  function addPlayer(peerId, spawnIndex = 0, networkId = null) {
    const owner = normalizePeerId(peerId);
    if (playerByPeer.has(owner)) return playerByPeer.get(owner);
    const spawn = spawns[positiveModulo(spawnIndex, Math.max(1, spawns.length))] || { x: 1e3, y: 1e3 };
    const entityId = spawnPlayer(world, spawn.x, spawn.y);
    world.add(entityId, PlayerTag);
    playerByPeer.set(owner, entityId);
    lastInputSeqByPeer.set(owner, -1);
    bindNetworkId(entityId, normalizeNetworkId(networkId ?? `player:${owner}`));
    revision += 1;
    if (mode === SIM_MODE.AUTHORITY && !populationStarted) {
      populationStarted = true;
      for (let i = 0; i < enemyCount; i++) {
        const angle = i / Math.max(1, enemyCount) * Math.PI * 2;
        const mobId = spawnCaster(
          world,
          grid,
          spawn.x + Math.cos(angle) * (180 + i * 30),
          spawn.y + Math.sin(angle) * (180 + i * 30),
          entityId
        );
        ensureNetworkId(mobId, "mob");
      }
      if (enemyCount > 0) revision += 1;
    }
    return entityId;
  }
  __name(addPlayer, "addPlayer");
  function removePlayer(peerId) {
    const owner = normalizePeerId(peerId);
    const entityId = playerByPeer.get(owner);
    if (entityId == null) return false;
    playerByPeer.delete(owner);
    lastInputSeqByPeer.delete(owner);
    if (world.alive.has(entityId)) world.destroy(entityId);
    retargetEnemies();
    revision += 1;
    return true;
  }
  __name(removePlayer, "removePlayer");
  function setPlayerInput(peerId, command = {}) {
    const owner = normalizePeerId(peerId);
    const entityId = playerByPeer.get(owner);
    if (entityId == null || !world.has(entityId, Input)) return false;
    const seq = normalizeOptionalSequence(command.seq);
    if (seq != null && seq <= (lastInputSeqByPeer.get(owner) ?? -1)) return false;
    const input = world.get(entityId, Input);
    input.moveX = clampUnit2(command.moveX);
    input.moveY = clampUnit2(command.moveY);
    input.aimX = clampUnit2(command.aimX);
    input.aimY = clampUnit2(command.aimY);
    input.fire = Boolean(command.fire);
    if (Number.isInteger(command.spellSlot) && world.has(entityId, Spellbook)) {
      const book = world.get(entityId, Spellbook);
      if (command.spellSlot >= 0 && command.spellSlot < book.spells.length) {
        book.activeIndex = command.spellSlot;
      }
    }
    if (seq != null) lastInputSeqByPeer.set(owner, seq);
    return true;
  }
  __name(setPlayerInput, "setPlayerInput");
  function step(dt = SIM_DT) {
    if (mode !== SIM_MODE.AUTHORITY) throw new Error("replica simulations cannot advance gameplay");
    const stepDt = Number(dt);
    if (!Number.isFinite(stepDt) || stepDt <= 0) throw new Error("arena simulation step requires a positive finite dt");
    tick += 1;
    world.tick(stepDt);
    revision += 1;
    return tick;
  }
  __name(step, "step");
  function captureSnapshot() {
    const entities = [];
    for (const entityId of world.alive) {
      const record = captureEntity(entityId);
      if (record) entities.push(record);
    }
    entities.sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
    const snapshot = {
      version: SIM_SNAPSHOT_VERSION,
      tick,
      revision,
      entities,
      events: eventHistory.map(cloneEvent)
    };
    pruneRetiredNetworkIds();
    return snapshot;
  }
  __name(captureSnapshot, "captureSnapshot");
  function applySnapshot(rawSnapshot) {
    if (mode !== SIM_MODE.REPLICA) throw new Error("authoritative simulations cannot apply remote snapshots");
    const snapshot = normalizeSnapshot(rawSnapshot);
    if (snapshot.revision <= lastAppliedRevision) return false;
    const liveIds = new Set(snapshot.entities.map((record) => record.id));
    for (const record of snapshot.entities) ensureReplicaEntity(record);
    for (const record of snapshot.entities) applyEntityRecord(record);
    for (const [networkId, entityId] of [...entityByNetworkId]) {
      if (!liveIds.has(networkId)) {
        forgetEntity(entityId);
        if (world.alive.has(entityId)) world.destroy(entityId);
      }
    }
    tick = snapshot.tick;
    revision = snapshot.revision;
    lastAppliedRevision = snapshot.revision;
    for (const event of snapshot.events) {
      if (event.sequence <= lastAppliedEventSequence) continue;
      lastAppliedEventSequence = event.sequence;
      world.emit(event.type, { ...event.payload, sequence: event.sequence, tick: event.tick });
    }
    return true;
  }
  __name(applySnapshot, "applySnapshot");
  function getPlayerEntity(peerId) {
    return playerByPeer.get(normalizePeerId(peerId)) ?? null;
  }
  __name(getPlayerEntity, "getPlayerEntity");
  function getPlayerSnapshot(peerId) {
    const entityId = getPlayerEntity(peerId);
    return entityId != null && world.alive.has(entityId) ? captureEntity(entityId) : null;
  }
  __name(getPlayerSnapshot, "getPlayerSnapshot");
  function captureEntity(entityId) {
    if (!world.has(entityId, Position)) return null;
    if (world.has(entityId, PlayerTag)) return capturePlayer(entityId);
    if (world.has(entityId, AI)) return captureMob(entityId);
    if (world.has(entityId, Projectile)) return captureProjectile(entityId);
    if (world.has(entityId, GroundItem)) return captureItem(entityId);
    return null;
  }
  __name(captureEntity, "captureEntity");
  function capturePlayer(entityId) {
    const peerId = findPeerForEntity(entityId);
    const position = world.get(entityId, Position);
    const velocity = world.get(entityId, Velocity);
    const facing = world.get(entityId, Facing);
    const collider = world.get(entityId, Collider);
    const health = world.get(entityId, Health);
    const book = world.get(entityId, Spellbook);
    const weapon = world.get(entityId, MeleeWeapon);
    return {
      id: ensureNetworkId(entityId, "player"),
      kind: "player",
      owner: peerId,
      inputSeq: lastInputSeqByPeer.get(peerId) ?? -1,
      state: {
        x: position.x,
        y: position.y,
        vx: velocity.vx,
        vy: velocity.vy,
        facing: facing.angle,
        radius: collider.radius,
        hp: health.hp,
        maxHp: health.maxHp,
        spells: [...book.spells],
        activeSpell: book.activeIndex,
        cooldown: book.cooldown,
        weapon: { name: weapon.name, glyph: weapon.glyph, damage: weapon.damage }
      }
    };
  }
  __name(capturePlayer, "capturePlayer");
  function captureMob(entityId) {
    const position = world.get(entityId, Position);
    const velocity = world.get(entityId, Velocity);
    const facing = world.get(entityId, Facing);
    const collider = world.get(entityId, Collider);
    const health = world.get(entityId, Health);
    const actor = world.get(entityId, Actor);
    return {
      id: ensureNetworkId(entityId, "mob"),
      kind: "mob",
      state: {
        x: position.x,
        y: position.y,
        vx: velocity.vx,
        vy: velocity.vy,
        facing: facing.angle,
        radius: collider.radius,
        hp: health.hp,
        maxHp: health.maxHp,
        name: actor.name,
        glyph: actor.glyph
      }
    };
  }
  __name(captureMob, "captureMob");
  function captureProjectile(entityId) {
    const position = world.get(entityId, Position);
    const velocity = world.get(entityId, Velocity);
    const collider = world.get(entityId, Collider);
    const projectile = world.get(entityId, Projectile);
    const lifetime = world.get(entityId, Lifetime);
    return {
      id: ensureNetworkId(entityId, "projectile"),
      kind: "projectile",
      state: {
        x: position.x,
        y: position.y,
        vx: velocity.vx,
        vy: velocity.vy,
        radius: collider.radius,
        damage: projectile.damage,
        team: projectile.team,
        piercing: projectile.piercing,
        trailColor: projectile.trailColor,
        burstColor: projectile.burstColor,
        ttl: lifetime.ttl,
        owner: ensureNetworkId(projectile.owner, world.has(projectile.owner, AI) ? "mob" : "player")
      }
    };
  }
  __name(captureProjectile, "captureProjectile");
  function captureItem(entityId) {
    const position = world.get(entityId, Position);
    const collider = world.get(entityId, Collider);
    const info = world.get(entityId, ItemInfo);
    const consumable = world.get(entityId, Consumable);
    return {
      id: ensureNetworkId(entityId, "item"),
      kind: "item",
      state: {
        x: position.x,
        y: position.y,
        radius: collider.radius,
        name: info?.name ?? "Item",
        glyph: info?.glyph ?? "?",
        effect: consumable?.effect ?? null,
        potency: consumable?.potency ?? 0
      }
    };
  }
  __name(captureItem, "captureItem");
  function ensureReplicaEntity(record) {
    if (entityByNetworkId.has(record.id)) return entityByNetworkId.get(record.id);
    let entityId;
    if (record.kind === "player") {
      entityId = addPlayer(record.owner, 0, record.id);
    } else {
      entityId = world.create();
      bindNetworkId(entityId, record.id);
      addReplicaComponents(entityId, record);
    }
    return entityId;
  }
  __name(ensureReplicaEntity, "ensureReplicaEntity");
  function addReplicaComponents(entityId, record) {
    const state = record.state;
    world.add(entityId, Position, { x: state.x, y: state.y });
    if (record.kind === "mob") {
      world.add(entityId, Velocity, { vx: state.vx, vy: state.vy });
      world.add(entityId, Facing, { angle: state.facing });
      world.add(entityId, Collider, { radius: state.radius });
      world.add(entityId, Health, { hp: state.hp, maxHp: state.maxHp });
      world.add(entityId, Actor, { kind: ActorKind.MOB, name: state.name, glyph: state.glyph });
      world.add(entityId, AI, { target: null });
    } else if (record.kind === "projectile") {
      world.add(entityId, Velocity, { vx: state.vx, vy: state.vy });
      world.add(entityId, Collider, { radius: state.radius });
      world.add(entityId, Projectile, recordToProjectile(state));
      world.add(entityId, Lifetime, { ttl: state.ttl });
    } else if (record.kind === "item") {
      world.add(entityId, Collider, { radius: state.radius });
      world.add(entityId, GroundItem);
      world.add(entityId, ItemInfo, { name: state.name, glyph: state.glyph });
      if (state.effect) world.add(entityId, Consumable, { effect: state.effect, potency: state.potency });
    }
  }
  __name(addReplicaComponents, "addReplicaComponents");
  function applyEntityRecord(record) {
    const entityId = entityByNetworkId.get(record.id);
    const state = record.state;
    const position = world.get(entityId, Position);
    position.x = state.x;
    position.y = state.y;
    if (world.has(entityId, Velocity)) {
      const velocity = world.get(entityId, Velocity);
      velocity.vx = state.vx;
      velocity.vy = state.vy;
    }
    if (world.has(entityId, Facing)) world.get(entityId, Facing).angle = state.facing;
    if (world.has(entityId, Collider)) world.get(entityId, Collider).radius = state.radius;
    if (world.has(entityId, Health)) {
      const health = world.get(entityId, Health);
      health.hp = state.hp;
      health.maxHp = state.maxHp;
    }
    if (record.kind === "player") {
      lastInputSeqByPeer.set(record.owner, record.inputSeq);
      const book = world.get(entityId, Spellbook);
      book.spells = [...state.spells];
      book.activeIndex = state.activeSpell;
      book.cooldown = state.cooldown;
      const weapon = world.get(entityId, MeleeWeapon);
      Object.assign(weapon, state.weapon);
    } else if (record.kind === "mob") {
      const actor = world.get(entityId, Actor);
      actor.name = state.name;
      actor.glyph = state.glyph;
    } else if (record.kind === "projectile") {
      const projectile = world.get(entityId, Projectile);
      Object.assign(projectile, recordToProjectile(state));
      projectile.owner = entityByNetworkId.get(state.owner) ?? null;
      world.get(entityId, Lifetime).ttl = state.ttl;
    }
  }
  __name(applyEntityRecord, "applyEntityRecord");
  function bindNetworkId(entityId, networkId) {
    const previous = networkIdByEntity.get(entityId);
    if (previous != null) entityByNetworkId.delete(previous);
    networkIdByEntity.set(entityId, networkId);
    entityByNetworkId.set(networkId, entityId);
  }
  __name(bindNetworkId, "bindNetworkId");
  function ensureNetworkId(entityId, kind) {
    if (entityId == null) return null;
    let networkId = networkIdByEntity.get(entityId);
    if (networkId) return networkId;
    if (!world.alive.has(entityId)) return null;
    networkId = `${kind}:${entityId}`;
    bindNetworkId(entityId, networkId);
    return networkId;
  }
  __name(ensureNetworkId, "ensureNetworkId");
  function forgetEntity(entityId) {
    const networkId = networkIdByEntity.get(entityId);
    const peerId = findPeerForEntity(entityId);
    if (peerId != null) {
      playerByPeer.delete(peerId);
      lastInputSeqByPeer.delete(peerId);
    }
    networkIdByEntity.delete(entityId);
    if (networkId != null) entityByNetworkId.delete(networkId);
  }
  __name(forgetEntity, "forgetEntity");
  function pruneRetiredNetworkIds() {
    const referencedOwners = /* @__PURE__ */ new Set();
    for (const [, projectile] of world.query(Projectile)) {
      if (projectile.owner != null) referencedOwners.add(projectile.owner);
    }
    for (const [entityId, networkId] of [...networkIdByEntity]) {
      if (world.alive.has(entityId) || referencedOwners.has(entityId)) continue;
      networkIdByEntity.delete(entityId);
      entityByNetworkId.delete(networkId);
    }
  }
  __name(pruneRetiredNetworkIds, "pruneRetiredNetworkIds");
  function findPeerForEntity(entityId) {
    for (const [peerId, candidate] of playerByPeer) if (candidate === entityId) return peerId;
    return null;
  }
  __name(findPeerForEntity, "findPeerForEntity");
  function retargetEnemies() {
    const target = playerByPeer.values().next().value ?? null;
    for (const [, ai] of world.query(AI)) ai.target = target;
  }
  __name(retargetEnemies, "retargetEnemies");
  function installLootRules(targetWorld) {
    targetWorld.on("entity.died", (event) => {
      if (event.kind !== ActorKind.MOB) return;
      spawnPotion(targetWorld, event.x, event.y, 25);
      const drop = rollTable(mobDropTable, mobDropTotalWeight, targetWorld.rand);
      const itemId = spawnDrop(targetWorld, drop, event.x + targetWorld.rand() * 12 - 6, event.y + targetWorld.rand() * 12 - 6);
      if (itemId != null) ensureNetworkId(itemId, "item");
      if (respawnEnemies) {
        const target = playerByPeer.values().next().value ?? null;
        const targetPosition = target == null ? null : targetWorld.get(target, Position);
        if (targetPosition) {
          const angle = targetWorld.rand() * Math.PI * 2;
          const distance = 280 + targetWorld.rand() * 160;
          const mobId = spawnCaster(
            targetWorld,
            grid,
            targetPosition.x + Math.cos(angle) * distance,
            targetPosition.y + Math.sin(angle) * distance,
            target
          );
          ensureNetworkId(mobId, "mob");
        }
      }
      revision += 1;
    });
  }
  __name(installLootRules, "installLootRules");
  return {
    addPlayer,
    applySnapshot,
    captureSnapshot,
    getMode: /* @__PURE__ */ __name(() => mode, "getMode"),
    getPlayerEntity,
    getPlayerSnapshot,
    getRevision: /* @__PURE__ */ __name(() => revision, "getRevision"),
    getTick: /* @__PURE__ */ __name(() => tick, "getTick"),
    removePlayer,
    setPlayerInput,
    step,
    world
  };
}
__name(createArenaSimulation, "createArenaSimulation");
function normalizeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") throw new Error("simulation snapshot must be an object");
  if (snapshot.version !== SIM_SNAPSHOT_VERSION) {
    throw new Error(`simulation snapshot version mismatch: ${snapshot.version ?? "missing"}`);
  }
  const tick = nonNegativeInteger(snapshot.tick, "snapshot tick");
  const revision = nonNegativeInteger(snapshot.revision, "snapshot revision");
  if (!Array.isArray(snapshot.entities)) throw new Error("simulation snapshot entities must be an array");
  if (!Array.isArray(snapshot.events)) throw new Error("simulation snapshot events must be an array");
  const ids = /* @__PURE__ */ new Set();
  const owners = /* @__PURE__ */ new Set();
  const entities = snapshot.entities.map((entity) => {
    const record = normalizeEntityRecord(entity);
    if (ids.has(record.id)) throw new Error(`duplicate simulation entity id: ${record.id}`);
    if (record.kind === "player" && owners.has(record.owner)) throw new Error(`duplicate simulation player owner: ${record.owner}`);
    ids.add(record.id);
    if (record.kind === "player") owners.add(record.owner);
    return record;
  });
  const events = snapshot.events.map(normalizeEvent);
  return { version: SIM_SNAPSHOT_VERSION, tick, revision, entities, events };
}
__name(normalizeSnapshot, "normalizeSnapshot");
function installAuthoritativeRules(world, grid) {
  const systems = [
    createMovementSystem({ grid }),
    createAISystem({ grid }),
    createPlayerCombatSystem({ grid }),
    createBumpSystem(),
    pickupSystem,
    createProjectileSystem({ grid, carve: createGridCarver(grid) }),
    deathSystem
  ];
  world.setScheduler((targetWorld, dt) => {
    for (const system of systems) system(targetWorld, dt);
  });
}
__name(installAuthoritativeRules, "installAuthoritativeRules");
function installEventJournal(world, history, nextIdentity) {
  for (const type of PRESENTATION_EVENTS) {
    world.on(type, (payload) => {
      const identity = nextIdentity();
      history.push({ ...identity, type, payload: clonePayload(payload) });
      if (history.length > EVENT_HISTORY_LIMIT) history.splice(0, history.length - EVENT_HISTORY_LIMIT);
    });
  }
}
__name(installEventJournal, "installEventJournal");
function spawnDrop(world, drop, x, y) {
  if (!drop || drop.type === "nothing") return null;
  if (drop.type === "potion") return spawnPotion(world, x, y, drop.potency);
  if (drop.type === "bow") return spawnBow(world, x, y);
  if (drop.type === "sword") return spawnSword(world, x, y, drop.tier);
  if (drop.type === "arrows") return spawnArrows(world, x, y, drop.count);
  if (drop.type === "epic_chest") return spawnEpicChest(world, x, y);
  if (drop.type === "epic_sword") return spawnEpicSword(world, x, y);
  if (drop.type === "epic_bow") return spawnEpicBow(world, x, y);
  if (drop.type === "legendary_sword") return spawnLegendarySword(world, x, y);
  if (drop.type === "legendary_bow") return spawnLegendaryBow(world, x, y);
  return null;
}
__name(spawnDrop, "spawnDrop");
function normalizeEntityRecord(entity) {
  if (!entity || typeof entity !== "object") throw new Error("simulation entity must be an object");
  const id = normalizeNetworkId(entity.id);
  const kind = String(entity.kind || "");
  if (!["player", "mob", "projectile", "item"].includes(kind)) throw new Error(`unsupported simulation entity kind: ${kind || "missing"}`);
  const state = entity.state;
  if (!state || typeof state !== "object") throw new Error(`simulation ${id} state must be an object`);
  if (kind === "player") {
    return {
      id,
      kind,
      owner: normalizePeerId(entity.owner),
      inputSeq: snapshotSequence(entity.inputSeq),
      state: normalizePlayerState(id, state)
    };
  }
  if (kind === "mob") return { id, kind, state: normalizeMobState(id, state) };
  if (kind === "projectile") return { id, kind, state: normalizeProjectileState(id, state) };
  return { id, kind, state: normalizeItemState(id, state) };
}
__name(normalizeEntityRecord, "normalizeEntityRecord");
function normalizePlayerState(id, state) {
  if (!Array.isArray(state.spells) || !state.spells.every((spell) => typeof spell === "string")) {
    throw new Error(`simulation ${id}.spells must be an array of strings`);
  }
  const weapon = state.weapon;
  if (!weapon || typeof weapon !== "object") throw new Error(`simulation ${id}.weapon must be an object`);
  return {
    ...normalizeBodyState(id, state),
    spells: [...state.spells],
    activeSpell: nonNegativeInteger(state.activeSpell, `${id}.activeSpell`),
    cooldown: finiteNumber(state.cooldown, `${id}.cooldown`),
    weapon: {
      name: String(weapon.name),
      glyph: String(weapon.glyph),
      damage: finiteNumber(weapon.damage, `${id}.weapon.damage`)
    }
  };
}
__name(normalizePlayerState, "normalizePlayerState");
function normalizeMobState(id, state) {
  return { ...normalizeBodyState(id, state), name: String(state.name), glyph: String(state.glyph) };
}
__name(normalizeMobState, "normalizeMobState");
function normalizeBodyState(id, state) {
  return {
    x: finiteNumber(state.x, `${id}.x`),
    y: finiteNumber(state.y, `${id}.y`),
    vx: finiteNumber(state.vx, `${id}.vx`),
    vy: finiteNumber(state.vy, `${id}.vy`),
    facing: finiteNumber(state.facing, `${id}.facing`),
    radius: finiteNumber(state.radius, `${id}.radius`),
    hp: finiteNumber(state.hp, `${id}.hp`),
    maxHp: finiteNumber(state.maxHp, `${id}.maxHp`)
  };
}
__name(normalizeBodyState, "normalizeBodyState");
function normalizeProjectileState(id, state) {
  return {
    x: finiteNumber(state.x, `${id}.x`),
    y: finiteNumber(state.y, `${id}.y`),
    vx: finiteNumber(state.vx, `${id}.vx`),
    vy: finiteNumber(state.vy, `${id}.vy`),
    radius: finiteNumber(state.radius, `${id}.radius`),
    damage: finiteNumber(state.damage, `${id}.damage`),
    team: String(state.team || "neutral"),
    piercing: Boolean(state.piercing),
    trailColor: String(state.trailColor || ""),
    burstColor: String(state.burstColor || ""),
    ttl: finiteNumber(state.ttl, `${id}.ttl`),
    owner: normalizeNetworkId(state.owner)
  };
}
__name(normalizeProjectileState, "normalizeProjectileState");
function normalizeItemState(id, state) {
  return {
    x: finiteNumber(state.x, `${id}.x`),
    y: finiteNumber(state.y, `${id}.y`),
    radius: finiteNumber(state.radius, `${id}.radius`),
    name: String(state.name),
    glyph: String(state.glyph),
    effect: state.effect == null ? null : String(state.effect),
    potency: finiteNumber(state.potency, `${id}.potency`)
  };
}
__name(normalizeItemState, "normalizeItemState");
function normalizeEvent(event) {
  if (!event || typeof event !== "object" || !PRESENTATION_EVENTS.includes(event.type)) {
    throw new Error("invalid simulation presentation event");
  }
  return {
    sequence: nonNegativeInteger(event.sequence, "event sequence"),
    tick: nonNegativeInteger(event.tick, "event tick"),
    type: event.type,
    payload: clonePayload(event.payload)
  };
}
__name(normalizeEvent, "normalizeEvent");
function recordToProjectile(state) {
  return {
    damage: state.damage,
    owner: null,
    team: state.team,
    speed: Math.hypot(state.vx, state.vy),
    piercing: state.piercing,
    trailColor: state.trailColor,
    burstColor: state.burstColor
  };
}
__name(recordToProjectile, "recordToProjectile");
function cloneEvent(event) {
  return { ...event, payload: clonePayload(event.payload) };
}
__name(cloneEvent, "cloneEvent");
function clonePayload(payload) {
  if (!payload || typeof payload !== "object") return {};
  return JSON.parse(JSON.stringify(payload));
}
__name(clonePayload, "clonePayload");
function normalizePeerId(peerId) {
  const id = String(peerId || "").trim();
  if (!id) throw new Error("player peer id is required");
  return id;
}
__name(normalizePeerId, "normalizePeerId");
function normalizeNetworkId(id) {
  const value = String(id ?? "").trim();
  if (!value) throw new Error("simulation entity id must be a non-empty string");
  return value;
}
__name(normalizeNetworkId, "normalizeNetworkId");
function positiveModulo(value, divisor) {
  const n = Number.isInteger(value) ? value : 0;
  return (n % divisor + divisor) % divisor;
}
__name(positiveModulo, "positiveModulo");
function clampUnit2(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-1, Math.min(1, n));
}
__name(clampUnit2, "clampUnit");
function normalizeOptionalSequence(value) {
  if (value == null) return null;
  const seq = Number(value);
  return Number.isInteger(seq) && seq >= 0 ? seq : null;
}
__name(normalizeOptionalSequence, "normalizeOptionalSequence");
function snapshotSequence(value) {
  const seq = Number(value);
  if (!Number.isInteger(seq) || seq < -1) throw new Error("simulation input sequence must be an integer greater than or equal to -1");
  return seq;
}
__name(snapshotSequence, "snapshotSequence");
function nonNegativeInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new Error(`simulation ${field} must be a non-negative integer`);
  return number;
}
__name(nonNegativeInteger, "nonNegativeInteger");
function finiteNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`simulation ${field} must be finite`);
  return number;
}
__name(finiteNumber, "finiteNumber");

// worker/index.js
var JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};
var SNAPSHOT_HZ = 10;
var SERVER_TICK_MS = 1e3 / SIM_TICK_HZ;
var SNAPSHOT_EVERY_TICKS = Math.max(1, Math.round(SIM_TICK_HZ / SNAPSHOT_HZ));
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      return json({
        ok: true,
        service: "js-hack-arena",
        runtime: "cloudflare-worker"
      });
    }
    if (url.pathname === "/api/rooms/default") {
      const roomId = normalizeRoomId(url.searchParams.get("room") || DEFAULT_ROOM_ID);
      return json({
        roomId,
        seed: makeRoomSeed(roomId),
        ws: websocketUrl(request, `/ws/${roomId}`)
      });
    }
    if (url.pathname.startsWith("/ws/")) {
      const roomId = normalizeRoomId(url.pathname.slice("/ws/".length));
      const id = env.GAME_ROOM.idFromName(roomId);
      return env.GAME_ROOM.get(id).fetch(request);
    }
    return env.ASSETS.fetch(request);
  }
};
var GameRoom = class {
  static {
    __name(this, "GameRoom");
  }
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = /* @__PURE__ */ new Map();
    this.createdAt = Date.now();
    this.roomId = DEFAULT_ROOM_ID;
    this.seed = makeRoomSeed(this.roomId);
    this.caveData = null;
    this.sim = null;
    this.tickTimer = null;
  }
  async fetch(request) {
    const url = new URL(request.url);
    this.setRoomId(normalizeRoomId(url.pathname.startsWith("/ws/") ? url.pathname.slice("/ws/".length) : DEFAULT_ROOM_ID));
    if (request.headers.get("upgrade") !== "websocket") {
      return json({
        ok: true,
        roomId: this.roomId,
        room: this.state.id.toString(),
        seed: this.seed,
        peers: this.sessions.size,
        tick: this.sim?.getTick() ?? 0,
        tickHz: SIM_TICK_HZ,
        snapshotHz: SNAPSHOT_HZ
      });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.accept(server);
    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }
  accept(socket) {
    socket.accept();
    const peerId = crypto.randomUUID();
    const session = {
      id: peerId,
      socket,
      joinedAt: Date.now(),
      lastSeenAt: Date.now(),
      input: makeInputFrame()
    };
    this.ensureSim().addPlayer(peerId, this.sessions.size);
    this.sessions.set(socket, session);
    this.startTicking();
    this.send(socket, MESSAGE.WELCOME, {
      peerId,
      roomId: this.roomId,
      seed: this.seed,
      tickHz: SIM_TICK_HZ,
      snapshotHz: SNAPSHOT_HZ,
      peers: this.peerList(),
      snapshot: this.ensureSim().captureSnapshot()
    });
    this.broadcast(MESSAGE.PEER_JOINED, { peerId, peers: this.peerList() }, socket);
    this.broadcastSnapshot();
    socket.addEventListener("message", (event) => {
      this.handleMessage(socket, event.data);
    });
    socket.addEventListener("close", () => {
      this.leave(socket);
    });
    socket.addEventListener("error", () => {
      this.leave(socket);
    });
  }
  handleMessage(socket, raw) {
    const session = this.sessions.get(socket);
    if (!session) return;
    let msg;
    try {
      msg = decodeMessage(raw);
    } catch (err) {
      this.send(socket, MESSAGE.ERROR, { error: err.message });
      return;
    }
    session.lastSeenAt = Date.now();
    if (msg.type === MESSAGE.PING) {
      this.send(socket, MESSAGE.PONG, { tick: this.ensureSim().getTick() });
      return;
    }
    if (msg.type === MESSAGE.HELLO) {
      this.send(socket, MESSAGE.WELCOME, {
        peerId: session.id,
        roomId: this.roomId,
        seed: this.seed,
        tickHz: SIM_TICK_HZ,
        snapshotHz: SNAPSHOT_HZ,
        peers: this.peerList(),
        snapshot: this.ensureSim().captureSnapshot()
      });
      return;
    }
    if (msg.type === MESSAGE.INPUT) {
      session.input = makeInputFrame(msg.input);
      this.ensureSim().setPlayerInput(session.id, session.input);
      return;
    }
    this.send(socket, MESSAGE.ERROR, { error: `unsupported message type: ${msg.type}` });
  }
  step() {
    const sim = this.ensureSim();
    const tick = sim.step(SIM_DT);
    if (tick % SNAPSHOT_EVERY_TICKS !== 0) return;
    this.broadcast(MESSAGE.SNAPSHOT, {
      snapshot: sim.captureSnapshot()
    });
  }
  leave(socket) {
    const session = this.sessions.get(socket);
    if (!session) return;
    this.sessions.delete(socket);
    this.ensureSim().removePlayer(session.id);
    this.broadcast(MESSAGE.PEER_LEFT, {
      peerId: session.id,
      peers: this.peerList()
    });
    this.broadcastSnapshot();
    if (this.sessions.size === 0) this.stopTicking();
  }
  peerList() {
    return [...this.sessions.values()].map((session) => ({
      id: session.id,
      joinedAt: session.joinedAt,
      lastSeenAt: session.lastSeenAt
    }));
  }
  broadcastSnapshot() {
    this.broadcast(MESSAGE.SNAPSHOT, {
      snapshot: this.ensureSim().captureSnapshot()
    });
  }
  setRoomId(roomId) {
    if (this.roomId === roomId) return;
    this.roomId = roomId;
    this.seed = makeRoomSeed(roomId);
    this.caveData = null;
    this.sim = null;
  }
  ensureCave() {
    if (!this.caveData) {
      this.caveData = generateCave({
        seed: this.seed,
        width: 2e3,
        height: 2e3,
        profile: CaveProfile.CAVERNS,
        spawnCount: 4
      });
    }
    return this.caveData;
  }
  ensureSim() {
    if (!this.sim) {
      const caveData = this.ensureCave();
      this.sim = createArenaSimulation({
        seed: this.seed,
        grid: caveData.grid,
        spawns: caveData.spawns
      });
    }
    return this.sim;
  }
  startTicking() {
    if (this.tickTimer !== null) return;
    this.tickTimer = setTimeout(() => this.tickLoop(), SERVER_TICK_MS);
  }
  stopTicking() {
    if (this.tickTimer === null) return;
    clearTimeout(this.tickTimer);
    this.tickTimer = null;
  }
  tickLoop() {
    this.tickTimer = null;
    if (this.sessions.size === 0) return;
    try {
      this.step();
    } finally {
      if (this.sessions.size > 0) this.startTicking();
    }
  }
  send(socket, type, payload) {
    if (socket.readyState !== WebSocket.OPEN) return;
    socket.send(encodeMessage(type, payload));
  }
  broadcast(type, payload, except = null) {
    for (const socket of this.sessions.keys()) {
      if (socket !== except) this.send(socket, type, payload);
    }
  }
};
function websocketUrl(request, pathname) {
  const url = new URL(request.url);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = pathname;
  url.search = "";
  return url.toString();
}
__name(websocketUrl, "websocketUrl");
function json(body, init = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    ...init,
    headers: {
      ...JSON_HEADERS,
      ...init.headers || {}
    }
  });
}
__name(json, "json");

// ../../.cache/deno/npm/registry.npmjs.org/wrangler/4.107.1/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx2, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../.cache/deno/npm/registry.npmjs.org/wrangler/4.107.1/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx2, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-MPrF4L/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// ../../.cache/deno/npm/registry.npmjs.org/wrangler/4.107.1/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-MPrF4L/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  GameRoom,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
