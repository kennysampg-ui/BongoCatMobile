/* Modos visuais adaptados dos sprites do Bongo Cat osu! 1.5.3.
 * Os eventos vêm do Android: toques/cliques e, se o serviço de acessibilidade estiver ativo, as teclas
 * físicas mapeadas em Ajustes (o serviço compara só o código numérico com os atalhos configurados).
 */
(function (g) {
  'use strict';
  var ROOT = 'modes/img/';
  var MODES = {
    osu: { label: 'osu!', bg: 'osu/mousebg.png', idle: 'osu/up.png', left: 'osu/left.png', right: 'osu/right.png', extra: 'osu/mouse.png' },
    mania4k: { label: 'Mania 4K', bg: 'mania/4K/bg.png', leftIdle: 'mania/leftup.png', rightIdle: 'mania/rightup.png', left: ['mania/left0.png','mania/left1.png','mania/left2.png'], right: ['mania/right0.png','mania/right1.png','mania/right2.png'] },
    mania7k: { label: 'Mania 7K', bg: 'mania/7K/bg.png', leftIdle: 'mania/leftup.png', rightIdle: 'mania/rightup.png', left: ['mania/left0.png','mania/left1.png','mania/left2.png'], right: ['mania/right0.png','mania/right1.png','mania/right2.png'] },
    taiko: { label: 'Taiko', bg: 'taiko/bg.png', leftIdle: 'taiko/leftup.png', rightIdle: 'taiko/rightup.png', left: ['taiko/leftrim.png','taiko/leftcentre.png'], right: ['taiko/rightrim.png','taiko/rightcentre.png'] },
    catch: { label: 'Catch', bg: 'catch/bg.png', idle: 'catch/up.png', left: 'catch/left.png', right: 'catch/right.png', extra: 'catch/dash.png' }
  };

  var AUTO = { typing: 230, clickLeft: 650, clickRight: 650, mouseMove: 60, touch: 1100 };
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function num(v, d) { v = +v; return isFinite(v) ? v : d; }

  /* "Animação exibida: sempre X" (Ajustes): repete o evento enquanto o motor não estiver pausado. */
  function syncForced(e) {
    clearTimeout(e.ft);
    var f = e.forced;
    if (e.paused || !AUTO[f]) return;
    (function loop() {
      var t = Date.now();
      if (f === 'mouseMove' && e.pointer) e.pointer(0.5 + 0.45 * Math.sin(t / 700), 0.5 + 0.4 * Math.cos(t / 900));
      else e.trigger(f, { dx: Math.sin(t / 400) * 0.9, dy: Math.cos(t / 600) * 0.4 });
      e.ft = setTimeout(loop, AUTO[f] / (e.speed || 1));
    })();
  }
  function ModeEngine(host, mode) {
    this.host = host; this.mode = MODES[mode] ? mode : 'osu'; this.speed = 1; this.saver = false; this.paused = false;
    this.forced = 'auto'; this.leftUntil = 0; this.rightUntil = 0; this.extraUntil = 0; this.flip = false;
    this.root = document.createElement('div'); this.root.className = 'bongo-mode-stage';
    this.root.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:hidden;';
    host.innerHTML = ''; host.appendChild(this.root);
    this.bg = this.img(this.mode === 'osu' ? 'osu/mousebg.png' : MODES[this.mode].bg, 0);
    this.bg.style.width='100%'; this.bg.style.height='100%'; this.bg.style.objectFit='contain';
    this.left = this.img('', 2); this.right = this.img('', 3); this.extra = null;
    this.left.style.width = this.right.style.width = '100%';
    this.left.style.height = this.right.style.height = '100%';
    this.left.style.left = this.right.style.left = '0';
    this.left.style.bottom = this.right.style.bottom = '0';
    this.left.style.objectFit = this.right.style.objectFit = 'contain';
    if (this.mode === 'osu') {
      this.left.style.width = this.right.style.width = '100%'; this.left.style.left = this.right.style.left = '0';
      this.left.style.bottom = this.right.style.bottom = '0';
      this.extra = this.img('osu/mouse.png', 1); this.extra.style.width='16%'; this.extra.style.height='auto'; this.extra.style.right='5%'; this.extra.style.bottom='2%';
    } else if (this.mode === 'catch') {
      this.left.style.width=this.right.style.width='100%'; this.left.style.left=this.right.style.left='0';
      this.extra = this.img('catch/dash.png', 4); this.extra.style.width='100%'; this.extra.style.height='100%'; this.extra.style.left='0'; this.extra.style.bottom='0';
    }
    this.keys = [];
    if (this.mode === 'mania4k' || this.mode === 'mania7k') {
      var count = this.mode === 'mania4k' ? 4 : 7;
      for (var ki=0; ki<count; ki++) { var keyImg=this.img('mania/'+(this.mode==='mania4k'?'4K':'7K')+'/'+ki+'.png', 1); keyImg.style.width='100%'; keyImg.style.height='100%'; keyImg.style.left='0'; keyImg.style.bottom='0'; keyImg.style.opacity='0'; this.keys.push(keyImg); }
    }
    this.keyIndex = 0;
    this.render();
  }
  ModeEngine.prototype.img = function (file, z) {
    var el = document.createElement('img'); el.draggable = false; el.alt='';
    el.style.cssText='position:absolute;max-width:100%;max-height:100%;object-fit:contain;pointer-events:none;z-index:'+z+';';
    if (file) el.src = ROOT + file;
    this.root.appendChild(el); return el;
  };
  ModeEngine.prototype.setCharacter = function () {};
  ModeEngine.prototype.setSpeed = function (v) { this.speed = Math.max(.25, Math.min(3, Number(v)||1)); syncForced(this); };
  ModeEngine.prototype.setBatterySaver = function (v) { this.saver = !!v; };
  ModeEngine.prototype.setForced = function (v) { this.forced = v || 'auto'; this.render(); syncForced(this); };
  ModeEngine.prototype.setPaused = function (v) { this.paused = !!v; syncForced(this); };
  ModeEngine.prototype.trigger = function (type) {
    if (this.paused) return;
    var t = Date.now(), hold = 220 / this.speed;
    var maniaMatch = /^maniakey([0-6])$/.exec(type);
    var taikoMatch = /^taiko([0-3])$/.exec(type);
    if (this.keys && this.keys.length) {
      if (maniaMatch) this.keyIndex = Math.min(this.keys.length - 1, Number(maniaMatch[1]));
      else this.keyIndex = (this.keyIndex + 1) % this.keys.length;
      this.keys.forEach(function(k,i){k.style.opacity=i===this.keyIndex?'1':'0';}, this);
    }
    if (taikoMatch) {
      var n = Number(taikoMatch[1]);
      if (n < 2) this.leftUntil = t + hold; else this.rightUntil = t + hold;
      this.flip = (n === 1 || n === 3);
    } else if (type === 'clickRight' || type === 'mouseMove') this.rightUntil = t + hold;
    else if (type === 'touch') { this.leftUntil = t + hold; this.rightUntil = t + hold; }
    else { this.flip = !this.flip; if (this.flip) this.leftUntil = t + hold; else this.rightUntil = t + hold; }
    if (this.mode === 'catch' && (type === 'mouseMove' || type === 'clickRight')) this.extraUntil = t + hold;
    this.render();
    var self=this; clearTimeout(this.timer); this.timer=setTimeout(function(){ self.render(); }, hold+20);
  };
  ModeEngine.prototype.render = function () {
    var m=MODES[this.mode], t=Date.now(), l=t<this.leftUntil, r=t<this.rightUntil;
    function src(el, f) { if (el && f) el.src=ROOT+f; }
    if (this.mode==='osu') { src(this.left,l?'osu/left.png':'osu/up.png'); src(this.right,r?'osu/right.png':'osu/up.png'); }
    else if (this.mode==='mania4k' || this.mode==='mania7k') {
      var idxL=l?(this.flip?1:0):null, idxR=r?(this.flip?0:1):null;
      src(this.left,idxL===null?'mania/leftup.png':m.left[idxL]); src(this.right,idxR===null?'mania/rightup.png':m.right[idxR]);
    } else if (this.mode==='taiko') {
      src(this.left,l?(this.flip?'taiko/leftcentre.png':'taiko/leftrim.png'):'taiko/leftup.png');
      src(this.right,r?(this.flip?'taiko/rightrim.png':'taiko/rightcentre.png'):'taiko/rightup.png');
    } else if (this.mode==='catch') {
      src(this.left,l?'catch/left.png':'catch/up.png'); src(this.right,r?'catch/right.png':'catch/up.png');
      if (this.extra) this.extra.style.opacity=t<this.extraUntil?'1':'0';
    }
  };
  ModeEngine.prototype.destroy = function () { clearTimeout(this.ft); clearTimeout(this.timer); if(this.root.parentNode)this.root.parentNode.removeChild(this.root); };

  /* ------------------------------------------------------------------------------------------
   * Modo osu!: cena SVG no espaço do sprite (612×354), igual ao Bongo Cat osu! do PC.
   *  - mousebg.png            cenário (gato, mesa, mousepad e teclado)
   *  - mouse.png              o mouse, que desliza sobre o mousepad seguindo o ponteiro
   *  - braço esquerdo         DESENHADO por código (não existe sprite): do lado da cabeça até o mouse
   *  - up/left/right.png      pata direita no teclado (levantada / tecla esquerda / tecla direita)
   * ------------------------------------------------------------------------------------------ */
  var NS = 'http://www.w3.org/2000/svg';
  var PAD = { x0: 66, y0: 212, x1: 192, y1: 284 };   // centro do mouse (área do mousepad)
  var ARM_A = { x: 174, y: 108 };                    // fim do contorno da cabeça: de onde parte a borda externa do braço
  var ARM_B = { x: 238, y: 187 };                    // onde a cabeça encontra a linha da mesa: de onde parte a borda interna
  var MOUSE_W = 100, MOUSE_H = 65;

  function svgEl(name, attrs) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  function OsuEngine(host) {
    var R = ROOT + 'osu/';
    this.host = host; this.speed = 1; this.saver = false; this.paused = false; this.forced = 'auto';
    this.tx = 0.5; this.ty = 0.5; this.cx = 0.5; this.cy = 0.5; this.alt = false;
    this.raf = 0; this.last = 0; this.pawTimer = 0; this.ft = 0; this.cur = 'up';
    var self = this;
    this.tickFn = function (t) { self.tick(t); };

    var svg = svgEl('svg', { viewBox: '0 0 612 354', preserveAspectRatio: 'xMidYMid meet' });
    svg.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;display:block;pointer-events:none;';

    function img(file, w, h, x, y) { return svgEl('image', { href: R + file, x: x, y: y, width: w, height: h, preserveAspectRatio: 'none' }); }
    svg.appendChild(img(g.BongoModes && g.BongoModes.transparentDesk === false ? 'mousebg.png' : 'mousebg_t.png', 612, 354, 0, 0));
    this.mouse = svgEl('g', {});
    this.mouse.appendChild(img('mouse.png', MOUSE_W, MOUSE_H, -MOUSE_W / 2, -MOUSE_H / 2));
    svg.appendChild(this.mouse);
    this.armFill = svgEl('path', { fill: '#ffffff', stroke: 'none' });
    this.armLine = svgEl('path', { fill: 'none', stroke: '#000000', 'stroke-width': 6.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    svg.appendChild(this.armFill); svg.appendChild(this.armLine);
    this.paws = { up: img('up.png', 612, 354, 0, 0), left: img('left.png', 612, 354, 0, 0), right: img('right.png', 612, 354, 0, 0) };
    this.paws.left.style.display = 'none'; this.paws.right.style.display = 'none';
    svg.appendChild(this.paws.up); svg.appendChild(this.paws.left); svg.appendChild(this.paws.right);

    host.innerHTML = '';
    host.appendChild(svg);
    this.svg = svg;
    this.layout();
  }

  OsuEngine.prototype.layout = function () {
    var mx = PAD.x0 + this.cx * (PAD.x1 - PAD.x0), my = PAD.y0 + this.cy * (PAD.y1 - PAD.y0);
    this.mouse.setAttribute('transform', 'translate(' + mx.toFixed(1) + ' ' + my.toFixed(1) + ') rotate(' + ((this.cx - 0.5) * 14).toFixed(1) + ')');
    // Braço como UMA forma contínua: larga no ombro (junto da cabeça) e afinando até a pata sobre o mouse.
    var hx = mx + 2, hy = my - 15, r = 24;                         // centro e raio da ponta da pata
    var lx = hx - r, ly = hy + 2, rx = hx + r, ry = hy + 2;         // lados esquerdo/direito da pata
    var sh = Math.max(0, 150 - hx);                               // mão longe, à esquerda: a base do braço desce e mantém a espessura
    var A = ARM_A, B = { x: ARM_B.x - sh * 0.25, y: ARM_B.y + sh * 0.45 };
    var oc = (lx + (A.x - lx) * 0.12 - 6).toFixed(1) + ' ' + (A.y + (ly - A.y) * 0.5).toFixed(1);      // borda externa: abaulada, continua a curva da cabeça
    var ic = (B.x - (B.x - rx) * 0.3).toFixed(1) + ' ' + (ry - 8).toFixed(1);                          // borda interna: desce quase reta e curva até a pata
    var edge = 'M' + A.x + ' ' + A.y + ' Q' + oc + ' ' + lx.toFixed(1) + ' ' + ly.toFixed(1) +
      ' A' + r + ' ' + r + ' 0 0 0 ' + rx.toFixed(1) + ' ' + ry.toFixed(1) + ' Q' + ic + ' ' + B.x + ' ' + B.y;
    this.armLine.setAttribute('d', edge);
    this.armFill.setAttribute('d', edge + ' L' + (B.x - 30) + ' ' + (B.y - 40) + ' L' + (A.x + 24) + ' ' + (A.y - 6) + ' Z');
  };

  OsuEngine.prototype.show = function (which) {
    if (which === this.cur) return;
    this.cur = which;
    for (var k in this.paws) this.paws[k].style.display = (k === which) ? '' : 'none';
  };
  OsuEngine.prototype.press = function (which, hold) {
    var self = this;
    this.show(which);
    clearTimeout(this.pawTimer);
    this.pawTimer = setTimeout(function () { self.show('up'); }, hold);
  };

  OsuEngine.prototype.wake = function () {
    if (!this.raf && !this.paused) this.raf = requestAnimationFrame(this.tickFn);
  };
  OsuEngine.prototype.tick = function (t) {
    this.raf = 0;
    if (this.paused) return;
    var dt = this.last ? clamp((t - this.last) / 1000, 0, 0.1) : 1 / 60;
    this.last = t;
    var k = 1 - Math.exp(-dt * 12 * this.speed);
    this.cx += (this.tx - this.cx) * k;
    this.cy += (this.ty - this.cy) * k;
    this.layout();
    if (Math.abs(this.tx - this.cx) > 0.002 || Math.abs(this.ty - this.cy) > 0.002) this.raf = requestAnimationFrame(this.tickFn);
    else this.last = 0;               // parado: nenhum frame é agendado (economia de bateria)
  };

  /** Posição absoluta do ponteiro sobre o personagem (0..1) → posição do mouse no mousepad. */
  OsuEngine.prototype.pointer = function (nx, ny) {
    if (this.paused) return;
    this.ptrAt = Date.now();
    this.tx = clamp(num(nx, 0.5), 0, 1);
    this.ty = clamp(num(ny, 0.5), 0, 1);
    this.wake();
  };

  OsuEngine.prototype.trigger = function (type, data) {
    if (this.paused) return;
    var hold = 200 / this.speed;
    if (type === 'clickLeft') this.press('left', hold);
    else if (type === 'clickRight') this.press('right', hold);
    else if (type === 'typing' || type === 'touch') { this.alt = !this.alt; this.press(this.alt ? 'left' : 'right', hold); }
    else if (type === 'mouseMove') {
      if (Date.now() - (this.ptrAt || 0) < 400) return;   // a posição absoluta tem prioridade sobre os deltas
      this.tx = clamp(this.tx + num(data && data.dx, 0) * 0.35, 0, 1);
      this.ty = clamp(this.ty + num(data && data.dy, 0) * 0.35, 0, 1);
      this.wake();
    }
  };

  OsuEngine.prototype.setCharacter = function () {};
  OsuEngine.prototype.setSpeed = function (v) { this.speed = clamp(num(v, 1), 0.25, 3); syncForced(this); };
  OsuEngine.prototype.setBatterySaver = function (v) { this.saver = !!v; };
  OsuEngine.prototype.setForced = function (v) { this.forced = v || 'auto'; if (this.forced === 'auto' || this.forced === 'idle') this.show('up'); syncForced(this); };
  OsuEngine.prototype.setPaused = function (v) {
    this.paused = !!v;
    if (this.paused) { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; clearTimeout(this.pawTimer); this.last = 0; this.show('up'); }
    else this.wake();
    syncForced(this);
  };
  OsuEngine.prototype.destroy = function () {
    this.paused = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0; clearTimeout(this.pawTimer); clearTimeout(this.ft);
    if (this.svg && this.svg.parentNode) this.svg.parentNode.removeChild(this.svg);
  };

  function create(host, mode) {
    mode = MODES[mode] ? mode : 'osu';
    return mode === 'osu' ? new OsuEngine(host) : new ModeEngine(host, mode);
  }
  g.BongoModes = { Engine: create, list: Object.keys(MODES).map(function(k){return {id:k,label:MODES[k].label};}) };
})(window);
