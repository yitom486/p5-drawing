/**
 * 自注意力
 * 用短句「我 / 喜欢 / 看 / 夜 / 湖」看一遍 Transformer 里的 self-attention。
 * 每个词轮流当查询，去比较所有键，softmax 之后按权重把值混在一起。
 * 向量是手写的玩具，不是训练好的模型；点积和 softmax 是真算的，所以粗细和数字对得上。
 */

const PALETTE = {
  skyTop: [7, 11, 28],
  skyDeep: [8, 22, 44],
  paper: [244, 237, 216],
  mist: [168, 184, 214],
  lantern: [255, 186, 96],
  ink: [8, 12, 24],
};

// 温度越低，注意力越集中在最像的那几个词上。0.4 能看清「看」主要在看「湖」。
const TEMP = 0.4;

// 每个词带三样东西：
// 查询 q：这个词正在找什么
// 键 k：这个词可供别人比对的特征
// 值：被取走、混进新表示的那一份。画面里值就是这个词的颜色。
const TOKENS = [
  {
    text: "我",
    q: [1.05, 0.12, 0.02],
    k: [1.0, 0.1, 0.0],
    color: [255, 220, 170],
  },
  {
    text: "喜欢",
    q: [0.22, 1.05, 0.28],
    k: [0.48, 0.95, 0.12],
    color: [255, 168, 86],
  },
  {
    text: "看",
    q: [0.04, 0.22, 1.12],
    k: [0.18, 0.88, 0.36],
    color: [120, 214, 206],
  },
  {
    text: "夜",
    q: [0.02, 0.18, 0.92],
    k: [0.06, 0.28, 0.82],
    color: [186, 170, 240],
  },
  {
    text: "湖",
    q: [0.05, 0.42, 0.7],
    k: [0.04, 0.14, 1.18],
    color: [72, 148, 230],
  },
];

// 一轮查询要走的四步。时间用毫秒，不跟丢帧绑在一起。
const STEPS = [
  { id: "query", dur: 1100 },
  { id: "scores", dur: 1600 },
  { id: "weights", dur: 1800 },
  { id: "blend", dur: 2200 },
];

const STEP_DUR = STEPS.reduce(function (sum, step) {
  return sum + step.dur;
}, 0);

const FONT =
  '"WenQuanYi Micro Hei", "Droid Sans Fallback", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';

let attention;
let stars = [];
let particles = [];
let shownRepr = [];
let sky;
let clock = { paused: false, offset: 0, frozen: 0 };
let lastQuery = 0;
let passIndex = 0;

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(min(2, displayDensity()));
  frameRate(30);
  angleMode(RADIANS);
  textAlign(CENTER, CENTER);

  attention = buildAttention();
  shownRepr = TOKENS.map(function (token) {
    return token.color.slice();
  });
  stars = createStars(48);
  rebuildSky();

  const hint = document.getElementById("hint");
  if (hint) hint.remove();
}

function draw() {
  const phase = currentPhase();
  const nodes = layout();

  image(sky, 0, 0, width, height);
  drawStars();
  drawHeader(phase);
  drawPipeline(phase);
  drawLinks(phase, nodes);
  drawTokens(phase, nodes);
  drawParticles(phase, nodes);
  drawHeatmap(phase, nodes.heat);
  drawFooter(phase);

  if (!clock.paused && phase.step === "blend") spawnParticles(phase);
  stepParticles();
  easeRepresentations(phase);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  rebuildSky();
}

function mousePressed() {
  togglePause();
}

function keyPressed() {
  if (key === " ") togglePause();
}

// --- 注意力是怎么算出来的 ---

function buildAttention() {
  const n = TOKENS.length;
  const scores = [];
  const weights = [];
  const rawShare = [];
  const mixed = [];

  for (let i = 0; i < n; i++) {
    const row = [];
    for (let j = 0; j < n; j++) {
      // 查询 · 键。越像，分数越高。真实模型还会除以 √维度，这里维度固定，省掉。
      row.push(dot(TOKENS[i].q, TOKENS[j].k));
    }
    scores.push(row);

    // softmax：先除以温度，再变成加起来等于 1 的注意力权重
    const soft = softmax(
      row.map(function (score) {
        return score / TEMP;
      })
    );
    weights.push(soft);

    const total = row.reduce(function (sum, score) {
      return sum + score;
    }, 0);
    rawShare.push(
      row.map(function (score) {
        return total === 0 ? 1 / n : score / total;
      })
    );

    // 加权求和：新表示 = Σ 注意力权重 × 值
    mixed.push(mixValues(soft));
  }

  return { scores: scores, weights: weights, rawShare: rawShare, mixed: mixed };
}

