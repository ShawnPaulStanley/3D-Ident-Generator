const canvas = document.getElementById("glCanvas");
const gl = canvas.getContext("webgl", { antialias: true });

if (!gl) {
    throw new Error("WebGL is not supported in this browser.");
}

const vertexShaderSource = `
    attribute vec3 a_position;
    attribute vec4 a_color;
    uniform mat4 u_matrix;
    varying vec4 v_color;
    void main() {
        gl_Position = u_matrix * vec4(a_position, 1.0);
        v_color = a_color;
    }
`;
const fragmentShaderSource = `
    precision mediump float;
    varying vec4 v_color;
    void main() {
        gl_FragColor = v_color;
    }
`;

function createShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`Shader compilation failed: ${message}`);
    }
    return shader;
}

function createProgram() {
    const program = gl.createProgram();
    gl.attachShader(program, createShader(gl.VERTEX_SHADER, vertexShaderSource));
    gl.attachShader(program, createShader(gl.FRAGMENT_SHADER, fragmentShaderSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(`Program linking failed: ${gl.getProgramInfoLog(program)}`);
    }
    return program;
}

const program = createProgram();
const positionLocation = gl.getAttribLocation(program, "a_position");
const colorLocation = gl.getAttribLocation(program, "a_color");
const matrixLocation = gl.getUniformLocation(program, "u_matrix");
const positionBuffer = gl.createBuffer();
const colorBuffer = gl.createBuffer();
let mesh = null;
let settings = { text: "LAG", color: "#00ccff", depth: 0.2 };

function multiply(a, b) {
    const result = new Float32Array(16);
    for (let column = 0; column < 4; column++) {
        for (let row = 0; row < 4; row++) {
            result[column * 4 + row] =
                a[row] * b[column * 4] +
                a[4 + row] * b[column * 4 + 1] +
                a[8 + row] * b[column * 4 + 2] +
                a[12 + row] * b[column * 4 + 3];
        }
    }
    return result;
}

function rotationX(angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
}
function rotationY(angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
}
function rotationZ(angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}
function scaling(value) {
    return new Float32Array([value, 0, 0, 0, 0, value, 0, 0, 0, 0, value, 0, 0, 0, 0, 1]);
}
function translation(x, y, z) {
    return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
}

function easeInOut(value) {
    return value < 0.5 ? 2 * value * value : 1 - Math.pow(-2 * value + 2, 2) / 2;
}

const phases = [
    { name: "initial", duration: 0.8 },
    { name: "y", duration: 2.4 },
    { name: "x", duration: 2.4 },
    { name: "z", duration: 2.4 },
    { name: "combined", duration: 3.2 },
    { name: "tilt", duration: 2.6 },
    { name: "orbit", duration: 3.2 },
    { name: "bounce", duration: 2.4 },
    { name: "return", duration: 2.4 },
    { name: "scaleUp", duration: 2.2 },
    { name: "scaleDown", duration: 2.2 }
];
let phaseIndex = 0;
let phaseTime = 0;
let lastTime = 0;
let elapsed = 0;
let paused = false;
let speed = 1;
let selectedAnimation = "all";

function rebuildMesh() {
    const triangles = textToTriangles(settings.text || "LAG");
    mesh = extrude2D(triangles, settings.depth, hexToRgb(settings.color));
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.colors, gl.STATIC_DRAW);
}

function restart() {
    phaseIndex = 0;
    phaseTime = 0;
    elapsed = 0;
    paused = false;
    playButton.textContent = "Pause";
}

function transitionPhase() {
    phaseTime -= phases[phaseIndex].duration;
    phaseIndex = (phaseIndex + 1) % phases.length;
}

function getActivePhase() {
    if (selectedAnimation === "all") return phases[phaseIndex];
    if (selectedAnimation === "scale") {
        return { name: "scaleLoop", duration: 4.4 };
    }
    return { name: selectedAnimation, duration: 2.8 };
}

function getActiveProgress(activePhase) {
    return easeInOut(Math.min(phaseTime / activePhase.duration, 1));
}

