/**
 * 夜湖
 * 用代码画一幅湖边夜景：月亮、星星、远山、松林、小船。
 * 没有图片。每一帧都从远处画到近处，后画的会盖住先画的。
 */

// 改这几个数，整幅画的气氛会跟着变
const PALETTE = {
  skyTop: [7, 11, 28],
  skyHorizon: [40, 54, 90],
  farHill: [68, 86, 120],
  nearHill: [18, 28, 50],
  shore: [7, 9, 14],
  pine: [5, 7, 11],
  moon: [244, 237, 216],
  waterFar: [16, 36, 62],
  waterNear: [5, 11, 22],
  lantern: [255, 186, 96],
};

// 左岸轮廓。数字是相对宽、高的位置（0 到 1），不是像素
const SHORE = [
  [0.0, 0.52],
  [0.05, 0.49],
  [0.1, 0.47],
  [0.16, 0.485],
  [0.22, 0.455],
  [0.28, 0.47],
  [0.33, 0.5],
  [0.37, 0.55],
  [0.4, 0.62],
];

// 松树：横坐标（0 到 1），以及在 800px 高的画面里的树高
const PINES = [
  [0.04, 150],
  [0.08, 200],
  [0.115, 128],
  [0.15, 220],
  [0.19, 108],
  [0.225, 168],
  [0.265, 96],
  [0.3, 72],
];

let stars = [];

function setup() {
  // 画布跟浏览器窗口一样大
  createCanvas(windowWidth, windowHeight);
  pixelDensity(min(2, displayDensity()));
  frameRate(30);

  // 固定随机种子：每次打开，星星都在同一位置
  randomSeed(19);
  noiseSeed(19);
  stars = createStars(110);

  const hint = document.getElementById("hint");
  if (hint) hint.remove();
}

function draw() {
  // 从远到近。顺序一乱，船就会沉到山后面
  drawSky();
  drawMoonGlow();
  drawStars();
  drawMoon();
  drawHills();
  drawWater();
  drawMist();
  drawMoonReflection();
  drawBoatReflection();
  drawDistantSail();
  drawHeadland();
  drawShore();
  drawCabin();
  drawPines();
  drawBoat();
  drawReeds();
}

function windowResized() {
  // 位置都按宽高的比例算，所以缩放窗口时构图还在
  resizeCanvas(windowWidth, windowHeight);
}

function ink(rgb, a) {
  // 把上面的颜色数组变成 p5 能用的颜色。a 是透明度，0 全透，255 不透
  if (a === undefined) return color(rgb[0], rgb[1], rgb[2]);
  return color(rgb[0], rgb[1], rgb[2], a);
}

function unit() {
  // 以 800px 为基准缩放船、树、草，大屏小屏都看得清
  return min(width, height) / 800;
}

function horizonY() {
  return height * 0.58;
}

function moonX() {
  return width * 0.76;
}

function moonY() {
  return height * 0.19;
}

function moonR() {
  return min(width, height) * 0.058;
}

function createStars(count) {
  const list = [];
  for (let i = 0; i < count; i++) {
    list.push({
      x: random(),
      // 越靠近天顶星星越多，地平线附近留空
      y: random(0.02, 0.46) * random(0.35, 1),
      r: random() < 0.08 ? random(1.7, 2.6) : random(0.45, 1.25),
      phase: random(TWO_PI),
      warm: random() < 0.12,
      spike: random() < 0.045,
    });
  }
  return list;
}

function shoreY(nx) {
  if (nx <= SHORE[0][0]) return SHORE[0][1] * height;
  for (let i = 0; i < SHORE.length - 1; i++) {
    const x0 = SHORE[i][0];
    const y0 = SHORE[i][1];
    const x1 = SHORE[i + 1][0];
    const y1 = SHORE[i + 1][1];
    if (nx <= x1) {
      const t = (nx - x0) / (x1 - x0);
      return lerp(y0, y1, t) * height;
    }
  }
  return height;
}

