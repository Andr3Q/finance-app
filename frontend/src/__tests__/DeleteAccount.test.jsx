import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import DeleteAccount from '../pages/DeleteAccount.jsx'

vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => <div data-testid="navbar" /> }))

// Página pública "Excluir conta e dados" (/excluir-conta): é o endereço que a Play Console pede na Segurança dos dados. O texto repete o app (tela
// Meus dados) e a Política de Privacidade; os testes de "deriva" abaixo leem esses arquivos para a página nunca ficar dizendo outra coisa.
function renderPage({ loggedIn = false } = {}) {
  const user = loggedIn ? { id: 'u1', name: 'Ana' } : {}
  sessionStorage.setItem('user', JSON.stringify(user))
  window.dispatchEvent(new CustomEvent('user-updated', { detail: user }))
  return render(
    <MemoryRouter initialEntries={['/excluir-conta']}>
      <Routes>
        <Route path="/excluir-conta" element={<DeleteAccount />} />
        <Route path="*" element={<div>outra tela</div>} />
      </Routes>
    </MemoryRouter>
  )
}
const src = (rel) => readFileSync(resolve(process.cwd(), 'src', rel), 'utf8')

beforeEach(() => { sessionStorage.clear() })

describe('Excluir conta e dados (página pública)', () => {
  it('título, quem é o responsável e as 4 seções, para um visitante sem login (sem barra de navegação)', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Excluir conta e dados' })).toBeInTheDocument()
    expect(screen.getByText('Como apagar sua conta do Nancy')).toBeInTheDocument()
    expect(screen.getByText(/responsável: André Pereira de Almeida/)).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toEqual([
      '1. Pelo aplicativo', '2. Por e-mail, se você não consegue entrar', 'O que é apagado', 'O que pode permanecer por um tempo',
    ])
    expect(screen.queryByTestId('navbar')).not.toBeInTheDocument()
  })

  it('o passo a passo do aplicativo tem 5 passos, na ordem, com os nomes que a pessoa vê na tela', () => {
    renderPage()
    const passos = [...document.querySelectorAll('.lg-ul')][0].querySelectorAll('li')
    expect([...passos].map(li => li.textContent.match(/^Passo \d/)?.[0])).toEqual(['Passo 1', 'Passo 2', 'Passo 3', 'Passo 4', 'Passo 5'])
    const texto = [...passos].map(li => li.textContent).join(' ')
    for (const nome of ['Perfil', 'Meus dados', 'Excluir minha conta', 'Esta ação não pode ser desfeita', 'Confirme sua senha para continuar', 'Excluir conta']) {
      expect(texto).toContain(nome)
    }
  })

  it('NÃO deriva do app: cada nome citado no passo a passo existe de verdade na tela Meus dados e no menu do Perfil', () => {
    const meusDados = src('pages/SettingsData.jsx')
    for (const nome of ['Excluir minha conta', 'Esta ação não pode ser desfeita', 'Confirme sua senha para continuar', 'Excluir conta']) {
      expect(meusDados, `a tela Meus dados não tem mais "${nome}": atualize pages/DeleteAccount.jsx`).toContain(nome)
    }
    expect(src('pages/Settings.jsx')).toContain("label: 'Meus dados'")
    expect(meusDados).toContain('CSV') // a página diz que dá para exportar antes de excluir
  })

  it('NÃO deriva da Política de Privacidade: caminho no app, retenção das cópias, registros de segurança e prazo de resposta são os mesmos', () => {
    const politica = src('pages/PrivacyPolicy.jsx')
    for (const trecho of ['Perfil → Meus dados → Excluir minha conta', 'por até cerca de 12 meses', 'mantidos por 90 dias', '15 dias úteis', 'removidos do banco no momento da exclusão']) {
      expect(politica, `a política não tem mais "${trecho}": atualize pages/DeleteAccount.jsx`).toContain(trecho)
    }
    renderPage()
    const texto = document.body.textContent
    for (const trecho of ['até cerca de 12 meses', '90 dias', '15 dias úteis', 'removidos do banco no momento em que você confirma']) expect(texto).toContain(trecho)
  })

  it('o pedido por e-mail vai para o contato de privacidade, com o assunto pronto, e o rodapé leva à Política e aos Termos', () => {
    renderPage()
    const mails = screen.getAllByRole('link', { name: 'privacidade@myfinancepro.com.br' })
    expect(mails).toHaveLength(2) // dentro do texto + rodapé
    expect(mails[0]).toHaveAttribute('href', 'mailto:privacidade@myfinancepro.com.br?subject=Excluir%20minha%20conta%20do%20Nancy')
    expect(mails[1]).toHaveAttribute('href', 'mailto:privacidade@myfinancepro.com.br')
    const foot = within(document.querySelector('.lg-foot'))
    expect(foot.getByRole('link', { name: 'Política de Privacidade' })).toHaveAttribute('href', '/privacidade')
    expect(foot.getByRole('link', { name: 'Termos de Uso' })).toHaveAttribute('href', '/termos')
  })

  it('a lista do que é apagado confere com o que a exclusão faz no servidor (conta, lançamentos, contas fixas, metas, parcelas, foto, notificações, pagamentos e acessos)', () => {
    renderPage()
    const apagado = [...document.querySelectorAll('.lg-ul')][1].textContent
    for (const item of ['nome, e-mail e senha', 'lançamentos, categorias e limites', 'contas fixas, metas e compras parceladas', 'foto de perfil', 'inscrições de notificação', 'histórico de pagamentos', 'registros de acesso']) {
      expect(apagado).toContain(item)
    }
  })

  it('texto público: sem CPF, sem o domínio de outra pessoa e sem emoji', () => {
    renderPage()
    const texto = document.body.textContent
    expect(texto).not.toMatch(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/)
    expect(texto).not.toContain('nancy.com.br')
    expect(document.body.innerHTML).not.toContain('nancy.com.br')
    expect(texto).not.toMatch(/\p{Extended_Pictographic}/u)
  })

  it('logado também abre (barra de navegação presente)', () => {
    renderPage({ loggedIn: true })
    expect(screen.getByRole('heading', { level: 1, name: 'Excluir conta e dados' })).toBeInTheDocument()
    expect(screen.getByTestId('navbar')).toBeInTheDocument()
  })
})
