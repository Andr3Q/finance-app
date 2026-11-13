'use strict'

const fs = require('fs')
const path = require('path')
const { EMAIL_ASSETS_URL, BANNER_TITLES, bannerFile, bannerUrl, slugify } = require('../src/services/emailBanners')

// Cabeçalho dos e-mails como imagem (o Gmail do celular recolore texto no modo escuro; imagem não).
// Estes testes garantem que cada título tem a sua imagem pronta em frontend/public/email/ e que não sobra imagem velha.

const PASTA = path.join(__dirname, '../../frontend/public/email')
const arquivos = fs.existsSync(PASTA) ? fs.readdirSync(PASTA) : []

// Largura e altura de um JPEG, lidas do marcador SOF (sem biblioteca).
function tamanhoJpeg(buf) {
  let i = 2
  while (i < buf.length) {
    if (buf[i] !== 0xFF) { i++; continue }
    const marcador = buf[i + 1]
    if (marcador >= 0xC0 && marcador <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(marcador)) {
      return { altura: buf.readUInt16BE(i + 5), largura: buf.readUInt16BE(i + 7) }
    }
    i += 2 + buf.readUInt16BE(i + 2)
  }
  return null
}

describe('emailBanners — lista e nomes', () => {
  test('17 títulos, sem repetição', () => {
    expect(BANNER_TITLES).toHaveLength(17)
    expect(new Set(BANNER_TITLES).size).toBe(BANNER_TITLES.length)
  })

  test('slugify tira acento e símbolos', () => {
    expect(slugify('Redefinição de senha')).toBe('redefinicao-de-senha')
    expect(slugify('Seja bem-vindo(a)!')).toBe('seja-bem-vindo-a')
    expect(slugify('  E-mail   de login  ')).toBe('e-mail-de-login')
  })

  test('o nome do arquivo tem título e resumo do título: mudar o título muda o nome', () => {
    expect(bannerFile('Resumo semanal')).toMatch(/^banner-resumo-semanal-[0-9a-f]{8}\.jpg$/)
    expect(bannerFile('Resumo semanal')).toBe(bannerFile('Resumo semanal'))
    expect(bannerFile('Resumo semanal')).not.toBe(bannerFile('Resumo semanal!'))
  })

  test('nomes de arquivo todos diferentes', () => {
    const nomes = BANNER_TITLES.map(bannerFile)
    expect(new Set(nomes).size).toBe(nomes.length)
  })

  test('endereço da imagem aponta para a produção; título sem imagem devolve null', () => {
    expect(EMAIL_ASSETS_URL).toBe('https://myfinancepro.com.br/email')
    expect(bannerUrl('Resumo semanal')).toBe(`https://myfinancepro.com.br/email/${bannerFile('Resumo semanal')}`)
    expect(bannerUrl('Título que não existe')).toBeNull()
    expect(bannerUrl('')).toBeNull()
  })
})

describe('emailBanners — as imagens existem em frontend/public/email', () => {
  test.each(BANNER_TITLES)('"%s" tem a imagem, é JPEG de verdade, nítida e leve', (titulo) => {
    const nome = bannerFile(titulo)
    expect(arquivos).toContain(nome)

    const buf = fs.readFileSync(path.join(PASTA, nome))
    expect([buf[0], buf[1]]).toEqual([0xFF, 0xD8])             // é JPEG
    const { largura, altura } = tamanhoJpeg(buf)
    expect(largura).toBe(1200)                                  // 400 px x 3: nítida a 520 px em tela retina
    expect(altura).toBeGreaterThan(300)
    expect(altura).toBeLessThan(700)
    expect(buf.length).toBeLessThan(80 * 1024)                  // cabeçalho de e-mail precisa ser leve
  })

  test('não sobra imagem velha: toda imagem da pasta pertence a um título da lista', () => {
    const esperados = new Set(BANNER_TITLES.map(bannerFile))
    expect(arquivos.filter((f) => !esperados.has(f))).toEqual([])
  })
})
