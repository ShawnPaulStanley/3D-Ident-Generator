// Finds the canvas used for WebGL drawing.
const canvas = document.getElementById("glCanvas");
// Creates a WebGL context with anti-aliasing enabled.
const gl = canvas.getContext("webgl", { antialias: true });

// Stops execution when the browser cannot create WebGL.
if (!gl) {
    throw new Error("WebGL is not supported in this browser.");
}

// Transforms vertex positions using the animation matrix.
const vertexShaderSource = `
    attribute vec3 a_position;
    attribute vec4 a_color;
    attribute vec3 a_normal;
    uniform mat4 u_matrix;
    uniform mat4 u_model;
    uniform vec3 u_lightDirection;
    varying vec4 v_color;
    varying vec3 v_worldPosition;
    varying vec3 v_worldNormal;
    void main() {
        gl_Position = u_matrix * vec4(a_position, 1.0);
        v_worldPosition = (u_model * vec4(a_position, 1.0)).xyz;
        v_worldNormal = normalize((u_model * vec4(a_normal, 0.0)).xyz);
        v_color = a_color;
    }
`;
// Outputs the interpolated colour for each rendered fragment.
const fragmentShaderSource = `
    precision mediump float;
    varying vec4 v_color;
    varying vec3 v_worldPosition;
    varying vec3 v_worldNormal;
    uniform vec3 u_lightDirection;
    void main() {
        vec3 normal = normalize(v_worldNormal);
        vec3 light = normalize(u_lightDirection);
        vec3 viewDirection = normalize(-v_worldPosition);
        vec3 halfDirection = normalize(light + viewDirection);
        float diffuse = max(dot(normal, light), 0.0);
        float specular = pow(max(dot(normal, halfDirection), 0.0), 48.0);
        float lighting = 0.24 + diffuse * 0.62;
        vec3 glossyColor = v_color.rgb * lighting + vec3(1.0) * specular * 0.85;
        gl_FragColor = vec4(min(glossyColor, 1.0), v_color.a);
    }
`;

// Compiles one WebGL shader and reports compiler errors.
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

// Links the vertex and fragment shaders into one WebGL program.
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

// Creates the shader program used for every frame.
const program = createProgram();
// Finds the vertex-position attribute in the shader.
const positionLocation = gl.getAttribLocation(program, "a_position");
// Finds the vertex-colour attribute in the shader.
const colorLocation = gl.getAttribLocation(program, "a_color");
// Finds the transformation-matrix uniform in the shader.
const matrixLocation = gl.getUniformLocation(program, "u_matrix");
// Finds the model transform used for lighting positions and normals.
const modelLocation = gl.getUniformLocation(program, "u_model");
// Finds the directional-light uniform in the shader.
const lightDirectionLocation = gl.getUniformLocation(program, "u_lightDirection");
// Finds the per-face normal attribute in the shader.
const normalLocation = gl.getAttribLocation(program, "a_normal");
// Creates the GPU buffer containing vertex positions.
const positionBuffer = gl.createBuffer();
// Creates the GPU buffer containing vertex colours.
const colorBuffer = gl.createBuffer();
// Creates the GPU buffer containing vertex normals.
const normalBuffer = gl.createBuffer();

// Gets the animation dropdown element.
const animationInput = document.getElementById("animationInput");
// Gets the colour picker element.
const colorInput = document.getElementById("colorInput");
// Gets the extrusion-depth slider.
const depthInput = document.getElementById("depthInput");
// Gets the animation-speed slider.
const speedInput = document.getElementById("speedInput");
// Gets the displayed depth value.
const depthValue = document.getElementById("depthValue");
// Gets the displayed speed value.
const speedValue = document.getElementById("speedValue");
// Gets the play/pause button.
const playButton = document.getElementById("playButton");
// Gets the reset button.
const restartButton = document.getElementById("restartButton");