function drawSky() {
  // 一行一行铺颜色：顶上更深，靠近湖面稍亮
  const y0 = horizonY();
  const top = ink(PALETTE.skyTop);
  const low = ink(PALETTE.skyHorizon);
  for (let y = 0; y < y0; y++) {
    const t = y / y0;
    stroke(lerpColor(top, low, pow(t, 0.85)));
    line(0, y, width, y);
  }
}

function drawMoonGlow() {
  // 很多层很淡的圆叠在一起，就是月光，而不是一个硬边的白点
  const x = moonX();
  const y = moonY();
  const r = moonR();
  noStroke();
  for (let i = 12; i >= 1; i--) {
    fill(186, 202, 230, 6);
    circle(x, y, r * 2 * (1 + i * 0.72));
  }
}

function drawStars() {
  const mx = moonX();
  const my = moonY();
  const clear = moonR() * 2.3;
  for (const s of stars) {
    const x = s.x * width;
    const y = s.y * height;
    if (dist(x, y, mx, my) < clear) continue;

    // sin 在 -1 和 1 之间摆动，用来让星星轻轻明暗
    const twinkle = 0.55 + 0.45 * sin(frameCount * 0.035 + s.phase);
    const alpha = (s.spike ? 230 : 170) * twinkle;
    const rad = s.r * max(1, unit());
    noStroke();
    if (s.warm) fill(255, 232, 206, alpha);
    else fill(232, 238, 246, alpha);
    circle(x, y, rad * 2);

    if (s.spike) {
      stroke(232, 238, 246, alpha * 0.65);
      strokeWeight(1);
      const len = rad * 4.5;
      line(x - len, y, x + len, y);
      line(x, y - len, x, y + len);
    }
  }
  noStroke();
}

function drawMoon() {
  const x = moonX();
  const y = moonY();
  const r = moonR();
  noStroke();
  for (let i = 3; i >= 1; i--) {
    fill(255, 244, 220, 16);
    circle(x, y, r * 2 * (1 + i * 0.22));
  }
  fill(ink(PALETTE.moon));
  circle(x, y, r * 2);
  // 浅浅的月海，避免月亮只是一个纯白圆
  fill(206, 204, 186, 55);
  circle(x - r * 0.22, y - r * 0.08, r * 0.95);
  fill(186, 186, 168, 40);
  circle(x + r * 0.28, y + r * 0.22, r * 0.5);
  fill(255, 252, 242, 90);
  circle(x - r * 0.28, y - r * 0.26, r * 0.36);
}

function drawHills() {
  // 远处的山更淡、更矮；月亮底下故意留低，不挡住月亮
  drawRidge(horizonY() + 2, height * 0.075, 1.5, 2.2, ink(PALETTE.farHill), 0.92, true);
  drawRidge(horizonY() + 8, height * 0.12, 2.3, 5.6, ink(PALETTE.nearHill), 0.55, false);
}

function drawRidge(baseY, amp, freq, seedY, col, dipStrength, highlight) {
  const step = 8;
  const pts = [];
  for (let x = -step; x <= width + step; x += step) {
    const nx = x / width;
    const away = abs(nx - 0.76);
    const dip = away < 0.28 ? (1 - away / 0.28) * dipStrength : 0;
    // noise 的相邻值很接近，山脊才会连成一条，而不是锯齿
    const n = noise(nx * freq + seedY, seedY);
    pts.push({ x: x, y: baseY - n * amp * (1 - dip) });
  }

  noStroke();
  fill(col);
  beginShape();
  vertex(-step, height);
  for (const p of pts) vertex(p.x, p.y);
  vertex(width + step, height);
  endShape(CLOSE);

  if (highlight) {
    noFill();
    stroke(176, 192, 216, 55);
    strokeWeight(1.25);
    beginShape();
    for (const p of pts) vertex(p.x, p.y);
    endShape();
    noStroke();
  }
}

function drawWater() {
  const y0 = horizonY();
  const far = ink(PALETTE.waterFar);
  const near = ink(PALETTE.waterNear);
  const time = millis() * 0.00035;
  for (let y = y0; y < height; y++) {
    const t = (y - y0) / (height - y0);
    const c = lerpColor(far, near, pow(t, 0.8));
    // 很轻的明暗，像水面在呼吸，而不是一块死颜色
    const breathe = sin(y * 0.045 + time * 5) * 2.2;
    stroke(red(c) + breathe, green(c) + breathe * 0.8, blue(c) + breathe * 1.3);
    line(0, y, width, y);
  }
}