function currentRotation() {
    const activePhase = getActivePhase();
    const phase = activePhase.name;
    const progress = getActiveProgress(activePhase);
    const halfTurn = Math.PI;
    let x = 0, y = 0, z = 0;
    const solo = selectedAnimation !== "all";
    if (phase === "y") y = solo ? Math.PI * 2 * progress : halfTurn * progress;
    if (phase === "x") {
        y = solo ? 0 : halfTurn;
        x = Math.PI * (solo ? 2 : 1) * progress;
    }
    if (phase === "z") {
        y = solo ? 0 : halfTurn;
        x = solo ? 0 : halfTurn;
        z = Math.PI * (solo ? 2 : 1) * progress;
    }
    if (phase === "combined") {
        const angle = Math.PI * (solo ? 2 : 1) * progress;
        x = solo ? angle : halfTurn + angle;
        y = solo ? angle : halfTurn + angle;
        z = solo ? angle : halfTurn + angle;
    }
    if (phase === "tilt") {
        x = halfTurn * 2 + Math.sin(progress * Math.PI) * 0.35;
        y = halfTurn * 2 + Math.sin(progress * Math.PI * 2) * 0.55;
        z = halfTurn * 2 + Math.sin(progress * Math.PI) * 0.7;
    }
    if (phase === "orbit") {
        x = halfTurn * 2 + Math.sin(progress * Math.PI * 2) * 0.35;
        y = halfTurn * 2 + progress * Math.PI * 2;
        z = Math.sin(progress * Math.PI * 2) * 0.25;
    }
    if (phase === "bounce") {
        x = halfTurn * 2;
        y = halfTurn * 2;
        z = Math.sin(progress * Math.PI * 4) * 0.16;
    }
    if (phase === "return") {
        x = Math.PI * 2 * (1 - progress);
        y = Math.PI * 2 * (1 - progress);
        z = Math.PI * 2 * (1 - progress);
    }
    return multiply(rotationZ(z), multiply(rotationY(y), rotationX(x)));
}

function currentScale() {
    const activePhase = getActivePhase();
    const phase = activePhase.name;
    const progress = getActiveProgress(activePhase);
    if (phase === "bounce") return 1 + Math.sin(progress * Math.PI * 2) * 0.08;
    if (phase === "scaleLoop") return 1 + (1 - Math.cos(progress * Math.PI * 2)) * 0.275;
    if (phase === "scaleUp") return 1 + progress * 0.55;
    if (phase === "scaleDown") return 1.55 - progress * 0.55;
    return 1;
}

function currentTranslation() {
    const activePhase = getActivePhase();
    const phase = activePhase.name;
    const progress = getActiveProgress(activePhase);
    if (phase === "orbit") {
        const angle = progress * Math.PI * 2;
        return translation(Math.cos(angle) * 0.16, Math.sin(angle) * 0.1, 0);
    }
    if (phase === "bounce") {
        return translation(0, Math.sin(progress * Math.PI * 2) * 0.12, 0);
    }
    return translation(0, 0, 0);
}

function resize() {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.floor(canvas.clientWidth * pixelRatio);
    const height = Math.floor(canvas.clientHeight * pixelRatio);
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
}

function draw(time) {
    resize();
    const delta = lastTime ? Math.min((time - lastTime) / 1000, 0.1) : 0;
    lastTime = time;
    if (!paused) {
        phaseTime += delta * speed;
        elapsed += delta;
        if (selectedAnimation === "all") {
            if (phaseTime >= phases[phaseIndex].duration) transitionPhase();
        } else if (phaseTime >= getActivePhase().duration) {
            phaseTime %= getActivePhase().duration;
        }
    }

    const aspect = canvas.width / canvas.height;
    const aspectMatrix = aspect >= 1
        ? scaling(1 / aspect)
        : new Float32Array([1, 0, 0, 0, 0, aspect, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const matrix = multiply(
        aspectMatrix,
        multiply(currentTranslation(), multiply(scaling(currentScale()), currentRotation()))
    );

    gl.clearColor(0.01, 0.01, 0.015, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (mesh) {
        gl.useProgram(program);
        gl.uniformMatrix4fv(matrixLocation, false, matrix);
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
        gl.enableVertexAttribArray(colorLocation);
        gl.vertexAttribPointer(colorLocation, 4, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, mesh.positions.length / 3);
    }
    requestAnimationFrame(draw);
}

gl.enable(gl.DEPTH_TEST);
gl.enable(gl.CULL_FACE);

const textInput = document.getElementById("textInput");
const animationInput = document.getElementById("animationInput");
const colorInput = document.getElementById("colorInput");
const depthInput = document.getElementById("depthInput");
const speedInput = document.getElementById("speedInput");
const depthValue = document.getElementById("depthValue");
const speedValue = document.getElementById("speedValue");
const playButton = document.getElementById("playButton");
const restartButton = document.getElementById("restartButton");
const fullscreenButton = document.getElementById("fullscreenButton");

textInput.addEventListener("change", () => { settings.text = textInput.value.trim() || "LAG"; rebuildMesh(); });
animationInput.addEventListener("change", () => {
    selectedAnimation = animationInput.value;
    restart();
});
colorInput.addEventListener("input", () => { settings.color = colorInput.value; rebuildMesh(); });
depthInput.addEventListener("input", () => {
    settings.depth = Number(depthInput.value);
    depthValue.value = settings.depth.toFixed(2);
    rebuildMesh();
});
speedInput.addEventListener("input", () => {
    speed = Number(speedInput.value);
    speedValue.value = `${speed.toFixed(2)}x`;
});
playButton.addEventListener("click", () => {
    paused = !paused;
    playButton.textContent = paused ? "Play" : "Pause";
});
restartButton.addEventListener("click", restart);
fullscreenButton.addEventListener("click", () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
});
window.addEventListener("resize", resize);

rebuildMesh();
requestAnimationFrame(draw);
