'use strict'
const express = require('express')
const cors    = require('cors')

// Arquivos do app com hash no nome (JS/CSS/fontes do Vite): públicos, com cache de 1 ano.
// Arquivo que NÃO existe aqui é 404 de verdade. Antes ele caía no "catch-all" do app e voltava como a página inicial (HTML) com
// status 200: o service worker do celular guardava esse HTML no lugar do arquivo e o app ficava preso em "Algo deu errado"
// (o botão Recarregar não resolvia, porque a cópia errada vinha do cache). O 404 não é guardado por ninguém (no-store).
function staticAssets(dir) {
  const router = express.Router()
  // Vite gera <script type="module" crossorigin>: o browser exige Access-Control-Allow-Origin mesmo em same-origin.
  // São arquivos públicos, sem credenciais.
  router.use(cors({ origin: '*' }))
  router.use(express.static(dir, { maxAge: '1y', immutable: true }))
  router.use((_req, res) => {
    res.set('Cache-Control', 'no-store')
    res.status(404).type('text/plain').send('Arquivo não encontrado.')
  })
  return router
}

module.exports = { staticAssets }
