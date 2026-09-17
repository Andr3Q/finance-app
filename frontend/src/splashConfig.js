// Duração da splash de abertura (index.html) = duração do vídeo /splash.mp4
// (4,1s). Compartilhada entre main.jsx (que remove a splash) e App.jsx (que
// atrasa o mount da tela de login pra quem já tem conta — senão o campo de
// senha entra no DOM ainda com a splash em cima, e o navegador dispara o
// preenchimento automático de senha antes da hora).
export const SPLASH_MIN_MS = 4100
