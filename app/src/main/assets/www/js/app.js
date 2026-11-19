/* Bongo Cat Mobile – interface (telas inicial, galeria, editor e configurações). */
(function (global) {
  'use strict';

  var API = global.BongoAPI;
  var E = global.BongoEngine;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  var ICON = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/></svg>',
    grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/></svg>',
    sliders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>',
    stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5.5" y="5.5" width="13" height="13" rx="2.5"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    eyeoff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0112 5c6.4 0 10 7 10 7a17 17 0 01-3.2 4M6.5 6.6A17 17 0 002 12s3.6 7 10 7a9.8 9.8 0 004.2-.9"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5M4 16v4h16v-4"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9.5"/><path d="M12 11v6M12 7.5v.01"/></svg>'
  };

  var STATE_LABEL = {
    idle: 'Repouso', typing: 'Digitação', clickLeft: 'Clique esquerdo', clickRight: 'Clique direito',
    mouseMove: 'Movimento do mouse', touch: 'Toque na tela'
  };
  var FX_LABEL = [
    ['auto', 'Automático'], ['none', 'Nenhum'], ['breathe', 'Respirar'], ['bounce', 'Pulinho'], ['squash', 'Achatar'],
    ['tilt', 'Inclinar'], ['shake', 'Tremer'], ['follow', 'Seguir o mouse'], ['pop', 'Saltar']
  ];

  // ------------------------------------------------------------------ estado

  var S = {
    settings: {}, library: [], overlay: { permission: false, running: false, hidden: false },
    notifications: null, a11y: { enabled: false }, shizuku: { installed: false, running: false, granted: false }, devices: {}, app: {},
    tab: 'home', inEditor: false, draft: null, paused: false
  };
  var engine = null;       // uma só Engine por vez (início ou editor)
  var engineHost = null;
  var pendingPatch = {};
  var saveTimer = 0;
  var toastTimer = 0;

  function allChars() { return global.BongoChars.list.concat(S.library); }
  function findChar(id) {
    var l = allChars();
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
    return null;
  }
  function currentChar() { return findChar(S.settings.characterId) || global.BongoChars.default(); }

  function load() {
    var st = API.getState();
    S.settings = st.settings || {};
    S.library = st.library || [];
    S.overlay = st.overlay || S.overlay;
    S.notifications = st.notifications;
    S.a11y = st.a11y || S.a11y;
    S.stats = st.inputStats || {};
    S.shizuku = st.shizuku || S.shizuku;
    S.devices = st.devices || {};
    S.app = st.app || {};
    if (!Array.isArray(S.settings.favorites)) S.settings.favorites = [];
  }

  /** Aplica localmente e envia ao Android (agrupado), que salva e atualiza a sobreposição na hora. */
  function save(patch) {
    for (var k in patch) { S.settings[k] = patch[k]; pendingPatch[k] = patch[k]; }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 120);
  }
  function flush() {
    clearTimeout(saveTimer);
    if (!Object.keys(pendingPatch).length) return;
    var p = pendingPatch; pendingPatch = {};
    API.saveSettings(p);
  }

  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  function dialog(title, bodyHtml, buttons) {
    return new Promise(function (resolve) {
      var m = $('#modal');
      m.innerHTML = '<div class="box" role="dialog" aria-modal="true"><h3>' + esc(title) + '</h3><div>' + bodyHtml + '</div><div class="row"></div></div>';
      var row = $('.row', m);
      buttons.forEach(function (b, i) {
        var el = document.createElement('button');
        el.className = 'btn ' + (b.cls || '');
        el.textContent = b.label;
        el.onclick = function () { m.hidden = true; m.innerHTML = ''; resolve(i); };
        row.appendChild(el);
      });
      m.hidden = false;
    });
  }
  function closeDialog() { var m = $('#modal'); if (!m.hidden) { m.hidden = true; m.innerHTML = ''; return true; } return false; }

  // ------------------------------------------------------------------ Engine única

  function mountEngine(host, def) {
    unmountEngine();
    engineHost = host;
    if (global.BongoModes) global.BongoModes.transparentDesk = S.settings.transparentDesk !== false;
    engine = (S.settings.displayMode && S.settings.displayMode !== 'classic' && global.BongoModes)
      ? new global.BongoModes.Engine(host, S.settings.displayMode) : new E.Engine(host);
    engine.setSpeed(S.settings.speed);
    engine.setBatterySaver(!!S.settings.batterySaver);
    engine.setCharacter(def);
    engine.setPaused(S.paused);
    return engine;
  }
  function unmountEngine() {
    if (engine) { engine.destroy(); engine = null; }
    engineHost = null;
  }

  function testBar() {
    return '<div class="test-btns">' +
      '<button class="btn sm" data-t="typing" data-s="low">⌨️ Digitar</button>' +
      '<button class="btn sm" data-t="clickLeft" data-s="low">🖱️ Clique esq.</button>' +
      '<button class="btn sm" data-t="clickRight" data-s="high">🖱️ Clique dir.</button>' +
      '<button class="btn sm" data-t="mouseMove">↔️ Mouse</button>' +
      '<button class="btn sm" data-t="touch" data-s="tick">👆 Toque</button></div>';
  }
  function bindTestBar(root) {
    $$('[data-t]', root).forEach(function (b) {
      b.onclick = function () {
        var t = b.getAttribute('data-t');
        if (engine) engine.trigger(t, t === 'mouseMove' ? { dx: (Math.random() * 2 - 1), dy: (Math.random() * 2 - 1) * 0.5 } : null);
        var snd = b.getAttribute('data-s');
        if (snd) API.playSound(snd);
      };
    });
  }

  // ------------------------------------------------------------------ navegação

  var TABS = [['home', 'Início', ICON.home], ['gallery', 'Galeria', ICON.grid], ['settings', 'Ajustes', ICON.sliders]];

  function renderNav() {
    $('#nav').innerHTML = TABS.map(function (t) {
      return '<button data-tab="' + t[0] + '"' + (S.tab === t[0] ? ' aria-current="page"' : '') + '>' + t[2] + '<span>' + t[1] + '</span></button>';
    }).join('');
    $$('#nav button').forEach(function (b) { b.onclick = function () { go(b.getAttribute('data-tab')); }; });
  }

  function go(tab) {
    if (S.inEditor) return;
    flush();
    S.tab = tab;
    unmountEngine();
    ['home', 'gallery', 'settings', 'editor'].forEach(function (n) { $('#screen-' + n).hidden = (n !== tab); });
    renderNav();
    if (tab === 'home') renderHome();
    else if (tab === 'gallery') renderGallery();
    else if (tab === 'settings') renderSettings();
    $('#screen-' + tab).scrollTop = 0;
  }

  // ------------------------------------------------------------------ INÍCIO

  function statusChip() {
    var o = S.overlay;
    if (!o.running) return '<span class="chip off">Parada</span>';
    return o.hidden ? '<span class="chip warn">Oculta</span>' : '<span class="chip on">Ativa</span>';
  }

  function renderHome() {
    var o = S.overlay, c = currentChar();
    var perm = o.permission;
    var html = '<h1>Bongo Cat Mobile</h1><p class="sub">Um personagem que reage ao que você faz, flutuando sobre qualquer app.</p>' +
      '<div class="home-grid"><div class="card"><div class="row between" style="margin-bottom:10px">' +
      '<div class="grow"><b id="home-name">' + esc(c.name) + '</b><div class="small muted">Toque no palco para testar</div></div>' + statusChip() + '</div>' +
      '<div class="stage-wrap"><div class="stage" id="home-stage"' + (S.settings.displayMode && S.settings.displayMode !== 'classic' ? ' style="aspect-ratio:612/354"' : '') + '><div class="fit" id="home-fit"></div></div></div>' + testBar() +
      '<div class="field" style="margin-top:12px"><div class="field-head"><b>Modo Bongo Cat</b></div><select id="home-mode"><option value="classic">Personagens clássicos</option><option value="osu">osu!</option><option value="mania4k">Mania 4K</option><option value="mania7k">Mania 7K</option><option value="taiko">Taiko</option><option value="catch">Catch</option></select><p class="hint">Escolha o estilo de animação que ficará na sobreposição.</p></div></div>' +
      '<div><div class="card">';

    if (!perm) {
      html += '<div class="note warn" style="margin-bottom:14px">' + ICON.info + '<div><b>Falta uma permissão.</b> Para flutuar sobre outros apps o Android exige a opção “Exibir sobre outros apps”. Você escolhe o Bongo Cat na lista e ativa.</div></div>' +
        '<button class="btn primary block" id="btn-perm">Conceder permissão</button>';
    } else if (!o.running) {
      html += '<button class="btn primary block" id="btn-start">' + ICON.play + ' Iniciar sobreposição</button>' +
        '<p class="hint" style="margin-top:10px">O personagem aparece sobre os outros apps e continua ativo quando você sair daqui.</p>';
    } else {
      html += '<div class="stack"><button class="btn danger block" id="btn-stop">' + ICON.stop + ' Parar sobreposição</button>' +
        '<button class="btn block" id="btn-hide">' + (o.hidden ? ICON.eye + ' Mostrar personagem' : ICON.eyeoff + ' Ocultar personagem') + '</button></div>' +
        '<p class="hint" style="margin-top:10px">Dica: segure o personagem para abrir os controles (tamanho, ocultar, fechar).</p>';
    }
    html += '</div>';

    if (perm && S.notifications === false) {
      html += '<div class="card flat"><p><b>Notificação do serviço</b></p><p class="small muted">Sem a permissão de notificações o Android esconde o aviso do serviço, mas a sobreposição funciona do mesmo jeito. Com ela, você ganha botões de ocultar e fechar na barra de notificações.</p>' +
        '<button class="btn sm" id="btn-notif">Permitir notificações</button></div>';
    }

    html += '<div class="card"><div class="field-head"><b>Tamanho</b><output id="o-size">' + Math.round((S.settings.size || 1) * 100) + '%</output></div>' +
      '<input type="range" id="home-size" min="40" max="250" step="5" value="' + Math.round((S.settings.size || 1) * 100) + '" aria-label="Tamanho do personagem">' +
      '<div class="field-head" style="margin-top:6px"><b>Velocidade</b><output id="o-speed">' + (+S.settings.speed || 1).toFixed(2) + '×</output></div>' +
      '<input type="range" id="home-speed" min="25" max="300" step="5" value="' + Math.round((S.settings.speed || 1) * 100) + '" aria-label="Velocidade das animações"></div>' +
      '</div></div>';

    var root = $('#screen-home');
    root.innerHTML = html;
    mountEngine($('#home-fit'), c);
    bindTestBar(root);
    var modeSelect = $('#home-mode'); if (modeSelect) { modeSelect.value = S.settings.displayMode || 'classic'; modeSelect.onchange = function(e) { save({ displayMode: e.target.value }); flush(); renderHome(); toast('Modo: ' + e.target.options[e.target.selectedIndex].text); }; }
    $('#home-stage').onpointermove = function (e) {
      if (!engine || !engine.pointer) return;
      var r = this.getBoundingClientRect();
      engine.pointer((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    };
    $('#home-stage').onclick = function (e) {
      if (e.target.closest('[data-t]')) return;
      engine && engine.trigger('touch'); API.playSound('tick');
    };
    var bp = $('#btn-perm'); if (bp) bp.onclick = askOverlayPermission;
    var bs = $('#btn-start'); if (bs) bs.onclick = startOverlay;
    var bx = $('#btn-stop'); if (bx) bx.onclick = function () { API.stopOverlay(); settleOverlay(); };
    var bh = $('#btn-hide'); if (bh) bh.onclick = function () { API.setOverlayHidden(!S.overlay.hidden); settleOverlay(); };
    var bn = $('#btn-notif'); if (bn) bn.onclick = function () { API.requestNotificationPermission(); };
    $('#home-size').oninput = function (e) {
      var v = +e.target.value / 100; $('#o-size').textContent = Math.round(v * 100) + '%'; save({ size: v });
    };
    $('#home-speed').oninput = function (e) {
      var v = +e.target.value / 100; $('#o-speed').textContent = v.toFixed(2) + '×'; save({ speed: v }); engine && engine.setSpeed(v);
    };
  }

  function askOverlayPermission() {
    dialog('Permitir sobreposição', '<p>Vamos abrir a tela de configurações do Android. Procure <b>Bongo Cat Mobile</b> e ative <b>“Permitir exibição sobre outros apps”</b>. Depois, volte aqui.</p><p class="small muted">Essa permissão só serve para desenhar o personagem na tela. O app não lê o que há nos outros apps.</p>',
      [{ label: 'Agora não' }, { label: 'Abrir configurações', cls: 'primary' }]).then(function (i) {
      if (i === 1) API.requestOverlayPermission();
    });
  }

  function startOverlay() {
    flush();
    if (S.notifications === false) API.requestNotificationPermission();
    var r = API.startOverlay();
    if (r === 'no_permission') { S.overlay.permission = false; renderHome(); askOverlayPermission(); return; }
    settleOverlay();
    toast('Sobreposição iniciada');
  }

  /** O serviço liga/desliga de forma assíncrona: relê o estado logo depois. */
  function settleOverlay() {
    [150, 600].forEach(function (ms) {
      setTimeout(function () { refresh(); }, ms);
    });
  }

  // ------------------------------------------------------------------ GALERIA

  function charCard(c) {
    var sel = c.id === S.settings.characterId;
    var fav = S.settings.favorites.indexOf(c.id) >= 0;
    var custom = c.kind === 'custom';
    return '<div class="char" role="button" tabindex="0" data-id="' + esc(c.id) + '" aria-pressed="' + sel + '" aria-label="' + esc(c.name) + '">' +
      '<div class="thumb">' + E.thumbHTML(c) + '</div>' +
      (sel ? '<span class="sel-badge">Em uso</span>' : '') +
      '<button class="star" data-fav="' + esc(c.id) + '" aria-pressed="' + fav + '" aria-label="Favorito">' + ICON.star + '</button>' +
      '<div class="name">' + esc(c.name) + '</div>' +
      (custom ? '<div class="actions"><button class="btn sm" data-edit="' + esc(c.id) + '">' + ICON.edit + ' Editar</button><button class="btn sm danger" data-del="' + esc(c.id) + '" aria-label="Excluir">' + ICON.trash + '</button></div>' : '') +
      '</div>';
  }

  function renderGallery() {
    var all = allChars(), favs = S.settings.favorites;
    var favList = all.filter(function (c) { return favs.indexOf(c.id) >= 0; });
    var html = '<div class="row between"><h1>Galeria</h1><button class="btn primary sm" id="g-import">' + ICON.plus + ' Importar</button></div>' +
      '<p class="sub">Toque num personagem para usá-lo. A estrela salva nos favoritos.</p>';
    if (favList.length) html += '<h2>Favoritos</h2><div class="grid">' + favList.map(charCard).join('') + '</div>';
    var groups = ['Gatos', 'Outros animais'];
    groups.forEach(function (g) {
      var l = global.BongoChars.list.filter(function (c) { return c.group === g; });
      html += '<h2>' + g + '</h2><div class="grid">' + l.map(charCard).join('') + '</div>';
    });
    html += '<h2>Personalizados</h2>';
    if (S.library.length) html += '<div class="grid">' + S.library.map(charCard).join('') + '</div>';
    else html += '<div class="card empty">Você ainda não importou nenhum personagem.<br>Use PNG, GIF transparente ou spritesheet da sua galeria.<br><br><button class="btn primary" id="g-import2">' + ICON.upload + ' Importar personagem</button></div>';

    var root = $('#screen-gallery');
    var top = root.scrollTop;
    root.innerHTML = html;
    root.scrollTop = top;

    $('#g-import').onclick = function () { openEditor(null); };
    var i2 = $('#g-import2'); if (i2) i2.onclick = function () { openEditor(null); };

    $$('.char', root).forEach(function (el) {
      var id = el.getAttribute('data-id');
      var pick = function () { save({ characterId: id }); flush(); renderGallery(); toast('Personagem: ' + findChar(id).name); };
      el.onclick = function (e) {
        if (e.target.closest('[data-fav]') || e.target.closest('[data-edit]') || e.target.closest('[data-del]')) return;
        pick();
      };
      el.onkeydown = function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target === el) { e.preventDefault(); pick(); } };
    });
    $$('[data-fav]', root).forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        var id = b.getAttribute('data-fav'), f = S.settings.favorites.slice(), i = f.indexOf(id);
        if (i >= 0) f.splice(i, 1); else f.push(id);
        save({ favorites: f }); flush(); renderGallery();
      };
    });
    $$('[data-edit]', root).forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); openEditor(b.getAttribute('data-edit')); }; });
    $$('[data-del]', root).forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        var id = b.getAttribute('data-del'), c = findChar(id);
        dialog('Excluir personagem?', '<p>“' + esc(c.name) + '” e seus arquivos serão removidos do aparelho.</p>', [{ label: 'Cancelar' }, { label: 'Excluir', cls: 'danger' }]).then(function (i) {
          if (i !== 1) return;
          API.deleteCharacter(id);
          S.library = S.library.filter(function (x) { return x.id !== id; });
          var patch = { favorites: S.settings.favorites.filter(function (x) { return x !== id; }) };
          if (S.settings.characterId === id) patch.characterId = global.BongoChars.DEFAULT_ID;
          save(patch); flush(); renderGallery(); toast('Personagem excluído');
        });
      };
    });
  }

  // ------------------------------------------------------------------ EDITOR

  function newId() { return 'custom-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function openEditor(id) {
    var src = id ? findChar(id) : null;
    S.draft = src ? JSON.parse(JSON.stringify(src)) : { id: newId(), name: '', kind: 'custom', anims: {}, isNew: true };
    S.draft.isNew = !src;
    S.inEditor = true;
    document.body.classList.add('in-editor');
    unmountEngine();
    ['home', 'gallery', 'settings'].forEach(function (n) { $('#screen-' + n).hidden = true; });
    $('#screen-editor').hidden = false;
    renderEditor();
    $('#screen-editor').scrollTop = 0;
  }

  function closeEditor() {
    S.inEditor = false;
    document.body.classList.remove('in-editor');
    unmountEngine();
    $('#screen-editor').hidden = true;
    S.draft = null;
    go('gallery');
  }

  function cancelEditor() {
    var d = S.draft;
    if (d && d.isNew) API.discardDraft(d.id);
    closeEditor();
  }

  function draftDef() {
    var d = S.draft;
    return { id: d.id, name: d.name, kind: 'custom', anims: d.anims };
  }

  function animRow(state) {
    var a = S.draft.anims[state];
    var h = '<div class="anim-row" data-state="' + state + '"><div class="head"><div class="mini">' +
      (a ? E.thumbHTML({ kind: 'custom', anims: { idle: a } }) : '') + '</div><div class="grow"><b>' + STATE_LABEL[state] + '</b><div class="dim">' +
      (a ? (a.label ? esc(a.label) : 'Arquivo importado') + ' · ' + (a.width || '?') + '×' + (a.height || '?') : (state === 'idle' ? 'Obrigatório se não houver outra' : 'Sem arquivo (usa o repouso)')) + '</div></div>' +
      '<button class="btn sm" data-act="pick">' + ICON.upload + ' ' + (a ? 'Trocar' : 'Escolher') + '</button></div>';
    if (a) {
      var sheet = a.mode === 'sheet';
      h += '<div class="opts"><label>Tipo<select data-f="mode"><option value="image"' + (sheet ? '' : ' selected') + '>PNG / GIF</option><option value="sheet"' + (sheet ? ' selected' : '') + '>Spritesheet</option></select></label>' +
        '<label>Efeito de movimento<select data-f="fx">' + FX_LABEL.map(function (f) { return '<option value="' + f[0] + '"' + ((a.fx || 'auto') === f[0] ? ' selected' : '') + '>' + f[1] + '</option>'; }).join('') + '</select></label>';
      if (sheet) {
        h += '<label>Colunas<input type="number" inputmode="numeric" min="1" max="64" data-f="cols" value="' + (a.cols || 1) + '"></label>' +
          '<label>Linhas<input type="number" inputmode="numeric" min="1" max="64" data-f="rows" value="' + (a.rows || 1) + '"></label>' +
          '<label>Quadros<input type="number" inputmode="numeric" min="1" max="256" data-f="frames" value="' + (a.frames || ((a.cols || 1) * (a.rows || 1))) + '"></label>' +
          '<label>Quadros por segundo<input type="number" inputmode="numeric" min="1" max="60" data-f="fps" value="' + (a.fps || 12) + '"></label>' +
          '<label class="full"><span class="dim">Divida o arquivo em colunas × linhas iguais, na ordem da esquerda para a direita e de cima para baixo.</span></label>';
      }
      h += '<label class="full">Escala <span class="dim" data-o="scale">' + Math.round((a.scale || 1) * 100) + '%</span><input type="range" min="30" max="200" step="5" data-f="scale" value="' + Math.round((a.scale || 1) * 100) + '"></label>' +
        '<label class="check"><input type="checkbox" data-f="flip"' + (a.flip ? ' checked' : '') + '> Espelhar</label>' +
        '<div class="row" style="justify-content:flex-end"><button class="btn sm danger" data-act="remove">Remover</button></div></div>';
    }
    return h + '</div>';
  }

  function renderEditor() {
    var d = S.draft;
    var html = '<div class="ed-top"><button class="icon-btn" id="ed-back" aria-label="Voltar">' + ICON.back + '</button><h1>' + (d.isNew ? 'Novo personagem' : 'Editar personagem') + '</h1></div>' +
      '<div class="card"><div class="stage-wrap"><div class="stage" id="ed-stage"><div class="fit" id="ed-fit"></div></div></div>' + testBar() + '</div>' +
      '<div class="card"><label class="field-head" for="ed-name"><b>Nome</b></label><input id="ed-name" type="text" maxlength="40" placeholder="Ex.: Meu gatinho" value="' + esc(d.name) + '"></div>' +
      '<h2>Animações</h2><div class="card" id="ed-anims">' + E.STATES.map(animRow).join('') + '</div>' +
      '<div class="note" style="margin-bottom:14px">' + ICON.info + '<div>Aceita <b>PNG</b>, <b>GIF</b> (com transparência), <b>WebP</b> e <b>spritesheets</b> da sua galeria. Estados sem arquivo usam o de <b>Repouso</b>. Use só imagens que você tem direito de usar.</div></div>' +
      '<div class="row wrap"><button class="btn ghost grow" id="ed-cancel">Cancelar</button><button class="btn grow" id="ed-save">Salvar</button><button class="btn primary grow" id="ed-use">Salvar e usar</button></div>';

    var root = $('#screen-editor');
    root.innerHTML = html;
    var anyAnim = Object.keys(d.anims).length > 0;
    mountEngine($('#ed-fit'), anyAnim ? draftDef() : currentChar());
    bindTestBar(root);

    $('#ed-back').onclick = onBack;
    $('#ed-cancel').onclick = cancelEditor;
    $('#ed-name').oninput = function (e) { d.name = e.target.value; };
    $('#ed-save').onclick = function () { saveDraft(false); };
    $('#ed-use').onclick = function () { saveDraft(true); };
    bindAnimRows();
  }

  function refreshEditorPreview() {
    if (!engine) return;
    var any = Object.keys(S.draft.anims).length > 0;
    engine.setCharacter(any ? draftDef() : currentChar());
  }

  var rerendering = false;
  function rerenderAnimRow(state) {
    if (rerendering) return;
    var row = $('.anim-row[data-state="' + state + '"]');
    if (!row) return;
    rerendering = true;
    try {
      // Tira o foco antes: o blur dispara "change" e não pode acontecer no meio da troca.
      var ae = document.activeElement;
      if (ae && row.contains(ae) && ae.blur) ae.blur();
      row = $('.anim-row[data-state="' + state + '"]');
      if (!row || !row.parentNode) return;
      var tmp = document.createElement('div');
      tmp.innerHTML = animRow(state);
      row.parentNode.replaceChild(tmp.firstChild, row);
    } finally {
      rerendering = false;
    }
    bindAnimRows();
  }

  function bindAnimRows() {
    $$('.anim-row').forEach(function (row) {
      var state = row.getAttribute('data-state');
      var pick = $('[data-act="pick"]', row);
      pick.onclick = function () {
        pick.disabled = true;
        API.pickFile(S.draft.id, function (r) {
          pick.disabled = false;
          if (!r || !r.ok) {
            var msg = { cancelled: null, too_large: 'Arquivo grande demais (máx. 24 MB).', not_image: 'Esse arquivo não é uma imagem válida.', too_big_dims: 'Imagem grande demais (máx. 8192 px).' }[r && r.error];
            if (msg !== null) toast(msg || 'Não foi possível importar o arquivo.');
            return;
          }
          var old = S.draft.anims[state] || {};
          var isGif = /gif/i.test(r.mime || '') || /\.gif$/i.test(r.label || '');
          var wide = r.width >= r.height * 2.2 || r.height >= r.width * 2.2;
          S.draft.anims[state] = {
            file: r.file, mode: old.mode || 'image', fx: old.fx || 'auto', scale: old.scale || 1, flip: !!old.flip,
            cols: old.cols || 1, rows: old.rows || 1, frames: old.frames, fps: old.fps || 12,
            width: r.width, height: r.height, label: r.label, mime: r.mime
          };
          if (!old.file && wide && !isGif) toast('Parece uma spritesheet? Mude o tipo e informe colunas × linhas.');
          rerenderAnimRow(state); refreshEditorPreview();
        });
      };
      var rm = $('[data-act="remove"]', row);
      if (rm) rm.onclick = function () { delete S.draft.anims[state]; rerenderAnimRow(state); refreshEditorPreview(); };

      $$('[data-f]', row).forEach(function (inp) {
        var f = inp.getAttribute('data-f');
        var apply = function () {
          var a = S.draft.anims[state]; if (!a) return;
          if (inp.type === 'checkbox') a[f] = inp.checked;
          else if (f === 'scale') { a.scale = (+inp.value) / 100; var o = $('[data-o="scale"]', row); if (o) o.textContent = inp.value + '%'; }
          else if (f === 'mode' || f === 'fx') a[f] = inp.value;
          else {
            var lim = { cols: 64, rows: 64, frames: 256, fps: 60 }[f];
            a[f] = clamp(Math.round(+inp.value) || 1, 1, lim);
            if (f === 'cols' || f === 'rows') a.frames = (a.cols || 1) * (a.rows || 1); // o usuário pode reduzir "Quadros" depois
          }
          if (f === 'mode') { a.frames = (a.cols || 1) * (a.rows || 1); rerenderAnimRow(state); }
          refreshEditorPreviewSoon();
        };
        inp.oninput = apply;
        inp.onchange = function () { apply(); if (f === 'cols' || f === 'rows') rerenderAnimRow(state); };
      });
    });
  }

  var previewTimer = 0;
  function refreshEditorPreviewSoon() { clearTimeout(previewTimer); previewTimer = setTimeout(refreshEditorPreview, 200); }

  function saveDraft(use) {
    var d = S.draft;
    if (!Object.keys(d.anims).length) { toast('Escolha ao menos um arquivo de animação.'); return; }
    if (!d.anims.idle) {
      var first = E.STATES.filter(function (s) { return d.anims[s]; })[0];
      d.anims.idle = JSON.parse(JSON.stringify(d.anims[first]));
    }
    d.name = (d.name || '').trim() || 'Meu personagem';
    var out = { id: d.id, name: d.name, kind: 'custom', anims: {} };
    E.STATES.forEach(function (s) {
      var a = d.anims[s]; if (!a) return;
      out.anims[s] = {
        file: a.file, mode: a.mode === 'sheet' ? 'sheet' : 'image', fx: a.fx || 'auto', scale: a.scale || 1, flip: !!a.flip,
        cols: a.cols, rows: a.rows, frames: a.frames, fps: a.fps, width: a.width, height: a.height, label: a.label, mime: a.mime
      };
      if (a.mime === 'image/gif') out.anims[s].mode = a.mode === 'sheet' ? 'sheet' : 'gif';
      else if (out.anims[s].mode === 'image') out.anims[s].mode = 'image';
    });
    if (!API.upsertCharacter(out)) { toast('Não foi possível salvar o personagem.'); return; }
    if (use) { save({ characterId: d.id }); flush(); }
    load();
    S.inEditor = false;
    document.body.classList.remove('in-editor');
    unmountEngine();
    $('#screen-editor').hidden = true;
    S.draft = null;
    go('gallery');
    toast(use ? 'Salvo e em uso' : 'Personagem salvo');
  }

  // ------------------------------------------------------------------ AJUSTES

  function rangeField(id, label, min, max, step, val, fmt, hint) {
    return '<div class="field"><div class="field-head"><b>' + label + '</b><output id="o-' + id + '">' + fmt(val) + '</output></div>' +
      '<input type="range" id="s-' + id + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '" aria-label="' + label + '">' +
      (hint ? '<p class="hint">' + hint + '</p>' : '') + '</div>';
  }
  function switchField(id, label, hint, on) {
    return '<label class="switch"><span><b>' + label + '</b>' + (hint ? '<span class="hint" style="display:block">' + hint + '</span>' : '') + '</span>' +
      '<input type="checkbox" id="s-' + id + '"' + (on ? ' checked' : '') + '><span class="track"></span></label>';
  }

  function renderSettings() {
    var s = S.settings, o = S.overlay;
    var html = '<h1>Ajustes</h1><p class="sub">Tudo é salvo automaticamente neste aparelho.</p>';

    html += '<h2>Aparência</h2><div class="card">' +
      rangeField('size', 'Tamanho', 40, 250, 5, Math.round(s.size * 100), function (v) { return v + '%'; }) +
      rangeField('opacity', 'Opacidade', 30, 100, 5, Math.round(s.opacity * 100), function (v) { return v + '%'; }, 'Deixe mais transparente para não atrapalhar o app de baixo.') +
      '</div>';

    html += '<h2>Modo de animação</h2><div class="card"><div class="field"><div class="field-head"><b>Estilo do personagem</b></div><select id="s-mode"><option value="classic">Personagens clássicos</option><option value="osu">osu!</option><option value="mania4k">Mania 4K</option><option value="mania7k">Mania 7K</option><option value="taiko">Taiko</option><option value="catch">Catch</option></select><p class="hint">Cada modo usa sprites e movimentos próprios. Mania possui opções 4K e 7K.</p></div></div>';

    html += '<h2>Posição</h2><div class="card"><p class="small muted">Arraste a bolinha para posicionar o personagem. Você também pode arrastar o próprio personagem na tela. Ele nunca passa por cima das barras do sistema.</p>' +
      '<div class="pad" id="pad"><div class="dot" id="pad-dot"></div></div>' +
      '<div class="presets"><button class="btn" data-pos="0,0" aria-label="Canto superior esquerdo">↖</button><button class="btn" data-pos="1,0" aria-label="Canto superior direito">↗</button>' +
      '<button class="btn" data-pos="0.5,0.5" aria-label="Centro">●</button><button class="btn" data-pos="0,1" aria-label="Canto inferior esquerdo">↙</button><button class="btn" data-pos="1,1" aria-label="Canto inferior direito">↘</button></div></div>';

    html += '<h2>Animação</h2><div class="card">' +
      rangeField('speed', 'Velocidade', 25, 300, 5, Math.round(s.speed * 100), function (v) { return (v / 100).toFixed(2) + '×'; }) +
      '<div class="field"><div class="field-head"><b>Animação exibida</b></div><select id="s-forced" aria-label="Animação exibida">' +
      '<option value="auto">Automática (reage aos eventos)</option>' +
      E.STATES.map(function (st) { return '<option value="' + st + '">Sempre: ' + STATE_LABEL[st] + '</option>'; }).join('') +
      '</select><p class="hint">Escolha uma animação para ela repetir sem parar (útil para vídeos e capturas de tela). Em “Automática” o personagem fica parado e reage a toques, cliques e teclas.</p></div>' +
      switchField('saver', 'Economia de bateria', 'Menos quadros por segundo em repouso, sem respiração contínua.', s.batterySaver) + '</div>';

    html += '<h2>Sons</h2><div class="card">' + switchField('sound', 'Efeitos sonoros', 'Um “tum” a cada clique, toque ou tecla.', s.sound) +
      rangeField('volume', 'Volume', 0, 100, 5, Math.round(s.volume * 100), function (v) { return v + '%'; }) +
      '<div class="row" style="margin-top:8px"><button class="btn sm" data-snd="low">Testar grave</button><button class="btn sm" data-snd="high">Testar agudo</button><button class="btn sm" data-snd="tick">Testar toque</button></div></div>';

    // ---- entrada
    var dv = S.devices || {};
    html += '<h2>Teclado e mouse</h2><div class="card">' + switchField('outside', 'Reagir a toques e cliques fora do personagem', 'O Android avisa que houve um toque/clique em outro app, mas não onde nem em quê.', s.reactOutside) +
      '<div class="field"><div class="row between"><div class="grow"><b>Mouse</b><div class="hint">USB ou Bluetooth</div></div><span class="chip ' + (dv.mouse ? 'on' : 'off') + '">' + (dv.mouse ? 'Conectado' : 'Não detectado') + '</span></div></div>' +
      '<div class="field"><div class="row between"><div class="grow"><b>Teclado físico</b><div class="hint">USB ou Bluetooth</div></div><span class="chip ' + (dv.keyboard ? 'on' : 'off') + '">' + (dv.keyboard ? 'Conectado' : 'Não detectado') + '</span></div></div>' +
      '<div class="field"><div class="row between"><div class="grow"><b>Detecção de teclas em outros apps</b><div class="hint">Serviço opcional: compara apenas códigos numéricos das teclas físicas mapeadas.</div></div><span class="chip ' + (S.a11y.enabled ? 'on' : 'off') + '">' + (S.a11y.enabled ? 'Ativada' : 'Desativada') + '</span></div>' +
      '<button class="btn sm" id="btn-a11y" style="margin-top:10px">' + (S.a11y.enabled ? 'Gerenciar nas configurações' : 'Ativar nas configurações') + '</button></div>' +
      '<div class="field"><b>Mapeamento de teclas</b><p class="hint">Toque em uma ação e pressione a tecla física desejada. Para funcionar em outros apps, ative o serviço de acessibilidade.</p><div id="keymap-list"></div></div></div>';

    var zk = S.shizuku || {};
    html += '<h2>Áreas de toque (mouse e teclado)</h2><div class="card">' +
      '<p class="hint">Duas áreas transparentes, separadas do personagem. Na área do <b>mouse</b>, arrastar o dedo move o mouse (toque = clique, dois dedos = clique direito). Na área do <b>teclado</b>, cada faixa aciona uma pata/tecla. O app que estiver embaixo de uma área <b>não recebe</b> toques nela.</p>' +
      switchField('zonesOn', 'Ativar áreas de toque', 'Aparecem quando a sobreposição estiver ligada.', s.zonesOn) +
      switchField('zedit', 'Editar áreas', 'Ligado: arraste cada área e use o canto inferior direito para o tamanho. Desligado: as áreas ficam travadas e funcionam.', s.zonesLocked === false) +
      switchField('zvis', 'Só visual (deixar toques passarem)', 'O app embaixo volta a receber os toques, mas as áreas não detectam nada.', s.zonesVisualOnly) +
      rangeField('zalpha', 'Visibilidade das áreas', 10, 90, 5, Math.round((s.zonesAlpha == null ? 0.35 : s.zonesAlpha) * 100), function (v) { return v + '%'; }) +
      '<p class="hint">As posições são salvas separadamente para cada modo (osu!, Mania, Taiko, Catch).</p>' +
      '<button class="btn sm" id="btn-zreset">Restaurar posições padrão</button>' +
      switchField('desk', 'Mesa transparente (osu!)', 'Remove o fundo branco da mesa no modo osu!.', s.transparentDesk !== false) + '</div>';

    html += '<h2>Modo avançado (Shizuku)</h2><div class="card">' +
      '<p class="hint">Opcional. Com o app <b>Shizuku</b> ativo, o Bongo Cat lê o mouse (movimento e botões), toques e teclas físicas em <b>qualquer app</b>, sem bloquear nada: o jogo continua recebendo tudo. É preciso instalar o Shizuku e ativar a “Depuração sem fio” (no Samsung, refazer após reiniciar). Só lemos movimento, botões, “houve toque” e códigos de teclas mapeadas; nada é guardado nem enviado.</p>' +
      '<div class="field"><div class="row between"><div class="grow"><b>Shizuku</b></div><span class="chip ' + (zk.running ? 'on' : 'off') + '">' + (zk.running ? 'Ativo' : (zk.installed ? 'Instalado, desligado' : 'Não instalado')) + '</span></div></div>' +
      '<div class="field"><div class="row between"><div class="grow"><b>Permissão para o Bongo Cat</b></div><span class="chip ' + (zk.granted ? 'on' : 'off') + '">' + (zk.granted ? 'Concedida' : 'Pendente') + '</span></div>' +
      '<button class="btn sm" id="btn-shizuku" style="margin-top:10px">' + (zk.running ? (zk.granted ? 'Permissão concedida' : 'Conceder permissão') : (zk.installed ? 'Abrir o Shizuku' : 'Baixar o Shizuku')) + '</button></div>' +
      '<div class="field"><b>Teste de entrada</b><p class="hint">Com o modo avançado ligado, mexa o mouse, aperte teclas e toque na tela (inclusive com o Panda Mouse ligado) e toque em Atualizar. Se um número ficar em 0, o Android não entregou aquele tipo de evento ao Bongo Cat.</p>' +
      '<div id="inp-stats" class="small"></div><div class="row" style="margin-top:8px"><button class="btn sm" id="btn-stat-refresh">Atualizar</button><button class="btn sm" id="btn-stat-zero">Zerar</button></div></div>' +
      switchField('zvirt', 'Áreas virtuais (não bloqueiam o jogo)', 'Com o Shizuku, as áreas de toque só são desenhadas e o app lê seus toques por baixo: o jogo continua recebendo tudo, inclusive o analógico. Desligue para voltar às áreas que capturam o toque.', s.zonesVirtual !== false) +
      switchField('adv', 'Ativar leitura global de entrada', 'Só funciona com o Shizuku ativo e a permissão concedida.', s.advancedInput) +
      rangeField('advsens', 'Sensibilidade do mouse', 25, 400, 5, Math.round((s.advSens || 1) * 100), function (v) { return (v / 100).toFixed(2) + '×'; }) + '</div>';

    html += '<details class="card"><summary>Como funciona e quais são as limitações do Android</summary><div class="body">' +
      '<p class="small">Por segurança, o Android <b>não deixa um app ver o que acontece em outros apps</b>. Este aplicativo respeita isso. Veja o que dá e o que não dá:</p>' +
      '<table class="lim">' +
      '<tr><td>Toque ou clique <b>no personagem</b></td><td><span class="yes">Sim</span> – toque, mouse (esquerdo/direito), passar o mouse por cima e roda do mouse.</td></tr>' +
      '<tr><td>Toque/clique <b>em outro app</b></td><td><span class="part">Parcial</span> – o sistema avisa que houve um toque fora da janela, sem posição e sem conteúdo. O personagem reage, mas não sabe em quê.</td></tr>' +
      '<tr><td>Teclado físico em outro app</td><td><span class="part">Só com acessibilidade</span> – você precisa ativar o serviço manualmente. Ele compara somente o código numérico da tecla com os atalhos configurados; não lê o texto digitado.</td></tr>' +
      '<tr><td>Teclado virtual (na tela)</td><td><span class="no">Não</span> – detectá-lo exigiria ler o texto digitado. O app não faz isso.</td></tr>' +
      '<tr><td>Movimento do mouse fora do personagem</td><td><span class="no">Não</span> – o Android só entrega o movimento ao app que está sob o cursor.</td></tr>' +
      '<tr><td>Ler textos, senhas ou a tela</td><td><span class="no">Nunca</span> – o serviço não lê conteúdo de tela e o app <b>nem tem a permissão de Internet</b>: nada sai do aparelho.</td></tr></table>' +
      '<p class="small muted" style="margin-top:10px">Alguns fabricantes (Xiaomi, Samsung, etc.) encerram serviços em segundo plano para economizar bateria. Se o personagem sumir, retire o app da otimização de bateria nas configurações do aparelho.</p>' +
      '<button class="btn sm" id="btn-appset">Abrir configurações do app</button></div></details>';

    html += '<h2>Sobre</h2><div class="card flat small muted">Bongo Cat Mobile ' + esc(S.app.version || '') + (S.app.sdk ? ' · Android API ' + esc(S.app.sdk) : ' · modo navegador') +
      '<br>Personagens de demonstração: arte original deste projeto. Projeto independente, sem vínculo com o Bongo Cat original.' +
      '<br>Sobreposição: ' + (o.permission ? 'permissão concedida' : 'permissão pendente') + '.</div>';

    var root = $('#screen-settings');
    root.innerHTML = html;
    $('#s-forced').value = s.forcedAnim || 'auto';
    var modeSetting = $('#s-mode'); if (modeSetting) { modeSetting.value = s.displayMode || 'classic'; modeSetting.onchange = function(e) { save({ displayMode: e.target.value }); flush(); renderSettings(); toast('Modo atualizado'); }; }

    function bindRange(id, key, scale, fmt, extra) {
      $('#s-' + id).oninput = function (e) {
        var v = +e.target.value / scale; $('#o-' + id).textContent = fmt(+e.target.value);
        var p = {}; p[key] = v; save(p); if (extra) extra(v);
      };
    }
    bindRange('size', 'size', 100, function (v) { return v + '%'; });
    bindRange('opacity', 'opacity', 100, function (v) { return v + '%'; });
    bindRange('speed', 'speed', 100, function (v) { return (v / 100).toFixed(2) + '×'; });
    bindRange('volume', 'volume', 100, function (v) { return v + '%'; });
    $('#s-forced').onchange = function (e) { save({ forcedAnim: e.target.value }); };
    $('#s-saver').onchange = function (e) { save({ batterySaver: e.target.checked }); };
    $('#s-sound').onchange = function (e) { save({ sound: e.target.checked }); };
    $('#s-outside').onchange = function (e) { save({ reactOutside: e.target.checked }); };
    $$('[data-snd]', root).forEach(function (b) { b.onclick = function () { flush(); API.playSound(b.getAttribute('data-snd')); }; });
    $('#s-zonesOn').onchange = function (e) { save({ zonesOn: e.target.checked }); };
    $('#s-zedit').onchange = function (e) { save({ zonesLocked: !e.target.checked }); };
    $('#s-zvis').onchange = function (e) { save({ zonesVisualOnly: e.target.checked }); };
    $('#s-desk').onchange = function (e) { save({ transparentDesk: e.target.checked }); };
    var statBase = { lines: 0, keys: 0, moves: 0, clicks: 0, touches: 0 };
    function showStats() {
      var st = (API.getState() || {}).inputStats || {};
      var d = function (k) { return Math.max(0, (st[k] || 0) - (statBase[k] || 0)); };
      $('#inp-stats').innerHTML = (st.alive ? '<span class="chip on">Lendo entrada</span>' : '<span class="chip off">Parado (Shizuku/permissão/modo desligado)</span>') +
        '<br>Linhas recebidas do sistema: <b>' + d('lines') + '</b><br>Teclas mapeadas: <b>' + d('keys') + '</b><br>Movimentos do mouse: <b>' + d('moves') +
        '</b><br>Cliques do mouse: <b>' + d('clicks') + '</b><br>Toques na tela: <b>' + d('touches') + '</b>';
    }
    showStats();
    $('#btn-stat-refresh').onclick = showStats;
    $('#btn-stat-zero').onclick = function () { var st = (API.getState() || {}).inputStats || {}; statBase = { lines: st.lines || 0, keys: st.keys || 0, moves: st.moves || 0, clicks: st.clicks || 0, touches: st.touches || 0 }; showStats(); };
    $('#s-zvirt').onchange = function (e) { save({ zonesVirtual: e.target.checked }); };
    $('#s-adv').onchange = function (e) {
      save({ advancedInput: e.target.checked });
      if (e.target.checked && !(S.shizuku && S.shizuku.granted)) toast('Conceda a permissão do Shizuku abaixo para funcionar.');
    };
    bindRange('zalpha', 'zonesAlpha', 100, function (v) { return v + '%'; });
    bindRange('advsens', 'advSens', 100, function (v) { return (v / 100).toFixed(2) + '×'; });
    $('#btn-zreset').onclick = function () { save({ zones: {} }); flush(); toast('Posições restauradas'); };
    $('#btn-shizuku').onclick = function () { flush(); API.requestShizuku(); };
    $('#btn-a11y').onclick = function () {
      dialog('Detecção de teclado físico', '<p>Vamos abrir <b>Acessibilidade</b>. Procure <b>“Bongo Cat – teclado físico”</b> e ative.</p><p class="small muted">O Android mostrará um aviso padrão de segurança. O serviço compara somente o código numérico das teclas físicas mapeadas. Não lê texto digitado nem conteúdo da tela. Você pode desativá-lo quando quiser.</p>',
        [{ label: 'Cancelar' }, { label: 'Abrir', cls: 'primary' }]).then(function (i) { if (i === 1) API.openAccessibilitySettings(); });
    };
    $('#btn-appset').onclick = function () { API.openAppSettings(); };

    var modeForKeys = s.displayMode || 'classic';
    var actionSets = {
      osu: [['left','Clique esquerdo'],['right','Clique direito']],
      mania4k: [['key0','Pista 1'],['key1','Pista 2'],['key2','Pista 3'],['key3','Pista 4']],
      mania7k: [['key0','Pista 1'],['key1','Pista 2'],['key2','Pista 3'],['key3','Pista 4'],['key4','Pista 5'],['key5','Pista 6'],['key6','Pista 7']],
      taiko: [['rimLeft','Borda esquerda'],['centreLeft','Centro esquerdo'],['centreRight','Centro direito'],['rimRight','Borda direita']],
      catch: [['left','Mover à esquerda'],['right','Mover à direita'],['dash','Dash']],
      classic: [['left','Pata esquerda'],['right','Pata direita']]
    };
    var keyNames = {};
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach(function(ch, i){ keyNames[29+i] = ch; });
    for (var d=0; d<9; d++) keyNames[8+d] = String(d+1);
    keyNames[7]='0'; keyNames[62]='Espaço'; keyNames[66]='Enter';
    keyNames[21]='←'; keyNames[22]='→'; keyNames[19]='↑'; keyNames[20]='↓';
    keyNames[59]='Shift'; keyNames[60]='Shift direito'; keyNames[113]='Ctrl'; keyNames[57]='Alt';
    function androidKeyCode(e) {
      if (e.code && /^Key[A-Z]$/.test(e.code)) return 29 + e.code.charCodeAt(3) - 65;
      if (e.code && /^Digit[0-9]$/.test(e.code)) return e.code === 'Digit0' ? 7 : 8 + Number(e.code.slice(5)) - 1;
      var special = {Space:62, Enter:66, ArrowLeft:21, ArrowRight:22, ArrowUp:19, ArrowDown:20, ShiftLeft:59, ShiftRight:60, ControlLeft:113, AltLeft:57};
      return special[e.code] || null;
    }
    var bindings = Object.assign({}, s.keyBindings || {});
    var mapRoot = $('#keymap-list');
    function renderKeymap() {
      var actions = actionSets[modeForKeys] || actionSets.classic;
      mapRoot.innerHTML = actions.map(function(a) {
        return '<div class="row between" style="margin:8px 0"><span class="small">' + a[1] + '</span><button class="btn sm" data-bind-key="' + a[0] + '">' + (keyNames[bindings[a[0]]] || 'Definir tecla') + '</button></div>';
      }).join('');
      $$('[data-bind-key]', mapRoot).forEach(function(btn) {
        btn.onclick = function() {
          var action = btn.getAttribute('data-bind-key');
          btn.textContent = 'Pressione uma tecla…';
          function capture(e) {
            var code = androidKeyCode(e);
            if (code === null || e.isComposing) return;
            e.preventDefault(); e.stopPropagation();
            document.removeEventListener('keydown', capture, true);
            bindings[action] = code;
            save({keyBindings: bindings}); flush(); renderKeymap();
            toast('Atalho atualizado: ' + (keyNames[code] || code));
          }
          document.addEventListener('keydown', capture, true);
        };
      });
    }
    renderKeymap();
    $$('[data-pos]', root).forEach(function (b) {
      b.onclick = function () { var p = b.getAttribute('data-pos').split(','); setPos(+p[0], +p[1]); };
    });
    bindPad();
    updatePadDot();
  }

  function updatePadDot() {
    var d = $('#pad-dot'); if (!d) return;
    d.style.left = (S.settings.posX * 100) + '%';
    d.style.top = (S.settings.posY * 100) + '%';
  }
  function setPos(x, y) { save({ posX: clamp(x, 0, 1), posY: clamp(y, 0, 1) }); updatePadDot(); }
  function bindPad() {
    var pad = $('#pad'); if (!pad) return;
    var active = false;
    var move = function (e) {
      var r = pad.getBoundingClientRect();
      setPos((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    };
    pad.onpointerdown = function (e) { active = true; try { pad.setPointerCapture(e.pointerId); } catch (x) { /* ok */ } move(e); e.preventDefault(); };
    pad.onpointermove = function (e) { if (active) move(e); };
    pad.onpointerup = pad.onpointercancel = function () { active = false; flush(); };
  }

  // ------------------------------------------------------------------ chamadas vindas do Android

  function onBack() {
    if (closeDialog()) return true;
    if (S.inEditor) { cancelEditor(); return true; }
    if (S.tab !== 'home') { go('home'); return true; }
    return false; // deixa o Android fechar o app
  }

  /** Relê o estado nativo (voltou das configurações, mouse plugado, serviço ligou/desligou…). */
  function refresh() {
    if (S.inEditor) return;
    flush();
    var before = JSON.stringify([S.overlay, S.notifications, S.a11y, S.devices]);
    var lib = JSON.stringify(S.library);
    load();
    var after = JSON.stringify([S.overlay, S.notifications, S.a11y, S.devices]);
    if (before === after && lib === JSON.stringify(S.library)) return;
    if (document.activeElement && /^(INPUT|SELECT)$/.test(document.activeElement.tagName) && S.tab === 'settings') return; // não interrompe ajuste em andamento
    if (S.tab === 'home') renderHome();
    else if (S.tab === 'settings') renderSettings();
  }

  function setPaused(p) {
    S.paused = !!p;
    if (engine) engine.setPaused(p);
    if (p) flush();
  }

  global.BongoUI = { onBack: onBack, refresh: refresh, setPaused: setPaused };

  // ------------------------------------------------------------------ início

  load();
  E.config.charBase = '/chars/';
  document.addEventListener('visibilitychange', function () { setPaused(document.hidden); });
  window.addEventListener('pagehide', flush);
  renderNav();
  go('home');
})(window);
