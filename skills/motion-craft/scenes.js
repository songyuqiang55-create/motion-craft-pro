/**
 * Motion Craft Pro · Scene Helpers v2.0.0
 * TitleBeat / BulletReveal / StatCounter / CompareBars / QuoteCard / EndCard
 * 依赖全局 MC（engine.js）。全部是时间 t 的纯函数绘制。
 */
(function (global) {
  'use strict';
  const M = global.MC;
  if (!M) throw new Error('MC engine must load before scenes.js');

  const {
    Ease, spring, springSeg, seg, lerp, clamp01, beatAlpha,
    drawTracked, wrapCN, divider, card, bars, ring, glow,
    FONT_STACK, SERIF_STACK, Palette, rgba
  } = M;

  /**
   * TitleBeat — editorial title with label + headline + optional sub
   * beat.copy: { label, title, sub }
   */
  function TitleBeat(ctx, W, H, t, beat, layout) {
    const a = beatAlpha(t, beat.start, beat.end, 0.5, 0.55);
    if (a <= 0) return;
    const copy = beat.copy || {};
    const L = layout || M.layoutGrid(W, H);
    const s = L.scale;
    const p = springSeg(t, beat.start, beat.start + 1.1, { damping: 17, stiffness: 150 });

    ctx.save();
    ctx.globalAlpha = a;

    if (copy.label) {
      ctx.font = `600 ${Math.round(18 * s)}px ${FONT_STACK}`;
      drawTracked(ctx, copy.label, L.colL, L.top + 80 * s, {
        tracking: 5 * s, fill: Palette.accent, progress: p * 1.2, stagger: 0.04, rise: 12 * s
      });
    }

    const title = copy.title || '';
    ctx.font = `700 ${Math.round(86 * s)}px ${FONT_STACK}`;
    const lines = wrapCN(ctx, title, L.colLW);
    lines.forEach((ln, i) => {
      drawTracked(ctx, ln, L.colL, L.top + 180 * s + i * 100 * s, {
        tracking: 3 * s, fill: Palette.ink,
        progress: p, stagger: 0.08, charDur: 0.55, rise: 32 * s,
        glow: 18, glowColor: 'rgba(196,165,116,0.35)'
      });
    });

    if (copy.sub) {
      const sp = Ease.outCubic(seg(t, beat.start + 0.55, beat.start + 1.3));
      ctx.globalAlpha = a * sp;
      ctx.font = `400 ${Math.round(28 * s)}px ${FONT_STACK}`;
      drawTracked(ctx, copy.sub, L.colL, L.top + 180 * s + lines.length * 100 * s + 28 * s, {
        tracking: 0.5 * s, fill: Palette.inkDim
      });
      divider(ctx, L.colL, L.top + 180 * s + lines.length * 100 * s + 70 * s, 160 * s,
        seg(t, beat.start + 0.9, beat.start + 1.5), Palette.accent, 1.5);
    }
    ctx.restore();
  }

  /**
   * BulletReveal — numbered points, one idea per line, staggered
   * beat.copy: { label?, items: [{k, title, desc}] }
   */
  function BulletReveal(ctx, W, H, t, beat, layout) {
    const a = beatAlpha(t, beat.start, beat.end, 0.4, 0.5);
    if (a <= 0) return;
    const copy = beat.copy || {};
    const items = copy.items || [];
    const L = layout || M.layoutGrid(W, H);
    const s = L.scale;

    ctx.save();
    ctx.globalAlpha = a;
    if (copy.label) {
      ctx.font = `600 ${Math.round(18 * s)}px ${FONT_STACK}`;
      drawTracked(ctx, copy.label, L.colL, L.top + 70 * s, { tracking: 4 * s, fill: Palette.accent });
    }

    items.forEach((it, i) => {
      const base = beat.start + 0.35 + i * 0.55;
      const p = springSeg(t, base, base + 0.85, { damping: 18, stiffness: 145, overshootClamping: true });
      if (p <= 0) return;
      const y = L.top + 160 * s + i * 120 * s;
      const dx = (1 - p) * 28 * s;
      ctx.save();
      ctx.globalAlpha = a * Math.min(1, p * 1.1);
      ctx.font = `600 ${Math.round(20 * s)}px ${FONT_STACK}`;
      drawTracked(ctx, it.k || String(i + 1).padStart(2, '0'), L.colL + dx, y, {
        tracking: 2 * s, fill: Palette.accent
      });
      ctx.font = `600 ${Math.round(36 * s)}px ${FONT_STACK}`;
      drawTracked(ctx, it.title || '', L.colL + 64 * s + dx, y + 2 * s, {
        tracking: 1.5 * s, fill: Palette.ink
      });
      if (it.desc) {
        ctx.font = `400 ${Math.round(24 * s)}px ${FONT_STACK}`;
        drawTracked(ctx, it.desc, L.colL + 64 * s + dx, y + 44 * s, {
          tracking: 0.4 * s, fill: Palette.inkFaint
        });
      }
      ctx.restore();
    });
    ctx.restore();
  }

  /**
   * StatCounter — big number counting up + unit + caption
   * beat.copy: { value, suffix?, prefix?, label, caption }
   * beat.visual: { from?:0 }
   */
  function StatCounter(ctx, W, H, t, beat, layout) {
    const a = beatAlpha(t, beat.start, beat.end, 0.4, 0.5);
    if (a <= 0) return;
    const copy = beat.copy || {};
    const L = layout || M.layoutGrid(W, H);
    const s = L.scale;
    const p = springSeg(t, beat.start, beat.start + 1.2, { damping: 14, stiffness: 120 });
    const from = (beat.visual && beat.visual.from) || 0;
    const target = Number(copy.value) || 0;
    const cur = Math.round(lerp(from, target, Ease.outQuint(p)));

    ctx.save();
    ctx.globalAlpha = a;
    if (copy.label) {
      ctx.font = `600 ${Math.round(18 * s)}px ${FONT_STACK}`;
      drawTracked(ctx, copy.label, L.cx, L.cy - 120 * s, {
        tracking: 5 * s, fill: Palette.accent, align: 'center'
      });
    }
    ctx.font = `700 ${Math.round(140 * s)}px ${FONT_STACK}`;
    const num = `${copy.prefix || ''}${cur}${copy.suffix || ''}`;
    drawTracked(ctx, num, L.cx, L.cy + 20 * s, {
      tracking: 2 * s, fill: Palette.ink, align: 'center',
      glow: 22, glowColor: 'rgba(196,165,116,0.4)'
    });
    if (copy.caption) {
      ctx.font = `400 ${Math.round(26 * s)}px ${FONT_STACK}`;
      drawTracked(ctx, copy.caption, L.cx, L.cy + 90 * s, {
        tracking: 0.5 * s, fill: Palette.inkDim, align: 'center'
      });
    }
    // subtle ring
    ring(ctx, L.cx, L.cy - 10 * s, 200 * s, p, {
      color: Palette.accent, trackColor: 'rgba(244,241,234,0.08)', lineWidth: 2, glow: 8
    });
    ctx.restore();
  }

  /**
   * CompareBars — two or more labeled bars
   * beat.copy: { label, items:[{label,value}], note? }
   */
  function CompareBars(ctx, W, H, t, beat, layout) {
    const a = beatAlpha(t, beat.start, beat.end, 0.4, 0.5);
    if (a <= 0) return;
    const copy = beat.copy || {};
    const items = copy.items || [];
    const L = layout || M.layoutGrid(W, H);
    const s = L.scale;
    const p = seg(t, beat.start + 0.2, beat.start + 1.4);

    ctx.save();
    ctx.globalAlpha = a;
    if (copy.label) {
      ctx.font = `600 ${Math.round(18 * s)}px ${FONT_STACK}`;
      drawTracked(ctx, copy.label, L.colL, L.top + 80 * s, { tracking: 4 * s, fill: Palette.accent });
    }
    if (copy.title) {
      ctx.font = `700 ${Math.round(64 * s)}px ${FONT_STACK}`;
      drawTracked(ctx, copy.title, L.colL, L.top + 170 * s, {
        tracking: 2 * s, fill: Palette.ink,
        progress: spring(p, { damping: 16 }), stagger: 0.06, rise: 24 * s
      });
    }

    const values = items.map(it => it.value);
    const bw = Math.min(480 * s, L.colRW);
    const bh = 280 * s;
    const bx = L.colR;
    const by = L.cy - bh / 2;
    const colors = items.map((_, i) => i === items.length - 1 ? Palette.accent : 'rgba(244,241,234,0.22)');
    // baseline
    ctx.beginPath();
    ctx.moveTo(bx - 12 * s, by + bh);
    ctx.lineTo(bx + bw + 12 * s, by + bh);
    ctx.strokeStyle = 'rgba(244,241,234,0.14)';
    ctx.lineWidth = 1;
    ctx.stroke();
    bars(ctx, bx, by, bw, bh, values, p, { gap: 72 * s, radius: 8, colors });

    ctx.font = `500 ${Math.round(22 * s)}px ${FONT_STACK}`;
    items.forEach((it, i) => {
      const n = items.length;
      const gap = 72 * s;
      const barW = (bw - gap * (n - 1)) / n;
      const cx = bx + i * (barW + gap) + barW / 2;
      ctx.fillStyle = i === n - 1 ? Palette.accentSoft : Palette.inkFaint;
      ctx.textAlign = 'center';
      ctx.fillText(it.label || '', cx, by + bh + 40 * s);
    });

    if (copy.note) {
      ctx.font = `400 ${Math.round(24 * s)}px ${FONT_STACK}`;
      drawTracked(ctx, copy.note, L.colL, L.bottom - 40 * s, { tracking: 0.4 * s, fill: Palette.inkDim });
    }
    ctx.restore();
  }

  /**
   * QuoteCard — large centered quote / key sentence
   * beat.copy: { quote, attribution? }
   */
  function QuoteCard(ctx, W, H, t, beat, layout) {
    const a = beatAlpha(t, beat.start, beat.end, 0.5, 0.55);
    if (a <= 0) return;
    const copy = beat.copy || {};
    const L = layout || M.layoutGrid(W, H);
    const s = L.scale;
    const p = springSeg(t, beat.start, beat.start + 1.0, { damping: 16, stiffness: 130 });

    ctx.save();
    ctx.globalAlpha = a * Math.min(1, p * 1.05);
    const q = copy.quote || '';
    ctx.font = `600 ${Math.round(48 * s)}px ${SERIF_STACK}`;
    const maxW = W * 0.62;
    const lines = wrapCN(ctx, q, maxW);
    const startY = L.cy - (lines.length * 64 * s) / 2;
    lines.forEach((ln, i) => {
      drawTracked(ctx, ln, L.cx, startY + i * 64 * s, {
        tracking: 1.5 * s, fill: Palette.ink, align: 'center',
        progress: p, stagger: 0.05, rise: 18 * s
      });
    });
    divider(ctx, L.cx - 60 * s, startY + lines.length * 64 * s + 28 * s, 120 * s,
      seg(t, beat.start + 0.7, beat.start + 1.3), Palette.accent, 1.5);
    if (copy.attribution) {
      ctx.font = `400 ${Math.round(22 * s)}px ${FONT_STACK}`;
      drawTracked(ctx, copy.attribution, L.cx, startY + lines.length * 64 * s + 70 * s, {
        tracking: 2 * s, fill: Palette.inkFaint, align: 'center'
      });
    }
    ctx.restore();
  }

  /**
   * EndCard — brand / CTA close
   * beat.copy: { title, sub?, brand? }
   */
  function EndCard(ctx, W, H, t, beat, layout) {
    const a = beatAlpha(t, beat.start, beat.end, 0.55, 0.4);
    if (a <= 0) return;
    const copy = beat.copy || {};
    const L = layout || M.layoutGrid(W, H);
    const s = L.scale;
    const p = springSeg(t, beat.start, beat.start + 1.0, { damping: 17, stiffness: 140 });

    ctx.save();
    ctx.globalAlpha = a;
    glow(ctx, L.cx, L.cy, 280 * s, Palette.accent, 0.12 * p, 0.25);
    ctx.font = `700 ${Math.round(52 * s)}px ${FONT_STACK}`;
    drawTracked(ctx, copy.title || '', L.cx, L.cy - 10 * s, {
      tracking: 2 * s, fill: Palette.ink, align: 'center',
      progress: p, stagger: 0.05, rise: 22 * s,
      glow: 16, glowColor: 'rgba(196,165,116,0.45)'
    });
    if (copy.sub) {
      ctx.font = `400 ${Math.round(26 * s)}px ${FONT_STACK}`;
      drawTracked(ctx, copy.sub, L.cx, L.cy + 50 * s, {
        tracking: 1 * s, fill: Palette.accentSoft, align: 'center'
      });
    }
    if (copy.brand) {
      ctx.font = `500 ${Math.round(16 * s)}px ${FONT_STACK}`;
      drawTracked(ctx, copy.brand, L.cx, H - L.M * 0.7, {
        tracking: 4 * s, fill: Palette.inkFaint, align: 'center'
      });
    }
    ctx.restore();
  }

  /** Dispatch by beat.type */
  function drawScene(ctx, W, H, t, beat, layout) {
    const map = {
      TitleBeat, title: TitleBeat,
      BulletReveal, bullets: BulletReveal,
      StatCounter, stat: StatCounter,
      CompareBars, compare: CompareBars,
      QuoteCard, quote: QuoteCard,
      EndCard, end: EndCard
    };
    const fn = map[beat.type];
    if (fn) fn(ctx, W, H, t, beat, layout);
  }

  global.MCScenes = {
    TitleBeat, BulletReveal, StatCounter, CompareBars, QuoteCard, EndCard, drawScene,
    VERSION: '2.0.0'
  };
})(typeof window !== 'undefined' ? window : globalThis);