function drawMist() {
  // 地平线上一层薄雾，让山和水分得开，又不会切成两半
  const y0 = horizonY();
  noStroke();
  for (let i = -18; i <= 18; i++) {
    const a = (1 - abs(i) / 18) * 16;
    fill(168, 186, 210, a);
    rect(0, y0 + i * 1.6, width, 2);
  }
}

function drawMoonReflection() {
  // 倒影是一截一截的短线：波纹会把它切断，所以不是一根实线
  const x0 = moonX();
  const top = horizonY() + 14;
  const time = millis() * 0.00045;
  const flow = (millis() * 0.018) % 8;
  strokeWeight(max(1.5, 2 * unit()));
  for (let y = top + flow; y < height - 8; y += 8) {
    const depth = (y - top) / (height - top);
    const n = noise(y * 0.02, time);
    if (n < 0.32) continue;
    const wobble = (noise(y * 0.035, time * 1.3) - 0.5) * lerp(8, 46, depth);
    const half = lerp(16, 3, depth) * (0.35 + n) * max(unit(), 0.8);
    stroke(230, 226, 206, lerp(100, 16, depth) * n);
    const x = x0 + wobble;
    line(x - half, y, x + half, y);
  }
  noStroke();
}

function boatPos() {
  const s = unit();
  const bob = sin(frameCount * 0.028) * 2.4 * s;
  return {
    x: width * 0.58,
    y: height * 0.75 + bob,
  };
}

function drawBoatReflection() {
  const p = boatPos();
  const s = unit();
  const y0 = p.y + 16 * s;
  // 暖色的灯影，和右边那道冷月光分开
  strokeWeight(max(1.5, 2 * s));
  for (let i = 0; i < 9; i++) {
    const n = noise(i * 0.45, millis() * 0.0003);
    if (n < 0.22) continue;
    const y = y0 + i * 8 * s;
    const half = (18 - i * 1.4) * s * (0.4 + n * 0.6);
    const wobble = (n - 0.5) * 12 * s;
    stroke(255, 176, 96, 70 - i * 6);
    line(p.x + 28 * s + wobble - half, y, p.x + 28 * s + wobble + half, y);
  }

  // 船身的倒影只留一个淡淡的深色弧
  noStroke();
  fill(150, 168, 190, 22);
  beginShape();
  const x = p.x;
  const y = y0 + 4 * s;
  vertex(x - 40 * s, y);
  bezierVertex(x - 20 * s, y + 10 * s, x + 24 * s, y + 10 * s, x + 48 * s, y);
  bezierVertex(x + 20 * s, y + 3 * s, x - 16 * s, y + 3 * s, x - 40 * s, y);
  endShape();
}

function drawDistantSail() {
  // 地平线上的一只小帆，用来把湖面撑出远近
  const s = unit();
  const x = width * 0.48;
  const y = horizonY() + 2;
  stroke(22, 32, 52);
  strokeWeight(1);
  line(x, y, x, y - 20 * s);
  noStroke();
  fill(28, 40, 64);
  triangle(x + 1, y - 18 * s, x + 1, y - 2, x + 10 * s, y - 3);
}

function drawHeadland() {
  const y0 = horizonY();
  const s = unit();
  noStroke();
  fill(12, 18, 32);
  beginShape();
  vertex(width * 0.86, y0 + 4);
  bezierVertex(width * 0.9, y0 - 16, width * 0.95, y0 - 8, width, y0 - 2);
  vertex(width, y0 + 14);
  endShape(CLOSE);
  drawPine(width * 0.93, y0 + 1, 42 * s);
  drawPine(width * 0.968, y0 + 3, 30 * s);
}

function drawShore() {
  noStroke();
  fill(ink(PALETTE.shore));
  beginShape();
  vertex(0, height);
  for (const pt of SHORE) vertex(pt[0] * width, pt[1] * height);
  vertex(SHORE[SHORE.length - 1][0] * width, height);
  endShape(CLOSE);
}

