import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import PrivacyPolicy from '../pages/PrivacyPolicy.jsx'

vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => <div data-testid="navbar" /> }))

function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname}</div> }
function renderPage({ loggedIn = true, entries = ['/settings', '/privacidade'], index = 1 } = {}) {
  const user = loggedIn ? { id: 'u1', name: 'Ana' } : {}
  sessionStorage.setItem('user', JSON.stringify(user))
  window.dispatchEvent(new CustomEvent('user-updated', { detail: user }))
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={index}>
      <Where />
      <Routes>
        <Route path="/privacidade" element={<PrivacyPolicy />} />
        <Route path="*" element={<div>outra tela</div>} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => { sessionStorage.clear() })

describe('Política de Privacidade', () => {
  it('cabeçalho "Conforme a LGPD" e as 10 seções do texto completo mais o contato do Encarregado (DPO)', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Política de Privacidade' })).toBeInTheDocument()
    expect(screen.getByText('Conforme a LGPD')).toBeInTheDocument()
    expect(screen.getByText(/Última atualização: 22 de maio de 2026 · Versão 1\.0/)).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toEqual([
      '1. Quem somos', '2. Dados que coletamos', '3. Como usamos seus dados', '4. Base legal (LGPD)', '5. Armazenamento e segurança',
      '6. Compartilhamento com terceiros', '7. Seus direitos (LGPD Art. 18)', '8. Retenção de dados', '9. Cookies e armazenamento local',
      '10. Alterações nesta política', 'Contato e Encarregado de Dados (DPO)',
    ])
  })

  it('o texto jurídico não perdeu o que a LGPD exige nem os compromissos de retenção', () => {
    renderPage()
    const text = document.body.textContent
    for (const clause of ['Lei 13.709/2018', 'hash bcrypt', 'Mercado Pago', 'Groq', 'LGPD Art. 18', 'removidos permanentemente em até 30 dias',
      'mantidos por 90 dias', 'Cookie de sessão (HttpOnly)', 'Não usamos cookies de rastreamento', '15 dias úteis']) {
      expect(text).toContain(clause)
    }
  })

  it('o contato do Encarregado e o rodapé levam ao e-mail de privacidade e aos Termos', () => {
    renderPage()
    const mails = screen.getAllByRole('link', { name: 'privacidade@nancy.com.br' })
    expect(mails).toHaveLength(2) // contato do DPO dentro do texto + rodapé
    mails.forEach(a => expect(a).toHaveAttribute('href', 'mailto:privacidade@nancy.com.br'))
    expect(within(document.querySelector('.lg-foot')).getByRole('link', { name: 'Termos de Uso' })).toHaveAttribute('href', '/termos')
  })

  it('logado: barra de navegação; visitante: sem barra; voltar vai pra tela anterior, pro Perfil (logado) ou pra página inicial (visitante)', () => {
    const a = renderPage()
    expect(screen.getByTestId('navbar')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/settings')
    a.unmount()
    const b = renderPage({ entries: ['/privacidade'], index: 0 })
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/settings')
    b.unmount()
    renderPage({ loggedIn: false, entries: ['/privacidade'], index: 0 })
    expect(screen.queryByTestId('navbar')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(screen.getByTestId('where').textContent).toBe('/')
  })
})
