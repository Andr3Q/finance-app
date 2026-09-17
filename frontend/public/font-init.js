// Ativa o CSS da fonte (carregado via <link rel="preload" id="font-preload">)
// assim que o download terminar, trocando rel="preload" por rel="stylesheet".
// Isso substitui o padrão comum onload="this.rel='stylesheet'" — um atributo
// inline, que o CSP bloqueia via script-src-attr (default do helmet, nunca
// liberado de propósito). Rodando como script externo, é permitido por
// script-src 'self' sem precisar afrouxar CSP nenhum.
(function () {
  var link = document.getElementById('font-preload')
  if (!link) return
  link.addEventListener('load', function () {
    link.rel = 'stylesheet'
  })
})()