function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

function softmax(values) {
  let peak = values[0];
  for (let i = 1; i < values.length; i++) peak = Math.max(peak, values[i]);

  const lifted = values.map(function (value) {
    return Math.exp(value - peak);
  });
  const total = lifted.reduce(function (sum, value) {
    return sum + value;
  }, 0);
  return lifted.map(function (value) {
    return value / total;
  });
}

function mixValues(weights) {
  const mixed = [0, 0, 0];
  for (let j = 0; j < TOKENS.length; j++) {
    mixed[0] += weights[j] * TOKENS[j].color[0];
    mixed[1] += weights[j] * TOKENS[j].color[1];
    mixed[2] += weights[j] * TOKENS[j].color[2];
  }
  return mixed;
}

// --- 时间：点亮查询 → 比较键 → 收成权重 → 把值加起来，然后换下一个词 ---

function playMillis() {
  if (clock.paused) return clock.frozen - clock.offset;
  return millis() - clock.offset;
}

function togglePause() {
  if (clock.paused) {
    clock.offset += millis() - clock.frozen;
    clock.paused = false;
    return;
  }
  clock.frozen = millis();
  clock.paused = true;
}

function currentPhase() {
  const loop = playMillis() % (STEP_DUR * TOKENS.length);
  const query = Math.floor(loop / STEP_DUR);
  let remain = loop - query * STEP_DUR;
  let step = STEPS[0];

  for (let i = 0; i < STEPS.length; i++) {
    step = STEPS[i];
    if (remain <= step.dur) break;
    remain -= step.dur;
  }

  if (query < lastQuery) passIndex += 1;
  lastQuery = query;

  const local = step.dur === 0 ? 1 : constrain(remain / step.dur, 0, 1);
  return {
    query: query,
    step: step.id,
    local: local,
    ease: smoothstep(local),
  };
}

function easeRepresentations(phase) {
  for (let i = 0; i < TOKENS.length; i++) {
    const target = representationTarget(i, phase);
    for (let c = 0; c < 3; c++) {
      shownRepr[i][c] += (target[c] - shownRepr[i][c]) * 0.14;
    }
  }
}

function representationTarget(i, phase) {
  const original = TOKENS[i].color;
  const mixed = attention.mixed[i];

  // 新的一轮开始时，把上一轮混好的颜色淡回各自原来的值
  if (passIndex > 0 && phase.query === 0 && phase.step === "query") {
    return lerp3(mixed, original, phase.ease);
  }
  if (i < phase.query) return mixed;
  if (i === phase.query && phase.step === "blend") {
    return lerp3(original, mixed, phase.ease);
  }
  return original;
}

// --- 布局：宽屏热力图在右侧，窄屏挪到词的下方 ---

