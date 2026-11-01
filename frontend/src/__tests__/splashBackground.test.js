import themeInit from '../../public/theme-init.js?raw'
import indexHtml from '../../index.html?raw'

const html = document.documentElement
const run = () => new Function(themeInit)() // o script roda no <head>, antes de tudo, direto na página

beforeEach(() => { html.className = ''; html.removeAttribute('data-theme'); localStorage.clear() })
afterEach(() => { vi.restoreAllMocks() })

// Achado do André (iPhone, produção): ao abrir o app aparecia uma faixa azul embaixo da abertura preta (≈47px) — o que a abertura
// não cobre mostra o fundo da página, que no celular/tema claro é azul (correção do "puxar a tela").
describe('abertura — fundo preto enquanto o vídeo está na tela', () => {
  it('theme-init.js marca a página como "em abertura" e aplica o tema salvo', () => {
    localStorage.setItem('theme', 'light')
    run()
    expect(html).toHaveClass('is-splashing')
    expect(html).toHaveAttribute('data-theme', 'light')
  })

  it('sem tema salvo vale o escuro, e a marca vale do mesmo jeito', () => {
    run()
    expect(html).toHaveClass('is-splashing')
    expect(html).toHaveAttribute('data-theme', 'dark')
  })

  it('armazenamento bloqueado (aba privada) não impede a marca', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado') })
    run()
    expect(html).toHaveClass('is-splashing')
  })

  it('o CSS da abertura pinta o fundo de preto sobre QUALQUER tema (mais específico que o tema claro)', () => {
    expect(indexHtml).toMatch(/html\.is-splashing,\s*html\.is-splashing\[data-theme\]\s*\{\s*background:\s*#000\s*!important;?\s*\}/)
  })
})
