/*
 * energia.js — pontinhos de luz do fundo da pagina inicial.
 * Leve: cria os elementos uma unica vez e deixa as animacoes com o CSS.
 * Nenhuma biblioteca, nenhum loop de requestAnimationFrame.
 */
(function () {
  'use strict';

  var alvo = document.getElementById('particulas');
  if (!alvo) return;

  // Respeita quem prefere menos movimento (o CSS tambem esconde oContainer).
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var telaPequena =
    (window.matchMedia && window.matchMedia('(max-width: 640px)').matches) ||
    (navigator.maxTouchPoints > 0 && window.innerWidth < 900);
  var total = telaPequena ? 6 : 14;
  var fragmento = document.createDocumentFragment();

  for (var i = 0; i < total; i++) {
    var p = document.createElement('i');
    p.style.setProperty('--x', (Math.random() * 100).toFixed(2) + '%');
    p.style.setProperty('--s', (telaPequena ? 2 : 2 + Math.random() * 2).toFixed(1) + 'px');
    p.style.setProperty('--d', (18 + Math.random() * 20).toFixed(1) + 's');
    p.style.setProperty('--delay', (-Math.random() * 32).toFixed(1) + 's');
    p.style.setProperty('--drift', (Math.random() * 120 - 60).toFixed(0) + 'px');
    p.style.setProperty('--op', (0.35 + Math.random() * 0.45).toFixed(2));
    fragmento.appendChild(p);
  }

  alvo.appendChild(fragmento);
})();
