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
  ModeEngine.prototype.setSpeed = function (v) { this.speed = Math.max(.25, Math.min(3, Number(v)||1)); };
  ModeEngine.prototype.setBatterySaver = function (v) { this.saver = !!v; };
  ModeEngine.prototype.setForced = function (v) { this.forced = v || 'auto'; this.render(); };
  ModeEngine.prototype.setPaused = function (v) { this.paused = !!v; };
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
  ModeEngine.prototype.destroy = function () { clearTimeout(this.timer); if(this.root.parentNode)this.root.parentNode.removeChild(this.root); };
  g.BongoModes = { Engine: ModeEngine, list: Object.keys(MODES).map(function(k){return {id:k,label:MODES[k].label};}) };
})(window);
