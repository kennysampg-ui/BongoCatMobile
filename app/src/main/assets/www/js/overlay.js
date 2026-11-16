/*
 * Página da sobreposição flutuante. NÃO chama o Android (não há ponte JS aqui): apenas recebe
 *   BongoOverlay.configure({settings, character})  – personagem, velocidade, modo economia, animação forçada
 *   BongoOverlay.event(tipo, dx, dy)               – keyboard | clickLeft | clickRight | mouseMove | touch
 *   BongoOverlay.setPaused(bool)                   – pausa TODO o processamento (oculto / tela apagada)
 * Nenhum texto digitado chega até aqui: o evento "keyboard" é só um pulso, sem tecla nem conteúdo.
 */
(function (global) {
  'use strict';

  var engine = new BongoEngine.Engine(document.getElementById('stage'));
  var currentKey = null;
  var nativePaused = false;

  var MAP = { keyboard: 'typing', clickLeft: 'clickLeft', clickRight: 'clickRight', mouseMove: 'mouseMove', touch: 'touch' };

  function sync() { engine.setPaused(nativePaused || document.hidden); }

  global.BongoOverlay = {
    configure: function (cfg) {
      var s = (cfg && cfg.settings) || {};
      var def = BongoChars.find(s.characterId) || (cfg && cfg.character) || BongoChars.default();
      var key = def.id + '|' + (def.kind === 'builtin' ? '' : JSON.stringify(def.anims));
      engine.setSpeed(s.speed);
      engine.setBatterySaver(!!s.batterySaver);
      if (key !== currentKey) {
        currentKey = key;
        engine.setCharacter(def);
      }
      engine.setForced(s.forcedAnim || 'auto');
    },
    event: function (type, dx, dy) {
      var st = MAP[type];
      if (st) engine.trigger(st, { dx: dx || 0, dy: dy || 0 });
    },
    setPaused: function (p) {
      nativePaused = !!p;
      sync();
    }
  };

  document.addEventListener('visibilitychange', sync);
  engine.setCharacter(BongoChars.default());
})(window);