function layout() {
  const n = TOKENS.length;
  const margin = clamp(width * 0.035, 16, 36);
  const compact = width < 760;
  const headerBottom = compact ? 132 : 156;
  const footerTop = height - (compact ? 108 : 124);
  const side = width >= 980 && height >= 620;
  const labelW = compact ? 28 : 36;

  let cell = side ? clamp(height * 0.048, 22, 40) : clamp(width * 0.055, 18, 34);
  const grid = cell * n;
  const sideReserve = side ? labelW + grid + margin : 0;
  const left = margin;
  const right = width - margin - sideReserve;
  const areaW = Math.max(120, right - left);

  let chipH = clamp(Math.min(height * 0.12, areaW / n * 0.72), 52, 96);
  let chipW = clamp(Math.min((areaW - 12 * n) / n, chipH * 1.45), 58, 132);
  if (chipW * n > areaW - 8) chipW = (areaW - 8) / n;

  const rowW = chipW * n;
  const gap = n === 1 ? 0 : Math.max(8, (areaW - rowW) / (n - 1));
  const used = chipW * n + gap * (n - 1);
  const xStart = left + (areaW - used) / 2 + chipW / 2;

  const arcRoom = 108;
  const orbRoom = 52;
  let yChip = headerBottom + arcRoom + chipH / 2;
  const lowest = footerTop - orbRoom - chipH / 2;
  if (!side) {
    const heatChrome = 70;
    const maxGrid = footerTop - (headerBottom + arcRoom + chipH + orbRoom) - heatChrome;
    cell = clamp(maxGrid / n, 16, 32);
    yChip = headerBottom + arcRoom + chipH / 2;
  }
  if (yChip > lowest) yChip = lowest;

  const tokens = [];
  for (let i = 0; i < n; i++) {
    tokens.push({
      x: xStart + i * (chipW + gap),
      y: yChip,
      w: chipW,
      h: chipH,
    });
  }

  const gridW = cell * n;
  const heat = {
    cell: cell,
    labelW: labelW,
    x: side ? width - margin - gridW : (width - gridW) / 2,
    y: side ? clamp(headerBottom + 28, 168, height * 0.34) : yChip + chipH / 2 + orbRoom + 36,
    side: side,
  };

  return { tokens: tokens, heat: heat, compact: compact };
}

function drawHeader(phase) {
  const compact = width < 760;
  useFont(compact ? 22 : 30, true);
  fill(PALETTE.paper);
  text("自注意力", width / 2, compact ? 32 : 40);

  useFont(compact ? 12 : 14, false);
  fill(PALETTE.mist[0], PALETTE.mist[1], PALETTE.mist[2], 210);
  text("一句短句里，每个词都去看所有词，再把留意到的含义混进来", width / 2, compact ? 56 : 68);

  drawSentence(phase, compact ? 84 : 100);
}

function drawSentence(phase, y) {
  const gap = width < 760 ? 16 : 28;
  useFont(width < 760 ? 14 : 16, false);
  const widths = TOKENS.map(function (token) {
    return textWidth(token.text);
  });
  const total =
    widths.reduce(function (sum, w) {
      return sum + w;
    }, 0) +
    gap * (TOKENS.length - 1);
  let x = width / 2 - total / 2;

  for (let i = 0; i < TOKENS.length; i++) {
    const on = i === phase.query;
    fill(on ? PALETTE.lantern : [150, 164, 190]);
    const cx = x + widths[i] / 2;
    text(TOKENS[i].text, cx, y);
    if (on) {
      stroke(PALETTE.lantern[0], PALETTE.lantern[1], PALETTE.lantern[2], 180);
      strokeWeight(1.2);
      line(x, y + 12, x + widths[i], y + 12);
      noStroke();
    }
    x += widths[i] + gap;
  }
}

function drawPipeline(phase) {
  const compact = width < 760;
  const items = [
    { id: "query", name: compact ? "查询" : "查询 Query" },
    { id: "scores", name: compact ? "键" : "键 Key" },
    { id: "weights", name: compact ? "权重" : "注意力权重" },
    { id: "blend", name: compact ? "求和" : "加权求和" },
  ];
  const y = compact ? 112 : 132;
  useFont(compact ? 11 : 13, false);

  const widths = items.map(function (item) {
    return textWidth(item.name) + (compact ? 16 : 22);
  });
  const gap = compact ? 16 : 28;
  const total =
    widths.reduce(function (sum, w) {
      return sum + w;
    }, 0) +
    gap * (items.length - 1);
  let x = width / 2 - total / 2;

  for (let i = 0; i < items.length; i++) {
    const on = items[i].id === phase.step;
    const w = widths[i];
    const h = compact ? 22 : 26;
    noStroke();
    fill(on ? 46 : 18, on ? 36 : 24, on ? 24 : 42, on ? 230 : 160);
    rectMode(CENTER);
    rect(x + w / 2, y, w, h, h / 2);
    if (on) {
      stroke(PALETTE.lantern);
      strokeWeight(1.2);
      noFill();
      rect(x + w / 2, y, w, h, h / 2);
      noStroke();
    }
    fill(on ? PALETTE.lantern : PALETTE.mist);
    text(items[i].name, x + w / 2, y);
    if (i < items.length - 1) {
      fill(PALETTE.mist[0], PALETTE.mist[1], PALETTE.mist[2], 120);
      text("→", x + w + gap / 2, y);
    }
    x += w + gap;
  }
}

