"use strict";

const world = (() => {
  const unit = vector => {
    const length = Math.hypot(...vector) || 1;
    return vector.map(value => value / length);
  };
  const cross = ([ax, ay, az], [bx, by, bz]) => [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
  const subtract = (a, b) => a.map((v, i) => v - b[i]);
  const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
  const colorCache = new Map();

  function rgb(hex) {
    if (!colorCache.has(hex)) {
      const value = parseInt(hex.replace("#", ""), 16);
      colorCache.set(hex, [value >> 16, (value >> 8) & 255, value & 255].map(n => n / 255));
    }
    return colorCache.get(hex);
  }

  class Mesh {
    constructor() {
      this.data = [];
    }

    face(points, color, normal = unit(cross(subtract(points[1], points[0]), subtract(points[2], points[0])))) {
      const channels = rgb(color);
      for (let i = 1; i < points.length - 1; i++) {
        for (const vertex of [points[0], points[i], points[i + 1]]) {
          this.data.push(...vertex, ...normal, ...channels);
        }
      }
      return this;
    }

    flat(points, y, color) {
      return this.face(points.map(([x, z]) => [x, y, z]), color, [0, 1, 0]);
    }

    rect(x, y, z, w, d, color) {
      return this.flat([[x - w / 2, z - d / 2], [x + w / 2, z - d / 2],
        [x + w / 2, z + d / 2], [x - w / 2, z + d / 2]], y, color);
    }

    box(x, y, z, w, h, d, color, angle = 0) {
      const c = Math.cos(angle), s = Math.sin(angle);
      const corner = (a, b, e) => [x + a * c + e * s, y + b, z - a * s + e * c];
      const a = corner(-w / 2, 0, -d / 2), b = corner(w / 2, 0, -d / 2);
      const f = corner(-w / 2, 0, d / 2), g = corner(w / 2, 0, d / 2);
      const A = corner(-w / 2, h, -d / 2), B = corner(w / 2, h, -d / 2);
      const F = corner(-w / 2, h, d / 2), G = corner(w / 2, h, d / 2);
      return this.face([A, F, G, B], color).face([a, A, B, b], color)
        .face([f, g, G, F], color).face([a, f, F, A], color).face([b, B, G, g], color);
    }

    // Horizontal path markings are built from shared-width segments.
    line(a, b, width, y, color) {
      const [dx, dz] = subtract(b, a);
      const k = width / (2 * (Math.hypot(dx, dz) || 1));
      const x = dz * k, z = -dx * k;
      return this.flat([[a[0] + x, a[1] + z], [b[0] + x, b[1] + z],
        [b[0] - x, b[1] - z], [a[0] - x, a[1] - z]], y, color);
    }

    path(points, width, y, color) {
      for (let i = 1; i < points.length; i++) this.line(points[i - 1], points[i], width, y, color);
      return this;
    }

    ring(x, y, z, lower, upper, height, color, segments = 12) {
      const top = [];
      for (let i = 0; i < segments; i++) {
        const a = 2 * Math.PI * i / segments, b = 2 * Math.PI * (i + 1) / segments;
        const p = [x + upper * Math.cos(a), y + height, z + upper * Math.sin(a)];
        const q = [x + upper * Math.cos(b), y + height, z + upper * Math.sin(b)];
        top.push(p);
        this.face([[x + lower * Math.cos(a), y, z + lower * Math.sin(a)], p, q,
          [x + lower * Math.cos(b), y, z + lower * Math.sin(b)]], color);
      }
      if (upper) this.face(top, color, [0, 1, 0]);
      return this;
    }
  }

  const cameraX = unit([1, 0, 1]);
  const cameraZ = unit([-1, 1, 1]);
  const cameraY = cross(cameraZ, cameraX);
  const lightZ = unit([-0.48, 1, -0.69]);
  const lightX = unit(cross([0, 1, 0], lightZ));
  const lightY = cross(lightZ, lightX);

  function matrix(x, y, z, sizeX, sizeY, offsetX = 0, offsetY = 0) {
    return [x[0] / sizeX, y[0] / sizeY, -z[0] / 160, 0,
      x[1] / sizeX, y[1] / sizeY, -z[1] / 160, 0,
      x[2] / sizeX, y[2] / sizeY, -z[2] / 160, 0,
      offsetX, offsetY, 0, 1];
  }

  const modelSource = `
    uniform vec4 model;
    uniform float pitch;
    vec3 tilt(vec3 p) {
      float c = cos(pitch), s = sin(pitch);
      return vec3(p.x, c*p.y+s*p.z, -s*p.y+c*p.z);
    }
    vec3 turn(vec3 p) {
      float c = cos(model.w), s = sin(model.w);
      return vec3(c*p.x+s*p.z, p.y, -s*p.x+c*p.z);
    }
  `;

  function program(gl, vertex, fragment) {
    const result = gl.createProgram();
    for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, "#version 300 es\n" + source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      gl.attachShader(result, shader);
      gl.deleteShader(shader);
    }
    gl.linkProgram(result);
    if (!gl.getProgramParameter(result, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(result));
    return result;
  }

  function createRenderer(canvas) {
    const gl = canvas.getContext("webgl2", { antialias: true, alpha: false });
    if (!gl) throw new Error("WebGL 2 is unavailable");
    const scene = program(gl, `
      layout(location=0) in vec3 position;
      layout(location=1) in vec3 normal;
      layout(location=2) in vec3 color;
      uniform mat4 camera, sun;
      out vec3 vColor, vPosition, vNormal;
      out vec4 vShadow;
      ${modelSource}
      void main() {
        vec4 point = vec4(turn(tilt(position)) + model.xyz, 1.);
        vColor = color; vPosition = point.xyz; vNormal = turn(tilt(normal));
        vShadow = sun * point;
        gl_Position = camera * point;
      }
    `, `
      precision highp float;
      in vec3 vColor, vPosition, vNormal;
      in vec4 vShadow;
      uniform sampler2D depthMap;
      uniform vec3 light;
      out vec4 outputColor;
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      void main() {
        vec3 n = normalize(vNormal);
        float incidence = max(0., dot(n, light));
        vec3 p = vShadow.xyz * .5 + .5;
        float obscured = 0.;
        if (all(greaterThan(p.xy, vec2(.002))) && all(lessThan(p.xy, vec2(.998)))) {
          float bias = .00039 + (1. - incidence) * .00055;
          for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
            obscured += step(texture(depthMap, p.xy + vec2(float(x), float(y)) / 2048.).r + bias, p.z);
          }
        }
        float grain = (hash(floor(vPosition.xz * 12.)) - .5) * .040;
        float textureAmount = smoothstep(.96, 1., n.y) * (1. - smoothstep(.15, .7, vPosition.y));
        vec3 ambient = vec3(.745, .79, .815) + max(n.y, 0.) * .055;
        vec3 sunlight = vec3(.224, .205, .175) * incidence * (1. - .94 * obscured / 9.);
        outputColor = vec4((vColor + grain * textureAmount) * (ambient + sunlight), 1.);
      }
    `);
    const shadow = program(gl, `
      layout(location=0) in vec3 position;
      uniform mat4 sun;
      ${modelSource}
      void main() { gl_Position = sun * vec4(turn(tilt(position)) + model.xyz, 1.); }
    `, `precision highp float; void main() {}`);

    const locations = (p, names) => Object.fromEntries(names.map(name => [name, gl.getUniformLocation(p, name)]));
    const sceneLoc = locations(scene, ["camera", "sun", "light", "depthMap", "model", "pitch"]);
    const shadowLoc = locations(shadow, ["sun", "model", "pitch"]);
    const lightMatrix = matrix(lightX, lightY, lightZ, 90, 72);
    const depthMap = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, depthMap);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, 2048, 2048, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const buffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, buffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthMap, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("Shadow framebuffer is unavailable");
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const meshes = new WeakMap();
    function upload(mesh) {
      const vao = gl.createVertexArray();
      const vbo = gl.createBuffer();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.data), gl.STATIC_DRAW);
      for (let i = 0; i < 3; i++) {
        gl.enableVertexAttribArray(i);
        gl.vertexAttribPointer(i, 3, gl.FLOAT, false, 36, i * 12);
      }
      const drawable = {vao, count: mesh.data.length / 9};
      meshes.set(mesh, drawable);
      return drawable;
    }

    function draw(objects, uniform, shadows) {
      let bound = null;
      for (const object of objects) {
        if (shadows && object.castShadow === false) continue;
        const drawable = meshes.get(object.mesh) || upload(object.mesh);
        if (drawable !== bound) gl.bindVertexArray(drawable.vao);
        bound = drawable;
        gl.uniform4f(uniform.model, object.x || 0, object.y || 0, object.z || 0, object.angle || 0);
        gl.uniform1f(uniform.pitch, object.pitch || 0);
        gl.drawArrays(gl.TRIANGLES, 0, drawable.count);
      }
    }

    const view = {zoom: 1, x: 0, y: 0, scale: 1, width: 1, height: 1};
    function resize() {
      const width = canvas.clientWidth, height = canvas.clientHeight;
      const density = Math.min(window.devicePixelRatio || 1, 1.65);
      const pixelWidth = Math.max(1, Math.round(width * density));
      const pixelHeight = Math.max(1, Math.round(height * density));
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      Object.assign(view, {width, height, scale: Math.min(width / 138, height / 89) * view.zoom});
    }

    function project(x, y, z) {
      const point = [x, y, z];
      return [view.width * .495 + view.x + dot(cameraX, point) * view.scale,
        view.height * .51 + view.y - dot(cameraY, point) * view.scale];
    }

    function render(objects) {
      resize();
      const halfW = view.width / (2 * view.scale), halfH = view.height / (2 * view.scale);
      const viewMatrix = matrix(cameraX, cameraY, cameraZ, halfW, halfH,
        -.01 + 2 * view.x / view.width, -.02 - 2 * view.y / view.height);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, buffer);
      gl.viewport(0, 0, 2048, 2048);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.useProgram(shadow);
      gl.uniformMatrix4fv(shadowLoc.sun, false, lightMatrix);
      draw(objects, shadowLoc, true);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(.47, .55, .48, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(scene);
      gl.bindTexture(gl.TEXTURE_2D, depthMap);
      gl.uniform1i(sceneLoc.depthMap, 0);
      gl.uniformMatrix4fv(sceneLoc.camera, false, viewMatrix);
      gl.uniformMatrix4fv(sceneLoc.sun, false, lightMatrix);
      gl.uniform3fv(sceneLoc.light, lightZ);
      draw(objects, sceneLoc, false);
    }

    return {view, render, project};
  }

  return {Mesh, createRenderer};
})();
