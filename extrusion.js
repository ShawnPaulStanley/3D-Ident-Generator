// Converts a hexadecimal colour string into WebGL-friendly RGB values.
function hexToRgb(hex) {
    const value = hex.replace("#", "");
    return [
        parseInt(value.slice(0, 2), 16) / 255,
        parseInt(value.slice(2, 4), 16) / 255,
        parseInt(value.slice(4, 6), 16) / 255
    ];
}

// Creates a shaded RGBA colour by multiplying an RGB colour by a brightness amount.
function scaleColor(color, amount) {
    return [
        color[0] * amount,
        color[1] * amount,
        color[2] * amount,
        1
    ];
}

// Converts 2D triangle coordinates into a coloured, extruded 3D mesh.
function extrude2D(vertices2D, depth, baseColor) {
    // Places the front and back faces equally around the origin on the z-axis.
    const z = depth / 2;
    // Stores all generated vertex positions for WebGL.
    const positions = [];
    // Stores one RGBA colour for every generated vertex.
    const colors = [];
    // Stores one face normal for every generated vertex.
    const normals = [];
    // Uses the brightest colour for the front face.
    const frontColor = scaleColor(baseColor, 1.0);
    // Darkens the rear face to show depth.
    const backColor = scaleColor(baseColor, 0.62);
    // Darkens the side faces to create a simple 3D shading effect.
    const sideColor = scaleColor(baseColor, 0.38);
    // Tracks shared edges so only outer edges receive side faces.
    const edges = new Map();

    // Appends one triangle and its repeated colour values to the mesh arrays.
    function addTriangle(vertices, color) {
        positions.push(...vertices);
        for (let i = 0; i < 3; i++) colors.push(...color);

        const ab = [
            vertices[3] - vertices[0],
            vertices[4] - vertices[1],
            vertices[5] - vertices[2]
        ];
        const ac = [
            vertices[6] - vertices[0],
            vertices[7] - vertices[1],
            vertices[8] - vertices[2]
        ];
        const normal = [
            ab[1] * ac[2] - ab[2] * ac[1],
            ab[2] * ac[0] - ab[0] * ac[2],
            ab[0] * ac[1] - ab[1] * ac[0]
        ];
        const length = Math.hypot(normal[0], normal[1], normal[2]) || 1;
        for (let i = 0; i < 3; i++) {
            normals.push(normal[0] / length, normal[1] / length, normal[2] / length);
        }
    }

    // Creates a stable string key for matching nearby 2D edge endpoints.
    function key(x, y) {
        return `${Math.round(x * 100000)},${Math.round(y * 100000)}`;
    }

    // Reads each group of six values as one 2D triangle.
    for (let i = 0; i < vertices2D.length; i += 6) {
        // Stores the triangle's three 2D points.
        const a = [vertices2D[i], vertices2D[i + 1]];
        const b = [vertices2D[i + 2], vertices2D[i + 3]];
        const c = [vertices2D[i + 4], vertices2D[i + 5]];

        // Adds the front-facing triangle.
        addTriangle([
            a[0], a[1], z,
            b[0], b[1], z,
            c[0], c[1], z
        ], frontColor);

        // Adds the reversed back-facing triangle.
        addTriangle([
            a[0], a[1], -z,
            c[0], c[1], -z,
            b[0], b[1], -z
        ], backColor);

        // Records each triangle edge for boundary detection.
        for (const [p, q] of [[a, b], [b, c], [c, a]]) {
            const kp = key(p[0], p[1]);
            const kq = key(q[0], q[1]);
            const edgeKey = kp < kq ? `${kp}|${kq}` : `${kq}|${kp}`;

            if (!edges.has(edgeKey)) {
                edges.set(edgeKey, { a: p, b: q, count: 1 });
            } else {
                edges.get(edgeKey).count++;
            }
        }
    }

    // Builds side faces only for edges used by one triangle.
    for (const edge of edges.values()) {
        if (edge.count !== 1) continue;

        const a = edge.a;
        const b = edge.b;
        // Adds the first side triangle.
        addTriangle([
            a[0], a[1], z,
            b[0], b[1], z,
            a[0], a[1], -z
        ], sideColor);
        // Adds the second side triangle to complete the rectangular wall.
        addTriangle([
            a[0], a[1], -z,
            b[0], b[1], z,
            b[0], b[1], -z
        ], sideColor);
    }

    // Returns typed arrays suitable for WebGL buffer uploads.
    return {
        positions: new Float32Array(positions),
        colors: new Float32Array(colors),
        normals: new Float32Array(normals)
    };
}