function drawLinks(phase, scene) {
  const query = phase.query;
  const from = scene.tokens[query];
  const order = [];

  for (let j = 0; j < TOKENS.length; j++) {
    order.push({ j: j, w: linkAmount(query, j, phase) });
  }
  order.sort(function (a, b) {
    return a.w - b.w;
  });

  for (let k = 0; k < order.length; k++) {
    const j = order[k].j;
    const amount = order[k].w;
    if (amount <= 0.001) continue;
    const geom = linkOf(from, scene.tokens[j]);
    const reveal = linkReveal(phase);
    const style = linkStyle(amount, reveal);
    const tint = lerp3([150, 176, 210], PALETTE.lantern, Math.pow(amount, 0.55));

    stroke(tint[0], tint[1], tint[2], style.alpha);
    strokeWeight(style.weight);
    strokeCap(ROUND);
    noFill();
    traceLink(geom);

    const caption = linkCaption(query, j, phase);
    if (caption && reveal > 0.45) {
      const at = pointOnLink(geom, 0.5);
      drawPill(caption, at.x, at.y - 11, style.alpha);
    }
  }
}

function linkAmount(i, j, phase) {
  const raw = attention.rawShare[i][j];
  const soft = attention.weights[i][j];
  if (phase.step === "query") return 0;
  if (phase.step === "scores") return raw * phase.ease;
  if (phase.step === "weights") return lerp(raw, soft, phase.ease);
  return soft;
}

function linkReveal(phase) {
  if (phase.step === "query") return 0;
  if (phase.step === "scores") return phase.ease;
  return 1;
}

function linkStyle(amount, reveal) {
  const t = amount * reveal;
  return {
    weight: lerp(1.15, 8.5, Math.pow(constrain(t, 0, 1), 0.8)),
    alpha: t <= 0 ? 0 : lerp(36, 235, Math.pow(constrain(t, 0, 1), 0.62)),
  };
}

function linkCaption(i, j, phase) {
  if (phase.step === "scores" && phase.local > 0.4) {
    const score = attention.scores[i][j];
    const row = attention.scores[i];
    const peak = Math.max.apply(null, row);
    if (score < peak * 0.72) return "";
    return score.toFixed(2);
  }
  if (phase.step === "weights" || phase.step === "blend") {
    const w = attention.weights[i][j];
    if (w < 0.1) return "";
    return Math.round(w * 100) + "%";
  }
  return "";
}

function drawTokens(phase, scene) {
  for (let i = 0; i < scene.tokens.length; i++) {
    drawToken(i, scene.tokens[i], phase, scene.compact);
  }
}

function drawToken(i, node, phase, compact) {
  const isQuery = i === phase.query;
  const breathe = 1 + 0.018 * Math.sin(playMillis() / 520 + i);
  const w = node.w * (isQuery ? 1.04 : 1) * breathe;
  const h = node.h * (isQuery ? 1.04 : 1) * breathe;
  const tint = TOKENS[i].color;

  if (isQuery) {
    noStroke();
    fill(PALETTE.lantern[0], PALETTE.lantern[1], PALETTE.lantern[2], 22);
    ellipse(node.x, node.y, w * 1.7, h * 1.85);
  }

  rectMode(CENTER);
  noStroke();
  fill(PALETTE.ink[0], PALETTE.ink[1], PALETTE.ink[2], 220);
  rect(node.x, node.y, w, h, h * 0.46);

  fill(tint[0], tint[1], tint[2], isQuery ? 48 : 28);
  rect(node.x, node.y, w, h, h * 0.46);

  stroke(tint[0], tint[1], tint[2], isQuery ? 240 : 150);
  strokeWeight(isQuery ? 2.4 : 1.3);
  noFill();
  rect(node.x, node.y, w, h, h * 0.46);
  noStroke();

  let fontSize = h * 0.4;
  useFont(fontSize, true);
  while (textWidth(TOKENS[i].text) > w - 16 && fontSize > 13) {
    fontSize -= 1;
    useFont(fontSize, true);
  }
  fill(PALETTE.paper);
  text(TOKENS[i].text, node.x, node.y - 1);

  useFont(compact ? 11 : 12, false);
  fill(isQuery ? PALETTE.lantern : [176, 188, 210]);
  text(roleLabel(i, phase), node.x, node.y + h / 2 + 16);

  const orbY = node.y + h / 2 + 36;
  const shown = shownRepr[i];
  noStroke();
  fill(shown[0], shown[1], shown[2], 230);
  circle(node.x, orbY, isQuery && phase.step === "blend" ? 18 : 14);
  noFill();
  stroke(PALETTE.paper[0], PALETTE.paper[1], PALETTE.paper[2], 70);
  strokeWeight(1);
  circle(node.x, orbY, isQuery && phase.step === "blend" ? 18 : 14);
  noStroke();
}

