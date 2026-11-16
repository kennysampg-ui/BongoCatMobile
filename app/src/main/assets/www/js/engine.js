/*
 * Bongo Cat Mobile – motor de animação.
 * Usado pela interface do app (pré-visualização) e pela sobreposição flutuante (overlay.html).
 *
 *  - SvgRenderer   : personagens embutidos, desenhados em SVG com patinhas animadas por "molas".
 *  - MediaRenderer : personagens importados (PNG, GIF transparente, spritesheet) + efeitos.
 *  - Engine        : máquina de estados (repouso/digitação/cliques/mouse/toque) e agendador de frames.
 *
 * Desempenho / bateria:
 *  - requestAnimationFrame SÓ enquanto há movimento; em repouso usa setTimeout (≈12 fps) ou, no modo
 *    economia, só acorda para piscar;
 *  - setPaused(true) cancela qualquer timer/rAF (chamado quando oculto, tela apagada ou app em 2º plano).
 */
(function (global) {
  'use strict';

  var STATES = ['idle', 'typing', 'clickLeft', 'clickRight', 'mouseMove', 'touch'];
  var HOLD = { typing: 380, clickLeft: 280, clickRight: 280, mouseMove: 260, touch: 520 };
  var AUTO_INTERVAL = { typing: 230, clickLeft: 650, clickRight: 650, mouseMove: 90, touch: 1100 };
  var DEFAULT_FX = { idle: 'breathe', typing: 'bounce', clickLeft: 'tilt', clickRight: 'tilt', mouseMove: 'follow', touch: 'pop' };
  var config = { charBase: '/chars/' };

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function now() { return (global.performance || Date).now(); }
  function num(v, d) { v = +v; return isFinite(v) ? v : d; }

  /** Arquivos importados vêm como "<id>/<arquivo>"; URLs data:/blob: (modo navegador) passam direto. */
  function urlFor(file) {
    if (!file) return '';
    if (/^(data:|blob:|https?:)/.test(file)) return file;
    return config.charBase + encodeURI(file);
  }

  // ------------------------------------------------------------------ SVG dos personagens embutidos

  var PALETTE_DEFAULT = {
    fur: '#e9e9f0', accent: '#9aa0b4', inner: '#ffb3c6', muzzle: '#ffffff', nose: '#ff7fa5',
    eye: '#241c2e', line: '#3a2f3f', drum: '#c98b4f', skin: '#f4e3c3', rim: '#8a5a2b',
    paw: null, ear: null, stripes: false, mask: false
  };

  function drumSvg(cx, cls, p) {
    return '<g class="' + cls + '">' +
      '<path d="M' + (cx - 30) + ' 156 L' + (cx - 26) + ' 194 Q' + cx + ' 203 ' + (cx + 26) + ' 194 L' + (cx + 30) + ' 156 Z" fill="' + p.drum + '"/>' +
      '<path d="M' + (cx - 28) + ' 169 Q' + cx + ' 177 ' + (cx + 28) + ' 169 M' + (cx - 27) + ' 181 Q' + cx + ' 189 ' + (cx + 27) + ' 181" stroke="rgba(0,0,0,.2)" stroke-width="2" fill="none"/>' +
      '<ellipse cx="' + cx + '" cy="156" rx="30" ry="9" fill="' + p.skin + '" stroke="' + p.rim + '" stroke-width="3"/>' +
      '<ellipse class="rip" cx="' + cx + '" cy="156" rx="30" ry="9" fill="none" stroke="#fff" stroke-width="2.5" opacity="0"/>' +
      '</g>';
  }

  function earsSvg(sp, p) {
    var ear = p.ear || p.fur;
    var back = '', front = '';
    if (sp === 'cat') {
      back = '<g class="earL"><path d="M50 68 L55 20 L92 46 Z" fill="' + ear + '"/><path d="M58 57 L61 33 L79 47 Z" fill="' + p.inner + '"/></g>' +
             '<g class="earR"><path d="M150 68 L145 20 L108 46 Z" fill="' + ear + '"/><path d="M142 57 L139 33 L121 47 Z" fill="' + p.inner + '"/></g>';
    } else if (sp === 'fox') {
      back = '<g class="earL"><path d="M46 72 L50 12 L94 44 Z" fill="' + ear + '"/><path d="M50 12 L61 28 L46 31 Z" fill="' + p.accent + '"/><path d="M58 60 L62 34 L82 48 Z" fill="' + p.inner + '"/></g>' +
             '<g class="earR"><path d="M154 72 L150 12 L106 44 Z" fill="' + ear + '"/><path d="M150 12 L139 28 L154 31 Z" fill="' + p.accent + '"/><path d="M142 60 L138 34 L118 48 Z" fill="' + p.inner + '"/></g>';
    } else if (sp === 'bunny') {
      back = '<g class="earL"><g transform="rotate(-8 76 56)"><ellipse cx="76" cy="24" rx="13" ry="36" fill="' + ear + '"/><ellipse cx="76" cy="27" rx="6.5" ry="26" fill="' + p.inner + '"/></g></g>' +
             '<g class="earR"><g transform="rotate(8 124 56)"><ellipse cx="124" cy="24" rx="13" ry="36" fill="' + ear + '"/><ellipse cx="124" cy="27" rx="6.5" ry="26" fill="' + p.inner + '"/></g></g>';
    } else if (sp === 'panda') {
      back = '<g class="earL"><circle cx="62" cy="52" r="16" fill="' + p.accent + '"/></g><g class="earR"><circle cx="138" cy="52" r="16" fill="' + p.accent + '"/></g>';
    } else if (sp === 'dog') {
      back = '<g class="earL"></g><g class="earR"></g>';
      front = '<g class="earLf"><ellipse cx="47" cy="80" rx="15" ry="31" fill="' + p.accent + '" transform="rotate(12 47 80)"/></g>' +
              '<g class="earRf"><ellipse cx="153" cy="80" rx="15" ry="31" fill="' + p.accent + '" transform="rotate(-12 153 80)"/></g>';
    }
    return { back: back, front: front };
  }

  function faceSvg(sp, p) {
    var s = '';
    if (sp === 'dog') {
      s += '<ellipse cx="100" cy="108" rx="27" ry="20" fill="' + p.muzzle + '"/>';
    } else if (sp === 'fox') {
      s += '<path d="M47 96 Q72 122 100 130 Q128 122 153 96 Q128 108 100 108 Q72 108 47 96Z" fill="' + p.muzzle + '"/>';
    } else if (sp === 'panda') {
      s += '<ellipse cx="100" cy="108" rx="24" ry="17" fill="' + p.muzzle + '"/>' +
           '<ellipse cx="76" cy="88" rx="13" ry="17" fill="' + p.accent + '" transform="rotate(-20 76 88)"/>' +
           '<ellipse cx="124" cy="88" rx="13" ry="17" fill="' + p.accent + '" transform="rotate(20 124 88)"/>';
    } else if (sp === 'bunny') {
      s += '<ellipse cx="100" cy="108" rx="22" ry="15" fill="' + p.muzzle + '"/>';
    } else if (sp === 'cat') {
      if (p.mask) s += '<ellipse cx="100" cy="100" rx="33" ry="27" fill="' + p.accent + '" opacity=".92"/>';
      if (p.stripes) {
        s += '<g stroke="' + p.accent + '" stroke-width="4.5" stroke-linecap="round" fill="none">' +
             '<path d="M100 43 L100 58"/><path d="M86 45 L89 57"/><path d="M114 45 L111 57"/>' +
             '<path d="M47 84 L60 86"/><path d="M47 95 L60 94"/><path d="M153 84 L140 86"/><path d="M153 95 L140 94"/></g>';
      }
      s += '<ellipse cx="100" cy="110" rx="18" ry="12" fill="' + p.muzzle + '" opacity=".9"/>';
    }
    // bochechas
    s += '<ellipse cx="64" cy="106" rx="8" ry="5" fill="#ff8fb1" opacity=".42"/><ellipse cx="136" cy="106" rx="8" ry="5" fill="#ff8fb1" opacity=".42"/>';
    // olhos
    if (sp === 'panda') {
      s += '<g class="eyes"><ellipse cx="76" cy="88" rx="5.5" ry="7" fill="#fff"/><circle cx="77" cy="89" r="3.2" fill="#15131c"/>' +
           '<ellipse cx="124" cy="88" rx="5.5" ry="7" fill="#fff"/><circle cx="123" cy="89" r="3.2" fill="#15131c"/></g>';
    } else {
      s += '<g class="eyes"><ellipse cx="78" cy="88" rx="6.5" ry="8.5" fill="' + p.eye + '"/><circle cx="80.2" cy="85" r="2.5" fill="#fff"/>' +
           '<ellipse cx="122" cy="88" rx="6.5" ry="8.5" fill="' + p.eye + '"/><circle cx="124.2" cy="85" r="2.5" fill="#fff"/></g>';
    }
    // nariz e boca
    var ln = 'stroke="' + p.line + '" stroke-width="2" fill="none" stroke-linecap="round"';
    if (sp === 'cat') {
      s += '<path d="M95 99 L105 99 L100 105 Z" fill="' + p.nose + '"/><path d="M100 105 L100 109 M100 109 Q95 114 90 110 M100 109 Q105 114 110 110" ' + ln + '/>' +
           '<g stroke="' + p.line + '" stroke-width="1.6" stroke-linecap="round" opacity=".6"><path d="M57 102 L33 97 M57 108 L33 111 M143 102 L167 97 M143 108 L167 111"/></g>';
    } else if (sp === 'dog') {
      s += '<ellipse cx="100" cy="98" rx="9.5" ry="6.5" fill="' + p.nose + '"/><path d="M100 104 L100 112 M100 112 Q92 120 86 112 M100 112 Q108 120 114 112" ' + ln + '/><path d="M95 117 Q100 129 105 117 Z" fill="#ff7b9c"/>';
    } else if (sp === 'bunny') {
      s += '<path d="M96 100 L104 100 L100 105 Z" fill="' + p.nose + '"/><path d="M100 105 L100 108 M100 108 Q95 112 91 109 M100 108 Q105 112 109 109" ' + ln + '/>' +
           '<rect x="95.5" y="111" width="4.2" height="9" rx="1.5" fill="#fff" stroke="' + p.line + '" stroke-width="1.2"/><rect x="100.3" y="111" width="4.2" height="9" rx="1.5" fill="#fff" stroke="' + p.line + '" stroke-width="1.2"/>';
    } else if (sp === 'panda') {
      s += '<ellipse cx="100" cy="100" rx="8.5" ry="5.5" fill="' + p.accent + '"/><path d="M100 105 L100 110 M100 110 Q94 115 89 111 M100 110 Q106 115 111 111" ' + ln + '/>';
    } else if (sp === 'fox') {
      s += '<ellipse cx="100" cy="104" rx="7.5" ry="5.5" fill="' + p.line + '"/><path d="M100 109 L100 113 M100 113 Q94 118 89 114 M100 113 Q106 118 111 114" ' + ln + '/>';
    }
    return s;
  }

  function buildSvg(def) {
    var p = {}, k, sp = def.species || 'cat';
    for (k in PALETTE_DEFAULT) p[k] = PALETTE_DEFAULT[k];
    for (k in (def.palette || {})) p[k] = def.palette[k];
    p.paw = p.paw || p.fur;
    var ears = earsSvg(sp, p);
    var armCol = p.paw;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="100%" height="100%" ' +
      'preserveAspectRatio="xMidYMid meet" style="display:block;overflow:visible">' +
      '<g class="body"><ellipse cx="100" cy="152" rx="50" ry="34" fill="' + p.fur + '"/>' +
      '<ellipse cx="100" cy="162" rx="27" ry="21" fill="' + p.muzzle + '" opacity=".85"/></g>' +
      '<g class="head">' + ears.back +
      '<ellipse cx="100" cy="88" rx="54" ry="46" fill="' + p.fur + '"/>' + ears.front + faceSvg(sp, p) + '</g>' +
      drumSvg(62, 'drumL', p) + drumSvg(138, 'drumR', p) +
      // braços: uma linha mais larga e escura por baixo faz o contorno
      '<line class="armLo" x1="80" y1="136" x2="62" y2="134" stroke="rgba(30,20,50,.28)" stroke-width="21" stroke-linecap="round"/>' +
      '<line class="armRo" x1="120" y1="136" x2="138" y2="134" stroke="rgba(30,20,50,.28)" stroke-width="21" stroke-linecap="round"/>' +
      '<line class="armL" x1="80" y1="136" x2="62" y2="134" stroke="' + armCol + '" stroke-width="17" stroke-linecap="round"/>' +
      '<line class="armR" x1="120" y1="136" x2="138" y2="134" stroke="' + armCol + '" stroke-width="17" stroke-linecap="round"/>' +
      '<g class="pawL" transform="translate(62 134)"><ellipse rx="15" ry="11.5" fill="' + armCol + '" stroke="rgba(30,20,50,.3)" stroke-width="2.5"/><path d="M-5 -1 L-5 5 M0 -2 L0 5 M5 -1 L5 5" stroke="' + p.line + '" stroke-width="1.6" stroke-linecap="round" opacity=".4"/></g>' +
      '<g class="pawR" transform="translate(138 134)"><ellipse rx="15" ry="11.5" fill="' + armCol + '" stroke="rgba(30,20,50,.3)" stroke-width="2.5"/><path d="M-5 -1 L-5 5 M0 -2 L0 5 M5 -1 L5 5" stroke="' + p.line + '" stroke-width="1.6" stroke-linecap="round" opacity=".4"/></g>' +
      '</svg>';
  }

  // ------------------------------------------------------------------ renderer SVG

  function SvgRenderer(def, container) {
    this.def = def;
    this.c = container;
    container.innerHTML = buildSvg(def);
    var q = function (s) { return container.querySelector(s); };
    this.el = {
      head: q('.head'), eyes: q('.eyes'), earL: q('.earL'), earR: q('.earR'), earLf: q('.earLf'), earRf: q('.earRf'),
      body: q('.body'), pawL: q('.pawL'), pawR: q('.pawR'), armL: q('.armL'), armR: q('.armR'), armLo: q('.armLo'), armRo: q('.armRo'),
      drumL: q('.drumL'), drumR: q('.drumR'), ripL: q('.drumL .rip'), ripR: q('.drumR .rip')
    };
    this.v = { pl: 0, pr: 0, plS: 0, prS: 0, nod: 0, mx: 0, my: 0, mxT: 0, myT: 0, mAct: 0, surprise: 0, rl: 0, rr: 0, blink: 0 };
    this.nextPaw = 0;
    this.blinkStart = -1;
    this.nextBlink = now() + 2500;
    this.moveUntil = 0;
    this.t0 = now();
    this.cache = {};
    this.lastSurprise = 0;
  }

  SvgRenderer.prototype.setAttr = function (node, name, value) {
    if (!node) return;
    var key = name + (node.getAttribute('class') || '');
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    node.setAttribute(name, value);
  };

  SvgRenderer.prototype.holdFor = function (state, speed) { return (HOLD[state] || 300) / speed; };

  SvgRenderer.prototype.onEnter = function (state, data) {
    var v = this.v;
    if (state === 'typing') {
      if ((this.nextPaw++ & 1) === 0) v.pl = 1; else v.pr = 1;
      v.nod = Math.min(1, v.nod + 0.45);
    } else if (state === 'clickLeft') {
      v.pl = 1; v.rl = 1; v.nod = 0.6;
    } else if (state === 'clickRight') {
      v.pr = 1; v.rr = 1; v.nod = 0.6;
    } else if (state === 'mouseMove') {
      v.mxT = clamp(v.mxT * 0.5 + num(data && data.dx, 0) * 1.2, -1, 1);
      v.myT = clamp(v.myT * 0.5 + num(data && data.dy, 0) * 1.2, -1, 1);
      this.moveUntil = now() + 280;
    } else if (state === 'touch') {
      v.surprise = 1;
    }
  };

  SvgRenderer.prototype.update = function (dt, t, state, speed, saver) {
    var v = this.v, k = speed;
    v.pl = Math.max(0, v.pl - dt * 7.5 * k);
    v.pr = Math.max(0, v.pr - dt * 7.5 * k);
    v.nod = Math.max(0, v.nod - dt * 5 * k);
    v.rl = Math.max(0, v.rl - dt * 2.8 * k);
    v.rr = Math.max(0, v.rr - dt * 2.8 * k);
    v.surprise = Math.max(0, v.surprise - dt * 1.1 * k);

    var a = 1 - Math.exp(-dt * 45);
    v.plS += (v.pl - v.plS) * a;
    v.prS += (v.pr - v.prS) * a;

    var moving = t < this.moveUntil;
    if (!moving) {
      var d = 1 - Math.exp(-dt * 5);
      v.mxT -= v.mxT * d;
      v.myT -= v.myT * d;
    }
    var f = 1 - Math.exp(-dt * 14);
    v.mx += (v.mxT - v.mx) * f;
    v.my += (v.myT - v.my) * f;
    v.mAct += ((moving ? 1 : 0) - v.mAct) * (1 - Math.exp(-dt * 10));

    // piscar
    if (this.blinkStart < 0 && t >= this.nextBlink) this.blinkStart = t;
    if (this.blinkStart >= 0) {
      var p = (t - this.blinkStart) / 170;
      if (p >= 1) {
        this.blinkStart = -1;
        this.nextBlink = t + 2500 + Math.random() * 3500;
        v.blink = 0;
      } else {
        v.blink = Math.sin(p * Math.PI);
      }
    }

    var br = saver ? 0 : Math.sin((t - this.t0) / 1000 * Math.PI * 2 * 0.4 * k);
    var s = v.surprise;
    var jump = s > 0.7 ? Math.sin(clamp((1 - s) / 0.3, 0, 1) * Math.PI) * 6 : 0;
    var headY = br * 1.5 + v.nod * 3 - jump;
    var tilt = v.mx * 2.5;

    var e = this.el;
    this.setAttr(e.head, 'transform', 'translate(0 ' + headY.toFixed(2) + ') rotate(' + tilt.toFixed(2) + ' 100 130)');
    var sy = (1 - v.blink * 0.92), sx = 1 + 0.2 * s;
    sy *= 1 + 0.2 * s;
    this.setAttr(e.eyes, 'transform', 'translate(100 88) scale(' + sx.toFixed(3) + ' ' + sy.toFixed(3) + ') translate(-100 -88)');
    this.setAttr(e.earL, 'transform', 'rotate(' + (-10 * s).toFixed(2) + ' 70 58)');
    this.setAttr(e.earR, 'transform', 'rotate(' + (10 * s).toFixed(2) + ' 130 58)');
    this.setAttr(e.body, 'transform', 'translate(100 186) scale(1 ' + (1 + br * 0.012).toFixed(4) + ') translate(-100 -186)');

    var rest = 134, hit = 147, lift = 18 * s;
    var lx = 62, ly = rest + (hit - rest) * v.plS - lift;
    var pressR = Math.max(v.prS, 0.4 * v.mAct);
    var rx = 138 + v.mx * 16, ry = rest + (hit - rest) * pressR + v.my * 6 - lift;
    this.setAttr(e.pawL, 'transform', 'translate(' + lx.toFixed(2) + ' ' + ly.toFixed(2) + ')');
    this.setAttr(e.pawR, 'transform', 'translate(' + rx.toFixed(2) + ' ' + ry.toFixed(2) + ')');
    this.setAttr(e.armL, 'x2', lx.toFixed(2)); this.setAttr(e.armL, 'y2', ly.toFixed(2));
    this.setAttr(e.armR, 'x2', rx.toFixed(2)); this.setAttr(e.armR, 'y2', ry.toFixed(2));
    this.setAttr(e.armLo, 'x2', lx.toFixed(2)); this.setAttr(e.armLo, 'y2', ly.toFixed(2));
    this.setAttr(e.armRo, 'x2', rx.toFixed(2)); this.setAttr(e.armRo, 'y2', ry.toFixed(2));

    this.setAttr(e.drumL, 'transform', 'translate(62 156) scale(1 ' + (1 - 0.07 * v.plS).toFixed(3) + ') translate(-62 -156)');
    this.setAttr(e.drumR, 'transform', 'translate(138 156) scale(1 ' + (1 - 0.07 * v.prS).toFixed(3) + ') translate(-138 -156)');
    if (e.ripL) {
      this.setAttr(e.ripL, 'rx', (30 + 22 * (1 - v.rl)).toFixed(1));
      this.setAttr(e.ripL, 'ry', (9 + 7 * (1 - v.rl)).toFixed(1));
      this.setAttr(e.ripL, 'opacity', (0.7 * v.rl).toFixed(2));
    }
    if (e.ripR) {
      this.setAttr(e.ripR, 'rx', (30 + 22 * (1 - v.rr)).toFixed(1));
      this.setAttr(e.ripR, 'ry', (9 + 7 * (1 - v.rr)).toFixed(1));
      this.setAttr(e.ripR, 'opacity', (0.7 * v.rr).toFixed(2));
    }

    return state !== 'idle' || v.pl > 0.002 || v.pr > 0.002 || v.nod > 0.002 || v.rl > 0.002 || v.rr > 0.002 ||
      v.surprise > 0.002 || this.blinkStart >= 0 || moving || Math.abs(v.mx) > 0.01 || Math.abs(v.my) > 0.01 ||
      Math.abs(v.plS - v.pl) > 0.01 || Math.abs(v.prS - v.pr) > 0.01;
  };

  SvgRenderer.prototype.nextIdleDelay = function (t, saver) {
    return saver ? Math.max(300, this.nextBlink - t) : 1000 / 12;
  };

  SvgRenderer.prototype.dispose = function () {
    this.c.innerHTML = '';
    this.el = {};
  };

  // ------------------------------------------------------------------ renderer de mídia importada

  function MediaRenderer(def, container) {
    this.def = def;
    this.c = container;
    container.innerHTML = '<div class="bc-stage" style="position:absolute;left:0;top:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;">' +
      '<div class="bc-sprite" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;will-change:transform;"></div></div>';
    this.sprite = container.querySelector('.bc-sprite');
    this.node = null;
    this.key = null;
    this.state = 'idle';
    this.stateT0 = now();
    this.iv = { tx: 0, ty: 0, rot: 0, sx: 0, sy: 0 };
    this.m = { x: 0, y: 0, tx: 0, ty: 0, until: 0 };
    this.tog = 0;
    this.frame = -1;
    this.cacheT = '';
    this.preloaded = [];
    var self = this;
    STATES.forEach(function (s) {
      var a = def.anims && def.anims[s];
      if (a && a.file && a.mode !== 'sheet') {
        var im = new Image();
        im.src = urlFor(a.file);
        self.preloaded.push(im);
      }
    });
  }

  MediaRenderer.prototype.anim = function (state) {
    var an = this.def.anims || {};
    if (an[state] && an[state].file) return an[state];
    if (an.idle && an.idle.file) return an.idle;
    for (var i = 0; i < STATES.length; i++) if (an[STATES[i]] && an[STATES[i]].file) return an[STATES[i]];
    return null;
  };

  MediaRenderer.prototype.ensureNode = function (a, force) {
    if (!a) return;
    var key = [a.file, a.mode, a.cols, a.rows, a.frames, a.width, a.height].join('|');
    if (!force && key === this.key) return;
    this.key = key;
    var node;
    if (a.mode === 'sheet') {
      var cols = Math.max(1, num(a.cols, 1) | 0), rows = Math.max(1, num(a.rows, 1) | 0);
      var asp = (num(a.width, 1) / cols) / (num(a.height, 1) / rows);
      if (!isFinite(asp) || asp <= 0) asp = 1;
      node = document.createElement('div');
      node.style.cssText = 'background-repeat:no-repeat;max-width:100%;max-height:100%;aspect-ratio:' + asp + ';' +
        (asp >= 1 ? 'width:100%;height:auto;' : 'width:auto;height:100%;') +
        'background-image:url("' + urlFor(a.file) + '");background-size:' + (cols * 100) + '% ' + (rows * 100) + '%;';
      this.frame = -1;
    } else {
      node = document.createElement('img');
      node.draggable = false;
      node.alt = '';
      node.style.cssText = 'width:100%;height:100%;object-fit:contain;pointer-events:none;-webkit-user-drag:none;';
      node.src = urlFor(a.file);
    }
    this.sprite.innerHTML = '';
    this.sprite.appendChild(node);
    this.node = node;
  };

  MediaRenderer.prototype.fxOf = function (state, a) {
    var f = a && a.fx;
    return (!f || f === 'auto') ? (DEFAULT_FX[state] || 'none') : f;
  };

  MediaRenderer.prototype.holdFor = function (state, speed) {
    var a = this.anim(state);
    if (a && num(a.hold, 0) > 0) return a.hold / speed;
    if (a && a.mode === 'sheet' && !this.isLoop(state, a)) {
      var frames = Math.max(1, num(a.frames, 1));
      return frames / (Math.max(1, num(a.fps, 12)) * speed) * 1000 + 60;
    }
    return (HOLD[state] || 300) / speed;
  };

  MediaRenderer.prototype.isLoop = function (state, a) {
    if (a && a.loop === true) return true;
    if (a && a.loop === false) return false;
    return state === 'idle' || state === 'typing' || state === 'mouseMove';
  };

  MediaRenderer.prototype.onEnter = function (state, data, t, changed) {
    if (changed) this.stateT0 = t;
    this.state = state;
    var a = this.anim(state);
    var fx = this.fxOf(state, a), iv = this.iv;
    if (a && a.mode === 'gif' && (state === 'clickLeft' || state === 'clickRight' || state === 'touch')) {
      this.ensureNode(a, true); // recria o <img> para reiniciar o GIF
    }
    if (state === 'mouseMove') {
      var m = this.m;
      m.tx = clamp(m.tx * 0.5 + num(data && data.dx, 0) * 1.2, -1, 1);
      m.ty = clamp(m.ty * 0.5 + num(data && data.dy, 0) * 1.2, -1, 1);
      m.until = t + 280;
    }
    this.tog ^= 1;
    if (fx === 'bounce') iv.ty = -0.07;
    else if (fx === 'squash') { iv.sy = -0.12; iv.sx = 0.08; }
    else if (fx === 'tilt') iv.rot = state === 'clickRight' ? 8 : (state === 'clickLeft' ? -8 : (this.tog ? 5 : -5));
    else if (fx === 'pop') { iv.sx = 0.14; iv.sy = 0.14; }
  };

  MediaRenderer.prototype.update = function (dt, t, state, speed, saver) {
    var a = this.anim(state);
    if (!a) return false;
    this.ensureNode(a, false);
    var iv = this.iv, m = this.m;

    var d = Math.exp(-dt * 12 * speed);
    iv.tx *= d; iv.ty *= d; iv.rot *= d; iv.sx *= d; iv.sy *= d;
    var moving = t < m.until;
    if (!moving) { var dd = Math.exp(-dt * 5); m.tx *= dd; m.ty *= dd; }
    var f = 1 - Math.exp(-dt * 14);
    m.x += (m.tx - m.x) * f; m.y += (m.ty - m.y) * f;

    // quadros de spritesheet
    if (a.mode === 'sheet' && this.node) {
      var cols = Math.max(1, num(a.cols, 1) | 0), rows = Math.max(1, num(a.rows, 1) | 0);
      var frames = clamp(num(a.frames, cols * rows) | 0, 1, cols * rows);
      var fps = clamp(num(a.fps, 12), 1, 60) * speed;
      var idx = Math.floor((t - this.stateT0) / 1000 * fps);
      idx = this.isLoop(state, a) ? idx % frames : Math.min(idx, frames - 1);
      if (idx !== this.frame) {
        this.frame = idx;
        var c = idx % cols, r = Math.floor(idx / cols);
        this.node.style.backgroundPosition = (cols > 1 ? c / (cols - 1) * 100 : 0) + '% ' + (rows > 1 ? r / (rows - 1) * 100 : 0) + '%';
      }
    }

    // efeitos contínuos
    var fx = this.fxOf(state, a), sx = 0, sy = 0, tx = iv.tx, ty = iv.ty;
    if (fx === 'breathe' && !saver) sy += 0.02 * Math.sin(t / 1000 * Math.PI * 2 * 0.4 * speed);
    else if (fx === 'shake' && state !== 'idle') tx += Math.sin(t / 18) * 0.03;
    else if (fx === 'follow') { tx += m.x * 0.07; ty += m.y * 0.05; }
    else if (fx === 'bounce' && state === 'typing') ty += 0; // já tratado por impulso

    var base = clamp(num(a.scale, 1), 0.2, 3);
    var flip = a.flip ? -1 : 1;
    var X = num(a.ox, 0) + tx * 100, Y = num(a.oy, 0) + ty * 100;
    var tf = 'translate(' + X.toFixed(2) + '%,' + Y.toFixed(2) + '%) rotate(' + iv.rot.toFixed(2) + 'deg) scale(' +
      (flip * base * (1 + iv.sx + sx)).toFixed(4) + ',' + (base * (1 + iv.sy + sy)).toFixed(4) + ')';
    if (tf !== this.cacheT) { this.cacheT = tf; this.sprite.style.transform = tf; }

    var mag = Math.abs(iv.tx) + Math.abs(iv.ty) + Math.abs(iv.rot) / 10 + Math.abs(iv.sx) + Math.abs(iv.sy);
    return state !== 'idle' || mag > 0.002 || moving || Math.abs(m.x) > 0.01 || Math.abs(m.y) > 0.01;
  };

  MediaRenderer.prototype.nextIdleDelay = function (t, saver) {
    var a = this.anim('idle');
    if (a && a.mode === 'sheet' && num(a.frames, 1) > 1) return 1000 / clamp(saver ? Math.min(num(a.fps, 12), 6) : num(a.fps, 12), 1, 30);
    if (a && this.fxOf('idle', a) === 'breathe' && !saver) return 1000 / 12;
    return 1500; // GIF/imagem estática: o navegador já cuida; só acorda de vez em quando
  };

  MediaRenderer.prototype.dispose = function () {
    this.c.innerHTML = '';
    this.node = null;
    this.preloaded = [];
  };

  // ------------------------------------------------------------------ Engine

  function Engine(container) {
    this.container = container;
    this.renderer = null;
    this.def = null;
    this.speed = 1;
    this.forced = 'auto';
    this.saver = false;
    this.paused = false;
    this.state = 'idle';
    this.stateUntil = Infinity;
    this._raf = 0;
    this._timer = 0;
    this._last = 0;
    this._nextAuto = 0;
    var self = this;
    this._tick = function (t) { self._run(t); };
  }

  Engine.prototype.setCharacter = function (def) {
    this._cancel();
    if (this.renderer) this.renderer.dispose();
    this.def = def;
    this.renderer = (def && def.kind === 'builtin') ? new SvgRenderer(def, this.container) : new MediaRenderer(def || { anims: {} }, this.container);
    this.state = 'idle';
    this.stateUntil = Infinity;
    this._last = 0;
    if (this.forced !== 'auto') this._enter(this.forced, now(), null);
    this._schedule();
  };

  Engine.prototype.setSpeed = function (v) { this.speed = clamp(num(v, 1), 0.25, 3); };
  Engine.prototype.setBatterySaver = function (b) { this.saver = !!b; this._wake(); };

  Engine.prototype.setForced = function (s) {
    s = (s === 'auto' || STATES.indexOf(s) >= 0) ? s : 'auto';
    if (s === this.forced) return;
    this.forced = s;
    this._nextAuto = 0;
    if (!this.renderer) return;
    if (s === 'auto') this._enter('idle', now(), null);
    else this._enter(s, now(), null);
    this._wake();
  };

  Engine.prototype.setPaused = function (p) {
    p = !!p;
    if (p === this.paused) return;
    this.paused = p;
    if (p) this._cancel();
    else { this._last = 0; this._schedule(); }
  };

  Engine.prototype.trigger = function (type, data) {
    if (this.paused || !this.renderer || this.forced !== 'auto') return;
    if (STATES.indexOf(type) < 1) return;
    this._enter(type, now(), data);
    this._wake();
  };

  Engine.prototype.destroy = function () {
    this._cancel();
    this.paused = true;
    if (this.renderer) this.renderer.dispose();
    this.renderer = null;
  };

  Engine.prototype._enter = function (state, t, data) {
    if (!this.renderer) return;
    var changed = state !== this.state;
    this.state = state;
    this.renderer.onEnter(state, data, t, changed);
    this.stateUntil = (this.forced !== 'auto' || state === 'idle') ? Infinity : t + this.renderer.holdFor(state, this.speed);
  };

  Engine.prototype._autoEvent = function (t) {
    var f = this.forced;
    var data = null;
    if (f === 'mouseMove') data = { dx: Math.sin(t / 400) * 0.9, dy: Math.cos(t / 600) * 0.4 };
    this._enter(f, t, data);
    this._nextAuto = t + AUTO_INTERVAL[f] / this.speed;
  };

  Engine.prototype._cancel = function () {
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; }
    if (this._timer) { clearTimeout(this._timer); this._timer = 0; }
  };

  Engine.prototype._wake = function () {
    if (this.paused) return;
    if (this._timer) { clearTimeout(this._timer); this._timer = 0; }
    this._schedule();
  };

  Engine.prototype._schedule = function () {
    if (this.paused || !this.renderer || this._raf || this._timer) return;
    this._raf = requestAnimationFrame(this._tick);
  };

  Engine.prototype._run = function (t) {
    this._raf = 0;
    this._timer = 0;
    if (this.paused || !this.renderer) return;
    var dt = this._last ? (t - this._last) / 1000 : 1 / 60;
    this._last = t;
    dt = clamp(dt, 0, 0.1);

    var auto = this.forced !== 'auto' && this.forced !== 'idle';
    if (auto && t >= this._nextAuto) this._autoEvent(t);
    else if (this.forced === 'auto' && this.state !== 'idle' && t > this.stateUntil) this._enter('idle', t, null);

    var busy = this.renderer.update(dt, t, this.state, this.speed, this.saver);
    if (busy || auto) {
      this._raf = requestAnimationFrame(this._tick);
    } else {
      var self = this;
      this._timer = setTimeout(function () { self._timer = 0; self._run(now()); }, this.renderer.nextIdleDelay(t, this.saver));
    }
  };

  // ------------------------------------------------------------------ miniatura estática (galeria)

  function thumbHTML(def) {
    if (def.kind === 'builtin') return buildSvg(def);
    var an = def.anims || {}, a = an.idle && an.idle.file ? an.idle : null;
    if (!a) for (var i = 0; i < STATES.length; i++) if (an[STATES[i]] && an[STATES[i]].file) { a = an[STATES[i]]; break; }
    if (!a) return '<div style="width:100%;height:100%"></div>';
    if (a.mode === 'sheet') {
      var cols = Math.max(1, num(a.cols, 1) | 0), rows = Math.max(1, num(a.rows, 1) | 0);
      var asp = (num(a.width, 1) / cols) / (num(a.height, 1) / rows);
      if (!isFinite(asp) || asp <= 0) asp = 1;
      return '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center"><div style="max-width:100%;max-height:100%;aspect-ratio:' + asp + ';' +
        (asp >= 1 ? 'width:100%;height:auto;' : 'width:auto;height:100%;') + 'background:url(&quot;' + urlFor(a.file) + '&quot;) 0 0/' + (cols * 100) + '% ' + (rows * 100) + '% no-repeat"></div></div>';
    }
    return '<img alt="" draggable="false" src="' + urlFor(a.file) + '" style="width:100%;height:100%;object-fit:contain">';
  }

  global.BongoEngine = {
    Engine: Engine, STATES: STATES, buildSvg: buildSvg, thumbHTML: thumbHTML, config: config, urlFor: urlFor,
    DEFAULT_FX: DEFAULT_FX
  };
})(window);
