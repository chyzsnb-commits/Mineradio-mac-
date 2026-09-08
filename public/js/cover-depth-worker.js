'use strict';

var SIZE = 256;

function buildDepthBitmap(sourceBitmap) {
  var W = SIZE;
  var H = SIZE;
  var N = W * H;
  var canvas = new OffscreenCanvas(SIZE, SIZE);
  var context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(sourceBitmap, 0, 0, W, H);
  var source = context.getImageData(0, 0, W, H).data;
  var luminance = new Float32Array(N);
  var blur = new Float32Array(N);
  var temporary = new Float32Array(N);
  var edge = new Float32Array(N);
  var depth = new Float32Array(N);

  for (var index = 0; index < N; index += 1) {
    var sourceIndex = index * 4;
    luminance[index] = (source[sourceIndex] * 0.299 + source[sourceIndex + 1] * 0.587 + source[sourceIndex + 2] * 0.114) / 255;
  }

  var radius = 4;
  for (var y = 0; y < H; y += 1) {
    var horizontalSum = 0;
    for (var initialX = -radius; initialX <= radius; initialX += 1) horizontalSum += luminance[y * W + Math.max(0, Math.min(W - 1, initialX))];
    for (var x = 0; x < W; x += 1) {
      temporary[y * W + x] = horizontalSum / (radius * 2 + 1);
      horizontalSum += luminance[y * W + Math.min(W - 1, x + radius + 1)] - luminance[y * W + Math.max(0, x - radius)];
    }
  }
  for (var column = 0; column < W; column += 1) {
    var verticalSum = 0;
    for (var initialY = -radius; initialY <= radius; initialY += 1) verticalSum += temporary[Math.max(0, Math.min(H - 1, initialY)) * W + column];
    for (var row = 0; row < H; row += 1) {
      blur[row * W + column] = verticalSum / (radius * 2 + 1);
      verticalSum += temporary[Math.min(H - 1, row + radius + 1) * W + column] - temporary[Math.max(0, row - radius) * W + column];
    }
  }

  for (var edgeY = 1; edgeY < H - 1; edgeY += 1) {
    for (var edgeX = 1; edgeX < W - 1; edgeX += 1) {
      var top = (edgeY - 1) * W;
      var current = edgeY * W;
      var bottom = (edgeY + 1) * W;
      var gx = -blur[top + edgeX - 1] - 2 * blur[current + edgeX - 1] - blur[bottom + edgeX - 1]
        + blur[top + edgeX + 1] + 2 * blur[current + edgeX + 1] + blur[bottom + edgeX + 1];
      var gy = -blur[top + edgeX - 1] - 2 * blur[top + edgeX] - blur[top + edgeX + 1]
        + blur[bottom + edgeX - 1] + 2 * blur[bottom + edgeX] + blur[bottom + edgeX + 1];
      edge[current + edgeX] = Math.min(1, Math.sqrt(gx * gx + gy * gy) * 1.4);
    }
  }

  for (var depthY = 0; depthY < H; depthY += 1) {
    for (var depthX = 0; depthX < W; depthX += 1) {
      var depthIndex = depthY * W + depthX;
      var cx = (depthX / (W - 1) - 0.5) * 2;
      var cy = (depthY / (H - 1) - 0.5) * 2;
      var centerBias = 1 - Math.min(1, Math.sqrt(cx * cx + cy * cy) * 0.75);
      depth[depthIndex] = Math.min(1, blur[depthIndex] * 0.45 + centerBias * 0.55);
    }
  }

  var output = context.createImageData(W, H);
  for (var outputIndex = 0; outputIndex < N; outputIndex += 1) {
    var pixel = outputIndex * 4;
    output.data[pixel] = Math.round(depth[outputIndex] * 255);
    output.data[pixel + 1] = Math.round(edge[outputIndex] * 255);
    output.data[pixel + 2] = Math.round(Math.min(1, depth[outputIndex] * 0.6 + edge[outputIndex] * 0.5) * 255);
    output.data[pixel + 3] = Math.round(luminance[outputIndex] * 255);
  }
  context.putImageData(output, 0, 0);
  return canvas.transferToImageBitmap();
}

self.onmessage = function (event) {
  var data = event && event.data ? event.data : {};
  var sourceBitmap = data.bitmap;
  try {
    if (!sourceBitmap) throw new Error('缺少封面位图');
    var bitmap = buildDepthBitmap(sourceBitmap);
    if (typeof sourceBitmap.close === 'function') sourceBitmap.close();
    self.postMessage({ id: data.id, bitmap }, [bitmap]);
  } catch (error) {
    if (sourceBitmap && typeof sourceBitmap.close === 'function') sourceBitmap.close();
    self.postMessage({ id: data.id, error: String(error && error.message ? error.message : error) });
  }
};