function roleLabel(i, phase) {
  if (i === phase.query) {
    if (phase.step === "blend") return "加权求和";
    return "查询";
  }
  if (phase.step === "blend") return "值";
  return "键";
}

function drawParticles(phase, scene) {
  for (let p = particles.length - 1; p >= 0; p--) {
    const spec = particles[p];
    if (spec.i !== phase.query || phase.step !== "blend") {
      particles.splice(p, 1);
      continue;
    }
    const geom = linkOf(scene.tokens[spec.j], scene.tokens[spec.i]);
    const pos = pointOnLink(geom, spec.t);
    const alpha = Math.sin(spec.t * Math.PI) * 230;
    const tint = TOKENS[spec.j].color;
    noStroke();
    fill(tint[0], tint[1], tint[2], alpha);
    circle(pos.x, pos.y, spec.size);
  }
}

function spawnParticles(phase) {
  const i = phase.query;
  for (let j = 0; j < TOKENS.length; j++) {
    let budget = attention.weights[i][j] * 0.72;
    while (budget > 0) {
      if (Math.random() < budget) {
        particles.push({
          i: i,
          j: j,
          t: 0,
          speed: 0.012 + Math.random() * 0.012,
          size: 2.4 + Math.random() * 2.8,
        });
      }
      budget -= 1;
    }
  }
  if (particles.length > 240) particles.splice(0, particles.length - 240);
}

function stepParticles() {
  if (clock.paused) return;
  for (let i = particles.length - 1; i >= 0; i--) {
    particles[i].t += particles[i].speed;
    if (particles[i].t >= 1) particles.splice(i, 1);
  }
}

function drawHeatmap(phase, heat) {
  const n = TOKENS.length;
  const cell = heat.cell;
  const gridW = cell * n;
  const originX = heat.x;
  const originY = heat.y;

  useFont(width < 760 ? 12 : 14, true);
  fill(PALETTE.paper);
  text(heatmapTitle(phase), originX + gridW / 2, originY - cell * 0.95);

  useFont(Math.min(12, cell * 0.38), false);
  for (let j = 0; j < n; j++) {
    fill(j === phase.query ? PALETTE.lantern : PALETTE.mist);
    text(TOKENS[j].text, originX + cell * j + cell / 2, originY - cell * 0.28);
  }

  for (let i = 0; i < n; i++) {
    const rowY = originY + cell * i;
    useFont(Math.min(12, cell * 0.4), false);
    fill(i === phase.query ? PALETTE.lantern : PALETTE.mist);
    textAlign(RIGHT, CENTER);
    text(TOKENS[i].text, originX - 8, rowY + cell / 2);
    textAlign(CENTER, CENTER);

    for (let j = 0; j < n; j++) {
      const value = cellValue(i, j, phase);
      const shown = heatColor(value);
      noStroke();
      fill(shown[0], shown[1], shown[2], value <= 0.001 ? 50 : 230);
      rectMode(CORNER);
      rect(originX + cell * j + 1.5, rowY + 1.5, cell - 3, cell - 3, 4);

      if (value >= 0.08 && cell >= 22 && (phase.step !== "scores" || i === phase.query)) {
        const percent = Math.round(attention.weights[i][j] * 100);
        const showNumber = i < phase.query || (i === phase.query && phase.step !== "query" && phase.step !== "scores");
        if (showNumber || (i === phase.query && phase.step === "weights" && phase.local > 0.35)) {
          useFont(Math.min(11, cell * 0.34), false);
          fill(value > 0.55 ? PALETTE.ink : PALETTE.paper);
          text(percent + "", originX + cell * j + cell / 2, rowY + cell / 2);
        }
      }
    }
  }

  noFill();
  stroke(PALETTE.lantern[0], PALETTE.lantern[1], PALETTE.lantern[2], 200);
  strokeWeight(1.4);
  rect(originX + 0.5, originY + cell * phase.query + 0.5, gridW - 1, cell - 1, 5);
  noStroke();

  const sum = rowSum(phase);
  if (sum) {
    useFont(11, false);
    fill(PALETTE.mist);
    text(sum, originX + gridW / 2, originY + gridW + 16);
  }
}

