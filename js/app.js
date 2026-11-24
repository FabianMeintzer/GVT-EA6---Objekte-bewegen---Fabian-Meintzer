
/* Vier Kugeln fliegen auf Kreisbahnen durch einen drehenden Torus */


var app = (function () {

  var canvas, gl, prog;

  var models = [];
  var torusModel;
  var sphereModels = [];

  // Torus-Geometrie hat R = 0.5 und r = 0.2, wird mit 2 skaliert
  var TORUS_SCALE = 2;
  var TORUS_R = 0.5 * TORUS_SCALE;
  var TORUS_r = 0.2 * TORUS_SCALE;
  var SPHERE_RADIUS = 0.3;
  var HEIGHT = 1.8;

  var SPHERE_COLORS = [
    [0.87, 0.36, 0.41, 1],
    [0.36, 0.44, 0.84, 1],
    [0.29, 0.74, 0.66, 1],
    [0.98, 0.76, 0.36, 1]
  ];

  var motion = {
    angle : 0,
    step : Math.PI / 36,
    speed : 2 * Math.PI / 8,
    running : true,
    lastTime : null,
    frameId : null
  };

  var camera = {
    eye : [0, 3.6, 5.6],
    center : [0, 1.4, 0],
    up : [0, 1, 0],
    aspect : 1,
    zAngle : Math.PI / 5,
    distance : 5.6,
    fovy : 60 * Math.PI / 180,
    near : 0.5,
    far : 40,
    vMatrix : mat4.create(),
    pMatrix : mat4.create()
  };

  var START_ANGLE = camera.zAngle;
  var START_DISTANCE = camera.distance;
  var START_HEIGHT = camera.eye[1];

  var LIMITS = {
    distanceMin : 3, distanceMax : 14,
    heightMin : 0.3, heightMax : 10,
    deltaRotate : Math.PI / 36,
    deltaHeight : 0.3,
    deltaDistance : 0.5
  };

  function start() {
    try {
      init();
      moveTo(0);
      render();
      if (motion.running) {
        motion.frameId = requestAnimationFrame(loop);
      }
    } catch (error) {
      showFatal('Die Anwendung konnte nicht gestartet werden: ' + error.message);
      console.error(error);
    }
  }

  function init() {
    initWebGL();
    initShaderProgram();
    initUniforms();
    initModels();
    initPipeline();
    initEventHandler();
    updateControls();
  }

  function initWebGL() {
    canvas = document.getElementById('canvas');
    gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) {
      throw new Error('WebGL wird nicht unterstützt.');
    }
  }

  function initShaderProgram() {
    var vs = initShader(gl.VERTEX_SHADER, 'vertexshader');
    var fs = initShader(gl.FRAGMENT_SHADER, 'fragmentshader');

    prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, 'aPosition');
    gl.linkProgram(prog);

    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('Shader-Programm: ' + gl.getProgramInfoLog(prog));
    }
    gl.useProgram(prog);
  }

  function initShader(shaderType, sourceTagId) {
    var shader = gl.createShader(shaderType);
    var source = document.getElementById(sourceTagId).text;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(sourceTagId + ': ' + gl.getShaderInfoLog(shader));
    }
    return shader;
  }

  function initUniforms() {
    prog.pMatrixUniform = gl.getUniformLocation(prog, 'uPMatrix');
    prog.mvMatrixUniform = gl.getUniformLocation(prog, 'uMVMatrix');
    prog.nMatrixUniform = gl.getUniformLocation(prog, 'uNMatrix');
    prog.colorUniform = gl.getUniformLocation(prog, 'uColor');
  }

  function initModels() {
    var s = SPHERE_RADIUS;
    var t = TORUS_SCALE;

    createModel('plane', 'wireframe', [0.70, 0.77, 0.86, 1], [0, 0, 0], [0, 0, 0], [1, 1, 1]);
    torusModel = createModel('torus', 'fillwireframe', [0.80, 0.82, 0.86, 1],
      [0, HEIGHT, 0], [0, 0, 0], [t, t, t]);

    for (var k = 0; k < 4; k++) {
      sphereModels.push(createModel('sphere', 'fill', SPHERE_COLORS[k],
        [0, HEIGHT, 0], [0, 0, 0], [s, s, s]));
    }
  }

  function createModel(geometryname, fillstyle, color, translate, rotate, scale) {
    var model = {};
    model.fillstyle = fillstyle;
    model.color = color;
    initDataAndBuffers(model, geometryname);
    initTransformations(model, translate, rotate, scale);

    models.push(model);
    return model;
  }

  function initTransformations(model, translate, rotate, scale) {
    model.translate = translate;
    model.rotate = rotate;
    model.scale = scale;

    model.mMatrix = mat4.create();
    model.mvMatrix = mat4.create();
    model.nMatrix = mat3.create();
  }

  function initDataAndBuffers(model, geometryname) {
    window[geometryname]['createVertexData'].apply(model);

    model.vboPos = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, model.vboPos);
    gl.bufferData(gl.ARRAY_BUFFER, model.vertices, gl.STATIC_DRAW);
    prog.positionAttrib = gl.getAttribLocation(prog, 'aPosition');
    gl.enableVertexAttribArray(prog.positionAttrib);

    model.vboNormal = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, model.vboNormal);
    gl.bufferData(gl.ARRAY_BUFFER, model.normals, gl.STATIC_DRAW);
    prog.normalAttrib = gl.getAttribLocation(prog, 'aNormal');
    gl.enableVertexAttribArray(prog.normalAttrib);

    model.iboLines = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model.iboLines);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, model.indicesLines, gl.STATIC_DRAW);
    model.iboLines.numberOfElements = model.indicesLines.length;

    model.iboTris = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model.iboTris);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, model.indicesTris, gl.STATIC_DRAW);
    model.iboTris.numberOfElements = model.indicesTris.length;

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
  }

  function initPipeline() {
    gl.clearColor(0.95, 0.95, 0.95, 1);

    gl.frontFace(gl.CCW);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(0.5, 0);

    resizeCanvas();
  }

  function initEventHandler() {
    window.onkeydown = function (evt) {
      var sign = evt.shiftKey ? -1 : 1;
      var handled = true;

      switch (evt.key) {
        case 'k':
        case 'K':
          schritt(sign);
          break;
        case 'a':
        case 'A':
          toggleAnimation();
          break;
        case 'ArrowLeft':
          drehen(-1);
          break;
        case 'ArrowRight':
          drehen(1);
          break;
        case 'ArrowUp':
          hoehe(1);
          break;
        case 'ArrowDown':
          hoehe(-1);
          break;
        case 'n':
        case 'N':
          zoom(sign);
          break;
        case 'r':
        case 'R':
          resetView();
          break;
        default:
          handled = false;
      }

      if (handled) {
        evt.preventDefault();
      }
    };

    var resize = function () {
      resizeCanvas();
      render();
    };
    window.addEventListener('resize', resize);
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(resize).observe(canvas);
    }
  }

  // Kreisbahn der Kugel k, Mittelpunkt im Abstand R zur Torusmitte
  function spherePosition(k, alpha) {
    var psi = k * Math.PI / 2;
    return [
      TORUS_R * Math.cos(psi) + TORUS_R * Math.cos(alpha),
      HEIGHT,
      TORUS_R * Math.sin(psi) - TORUS_R * Math.sin(alpha)
    ];
  }

  // Torus dreht mit dem gleichen Winkel, damit das Loch in Flugrichtung zeigt
  function moveTo(alpha) {
    var full = 2 * Math.PI;
    motion.angle = ((alpha % full) + full) % full;

    for (var k = 0; k < sphereModels.length; k++) {
      sphereModels[k].translate = spherePosition(k, motion.angle);
    }
    torusModel.rotate[1] = motion.angle;
  }

  function schritt(dir) {
    moveTo(motion.angle + (dir || 1) * motion.step);
    render();
  }

  function loop(time) {
    if (motion.lastTime !== null) {
      var dt = Math.min((time - motion.lastTime) / 1000, 0.1);
      moveTo(motion.angle + motion.speed * dt);
    }
    motion.lastTime = time;
    render();
    motion.frameId = requestAnimationFrame(loop);
  }

  function toggleAnimation() {
    motion.running = !motion.running;

    if (motion.running) {
      motion.lastTime = null;
      motion.frameId = requestAnimationFrame(loop);
    } else {
      cancelAnimationFrame(motion.frameId);
      render();
    }
    updateControls();
  }

  function drehen(dir) {
    camera.zAngle += dir * LIMITS.deltaRotate;
    render();
  }

  function hoehe(dir) {
    camera.eye[1] = clamp(camera.eye[1] + dir * LIMITS.deltaHeight,
      LIMITS.heightMin, LIMITS.heightMax);
    render();
  }

  function zoom(dir) {
    camera.distance = clamp(camera.distance + dir * LIMITS.deltaDistance,
      LIMITS.distanceMin, LIMITS.distanceMax);
    render();
  }

  function resetView() {
    camera.zAngle = START_ANGLE;
    camera.distance = START_DISTANCE;
    camera.eye[1] = START_HEIGHT;
    render();
  }

  function calculateCameraOrbit() {
    var x = 0, z = 2;
    camera.eye[x] = camera.center[x] + camera.distance * Math.sin(camera.zAngle);
    camera.eye[z] = camera.center[z] + camera.distance * Math.cos(camera.zAngle);
  }

  function setProjection() {
    mat4.perspective(camera.pMatrix, camera.fovy, camera.aspect, camera.near, camera.far);
    gl.uniformMatrix4fv(prog.pMatrixUniform, false, camera.pMatrix);
  }

  function render() {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    setProjection();
    calculateCameraOrbit();
    mat4.lookAt(camera.vMatrix, camera.eye, camera.center, camera.up);

    for (var i = 0; i < models.length; i++) {
      updateTransformations(models[i]);

      gl.uniformMatrix4fv(prog.mvMatrixUniform, false, models[i].mvMatrix);
      gl.uniformMatrix3fv(prog.nMatrixUniform, false, models[i].nMatrix);
      gl.uniform4fv(prog.colorUniform, models[i].color);

      draw(models[i]);
    }

    infosAktualisieren();
  }

  function updateTransformations(model) {
    var mMatrix = model.mMatrix;
    var mvMatrix = model.mvMatrix;

    mat4.identity(mMatrix);
    mat4.identity(mvMatrix);

    mat4.translate(mMatrix, mMatrix, model.translate);
    mat4.rotateX(mMatrix, mMatrix, model.rotate[0]);
    mat4.rotateY(mMatrix, mMatrix, model.rotate[1]);
    mat4.rotateZ(mMatrix, mMatrix, model.rotate[2]);
    mat4.scale(mMatrix, mMatrix, model.scale);

    mat4.multiply(mvMatrix, camera.vMatrix, mMatrix);
    mat3.normalFromMat4(model.nMatrix, mvMatrix);
  }

  function draw(model) {
    gl.bindBuffer(gl.ARRAY_BUFFER, model.vboPos);
    gl.vertexAttribPointer(prog.positionAttrib, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, model.vboNormal);
    gl.vertexAttribPointer(prog.normalAttrib, 3, gl.FLOAT, false, 0, 0);

    var fill = (model.fillstyle.search(/fill/) !== -1);
    if (fill) {
      gl.enableVertexAttribArray(prog.normalAttrib);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model.iboTris);
      gl.drawElements(gl.TRIANGLES, model.iboTris.numberOfElements, gl.UNSIGNED_SHORT, 0);
    }

    var wireframe = (model.fillstyle.search(/wireframe/) !== -1);
    if (wireframe) {
      gl.disableVertexAttribArray(prog.normalAttrib);
      gl.vertexAttrib3f(prog.normalAttrib, 0, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model.iboLines);
      gl.drawElements(gl.LINES, model.iboLines.numberOfElements, gl.UNSIGNED_SHORT, 0);
    }
  }

  function resizeCanvas() {
    var scale = Math.min(2, window.devicePixelRatio || 1);
    var width = Math.max(1, Math.round(canvas.clientWidth * scale));
    var height = Math.max(1, Math.round(canvas.clientHeight * scale));

    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    camera.aspect = canvas.width / canvas.height;
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function minSphereGap() {
    var min = Infinity;
    for (var i = 0; i < sphereModels.length; i++) {
      for (var j = i + 1; j < sphereModels.length; j++) {
        var a = sphereModels[i].translate, b = sphereModels[j].translate;
        var d = Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2) + Math.pow(a[2] - b[2], 2));
        min = Math.min(min, d - 2 * SPHERE_RADIUS);
      }
    }
    return min;
  }

  // Kugelmittelpunkt in das gedrehte Torus-System zurückdrehen und Abstand zum Rohr berechnen
  function minTorusGap() {
    var min = Infinity;
    var c = Math.cos(motion.angle), s = Math.sin(motion.angle);
    for (var k = 0; k < sphereModels.length; k++) {
      var p = sphereModels[k].translate;
      var x = c * p[0] - s * p[2];
      var y = p[1] - HEIGHT;
      var z = s * p[0] + c * p[2];
      var ring = Math.sqrt(x * x + y * y) - TORUS_R;
      var d = Math.sqrt(ring * ring + z * z) - TORUS_r - SPHERE_RADIUS;
      min = Math.min(min, d);
    }
    return min;
  }

  function updateControls() {
    var knopf = document.getElementById('btnAnimation');
    knopf.innerHTML = motion.running ? 'Pause' : 'Start';
    knopfSetzen('btnAnimation', motion.running);
  }

  function knopfSetzen(id, an) {
    var knopf = document.getElementById(id);
    if (!knopf) return;
    knopf.style.background = an ? '#2b6cb0' : '#4a5568';
    knopf.style.color = an ? '#ffffff' : '#dbe4ee';
  }

  function infosAktualisieren() {
    var grad = motion.angle * 180 / Math.PI;

    var html = '<h3>Kugeln auf Kreisbahnen, Torus dreht um Y</h3>';

    html += '<p class="formel">X = R &middot; cos(&psi;) + R &middot; cos(&alpha;)<br>'
          + 'Z = R &middot; sin(&psi;) - R &middot; sin(&alpha;)<br>Y = Höhe, Torus: rotateY(&alpha;)'
          + '<br><span class="klein">mit R = Ringradius des Torus, &psi; = 0&deg;, 90&deg;, 180&deg;, 270&deg;</span></p>';

    html += '<p><b>Animation:</b> ' + (motion.running ? 'läuft' : 'pausiert')
          + ', &alpha; = ' + grad.toFixed(0) + '&deg;<br>'
          + '<b>Abstand Kugel/Kugel:</b> ' + minSphereGap().toFixed(2) + '<br>'
          + '<b>Abstand Kugel/Torus:</b> ' + minTorusGap().toFixed(2) + '</p>';

    html += '<p>Die Kreisbahnen liegen um 90&deg; versetzt um die Torusmitte und gehen alle '
          + 'durch das Loch. Da alle Kugeln den gleichen Winkel haben, bleibt ihr Abstand '
          + 'zueinander gleich. Der Torus dreht sich mit, dadurch zeigt das Loch immer in '
          + 'Flugrichtung und die Kugeln berühren ihn nicht.</p>';

    document.getElementById('info').innerHTML = html;
  }

  function showFatal(text) {
    var box = document.getElementById('webgl-error');
    if (!box) return;
    box.textContent = text;
    box.hidden = false;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }


  return {
    start : start,
    schritt : schritt,
    toggleAnimation : toggleAnimation,
    drehen : drehen,
    hoehe : hoehe,
    zoom : zoom,
    resetView : resetView
  };

}());