// Stores appearance values used to rebuild the USM mesh.
const settings = {
    color: colorInput.value,
    depth: Number(depthInput.value)
};
// Holds the current GPU-ready logo mesh.
let mesh = null;
// Tracks elapsed time in the selected animation timeline.
let sequenceTime = 0;
// Stores the previous frame timestamp for delta-time calculation.
let lastTime = 0;
// Indicates whether animation time is currently stopped.
let paused = false;
// Stores the user-selected animation speed multiplier.
let speed = Number(speedInput.value);
// Stores the selected animation mode.
let selectedAnimation = "all";
// Defines the required animation phases and their transforms.
const phases = [
    { name: "right", duration: 1.5, startRotation: 0, endRotation: Math.PI, startScale: 1, endScale: 1 },
    { name: "rightReturn", duration: 1.5, startRotation: Math.PI, endRotation: 0, startScale: 1, endScale: 1 },
    { name: "left", duration: 1.5, startRotation: 0, endRotation: -Math.PI, startScale: 1, endScale: 1 },
    { name: "leftReturn", duration: 1.5, startRotation: -Math.PI, endRotation: 0, startScale: 1, endScale: 1 },
    { name: "scale", duration: 2.5, startRotation: 0, endRotation: 0, startScale: 1, endScale: 1.8 },
    { name: "scaleDown", duration: 2.5, startRotation: 0, endRotation: 0, startScale: 1.8, endScale: 1.15 },
    { name: "move", duration: 2 * Math.PI / 0.8, startRotation: 0, endRotation: 0, startScale: 1.15, endScale: 1.15 },
    { name: "reset", duration: 1.5, startRotation: 2 * Math.PI, endRotation: 2 * Math.PI, startScale: 1.15, endScale: 1 }
];
// Calculates the full duration of one main-sequence cycle.
const sequenceDuration = phases.reduce((total, phase) => total + phase.duration, 0);

// Multiplies two column-major 4x4 transformation matrices.
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

// Creates a rotation matrix around the x-axis.
function rotationX(angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
}

// Creates a rotation matrix around the y-axis.
function rotationY(angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
}

// Creates a rotation matrix around the z-axis.
function rotationZ(angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

// Creates a uniform scale matrix.
function scaling(value) {
    return new Float32Array([value, 0, 0, 0, 0, value, 0, 0, 0, 0, value, 0, 0, 0, 0, 1]);
}

// Creates a translation matrix.
function translation(x, y, z) {
    return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
}

// Smooths movement so animation starts and ends gently.
function easeInOut(value) {
    return value < 0.5
        ? 2 * value * value
        : 1 - Math.pow(-2 * value + 2, 2) / 2;
}

// Rebuilds the hardcoded USM geometry after a visual setting changes.
function rebuildMesh() {
    // Generates the 2D coordinate triangles for USM.
    const triangles = usmToTriangles();
    // Extrudes the 2D triangles into a coloured 3D mesh.
    mesh = extrude2D(triangles, settings.depth, hexToRgb(settings.color));
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.colors, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);
}

// Returns the animation to its initial playable state.
function resetAnimation() {
    sequenceTime = 0;
    lastTime = 0;
    paused = false;
    playButton.textContent = "Pause";
}

// Interpolates rotation and scale within one animation phase.
function interpolatePhase(phase, time) {
    const progress = easeInOut(Math.min(time / phase.duration, 1));
    return {
        rotation: phase.startRotation + (phase.endRotation - phase.startRotation) * progress,
        scale: phase.startScale + (phase.endScale - phase.startScale) * progress,
        x: 0,
        y: 0
    };
}

// Calculates the gentle continuous movement after the sequence.
function getMovementTransform(time) {
    return {
        rotation: time * 0.8,
        rotationX: Math.sin(time * 0.4) * 0.25,
        scale: 1.15,
        x: Math.cos(time * 0.8) * 0.07,
        y: Math.sin(time * 0.8) * 0.05
    };
}

// Smoothly returns the logo to the centered starting state before looping.
function getResetTransform(time) {
    const progress = easeInOut(Math.min(time / 1.5, 1));
    return {
        rotation: 2 * Math.PI * progress,
        rotationX: 0,
        scale: 1.15 - 0.15 * progress,
        x: 0.07 * (1 - progress),
        y: 0.05 * (1 - progress)
    };
}

