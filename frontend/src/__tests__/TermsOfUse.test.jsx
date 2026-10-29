import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import TermsOfUse from '../pages/TermsOfUse.jsx'

vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => <div data-testid="navbar" /> }))

function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname}</div> }
function renderPage({ loggedIn = true, entries = ['/settings', '/termos'], index = 1 } = {}) {
  const user = loggedIn ? { id: 'u1', name: 'Ana' } : {}
  sessionStorage.setItem('user', JSON.stringify(user))
  window.dispatchEvent(new CustomEvent('user-updated', { detail: user }))
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={index}>
      <Where />
      <Routes>
        <Route path="/termos" element={<TermsOfUse />} />
        <Route path="*" element={<div>outra tela</div>} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => { sessionStorage.clear() })

describe('Termos de Uso', () => {
  it('cabeçalho com a data da versão vigente e as 12 seções do texto completo', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Termos de Uso' })).toBeInTheDocument()
    expect(screen.getByText('Atualizado em mai/2026')).toBeInTheDocument()
    expect(screen.getByText(/Última atualização: 22 de maio de 2026 · Versão 1\.0/)).toBeInTheDocument()
    const titles = screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)
    expect(titles).toEqual([
      '1. O que é o Nancy', '2. Cadastro e responsabilidades da conta', '3. Planos e preços', '4. Pagamentos e renovação',
      '5. Cancelamento e reembolso', '6. Uso aceitável', '7. Disponibilidade do serviço', '8. Seus dados', '9. Propriedade intelectual',
      '10. Limitação de responsabilidade', '11. Alterações nos termos', '12. Legislação aplicável',
    ])
  })

  it('o texto jurídico não perdeu as cláusulas que valem como contrato', () => {
    renderPage()
    const text = document.body.textContent
    for (const clause of ['pelo menos 18 anos', 'R$ 9,90/mês ou R$ 99,00/ano', 'R$ 34,90/mês ou R$ 334,80/ano', 'Mercado Pago', 'dentro de 7 dias da compra',
      'Não somos uma instituição financeira', 'Lei 8.078/1990', 'Lei 13.709/2018', 'foro da comarca de São Paulo/SP']) {
      expect(text).toContain(clause)
    }
  })

  // Achado N2-10: o texto mandava cancelar em "Configurações → Planos", caminho que não existe no app.
  it('os caminhos citados existem no app (Perfil → Pagamentos); não há tela chamada "Configurações"', () => {
    renderPage()
    const text = document.body.textContent
    expect(text).toContain('cancelar a qualquer momento em Perfil → Pagamentos')
    expect(text).not.toContain('Configurações')
  })

  it('rodapé: e-mail de contato e link pra Política de Privacidade', () => {
    renderPage()
    expect(screen.getByRole('link', { name: 'contato@nancy.com.br' })).toHaveAttribute('href', 'mailto:contato@nancy.com.br')
    expect(within(document.querySelector('.lg-foot')).getByRole('link', { name: 'Política de Privacidade' })).toHaveAttribute('href', '/privacidade')
  })

  it('logado: barra de navegação; visitante (cadastro abre os Termos numa aba nova): sem barra', () => {
    const logged = renderPage()
    expect(screen.getByTestId('navbar')).toBeInTheDocument()
    logged.unmount()
    renderPage({ loggedIn: false })
    expect(screen.queryByTestId('navbar')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Termos de Uso' })).toBeInTheDocument()
  })

  it('voltar retorna à tela anterior; aberta direto: logado vai pro Perfil, visitante pra página inicial', () => {
    const a = renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/settings')
    a.unmount()
    const b = renderPage({ entries: ['/termos'], index: 0 })
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/settings')
    b.unmount()
    renderPage({ loggedIn: false, entries: ['/termos'], index: 0 })
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(within(document.body).getByTestId('where').textContent).toBe('/')
  })
})
