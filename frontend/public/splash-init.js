// Escolhe o vídeo da splash pela orientação da tela: 9:16 com a tela em pé
// (celular), 16:9 deitada (desktop/tablet horizontal). Os dois têm a mesma
// duração (4,1s), então SPLASH_MIN_MS vale pros dois.
// Script externo (não inline) porque o CSP do backend só libera script-src 'self'.
(function () {
  var video = document.getElementById('app-splash-video')
  if (!video) return
  var portrait = window.matchMedia('(orientation: portrait)').matches
  video.src = portrait ? '/splash-vertical.mp4' : '/splash.mp4'
})()
