/*
 * Camada de acesso ao Android. Dentro do app usa a ponte nativa (window.Android).
 * Fora do app (abrindo index.html num navegador de desktop para desenvolver/testar a interface)
 * cai num modo de simulação com localStorage, para dar para ajustar o visual sem compilar o APK.
 */
(function (global) {
  'use strict';

  var native = global.Android && typeof global.Android.getState === 'function' ? global.Android : null;
  var pending = {};

  function parse(s, d) { try { return JSON.parse(s); } catch (e) { return d; } }

  global.BongoNative = {
    // chamado pelo Kotlin quando o seletor de arquivos termina
    onPicked: function (reqId, json) {
      var cb = pending[reqId];
      delete pending[reqId];
      if (cb) cb(parse(json, { ok: false, error: 'error' }));
    }
  };

  var DEFAULTS = {
    characterId: 'cat-original', size: 1, opacity: 1, speed: 1, posX: 0.85, posY: 0.65, sound: true, volume: 0.7,
    forcedAnim: 'auto', batterySaver: false, reactOutside: true, favorites: []
  };

  var api;
  if (native) {
    api = {
      isNative: true,
      getState: function () { return parse(native.getState(), {}); },
      saveSettings: function (patch) { return native.saveSettings(JSON.stringify(patch)); },
      upsertCharacter: function (def) { return native.upsertCharacter(JSON.stringify(def)); },
      deleteCharacter: function (id) { return native.deleteCharacter(id); },
      discardDraft: function (id) { native.discardDraft(id); },
      pickFile: function (charId, cb) {
        var id = 'p' + Date.now() + Math.random().toString(36).slice(2, 6);
        pending[id] = cb;
        native.pickFile(id, charId);
      },
      startOverlay: function () { return native.startOverlay(); },
      stopOverlay: function () { native.stopOverlay(); },
      setOverlayHidden: function (h) { native.setOverlayHidden(!!h); },
      requestOverlayPermission: function () { native.requestOverlayPermission(); },
      requestNotificationPermission: function () { native.requestNotificationPermission(); },
      openAccessibilitySettings: function () { native.openAccessibilitySettings(); },
      openAppSettings: function () { native.openAppSettings(); },
      playSound: function (k) { native.playSound(k); }
    };
  } else {
    // ---------------- simulação para navegador ----------------
    var KEY = 'bongo_mock';
    var load = function () { return parse(global.localStorage && localStorage.getItem(KEY), null) || { settings: {}, library: [], overlay: { permission: true, running: false, hidden: false } }; };
    var persist = function (m) { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch (e) { /* cheio */ } };
    var audio = null;
    api = {
      isNative: false,
      getState: function () {
        var m = load();
        var s = {};
        for (var k in DEFAULTS) s[k] = DEFAULTS[k];
        for (var k2 in m.settings) s[k2] = m.settings[k2];
        return {
          settings: s, library: m.library, overlay: m.overlay, notifications: null,
          a11y: { enabled: false }, devices: { mouse: false, keyboard: false }, app: { version: 'navegador', sdk: 0, debug: true }
        };
      },
      saveSettings: function (patch) { var m = load(); for (var k in patch) m.settings[k] = patch[k]; persist(m); return true; },
      upsertCharacter: function (def) {
        var m = load(); var ok = false;
        for (var i = 0; i < m.library.length; i++) if (m.library[i].id === def.id) { m.library[i] = def; ok = true; }
        if (!ok) m.library.push(def);
        def.kind = 'custom'; persist(m); return true;
      },
      deleteCharacter: function (id) { var m = load(); m.library = m.library.filter(function (c) { return c.id !== id; }); persist(m); return true; },
      discardDraft: function () {},
      pickFile: function (charId, cb) {
        var inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*';
        inp.onchange = function () {
          var f = inp.files && inp.files[0];
          if (!f) return cb({ ok: false, error: 'cancelled' });
          var r = new FileReader();
          r.onload = function () {
            var im = new Image();
            im.onload = function () { cb({ ok: true, file: r.result, width: im.naturalWidth, height: im.naturalHeight, bytes: f.size, label: f.name, mime: f.type }); };
            im.onerror = function () { cb({ ok: false, error: 'not_image' }); };
            im.src = r.result;
          };
          r.readAsDataURL(f);
        };
        inp.click();
      },
      startOverlay: function () { var m = load(); m.overlay.running = true; m.overlay.hidden = false; persist(m); return 'ok'; },
      stopOverlay: function () { var m = load(); m.overlay.running = false; persist(m); },
      setOverlayHidden: function (h) { var m = load(); m.overlay.hidden = !!h; persist(m); },
      requestOverlayPermission: function () {},
      requestNotificationPermission: function () {},
      openAccessibilitySettings: function () {},
      openAppSettings: function () {},
      playSound: function (k) {
        try {
          audio = audio || new (global.AudioContext || global.webkitAudioContext)();
          var o = audio.createOscillator(), g = audio.createGain();
          o.frequency.value = k === 'high' ? 320 : (k === 'tick' ? 1200 : 190);
          g.gain.value = 0.15; o.connect(g); g.connect(audio.destination);
          o.start(); g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.15); o.stop(audio.currentTime + 0.16);
        } catch (e) { /* sem áudio */ }
      }
    };
  }

  global.BongoAPI = api;
})(window);