function drawPines() {
  // 高的先画，矮的叠在前面
  const list = PINES.slice().sort(function (a, b) {
    return b[1] - a[1];
  });
  for (const pine of list) {
    const nx = pine[0];
    drawPine(nx * width, shoreY(nx) + 2, pine[1] * unit());
  }
}

function drawPine(x, ground, h) {
  noStroke();
  fill(ink(PALETTE.pine));
  const trunkW = max(1.5, h * 0.04);
  rect(x - trunkW / 2, ground - h * 0.16, trunkW, h * 0.2);
  // 三层三角，下宽上尖，就是一棵松
  triangle(x, ground - h * 0.55, x - h * 0.36, ground, x + h * 0.36, ground);
  triangle(x, ground - h * 0.78, x - h * 0.26, ground - h * 0.3, x + h * 0.26, ground - h * 0.3);
  triangle(x, ground - h, x - h * 0.15, ground - h * 0.56, x + h * 0.15, ground - h * 0.56);
}

function drawCabin() {
  const s = unit();
  const nx = 0.338;
  const ground = shoreY(nx);
  const x = nx * width;
  const w = 46 * s;
  const h = 30 * s;
  noStroke();
  fill(8, 8, 12);
  triangle(x - 8 * s, ground - h + 1, x + w * 0.5, ground - h - 24 * s, x + w + 8 * s, ground - h + 1);
  rect(x, ground - h, w, h);
  // 一扇暖窗。先画一圈淡光，再画窗格
  const wx = x + 16 * s;
  const wy = ground - h + 10 * s;
  fill(255, 170, 80, 28);
  circle(wx + 6 * s, wy + 6 * s, 28 * s);
  fill(ink(PALETTE.lantern));
  rect(wx, wy, 12 * s, 13 * s, 1.5);
  stroke(90, 58, 28, 180);
  strokeWeight(1);
  line(wx + 6 * s, wy, wx + 6 * s, wy + 13 * s);
  line(wx, wy + 6.5 * s, wx + 12 * s, wy + 6.5 * s);
  noStroke();
}

function drawBoat() {
  const p = boatPos();
  const s = unit();
  push();
  translate(p.x, p.y);
  scale(s);

  noStroke();
  fill(22, 16, 18);
  beginShape();
  vertex(-52, -2);
  bezierVertex(-46, 16, -8, 18, 16, 15);
  bezierVertex(40, 12, 58, 2, 62, -8);
  vertex(44, -12);
  vertex(-40, -12);
  endShape(CLOSE);

  // 船舷上的一条亮边，船才不会糊成一团黑
  stroke(58, 48, 46);
  strokeWeight(1.5);
  line(-38, -12, 42, -12);

  stroke(32, 26, 28);
  strokeWeight(1.6);
  line(4, -12, 6, -64);

  noStroke();
  fill(36, 42, 58);
  triangle(8, -60, 8, -16, 34, -18);

  // 坐着的人，只是一个小剪影
  fill(12, 10, 12);
  circle(-8, -20, 8);
  rect(-12, -16, 9, 10, 2);

  // 船头的灯
  noStroke();
  fill(255, 188, 110, 36);
  circle(30, -14, 26);
  fill(ink(PALETTE.lantern));
  circle(30, -14, 6);
  pop();
}

function drawReeds() {
  // 近处的芦苇，说明观景的人站在岸边
  const s = unit();
  stroke(9, 12, 14);
  strokeWeight(max(1, 1.15 * s));
  const n = floor(16 * max(s, 0.85));
  for (let i = 0; i < n; i++) {
    const x = width * 0.015 + i * 15 * s;
    const h = (40 + noise(i * 0.37, 4) * 78) * s;
    const lean = (noise(i * 0.6, 2) - 0.42) * 20 * s;
    const y = height + 2;
    line(x, y, x + lean, y - h);
    line(x + lean * 0.45, y - h * 0.5, x + lean * 0.1, y - h * 0.72);
  }
  noStroke();
}
