(function(){
  try{var t=localStorage.getItem('theme')||'dark';document.documentElement.setAttribute('data-theme',t);}catch(e){}
  // Durante a abertura (vídeo preto) o fundo da página tem que ser preto: no iPhone o iOS deixa uma faixa embaixo sem cobrir
  // (≈47px) e ali aparecia a cor do fundo do tema claro. main.jsx tira a marca quando a abertura sai.
  document.documentElement.classList.add('is-splashing');
})();
