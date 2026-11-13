'use strict'

// ═══════════════════════════════════════════════════════
// 🖼️ src/services/emailBanners.js — Cabeçalho dos e-mails como imagem
//
// O cabeçalho azul (logo + "nancy" + título em branco) é uma IMAGEM, não texto. Motivo: o Gmail do iPhone/Android, no modo
// escuro, recolore o e-mail por conta própria e não dá para desligar. Texto branco sobre o azul virava preto; imagem ele nunca
// recolore. Com a imagem, o cabeçalho fica igual ao desenho em qualquer modo.
//
// As imagens ficam em frontend/public/email/ (servidas em https://myfinancepro.com.br/email/) e são geradas pelo script
// scripts/gerar-banners-email.cjs a partir da lista abaixo. O nome do arquivo leva um resumo do título: se alguém mudar o
// título aqui, o nome muda, o teste (emailBanners.test.js) reprova até a imagem ser gerada de novo.
// ═══════════════════════════════════════════════════════

const crypto = require('crypto')

// Sempre o endereço de produção: na homologação o portão barraria a imagem, e o Gmail busca a imagem por um servidor dele.
const EMAIL_ASSETS_URL = 'https://myfinancepro.com.br/email'

// Todos os títulos de e-mail que têm cabeçalho em imagem (o título aparece escrito na imagem).
const BANNER_TITLES = [
  'Confirme seu e-mail',
  'Seja bem-vindo(a)!',
  'Redefinição de senha',
  'Confirme seu novo e-mail',
  'Senha alterada',
  'Acesso de novo local detectado',
  'Conta bloqueada temporariamente',
  'E-mail de login alterado',
  'Plano Pro ativado',
  'Plano Elite ativado',
  'Aviso de renovação',
  'Seu trial está acabando',
  'Seu trial de 7 dias encerrou',
  'Seu plano expirou',
  'Sua indicação funcionou!',
  'Resumo semanal',
  'Relatório mensal',
]

function slugify(title) {
  return title
    .normalize('NFD').replace(/\p{M}/gu, '') // tira os acentos (marcas combinantes)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// "banner-confirme-seu-e-mail-3f2a9c1b.jpg": o final é um resumo do título (muda se o título mudar).
function bannerFile(title) {
  const hash = crypto.createHash('sha1').update(title).digest('hex').slice(0, 8)
  return `banner-${slugify(title)}-${hash}.jpg`
}

// Endereço da imagem do título, ou null se o título não tem imagem (o e-mail então usa o cabeçalho em texto).
function bannerUrl(title) {
  return BANNER_TITLES.includes(title) ? `${EMAIL_ASSETS_URL}/${bannerFile(title)}` : null
}

module.exports = { EMAIL_ASSETS_URL, BANNER_TITLES, bannerFile, bannerUrl, slugify }
