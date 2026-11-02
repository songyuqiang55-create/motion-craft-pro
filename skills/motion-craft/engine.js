/**
 * Motion Craft Pro Engine v2.0.0
 * 轻量导演栈 · Claude Opus 审美向程序化动效
 *
 * 设计原则：
 *   1. 所有绘制都是时间 t 的纯函数（renderFrame(t)）——禁止 Date.now / Math.random
 *   2. 分层：背景 → 光 → 粒子 → 内容 → 字幕 → 后期
 *   3. 尺寸以舞台宽高比例计算，支持 16:9 / 4:3 / 9:16 / 1:1
 *   4. Spring / 转场 / 字幕时间轴 / 场景辅助，对标 Remotion 习惯（非完整 Remotion）
 */
(function (global) {
  'use strict';

  /* ============================================================
   * 1. 数学 / 缓动 / Spring
   * ============================================================ */

  const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const seg = (t, a, b) => clamp01((t - a) / Math.max(1e-9, b - a));
  const remap = (t, a, b, c, d) => lerp(c, d, seg(t, a, b));

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const Ease = {
    linear: t => t,
    outCubic: t => 1 - Math.pow(1 - t, 3),
    outQuart: t => 1 - Math.pow(1 - t, 4),
    outQuint: t => 1 - Math.pow(1 - t, 5),
    outExpo: t => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    inCubic: t => t * t * t,
    inQuint: t => Math.pow(t, 5),
    inOutCubic: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    inOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
    inOutQuint: t => (t < 0.5 ? 16 * Math.pow(t, 5) : 1 - Math.pow(-2 * t + 2, 5) / 2),
    outBack: (t, s = 1.220) => {
      // Claude aesthetic: subtle overshoot only (default s smaller than classic 1.70158)
      return 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
    },
    outElastic: t => {
      if (t === 0 || t === 1) return t;
      const c = (2 * Math.PI) / 3;
      return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c) + 1;
    }
  };

  /**
   * Remotion-style spring approximation as a 0..1 progress curve.
   * Uses damped harmonic envelope — deterministic for same params.
   * @param {number} t progress 0..1 (usually from seg)
   * @param {{damping?:number, mass?:number, stiffness?:number, overshootClamping?:boolean}} cfg
   */
  function spring(t, cfg = {}) {
    const damping = cfg.damping === undefined ? 18 : cfg.damping;
    const mass = cfg.mass === undefined ? 1 : cfg.mass;
    const stiffness = cfg.stiffness === undefined ? 160 : cfg.stiffness;
    const overshootClamping = !!cfg.overshootClamping;
    t = clamp01(t);
    if (t === 0) return 0;
    if (t === 1) return 1;

    // Map t into a synthetic time domain so curve settles near 1.
    const w0 = Math.sqrt(stiffness / mass);
    const zeta = damping / (2 * Math.sqrt(stiffness * mass));
    const time = t * 1.35; // stretch so most settle happens within [0,1]

    let y;
    if (zeta < 1) {
      const wd = w0 * Math.sqrt(1 - zeta * zeta);
      y = 1 - Math.exp(-zeta * w0 * time) * (
        Math.cos(wd * time) + (zeta * w0 / wd) * Math.sin(wd * time)
      );
    } else {
      y = 1 - Math.exp(-w0 * time) * (1 + w0 * time);
    }
    if (overshootClamping) y = clamp01(y);
    return y;
  }

  /** Convenience: spring from time window */
  function springSeg(t, a, b, cfg) {
    return spring(seg(t, a, b), cfg);
  }

  /* ============================================================
   * 2. 色彩 / 字体
   * ============================================================ */

  function rgba(hex, a) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  /** Claude / editorial palette helpers */
  const Palette = {
    ink: '#f4f1ea',
    inkDim: 'rgba(244,241,234,0.62)',
    inkFaint: 'rgba(244,241,234,0.34)',
    accent: '#c4a574',       // restrained warm bronze (not neon amber)
    accentSoft: '#e2d2b4',
    cool: '#6b8799',
    bg0: '#0c0d10',
    bg1: '#14161c',
    bg2: '#08090c',
    paper: '#f7f4ef',
    paperInk: '#1a1c22'
  };

  const FONT_STACK = '"Inter", "SF Pro Text", "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif';
  const SERIF_STACK = '"Iowan Old Style", "Palatino Linotype", "Songti SC", "Noto Serif CJK SC", "Source Han Serif SC", serif';
  const MONO_STACK = '"SF Mono", "JetBrains Mono", "Cascadia Code", "Consolas", monospace';

  /* ============================================================
   * 3. 光效
   * ============================================================ */

  function glow(ctx, x, y, radius, color, intensity = 1, coreRatio = 0.28) {
    if (radius <= 0 || intensity <= 0) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, rgba(color, 0.85 * intensity));
    g.addColorStop(coreRatio, rgba(color, 0.28 * intensity));
    g.addColorStop(0.65, rgba(color, 0.07 * intensity));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function beam(ctx, x, y, len, halfWidth, angle, color, intensity = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    const g = ctx.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, rgba(color, 0.16 * intensity));
    g.addColorStop(0.5, rgba(color, 0.05 * intensity));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-halfWidth * 0.12, 0);
    ctx.lineTo(halfWidth * 0.12, 0);
    ctx.lineTo(halfWidth, len);
    ctx.lineTo(-halfWidth, len);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** Soft editorial backdrop gradient (Claude calm look) */
  function drawBackdrop(ctx, W, H, opt = {}) {
    const c0 = opt.c0 || Palette.bg1;
    const c1 = opt.c1 || Palette.bg0;
    const c2 = opt.c2 || Palette.bg2;
    const g = ctx.createLinearGradient(0, 0, W * 0.2, H);
    g.addColorStop(0, c0);
    g.addColorStop(0.55, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  /* ============================================================
   * 4. 粒子
   * ============================================================ */

  function createParticles(count, W, H, opt = {}) {
    const rnd = mulberry32(opt.seed || 1234);
    const hue = opt.hueRange || [32, 48];
    const size = opt.sizeRange || [0.5, 2.4];
    const speed = opt.speedRange || [0.12, 0.7];
    const arr = [];
    for (let i = 0; i < count; i++) {
      const z = rnd();
      arr.push({
        x: rnd() * W,
        y: rnd() * H,
        z,
        r: lerp(size[0], size[1], z * z),
        alpha: lerp(0.06, 0.42, z),
        speed: lerp(speed[0], speed[1], z),
        phase: rnd() * Math.PI * 2,
        hue: lerp(hue[0], hue[1], rnd()),
        wobble: 3 + z * 18
      });
    }
    return arr;
  }

  function drawParticles(ctx, particles, t, W, H, opt = {}) {
    const driftY = opt.driftY === undefined ? 0.55 : opt.driftY;
    const twinkleAmp = opt.twinkle === undefined ? 0.28 : opt.twinkle;
    const glowNear = opt.glowOnNear !== false;
    const sorted = particles.slice().sort((a, b) => a.z - b.z);
    for (const p of sorted) {
      const wob = Math.sin(t * p.speed + p.phase) * p.wobble;
      const rise = ((t * (3 + p.z * 12)) % (H + 240)) * driftY;
      const px = p.x + wob;
      const py = ((p.y - rise) % (H + 240) + H + 240) % (H + 240) - 120;
      const tw = 1 - twinkleAmp + twinkleAmp * (0.5 + 0.5 * Math.sin(t * (0.9 + p.z * 1.6) + p.phase));
      const a = p.alpha * tw;
      if (a <= 0.004) continue;
      ctx.beginPath();
      ctx.arc(px, py, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue}, 42%, ${58 + p.z * 14}%, ${a})`;
      ctx.fill();
      if (glowNear && p.z > 0.78) {
        const g = ctx.createRadialGradient(px, py, 0, px, py, p.r * 7);
        g.addColorStop(0, `hsla(${p.hue}, 50%, 62%, ${a * 0.32})`);
        g.addColorStop(1, `hsla(${p.hue}, 50%, 62%, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, py, p.r * 7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /* ============================================================
   * 5. 后期：颗粒 / 暗角 / 色彩分级
   * ============================================================ */

  function drawGrain(ctx, W, H, frameIndex, alpha = 0.022, density = 1) {
    const rnd = mulberry32(frameIndex * 7919 + 13);
    const n = Math.floor(700 * density * (W * H) / (1920 * 1080));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < n; i++) {
      ctx.fillRect(rnd() * W, rnd() * H, 1.2, 1.2);
    }
    ctx.restore();
  }

  function drawVignette(ctx, W, H, strength = 0.48) {
    const r = Math.hypot(W, H) / 2;
    const g = ctx.createRadialGradient(W / 2, H / 2, r * 0.38, W / 2, H / 2, r * 0.98);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.72, `rgba(0,0,0,${strength * 0.38})`);
    g.addColorStop(1, `rgba(0,0,0,${strength})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  /** Subtle teal/orange grade for editorial look */
  function drawColorGrade(ctx, W, H, opt = {}) {
    const warm = opt.warm === undefined ? 0.035 : opt.warm;
    const cool = opt.cool === undefined ? 0.028 : opt.cool;
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, `rgba(90,140,170,${cool})`);
    g.addColorStop(0.5, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(200,150,80,${warm})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  /* ============================================================
   * 6. 排版
   * ============================================================ */

  function measureTracked(ctx, text, tracking) {
    let w = 0;
    for (const ch of text) w += ctx.measureText(ch).width + tracking;
    return w - (text.length ? tracking : 0);
  }

  function drawTracked(ctx, text, x, y, opt = {}) {
    const tracking = opt.tracking || 0;
    const align = opt.align || 'left';
    const chars = Array.from(text);
    const width = measureTracked(ctx, text, tracking);
    let cx = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
    ctx.textAlign = 'left';
    ctx.textBaseline = opt.baseline || 'alphabetic';
    const easeFn = opt.ease || Ease.outQuint;

    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      let alpha = 1, dy = 0, sc = 1;
      if (opt.stagger !== undefined) {
        const p = easeFn(clamp01((opt.progress - i * opt.stagger) / (opt.charDur || 0.55)));
        alpha = p;
        dy = (1 - p) * (opt.rise || 28);
        sc = 0.96 + 0.04 * p;
      }
      if (alpha > 0.002) {
        ctx.save();
        ctx.globalAlpha *= alpha;
        if (sc !== 1) {
          const mw = ctx.measureText(ch).width;
          ctx.translate(cx + mw / 2, y + dy);
          ctx.scale(sc, sc);
          ctx.translate(-(cx + mw / 2), -(y + dy));
        }
        if (opt.glow) {
          ctx.shadowColor = opt.glowColor || 'rgba(196,165,116,0.55)';
          ctx.shadowBlur = opt.glow;
        }
        ctx.fillStyle = opt.fill || '#fff';
        ctx.fillText(ch, cx, y + dy);
        ctx.restore();
      }
      cx += ctx.measureText(ch).width + tracking;
    }
    return width;
  }

  function wrapCN(ctx, text, maxWidth) {
    const lines = [];
    let line = '';
    for (const ch of text) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = ch;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  /* ============================================================
   * 7. 镜头 / 转场
   * ============================================================ */

  function camera(ctx, W, H, opt, draw) {
    const scale = opt.scale || 1;
    const x = opt.x || 0;
    const y = opt.y || 0;
    ctx.save();
    ctx.translate(W / 2 + x, H / 2 + y);
    ctx.scale(scale, scale);
    ctx.translate(-W / 2, -H / 2);
    draw();
    ctx.restore();
  }

  /**
   * Transition helpers return alpha + offsets for content layers.
   * type: 'fade' | 'slide' | 'wipe'
   */
  function transition(progress, type = 'fade', opt = {}) {
    const p = clamp01(progress);
    const dir = opt.dir || 1; // 1=from right/down, -1=opposite
    const dist = opt.dist === undefined ? 48 : opt.dist;
    if (type === 'fade') {
      return { alpha: Ease.inOutCubic(p), x: 0, y: 0, wipe: 1 };
    }
    if (type === 'slide') {
      const e = Ease.outQuint(p);
      return {
        alpha: e,
        x: (1 - e) * dist * dir,
        y: opt.axis === 'y' ? (1 - e) * dist * dir : 0,
        wipe: 1
      };
    }
    // wipe: left→right reveal
    return { alpha: 1, x: 0, y: 0, wipe: Ease.inOutCubic(p) };
  }

  function applyWipe(ctx, W, H, wipeAmount, draw) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W * wipeAmount, H);
    ctx.clip();
    draw();
    ctx.restore();
  }

  /** Beat opacity with soft hold: fade in, hold, fade out */
  function beatAlpha(t, start, end, fadeIn = 0.45, fadeOut = 0.45) {
    const fi = Ease.outCubic(seg(t, start, start + fadeIn));
    const fo = 1 - Ease.inCubic(seg(t, end - fadeOut, end));
    return Math.min(fi, fo);
  }

  /* ============================================================
   * 8. 基础组件
   * ============================================================ */

  function divider(ctx, x, y, maxW, progress, color = Palette.accent, thickness = 1.5) {
    if (progress <= 0) return;
    const w = maxW * Ease.outCubic(progress);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.7 * progress;
    ctx.lineWidth = thickness;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.stroke();
    ctx.restore();
  }

  function card(ctx, x, y, w, h, opt = {}) {
    const r = opt.radius === undefined ? 16 : opt.radius;
    ctx.save();
    if (opt.shadow) {
      ctx.shadowColor = opt.shadow;
      ctx.shadowBlur = opt.shadowBlur || 36;
    }
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    if (opt.fill) { ctx.fillStyle = opt.fill; ctx.fill(); }
    ctx.shadowBlur = 0;
    if (opt.stroke) {
      ctx.strokeStyle = opt.stroke;
      ctx.lineWidth = opt.lineWidth || 1;
      ctx.stroke();
    }
    ctx.restore();
  }

  function ring(ctx, cx, cy, radius, progress, opt = {}) {
    const start = opt.start === undefined ? -Math.PI / 2 : opt.start;
    const end = start + Math.PI * 2 * Ease.outCubic(clamp01(progress));
    ctx.save();
    ctx.lineCap = 'round';
    if (opt.trackColor) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = opt.trackColor;
      ctx.lineWidth = opt.lineWidth || 6;
      ctx.stroke();
    }
    if (progress > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, start, end);
      ctx.strokeStyle = opt.color || Palette.accent;
      ctx.lineWidth = opt.lineWidth || 6;
      if (opt.glow) { ctx.shadowColor = opt.color || Palette.accent; ctx.shadowBlur = opt.glow; }
      ctx.stroke();
    }
    ctx.restore();
  }

  function bars(ctx, x, y, w, h, values, progress, opt = {}) {
    const n = values.length;
    const gap = opt.gap === undefined ? 16 : opt.gap;
    const bw = (w - gap * (n - 1)) / n;
    const maxV = Math.max(...values, 1);
    for (let i = 0; i < n; i++) {
      const p = spring(clamp01((progress - i * 0.1) / 0.7), { damping: 16, stiffness: 140, overshootClamping: true });
      if (p <= 0) continue;
      const bh = (values[i] / maxV) * h * p;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x + i * (bw + gap), y + h - bh, bw, bh, opt.radius || 6);
      ctx.fillStyle = opt.colors ? opt.colors[i % opt.colors.length] : Palette.accent;
      ctx.globalAlpha = 0.92;
      ctx.fill();
      ctx.restore();
    }
  }

  /* ============================================================
   * 9. 字幕时间轴
   * ============================================================ */

  /**
   * captions: [{start, end, text}] or word-level [{start, end, text, words:[{t,text}]}]
   * Draws bottom-safe captions with Claude-calm styling.
   */
  function drawCaptions(ctx, W, H, t, captions, opt = {}) {
    if (!captions || !captions.length) return;
    const margin = opt.margin === undefined ? Math.round(H * 0.08) : opt.margin;
    const active = captions.filter(c => t >= c.start && t <= c.end);
    if (!active.length) return;
    const c = active[active.length - 1];
    const fade = Math.min(
      Ease.outCubic(seg(t, c.start, c.start + 0.18)),
      1 - Ease.inCubic(seg(t, c.end - 0.18, c.end))
    );
    ctx.save();
    ctx.globalAlpha = fade * (opt.alpha === undefined ? 0.95 : opt.alpha);
    const fontSize = opt.fontSize || Math.round(H * 0.028);
    ctx.font = `500 ${fontSize}px ${FONT_STACK}`;
    const maxW = W * 0.72;
    const lines = wrapCN(ctx, c.text, maxW);
    const lineH = fontSize * 1.45;
    const boxH = lines.length * lineH + 20;
    const boxW = Math.min(maxW + 40, Math.max(...lines.map(l => ctx.measureText(l).width)) + 48);
    const bx = (W - boxW) / 2;
    const by = H - margin - boxH;

    // soft pill background
    ctx.fillStyle = 'rgba(8,9,12,0.55)';
    ctx.beginPath();
    ctx.roundRect(bx, by, boxW, boxH, 10);
    ctx.fill();

    ctx.fillStyle = opt.fill || Palette.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    lines.forEach((ln, i) => {
      // word highlight if words provided
      if (c.words && c.words.length) {
        // fall back to plain for multi-line simplicity
      }
      ctx.fillText(ln, W / 2, by + 10 + i * lineH);
    });
    ctx.restore();
  }

  /**
   * Build caption cues from Edge TTS WordBoundary JSON:
   * [{offset_ms, duration_ms, text}, ...] → [{start,end,text}]
   * Groups into phrases of ~N chars for readability.
   */
  function captionsFromWordBoundaries(words, opt = {}) {
    const groupChars = opt.groupChars || 14;
    const cues = [];
    let buf = '', start = null, end = 0;
    for (const w of words) {
      const s = (w.offset_ms || w.offset || 0) / 1000;
      const d = (w.duration_ms || w.duration || 0) / 1000;
      const e = s + d;
      if (start === null) start = s;
      buf += w.text || w.word || '';
      end = e;
      if (buf.replace(/\s/g, '').length >= groupChars) {
        cues.push({ start, end: end + 0.05, text: buf.trim() });
        buf = '';
        start = null;
      }
    }
    if (buf.trim()) cues.push({ start: start || 0, end: end + 0.08, text: buf.trim() });
    return cues;
  }

  /* ============================================================
   * 10. 分镜运行时
   * ============================================================ */

  function findBeat(storyboard, t) {
    const beats = (storyboard && storyboard.beats) || [];
    return beats.filter(b => t >= b.start && t < b.end);
  }

  function layoutGrid(W, H, aspectHint) {
    const short = Math.min(W, H);
    const M = Math.round(short * 0.078);
    return {
      M,
      left: M,
      right: W - M,
      top: M,
      bottom: H - M,
      colL: M,
      colLW: Math.round(W * 0.42),
      colR: Math.round(W * 0.52),
      colRW: W - Math.round(W * 0.52) - M,
      cx: W / 2,
      cy: H / 2,
      scale: W / 1920
    };
  }

  /* ============================================================
   * 导出
   * ============================================================ */

  global.MC = {
    clamp01, clamp, lerp, seg, remap, mulberry32, Ease, spring, springSeg,
    rgba, Palette,
    FONT_STACK, SERIF_STACK, MONO_STACK,
    glow, beam, drawBackdrop,
    createParticles, drawParticles,
    drawGrain, drawVignette, drawColorGrade,
    measureTracked, drawTracked, wrapCN,
    camera, transition, applyWipe, beatAlpha,
    divider, card, ring, bars,
    drawCaptions, captionsFromWordBoundaries,
    findBeat, layoutGrid,
    VERSION: '2.0.0'
  };
})(typeof window !== 'undefined' ? window : globalThis);
