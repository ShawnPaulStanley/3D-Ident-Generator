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

function polygonArea(points) {
    let area = 0;

    for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        area += a[0] * b[1] - b[0] * a[1];
    }

    return area / 2;
}

function cross(a, b, c) {
    return (
        (b[0] - a[0]) * (c[1] - a[1]) -
        (b[1] - a[1]) * (c[0] - a[0])
    );
}

function pointInTriangle(p, a, b, c) {
    const d1 = cross(p, a, b);
    const d2 = cross(p, b, c);
    const d3 = cross(p, c, a);

    const hasNegative = d1 < -1e-8 || d2 < -1e-8 || d3 < -1e-8;
    const hasPositive = d1 > 1e-8 || d2 > 1e-8 || d3 > 1e-8;

    return !(hasNegative && hasPositive);
}

function triangulatePolygon(points) {
    const vertices = points.map((_, i) => i);
    const triangles = [];
    const orientation = polygonArea(points) > 0 ? 1 : -1;
    let guard = 0;

    while (vertices.length > 3 && guard++ < 1000) {
        let foundEar = false;

        for (let i = 0; i < vertices.length; i++) {
            const prev = vertices[(i - 1 + vertices.length) % vertices.length];
            const curr = vertices[i];
            const next = vertices[(i + 1) % vertices.length];
            const a = points[prev];
            const b = points[curr];
            const c = points[next];

            if (cross(a, b, c) * orientation <= 1e-8) continue;

            let containsPoint = false;
            for (const index of vertices) {
                if (index === prev || index === curr || index === next) continue;
                if (pointInTriangle(points[index], a, b, c)) {
                    containsPoint = true;
                    break;
                }
            }

            if (containsPoint) continue;

            triangles.push(
                a[0], a[1],
                b[0], b[1],
                c[0], c[1]
            );
            vertices.splice(i, 1);
            foundEar = true;
            break;
        }

        if (!foundEar) {
            throw new Error("Polygon triangulation failed. Check letter outline.");
        }
    }

    if (vertices.length === 3) {
        for (const index of vertices) {
            triangles.push(points[index][0], points[index][1]);
        }
    }

    return triangles;
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
    const bottom = -H / 2;
    const top = H / 2;
    const totalWidth = W * 3 + GAP * 2;
    const start = -totalWidth / 2;
    const X = i => start + i * (W + GAP);

    const ux = X(0);
    const U = [
        [ux, bottom],
        [ux, top - 0.12],
        [ux + 0.12, top],
        [ux + 0.28, top - 0.12],
        [ux + T, top - 0.12],
        [ux + T, bottom + T],
        [ux + W - T, bottom + T],
        [ux + W - T, top - 0.12],
        [ux + W - 0.28, top],
        [ux + W - 0.12, top - 0.12],
        [ux + W, top - 0.12],
        [ux + W, bottom]
    ];
    triangles.push(...triangulatePolygon(U));

    const sx = X(1);
    addRectangleTriangles(triangles, sx, top - T, sx + W, top);
    addRectangleTriangles(triangles, sx, T / 2, sx + T, top - T);
    addRectangleTriangles(triangles, sx + T, -T / 2, sx + W, T / 2);
    addRectangleTriangles(triangles, sx + W - T, bottom + T, sx + W, -T / 2);
    addRectangleTriangles(triangles, sx, bottom, sx + W, bottom + T);

    const mx = X(2);
    addRectangleTriangles(triangles, mx, bottom, mx + T, top - 0.08);
    addRectangleTriangles(triangles, mx + W - T, bottom, mx + W, top - 0.08);
    addSegmentTriangles(triangles, mx + T / 2, top, mx + W / 2, bottom + 0.55, T);
    addSegmentTriangles(triangles, mx + W / 2, bottom + 0.55, mx + W - T / 2, top, T);
    addSegmentTriangles(triangles, mx, top - 0.08, mx + T / 2, top, T);
    addSegmentTriangles(triangles, mx + W - T / 2, top, mx + W, top - 0.08, T);

    return new Float32Array(triangles);
}