// Chooses the transform for the selected phase or complete sequence.
function getSequenceTransform() {
    if (selectedAnimation === "move") {
        return getMovementTransform(sequenceTime);
    }

    if (selectedAnimation === "reset") {
        return getResetTransform(sequenceTime % 1.5);
    }

    if (selectedAnimation !== "all") {
        const phase = phases.find(item => item.name === selectedAnimation);
        return interpolatePhase(phase, sequenceTime % phase.duration);
    }

    const cycleTime = sequenceTime % sequenceDuration;
    let remaining = cycleTime;
    for (const phase of phases) {
        if (remaining <= phase.duration) {
            if (phase.name === "move") {
                return getMovementTransform(remaining);
            }
            if (phase.name === "reset") {
                return getResetTransform(remaining);
            }
            return interpolatePhase(phase, remaining);
        }
        remaining -= phase.duration;
    }
    return { rotation: 0, scale: 1, x: 0, y: 0 };
}

// Matches the canvas drawing buffer to its displayed size and pixel density.
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

// Draws one animation frame and requests the next frame.
function draw(time) {
    // Updates the canvas dimensions before drawing.
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
        multiply(scaling(transform.scale), multiply(rotationY(transform.rotation), rotationX(transform.rotationX || 0)))
    );
    const matrix = multiply(aspectMatrix, model);

    gl.clearColor(0.01, 0.01, 0.015, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(program);
    gl.uniformMatrix4fv(matrixLocation, false, matrix);
    gl.uniformMatrix4fv(modelLocation, false, model);
    gl.uniform3f(lightDirectionLocation, -0.45, 0.7, 1.0);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.enableVertexAttribArray(colorLocation);
    gl.vertexAttribPointer(colorLocation, 4, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.enableVertexAttribArray(normalLocation);
    gl.vertexAttribPointer(normalLocation, 3, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.positions.length / 3);
    requestAnimationFrame(draw);
}

// Enables hidden-surface removal for the 3D mesh.
gl.enable(gl.DEPTH_TEST);
// Separates overlapping coplanar logo bars to prevent depth-buffer flicker.
gl.enable(gl.POLYGON_OFFSET_FILL);
gl.polygonOffset(-1, -1);

// Restarts when the user chooses a different animation mode.
animationInput.addEventListener("change", () => {
    selectedAnimation = animationInput.value;
    resetAnimation();
});
// Rebuilds the mesh when the logo colour changes.
colorInput.addEventListener("input", () => {
    settings.color = colorInput.value;
    rebuildMesh();
});
// Rebuilds the mesh when extrusion depth changes.
depthInput.addEventListener("input", () => {
    settings.depth = Number(depthInput.value);
    depthValue.value = settings.depth.toFixed(2);
    rebuildMesh();
});
// Updates the animation speed when the slider changes.
speedInput.addEventListener("input", () => {
    speed = Number(speedInput.value);
    speedValue.value = `${speed.toFixed(2)}x`;
});
// Toggles playback between paused and running states.
playButton.addEventListener("click", () => {
    paused = !paused;
    playButton.textContent = paused ? "Play" : "Pause";
});
// Resets the animation when the reset button is pressed.
restartButton.addEventListener("click", resetAnimation);
// Recalculates the viewport whenever the browser is resized.
window.addEventListener("resize", resize);

// Creates the initial mesh before the first frame.
rebuildMesh();
// Starts the browser's animation loop.
requestAnimationFrame(draw);
    // Uploads the position data to the GPU.
    // Uploads the colour data to the GPU.
        // Runs the movement phase independently from the main sequence.
        // Loops the selected individual phase.
    // Wraps time so the main sequence repeats continuously.
    // Finds the phase containing the current cycle time.
    // Calculates elapsed seconds since the previous frame.
    // Advances time only when playback is not paused.
    // Gets the current rotation, scale, and translation.
    // Corrects the model for the canvas aspect ratio.
    // Builds the final transformation matrix.
    // Clears the previous frame.
    // Selects the shader program and transformation matrix.
    // Binds position data to the vertex shader.
    // Binds colour data to the vertex shader.
    // Draws every triangle in the extruded logo.
