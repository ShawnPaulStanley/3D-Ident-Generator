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
    const stroke = 0.16;
    const top = 0.72;
    const bottom = -0.72;
    const middle = 0;
    const letterWidth = 0.68;
    const gap = 0.24;
    const start = -((letterWidth * 3) + (gap * 2)) / 2;
    const x = index => start + index * (letterWidth + gap);

    const half = stroke / 2;

    addBar(triangles, x(0), bottom, x(0) + stroke, top - half);
    addBar(triangles, x(0) + letterWidth - stroke, bottom, x(0) + letterWidth, top - half);
    addBar(triangles, x(0) + half, bottom, x(0) + letterWidth - half, bottom + stroke);
    addStroke(triangles, x(0), top - half, x(0) + half, top, stroke);
    addStroke(triangles, x(0) + letterWidth - half, top, x(0) + letterWidth, top - half, stroke);

    addBar(triangles, x(1) + half, top - stroke, x(1) + letterWidth - half, top);
    addBar(triangles, x(1), top - half, x(1) + stroke, middle + half);
    addBar(triangles, x(1) + half, middle - half, x(1) + letterWidth - half, middle + half);
    addBar(triangles, x(1) + letterWidth - stroke, middle - half, x(1) + letterWidth, bottom + half);
    addBar(triangles, x(1) + half, bottom, x(1) + letterWidth - half, bottom + stroke);
    addStroke(triangles, x(1), top - half, x(1) + half, top - stroke, stroke);
    addStroke(triangles, x(1) + letterWidth - half, bottom + stroke, x(1) + letterWidth, bottom + half, stroke);

    addBar(triangles, x(2), bottom, x(2) + stroke, top - half);
    addBar(triangles, x(2) + letterWidth - stroke, bottom, x(2) + letterWidth, top - half);
    addStroke(triangles, x(2) + half, top, x(2) + letterWidth / 2, middle + 0.08, stroke);
    addStroke(triangles, x(2) + letterWidth / 2, middle + 0.08, x(2) + letterWidth - half, top, stroke);

    return new Float32Array(triangles);
}