// Adds two triangles that form an axis-aligned rectangular bar.
function addRectangleTriangles(triangles, left, bottom, right, top) {
    triangles.push(
        left, top, right, top, left, bottom,
        left, bottom, right, top, right, bottom
    );
}

// Adds two triangles around a line segment to create a thick angled bar.
function addSegmentTriangles(triangles, x1, y1, x2, y2, width) {
    // Calculates the segment direction.
    const dx = x2 - x1;
    const dy = y2 - y1;
    // Measures the segment so its perpendicular offset can be normalized.
    const length = Math.hypot(dx, dy);
    // Calculates the perpendicular half-width of the bar.
    const offsetX = (dy / length) * width / 2;
    const offsetY = (dx / length) * width / 2;

    // Adds the two triangles making up the angled bar.
    triangles.push(
        x1 - offsetX, y1 + offsetY,
        x2 - offsetX, y2 + offsetY,
        x1 + offsetX, y1 - offsetY,
        x1 + offsetX, y1 - offsetY,
        x2 - offsetX, y2 + offsetY,
        x2 + offsetX, y2 - offsetY
    );
}

// Builds the hardcoded USM logo from coordinate-based bars and segments.
function usmToTriangles() {
    // Defines shared letter proportions and spacing.
    const triangles = [];
    const W = 0.76;
    const H = 1.44;
    const T = 0.19;
    const GAP = 0.17;
    const middle = 0;
    const bottom = -H / 2;
    const top = H / 2;
    // Places the three letters symmetrically around the origin.
    const totalWidth = W * 3 + GAP * 2;
    const start = -totalWidth / 2;
    // Converts a letter index into its horizontal starting coordinate.
    const X = i => start + i * (W + GAP);

    // Builds the U from two vertical legs, a bottom bar, and angled caps.
    const ux = X(0);
    addRectangleTriangles(triangles, ux, bottom, ux + T, top - 0.1);
    addRectangleTriangles(triangles, ux + W - T, bottom, ux + W, top - 0.1);
    addRectangleTriangles(triangles, ux + T / 2, bottom, ux + W - T / 2, bottom + T);
    addSegmentTriangles(triangles, ux, top - 0.1, ux + T / 2, top, T);
    addSegmentTriangles(triangles, ux + W - T / 2, top, ux + W, top - 0.1, T);

    // Builds the S from overlapping bars so its outline remains continuous.
    const sx = X(1);
    const half = T / 2;
    addRectangleTriangles(triangles, sx, top - T, sx + W, top);
    addRectangleTriangles(triangles, sx, top - T, sx + T, middle + half);
    addRectangleTriangles(triangles, sx, middle - half, sx + W, middle + half);
    addRectangleTriangles(triangles, sx + W - T, bottom + half, sx + W, middle + half);
    addRectangleTriangles(triangles, sx, bottom, sx + W, bottom + T);
    addSegmentTriangles(triangles, sx, top - T, sx + half, top, T);
    addSegmentTriangles(triangles, sx + W - half, bottom + T, sx + W, bottom + half, T);

    // Builds the M from vertical legs and a deep central valley.
    const mx = X(2);
    addRectangleTriangles(triangles, mx, bottom, mx + T, top - 0.08);
    addRectangleTriangles(triangles, mx + W - T, bottom, mx + W, top - 0.08);
    addSegmentTriangles(triangles, mx + T / 2, top, mx + W / 2, bottom + 0.55, T);
    addSegmentTriangles(triangles, mx + W / 2, bottom + 0.55, mx + W - T / 2, top, T);
    addSegmentTriangles(triangles, mx, top - 0.08, mx + T / 2, top, T);
    addSegmentTriangles(triangles, mx + W - T / 2, top, mx + W, top - 0.08, T);

    // Returns all USM triangles as a typed numeric array.
    return new Float32Array(triangles);
}
