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

// Converts any browser font into a pixel-triangulated 2D mesh; no glyph coordinates are hardcoded.
function textToTriangles(text, fontSize = 140) {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.font = `900 ${fontSize}px Arial, sans-serif`;
    const metrics = context.measureText(text);
    const padding = 12;
    canvas.width = Math.ceil(metrics.width) + padding * 2;
    canvas.height = fontSize + padding * 2;
    context.font = `900 ${fontSize}px Arial, sans-serif`;
    context.fillStyle = "#fff";
    context.textBaseline = "top";
    context.fillText(text, padding, padding);

    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const triangles = [];
    const scaleX = 2 / canvas.width;
    const scaleY = 2 / canvas.height;
    // One quad per block keeps the generated mesh small while retaining the text silhouette.
    const sampleSize = 4;

    for (let y = 0; y < canvas.height; y += sampleSize) {
        for (let x = 0; x < canvas.width; x += sampleSize) {
            if (image.data[(y * canvas.width + x) * 4 + 3] < 128) continue;
            const rightEdge = Math.min(x + sampleSize, canvas.width);
            const bottomEdge = Math.min(y + sampleSize, canvas.height);
            const left = x * scaleX - 1;
            const right = rightEdge * scaleX - 1;
            const top = 1 - y * scaleY;
            const bottom = 1 - bottomEdge * scaleY;
            triangles.push(left, top, right, top, left, bottom);
            triangles.push(left, bottom, right, top, right, bottom);
        }
    }
    return new Float32Array(triangles);
}