function heatmapTitle(phase) {
  // 正在比较的那一行还是点积；softmax 之后才叫注意力权重
  if (phase.step === "scores") return "点积分数 → 注意力权重";
  return "注意力权重";
}

function cellValue(i, j, phase) {
  const raw = attention.rawShare[i][j];
  const soft = attention.weights[i][j];
  if (i < phase.query) return soft;
  if (i > phase.query) return 0;
  if (phase.step === "query") return 0;
  if (phase.step === "scores") return raw * phase.ease;
  if (phase.step === "weights") return lerp(raw, soft, phase.ease);
  return soft;
}

function rowSum(phase) {
  if (phase.step === "scores") return "这一行还没归一";
  if (phase.step === "weights" || phase.step === "blend") return "这一行加起来 = 1";
  return "";
}

function heatColor(value) {
  const cool = [18, 30, 54];
  const warm = [255, 186, 96];
  return lerp3(cool, warm, Math.pow(constrain(value, 0, 1), 0.72));
}

function drawFooter(phase) {
  const compact = width < 760;
  const y = height - (compact ? 64 : 72);
  useFont(compact ? 12 : 15, false);
  fill(PALETTE.paper[0], PALETTE.paper[1], PALETTE.paper[2], 230);
  drawWrapped(captionFor(phase), width / 2, y, Math.min(width - 48, 760), compact ? 18 : 22);

  useFont(compact ? 11 : 12, false);
  fill(PALETTE.mist[0], PALETTE.mist[1], PALETTE.mist[2], 170);
  const legend = compact
    ? "查询 · 键 · 值 Value · 注意力权重 · 加权求和"
    : "查询 Query  ·  键 Key  ·  值 Value  ·  注意力权重  ·  加权求和";
  text(legend, width / 2, height - (compact ? 22 : 26));

  useFont(11, false);
  fill(PALETTE.mist[0], PALETTE.mist[1], PALETTE.mist[2], clock.paused ? 230 : 120);
  textAlign(LEFT, TOP);
  text(clock.paused ? "已暂停 · 再点一下继续" : "点击画面可暂停", 16, 12);
  textAlign(CENTER, CENTER);
}

function captionFor(phase) {
  const word = TOKENS[phase.query].text;
  if (phase.step === "query") {
    return "轮到「" + word + "」。它现在是查询 Query，要去看句子里的每一个词。";
  }
  if (phase.step === "scores") {
    return "每个词都有一把键 Key。查询和键越像，点积分数越高，线就越亮。";
  }
  if (phase.step === "weights") {
    return "分数经过 softmax，变成注意力权重：都是正的，加起来正好等于 1。";
  }
  return "按这些权重，把各个词的值 Value 加权求和，颜色流进「" + word + "」的新表示。";
}

// --- 连线几何：词和词之间一条弧，自己看自己就在头顶画一个环 ---

function linkOf(a, b) {
  const y1 = a.y - a.h / 2;
  const y2 = b.y - b.h / 2;
  if (Math.abs(a.x - b.x) < 1) {
    const rad = clamp(a.w * 0.34, 16, 30);
    return { self: true, x: a.x, y: y1, rad: rad };
  }
  const maxLift = Math.max(26, y1 - 150);
  const lift = Math.min(Math.abs(b.x - a.x) * 0.46, maxLift);
  return {
    self: false,
    x1: a.x,
    y1: y1,
    cx: (a.x + b.x) / 2,
    cy: y1 - lift,
    x2: b.x,
    y2: y2,
  };
}

