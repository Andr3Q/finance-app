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
  it('cabeçalho "Conforme a LGPD" e as 11 seções do texto completo mais o contato do Encarregado (DPO)', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Política de Privacidade' })).toBeInTheDocument()
    expect(screen.getByText('Conforme a LGPD')).toBeInTheDocument()
    expect(screen.getByText(/Última atualização: 7 de novembro de 2026 · Versão 1\.1/)).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toEqual([
      '1. Quem somos', '2. Dados que coletamos', '3. Como usamos seus dados', '4. Base legal (LGPD)', '5. Armazenamento e segurança',
      '6. Compartilhamento com terceiros', '7. Transferência internacional de dados', '8. Seus direitos (LGPD Art. 18)', '9. Retenção de dados',
      '10. Cookies e armazenamento local', '11. Alterações nesta política', 'Contato e Encarregado de Dados (DPO)',
    ])
  })

  it('o texto jurídico não perdeu o que a LGPD exige nem os compromissos de retenção', () => {
    renderPage()
    const text = document.body.textContent
    for (const clause of ['Lei 13.709/2018', 'hash bcrypt', 'Mercado Pago', 'Groq', 'LGPD Art. 18', 'removidos do banco no momento da exclusão',
      'mantidos por 90 dias', 'Cookie de sessão (HttpOnly)', 'Não usamos cookies de publicidade', '15 dias úteis']) {
      expect(text).toContain(clause)
    }
  })

  it('o texto diz a verdade sobre onde ficam os dados e para quem eles vão (achados da revisão de LGPD, 2026-11-04)', () => {
    renderPage()
    const text = document.body.textContent
    // banco nos EUA (Supabase, us-west-1), transferência internacional declarada, e os fornecedores que de fato recebem dados
    for (const fact of ['Estados Unidos (Califórnia)', '7. Transferência internacional de dados', 'Art. 33, IX', 'Resend', 'Serviços de notificação do navegador',
      'descrições, valores, categorias e datas das suas transações', 'não é guardado por nós']) {
      expect(text).toContain(fact)
    }
    // frases que o código não sustenta não podem voltar
    for (const falso of ['armazenados no Brasil', 'Trivy', 'sem dados financeiros identificáveis', 'conexão SSL/TLS obrigatória']) {
      expect(text).not.toContain(falso)
    }
  })

  // Revisão de 2026-11-07: o texto dizia que o app não usa analytics (usa o PostHog, só com consentimento), que os dados somem em
  // 30 dias (ficam nas cópias de segurança por cerca de 12 meses) e não citava quem de fato processa dados (Cloudflare, GitHub).
  it('declara o responsável, a análise de uso com consentimento, as cópias de segurança e os fornecedores que processam dados', () => {
    renderPage()
    const text = document.body.textContent
    for (const fato of ['André Pereira de Almeida', 'Responsável e Encarregado de Dados', 'PostHog', 'Cloudflare', 'GitHub',
      'só depois que você aceita os cookies analíticos', 'tocar em "Recusar"', 'por até cerca de 12 meses', 'criptografadas']) {
      expect(text).toContain(fato)
    }
    for (const falso of ['Não usamos cookies de rastreamento', 'analytics ou publicidade', 'em até 30 dias']) {
      expect(text).not.toContain(falso)
    }
    // o CPF do responsável nunca entra no texto público
    expect(text).not.toMatch(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/)
  })

  it('os caminhos dos direitos do titular existem no app (Perfil → …); não há tela chamada "Configurações"', () => {
    renderPage()
    const text = document.body.textContent
    for (const path of ['Perfil → Dados pessoais', 'Perfil → Meus dados → Excluir minha conta', 'CSV, PDF ou JSON (disponível em Perfil → Meus dados)', 'Perfil → Notificações']) {
      expect(text).toContain(path)
    }
    expect(text).not.toContain('Configurações')
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
