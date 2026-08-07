function shader(gl, type, source) {
  const handle = gl.createShader(type);
  if (!handle) throw new Error('WebGL could not allocate a shader');
  gl.shaderSource(handle, source);
  gl.compileShader(handle);
  if (!gl.getShaderParameter(handle, gl.COMPILE_STATUS)) {
    const details = gl.getShaderInfoLog(handle) || 'unknown shader error';
    gl.deleteShader(handle);
    throw new Error(`WebGL shader compilation failed: ${details}`);
  }
  return handle;
}

export function createWebGLDevice(canvas, { pixelRatio = () => devicePixelRatio || 1 } = {}) {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: true });
  if (!gl) throw new Error('Hack Arena requires WebGL2');
  const resources = [];

  function program(vertexSource, fragmentSource) {
    const vertex = shader(gl, gl.VERTEX_SHADER, vertexSource);
    const fragment = shader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    const handle = gl.createProgram();
    if (!handle) throw new Error('WebGL could not allocate a program');
    gl.attachShader(handle, vertex);
    gl.attachShader(handle, fragment);
    gl.linkProgram(handle);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(handle, gl.LINK_STATUS)) {
      const details = gl.getProgramInfoLog(handle) || 'unknown link error';
      gl.deleteProgram(handle);
      throw new Error(`WebGL program linking failed: ${details}`);
    }
    resources.push(() => gl.deleteProgram(handle));
    return handle;
  }

  function buffer(target, data, usage = gl.STATIC_DRAW) {
    const handle = gl.createBuffer();
    if (!handle) throw new Error('WebGL could not allocate a buffer');
    gl.bindBuffer(target, handle);
    gl.bufferData(target, data, usage);
    resources.push(() => gl.deleteBuffer(handle));
    return handle;
  }

  function vertexArray() {
    const handle = gl.createVertexArray();
    if (!handle) throw new Error('WebGL could not allocate a vertex array');
    resources.push(() => gl.deleteVertexArray(handle));
    return handle;
  }

  function texture2D({ width, height, data = null, internalFormat = gl.RGBA8, format = gl.RGBA, type = gl.UNSIGNED_BYTE, filter = gl.NEAREST }) {
    const handle = gl.createTexture();
    if (!handle) throw new Error('WebGL could not allocate a texture');
    gl.bindTexture(gl.TEXTURE_2D, handle);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, data);
    resources.push(() => gl.deleteTexture(handle));
    return handle;
  }

  function textureFromSource(source, { filter = gl.LINEAR, flipY = true } = {}) {
    const handle = gl.createTexture();
    if (!handle) throw new Error('WebGL could not allocate a texture');
    gl.bindTexture(gl.TEXTURE_2D, handle);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flipY);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    resources.push(() => gl.deleteTexture(handle));
    return handle;
  }

  function resize() {
    const ratio = Math.max(1, Number(pixelRatio()) || 1);
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    return { width, height, ratio };
  }

  function dispose() {
    while (resources.length) resources.pop()();
  }

  return Object.freeze({ gl, program, buffer, vertexArray, texture2D, textureFromSource, resize, dispose });
}
