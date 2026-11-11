function hexToRgb(hex) {
    const value = hex.replace("#", "");
    return [
        parseInt(value.slice(0, 2), 16) / 255,
        parseInt(value.slice(2, 4), 16) / 255,
        parseInt(value.slice(4, 6), 16) / 255
    ];
}

function scaleColor(color, amount) {
    return [
        color[0] * amount,
        color[1] * amount,
        color[2] * amount,
        1
    ];
}

function extrude2D(vertices2D, depth, baseColor) {
    const z = depth / 2;
    const positions = [];
    const colors = [];
    const frontColor = scaleColor(baseColor, 1.0);
    const backColor = scaleColor(baseColor, 0.62);
    const sideColor = scaleColor(baseColor, 0.38);
    const edges = new Map();

    function addTriangle(vertices, color) {
        positions.push(...vertices);
        for (let i = 0; i < 3; i++) colors.push(...color);
    }

    function key(x, y) {
        return `${Math.round(x * 100000)},${Math.round(y * 100000)}`;
    }

    for (let i = 0; i < vertices2D.length; i += 6) {
        const a = [vertices2D[i], vertices2D[i + 1]];
        const b = [vertices2D[i + 2], vertices2D[i + 3]];
        const c = [vertices2D[i + 4], vertices2D[i + 5]];

        addTriangle([
            a[0], a[1], z,
            b[0], b[1], z,
            c[0], c[1], z
        ], frontColor);

        addTriangle([
            a[0], a[1], -z,
            c[0], c[1], -z,
            b[0], b[1], -z
        ], backColor);

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

    for (const edge of edges.values()) {
        if (edge.count !== 1) continue;

        const a = edge.a;
        const b = edge.b;
        addTriangle([
            a[0], a[1], z,
            b[0], b[1], z,
            a[0], a[1], -z
        ], sideColor);
        addTriangle([
            a[0], a[1], -z,
            b[0], b[1], z,
            b[0], b[1], -z
        ], sideColor);
    }

    return {
        positions: new Float32Array(positions),
        colors: new Float32Array(colors)
    };
}

function addRectangleTriangles(triangles, left, bottom, right, top) {
    triangles.push(
        left, top, right, top, left, bottom,
        left, bottom, right, top, right, bottom
    );
}

function addSegmentTriangles(triangles, x1, y1, x2, y2, width) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy);
    const offsetX = (dy / length) * width / 2;
    const offsetY = (dx / length) * width / 2;

    triangles.push(
        x1 - offsetX, y1 + offsetY,
        x2 - offsetX, y2 + offsetY,
        x1 + offsetX, y1 - offsetY,
        x1 + offsetX, y1 - offsetY,
        x2 - offsetX, y2 + offsetY,
        x2 + offsetX, y2 - offsetY
    );
}

function usmToTriangles() {
    const triangles = [];
    const W = 0.76;
    const H = 1.44;
    const T = 0.19;
    const GAP = 0.17;
    const middle = 0;
    const bottom = -H / 2;
    const top = H / 2;
    const totalWidth = W * 3 + GAP * 2;
    const start = -totalWidth / 2;
    const X = i => start + i * (W + GAP);

    const ux = X(0);
    addRectangleTriangles(triangles, ux, bottom, ux + T, top - 0.1);
    addRectangleTriangles(triangles, ux + W - T, bottom, ux + W, top - 0.1);
    addRectangleTriangles(triangles, ux + T / 2, bottom, ux + W - T / 2, bottom + T);
    addSegmentTriangles(triangles, ux, top - 0.1, ux + T / 2, top, T);
    addSegmentTriangles(triangles, ux + W - T / 2, top, ux + W, top - 0.1, T);

    const sx = X(1);
    const half = T / 2;
    addRectangleTriangles(triangles, sx, top - T, sx + W, top);
    addRectangleTriangles(triangles, sx, top - T, sx + T, middle + half);
    addRectangleTriangles(triangles, sx, middle - half, sx + W, middle + half);
    addRectangleTriangles(triangles, sx + W - T, bottom + half, sx + W, middle + half);
    addRectangleTriangles(triangles, sx, bottom, sx + W, bottom + T);
    addSegmentTriangles(triangles, sx, top - T, sx + half, top, T);
    addSegmentTriangles(triangles, sx + W - half, bottom + T, sx + W, bottom + half, T);

    const mx = X(2);
    addRectangleTriangles(triangles, mx, bottom, mx + T, top - 0.08);
    addRectangleTriangles(triangles, mx + W - T, bottom, mx + W, top - 0.08);
    addSegmentTriangles(triangles, mx + T / 2, top, mx + W / 2, bottom + 0.55, T);
    addSegmentTriangles(triangles, mx + W / 2, bottom + 0.55, mx + W - T / 2, top, T);
    addSegmentTriangles(triangles, mx, top - 0.08, mx + T / 2, top, T);
    addSegmentTriangles(triangles, mx + W - T / 2, top, mx + W, top - 0.08, T);

    return new Float32Array(triangles);
}