function traceLink(geom) {
  if (geom.self) {
    arc(geom.x, geom.y, geom.rad * 2, geom.rad * 2, PI, TWO_PI);
    return;
  }
  bezier(geom.x1, geom.y1, geom.cx, geom.cy, geom.cx, geom.cy, geom.x2, geom.y2);
}

function pointOnLink(geom, t) {
  if (geom.self) {
    const angle = Math.PI * (1 + t);
    return {
      x: geom.x + Math.cos(angle) * geom.rad,
      y: geom.y + Math.sin(angle) * geom.rad,
    };
  }
  return {
    x: bezierPoint(geom.x1, geom.cx, geom.cx, geom.x2, t),
    y: bezierPoint(geom.y1, geom.cy, geom.cy, geom.y2, t),
  };
}

function drawPill(str, x, y, alpha) {
  useFont(12, false);
  const w = textWidth(str) + 12;
  const h = 18;
  rectMode(CENTER);
  noStroke();
  fill(7, 11, 28, Math.min(210, alpha));
  rect(x, y, w, h, 9);
  fill(PALETTE.paper[0], PALETTE.paper[1], PALETTE.paper[2], Math.min(255, alpha + 40));
  text(str, x, y + 0.5);
}

function drawWrapped(str, x, y, maxW, leading) {
  const lines = [];
  let line = "";
  for (let i = 0; i < str.length; i++) {
    const trial = line + str.charAt(i);
    if (line && textWidth(trial) > maxW) {
      lines.push(line);
      line = str.charAt(i);
    } else {
      line = trial;
    }
  }
  if (line) lines.push(line);
  const start = y - ((lines.length - 1) * leading) / 2;
  for (let i = 0; i < lines.length; i++) text(lines[i], x, start + i * leading);
}

// --- 背景：跟夜湖同一套深蓝，只有很少的星星在闪 ---

function rebuildSky() {
  sky = createGraphics(width, height);
  sky.pixelDensity(1);
  for (let y = 0; y < height; y++) {
    const t = height <= 1 ? 0 : y / height;
    sky.stroke(
      lerp(PALETTE.skyTop[0], PALETTE.skyDeep[0], t),
      lerp(PALETTE.skyTop[1], PALETTE.skyDeep[1], t),
      lerp(PALETTE.skyTop[2], PALETTE.skyDeep[2], t)
    );
    sky.line(0, y, width, y);
  }

  const glowX = width * 0.84;
  const glowY = height * 0.08;
  for (let i = 7; i >= 1; i--) {
    sky.noStroke();
    sky.fill(255, 196, 140, 5);
    sky.circle(glowX, glowY, i * min(width, height) * 0.07);
  }
}

function createStars(count) {
  const list = [];
  randomSeed(19);
  for (let i = 0; i < count; i++) {
    list.push({
      x: random(),
      y: random() * 0.34,
      size: random(1, 2.1),
      speed: random(0.6, 1.4),
      phase: random(TWO_PI),
    });
  }
  return list;
}

function drawStars() {
  noStroke();
  for (let i = 0; i < stars.length; i++) {
    const star = stars[i];
    const twinkle = 0.5 + 0.5 * Math.sin(playMillis() / 900 * star.speed + star.phase);
    fill(244, 237, 216, 40 + 100 * twinkle);
    circle(star.x * width, star.y * height, star.size);
  }
}

// p5 会把带空格的字体名整段加上引号，字体栈得在它设完之后自己写上。
function useFont(size, bold) {
  textSize(size);
  textStyle(bold ? BOLD : NORMAL);
  drawingContext.font = (bold ? "bold " : "normal ") + size + "px " + FONT;
}

function smoothstep(t) {
  const x = constrain(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function lerp3(a, b, t) {
  return [
    lerp(a[0], b[0], t),
    lerp(a[1], b[1], t),
    lerp(a[2], b[2], t),
  ];
}

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}
