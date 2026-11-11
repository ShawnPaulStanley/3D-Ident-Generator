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

const textInput = document.getElementById("textInput");
const colorInput = document.getElementById("colorInput");
const depthInput = document.getElementById("depthInput");
const speedInput = document.getElementById("speedInput");
const depthValue = document.getElementById("depthValue");
const speedValue = document.getElementById("speedValue");
const playButton = document.getElementById("playButton");
const restartButton = document.getElementById("restartButton");

const settings = {
    text: textInput.value.trim() || "USM",
    color: colorInput.value,
    depth: Number(depthInput.value)
};
let mesh = null;
let sequenceTime = 0;
let lastTime = 0;
let paused = false;
let speed = Number(speedInput.value);
const phases = [
    { duration: 1.5, startRotation: 0, endRotation: Math.PI, startScale: 1, endScale: 1 },
    { duration: 1.5, startRotation: Math.PI, endRotation: 0, startScale: 1, endScale: 1 },
    { duration: 1.5, startRotation: 0, endRotation: -Math.PI, startScale: 1, endScale: 1 },
    { duration: 1.5, startRotation: -Math.PI, endRotation: 0, startScale: 1, endScale: 1 },
    { duration: 2.5, startRotation: 0, endRotation: 0, startScale: 1, endScale: 1.8 }
];
const sequenceDuration = phases.reduce((total, phase) => total + phase.duration, 0);

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
    return value < 0.5
        ? 2 * value * value
        : 1 - Math.pow(-2 * value + 2, 2) / 2;
}

function rebuildMesh() {
    const triangles = textToTriangles((settings.text || "USM").toUpperCase());
    mesh = extrude2D(triangles, settings.depth, hexToRgb(settings.color));
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.colors, gl.STATIC_DRAW);
}

function resetAnimation() {
    sequenceTime = 0;
    lastTime = 0;
    paused = false;
    playButton.textContent = "Pause";
}

function getSequenceTransform() {
    if (sequenceTime >= sequenceDuration) {
        const movementTime = sequenceTime - sequenceDuration;
        return {
            rotation: Math.sin(movementTime * 0.9) * 0.35,
            scale: 1.8,
            x: Math.cos(movementTime * 0.7) * 0.08,
            y: Math.sin(movementTime * 1.1) * 0.08
        };
    }

    let remaining = sequenceTime;
    for (const phase of phases) {
        if (remaining <= phase.duration) {
            const progress = easeInOut(remaining / phase.duration);
            return {
                rotation: phase.startRotation + (phase.endRotation - phase.startRotation) * progress,
                scale: phase.startScale + (phase.endScale - phase.startScale) * progress,
                x: 0,
                y: 0
            };
        }
        remaining -= phase.duration;
    }
    return { rotation: 0, scale: 1, x: 0, y: 0 };
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
        sequenceTime += delta * speed;
    }

    const transform = getSequenceTransform();
    const aspect = canvas.width / canvas.height;
    const aspectMatrix = aspect >= 1
        ? scaling(1 / aspect)
        : new Float32Array([1, 0, 0, 0, 0, aspect, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const model = multiply(
        translation(transform.x, transform.y, 0),
        multiply(scaling(transform.scale), multiply(rotationY(transform.rotation), rotationX(0)))
    );
    const matrix = multiply(aspectMatrix, model);

    gl.clearColor(0.01, 0.01, 0.015, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(program);
    gl.uniformMatrix4fv(matrixLocation, false, matrix);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.enableVertexAttribArray(colorLocation);
    gl.vertexAttribPointer(colorLocation, 4, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.positions.length / 3);
    requestAnimationFrame(draw);
}

gl.enable(gl.DEPTH_TEST);
gl.enable(gl.CULL_FACE);

textInput.addEventListener("input", () => {
    settings.text = textInput.value.trim() || "USM";
    rebuildMesh();
});
colorInput.addEventListener("input", () => {
    settings.color = colorInput.value;
    rebuildMesh();
});
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
restartButton.addEventListener("click", resetAnimation);
window.addEventListener("resize", resize);

rebuildMesh();
requestAnimationFrame(draw);
