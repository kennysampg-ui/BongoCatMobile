/*
 * Página da sobreposição flutuante. NÃO chama o Android (não há ponte JS aqui): apenas recebe
 *   BongoOverlay.configure({settings, character})  – personagem, velocidade, modo economia, animação forçada
 *   BongoOverlay.event(tipo, dx, dy)               – keyboard | clickLeft | clickRight | mouseMove | touch
 *   BongoOverlay.setPaused(bool)                   – pausa TODO o processamento (oculto / tela apagada)
 * Nenhum texto digitado chega até aqui: o evento "keyboard" é só um pulso, sem tecla nem conteúdo.
 */
(function (global) {
  'use strict';

  var host = document.getElementById('stage');
  var engine = new BongoEngine.Engine(host);
  var currentMode = 'classic';
  var currentKey = null;
  var nativePaused = false;

  var MAP = { keyboard: 'typing', clickLeft: 'clickLeft', clickRight: 'clickRight', mouseMove: 'mouseMove', touch: 'touch' };

  function sync() { engine.setPaused(nativePaused || document.hidden); }

  global.BongoOverlay = {
    configure: function (cfg) {
      var s = (cfg && cfg.settings) || {};
      var mode = s.displayMode || 'classic';
      if (mode !== currentMode) {
        engine.destroy(); currentMode = mode; currentKey = null;
        engine = (mode !== 'classic' && window.BongoModes) ? new BongoModes.Engine(host, mode) : new BongoEngine.Engine(host);
      }
      var def = BongoChars.find(s.characterId) || (cfg && cfg.character) || BongoChars.default();
      var key = def.id + '|' + (def.kind === 'builtin' ? '' : JSON.stringify(def.anims));
      engine.setSpeed(s.speed);
      engine.setBatterySaver(!!s.batterySaver);
      if (key !== currentKey) {
        currentKey = key;
        if (mode === 'classic') engine.setCharacter(def);
      }
      engine.setForced(s.forcedAnim || 'auto');
    },
    event: function (type, dx, dy) {
      var st = MAP[type];
      if (st) engine.trigger(st, { dx: dx || 0, dy: dy || 0 });
      else if (/^maniakey[0-6]$/.test(type) || /^taiko[0-3]$/.test(type)) engine.trigger(type, { dx: dx || 0, dy: dy || 0 });
    },
    /** Posição do mouse/dedo sobre o personagem (0..1), usada pelo modo osu! para mover o mouse no mousepad. */
    pointer: function (x, y) { if (engine.pointer) engine.pointer(x, y); },
    setPaused: function (p) {
      nativePaused = !!p;
      sync();
    }
  };

  document.addEventListener('visibilitychange', sync);
  engine.setCharacter(BongoChars.default());
})(window);
