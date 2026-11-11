function hexToRgb(hex) {
    const value = hex.replace("#", "");
    return [
        parseInt(value.slice(0, 2), 16) / 255,
        parseInt(value.slice(2, 4), 16) / 255,
        parseInt(value.slice(4, 6), 16) / 255
    ];
}

function scaleColor(color, amount) {
    return [color[0] * amount, color[1] * amount, color[2] * amount, 1];
}

// Extrudes a list of 2D triangles into front, back and side faces.
function extrude2D(vertices2D, depth, baseColor) {
    const z = depth / 2;
    const positions = [];
    const colors = [];
    const frontColor = scaleColor(baseColor, 1);
    const backColor = scaleColor(baseColor, 0.62);
    const sideColor = scaleColor(baseColor, 0.4);

    function addTriangle(vertices, color) {
        positions.push(...vertices);
        for (let i = 0; i < 3; i++) colors.push(...color);
    }

    for (let i = 0; i < vertices2D.length; i += 6) {
        const x1 = vertices2D[i], y1 = vertices2D[i + 1];
        const x2 = vertices2D[i + 2], y2 = vertices2D[i + 3];
        const x3 = vertices2D[i + 4], y3 = vertices2D[i + 5];

        addTriangle([x1, y1, z, x2, y2, z, x3, y3, z], frontColor);
        addTriangle([x1, y1, -z, x3, y3, -z, x2, y2, -z], backColor);

        addTriangle([x1, y1, z, x2, y2, z, x1, y1, -z], sideColor);
        addTriangle([x1, y1, -z, x2, y2, z, x2, y2, -z], sideColor);
        addTriangle([x2, y2, z, x3, y3, z, x2, y2, -z], sideColor);
        addTriangle([x2, y2, -z, x3, y3, z, x3, y3, -z], sideColor);
        addTriangle([x3, y3, z, x1, y1, z, x3, y3, -z], sideColor);
        addTriangle([x3, y3, -z, x1, y1, z, x1, y1, -z], sideColor);
    }

    return {
        positions: new Float32Array(positions),
        colors: new Float32Array(colors)
    };
}

function addStroke(triangles, x1, y1, x2, y2, width) {
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

function addBar(triangles, left, bottom, right, top) {
    triangles.push(
        left, top, right, top, left, bottom,
        left, bottom, right, top, right, bottom
    );
}

// Builds the default USM logo from explicit 2D coordinates before extrusion.
function usmToTriangles() {
    const triangles = [];
    // Varsity-inspired proportions.
    const stroke = 0.19;
    const top = 0.72;
    const bottom = -0.72;
    const middle = 0;
    const letterWidth = 0.76;
    const gap = 0.17;
    const start = -((letterWidth * 3) + (gap * 2)) / 2;
    const x = index => start + index * (letterWidth + gap);
    const half = stroke / 2;

    const ux = x(0);
    addBar(triangles, ux, bottom, ux + stroke, top - 0.08);
    addBar(triangles, ux + letterWidth - stroke, bottom, ux + letterWidth, top - 0.08);
    addBar(triangles, ux + half, bottom, ux + letterWidth - half, bottom + stroke);
    addStroke(triangles, ux, top - 0.08, ux + half, top, stroke);
    addStroke(triangles, ux + letterWidth - half, top, ux + letterWidth, top - 0.08, stroke);

    const sx = x(1);
    addBar(triangles, sx + half, top - stroke, sx + letterWidth - half, top);
    addBar(triangles, sx, top - half, sx + stroke, middle + 0.08);
    addBar(triangles, sx + half, middle - half, sx + letterWidth - half, middle + half);
    addBar(triangles, sx + letterWidth - stroke, middle - 0.08, sx + letterWidth, bottom + half);
    addBar(triangles, sx + half, bottom, sx + letterWidth - half, bottom + stroke);
    addStroke(triangles, sx + stroke, middle + 0.08, sx + half, top - stroke, stroke);
    addStroke(triangles, sx + letterWidth - half, bottom + stroke, sx + letterWidth, middle - 0.08, stroke);

    const mx = x(2);
    const valley = bottom + 0.58;
    addBar(triangles, mx, bottom, mx + stroke, top - 0.08);
    addBar(triangles, mx + letterWidth - stroke, bottom, mx + letterWidth, top - 0.08);
    addStroke(triangles, mx + half, top, mx + letterWidth / 2, valley, stroke);
    addStroke(triangles, mx + letterWidth / 2, valley, mx + letterWidth - half, top, stroke);
    addStroke(triangles, mx, top - 0.08, mx + half, top, stroke);
    addStroke(triangles, mx + letterWidth - half, top, mx + letterWidth, top - 0.08, stroke);

    return new Float32Array(triangles);
}
