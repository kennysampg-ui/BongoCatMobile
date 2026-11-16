/*
 * Personagens de demonstração embutidos (arte original do projeto, desenhada em SVG pelo motor).
 * Nenhum deles usa arte de terceiros. Para usar outro visual (inclusive qualquer arte que você tenha
 * direito de usar), importe seus próprios PNG/GIF/spritesheets pelo Editor de personagens.
 */
(function (global) {
  'use strict';

  var list = [
    {
      id: 'cat-original', name: 'Gato Bongo', group: 'Gatos', species: 'cat',
      palette: { fur: '#eceef5', accent: '#a3a9c0', stripes: true, inner: '#ffb3c6', muzzle: '#ffffff', drum: '#c98b4f', skin: '#f4e3c3', rim: '#8a5a2b' }
    },
    {
      id: 'cat-orange', name: 'Gato Laranja', group: 'Gatos', species: 'cat',
      palette: { fur: '#f2a24f', accent: '#d97a1f', stripes: true, inner: '#ffc4a3', muzzle: '#fff1de', drum: '#b9794a', skin: '#f6e6c9', rim: '#7a4a24' }
    },
    {
      id: 'cat-black', name: 'Gato Preto', group: 'Gatos', species: 'cat',
      palette: { fur: '#2d2d3a', accent: '#4b4b5e', inner: '#8a5f86', muzzle: '#3d3d4e', eye: '#ffd54a', line: '#a9a9c4', nose: '#ff8fb1', drum: '#7b5a8a', skin: '#e6dcf2', rim: '#4a3560' }
    },
    {
      id: 'cat-siamese', name: 'Gato Siamês', group: 'Gatos', species: 'cat',
      palette: { fur: '#f3e5d0', accent: '#6f5648', ear: '#6f5648', mask: true, inner: '#c9a58f', muzzle: '#fff7ea', eye: '#2f7fe0', nose: '#b9788a', line: '#3b2a24', drum: '#a98259', skin: '#f6ecd9', rim: '#6c4a2e' }
    },
    {
      id: 'cat-blue', name: 'Gato Azulado', group: 'Gatos', species: 'cat',
      palette: { fur: '#8fa7c6', accent: '#6b84a6', stripes: true, inner: '#ffc2d1', muzzle: '#e8eff8', drum: '#5b7fb3', skin: '#e7f0fb', rim: '#3b5a8a' }
    },
    {
      id: 'dog-caramel', name: 'Cachorro Caramelo', group: 'Outros animais', species: 'dog',
      palette: { fur: '#dba462', accent: '#a9692f', muzzle: '#f5deb9', nose: '#2b2330', drum: '#8b6a3f', skin: '#f1e1c4', rim: '#5e4425' }
    },
    {
      id: 'bunny-white', name: 'Coelho', group: 'Outros animais', species: 'bunny',
      palette: { fur: '#fbfbfd', accent: '#e4e4ee', inner: '#ffc0d3', muzzle: '#ffffff', nose: '#ff8fb1', drum: '#d2759a', skin: '#fde7ef', rim: '#9c4468' }
    },
    {
      id: 'panda', name: 'Panda', group: 'Outros animais', species: 'panda',
      palette: { fur: '#fcfcfe', accent: '#24242c', paw: '#24242c', muzzle: '#ffffff', drum: '#5fa36d', skin: '#e4f3e6', rim: '#2f6a3d' }
    },
    {
      id: 'fox', name: 'Raposa', group: 'Outros animais', species: 'fox',
      palette: { fur: '#ee7d35', accent: '#2d2430', paw: '#3a2a2a', inner: '#ffd9b8', muzzle: '#fff4e6', drum: '#3e7ea6', skin: '#e1f0f8', rim: '#245676' }
    }
  ];

  list.forEach(function (c) { c.kind = 'builtin'; });

  global.BongoChars = {
    list: list,
    DEFAULT_ID: 'cat-original',
    find: function (id) {
      for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
      return null;
    },
    default: function () { return list[0]; }
  };
})(window);
