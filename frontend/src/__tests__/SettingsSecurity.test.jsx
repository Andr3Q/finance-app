import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import SettingsSecurity from '../pages/SettingsSecurity.jsx'

vi.mock('../services/api.js', () => ({
  authAPI: {
    changePassword: vi.fn(), twoFASetup: vi.fn(), twoFAVerifySetup: vi.fn(), twoFADisable: vi.fn(),
    twoFARegenerateCodes: vi.fn(), twoFABackupCodesCount: vi.fn(),
  },
}))
vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))
vi.mock('../components/ui/UpgradeModal.jsx', () => ({ default: ({ reason, onClose }) => <div role="dialog" aria-label="Convite ao Pro">{reason}<button onClick={onClose}>fechar convite</button></div> }))

import { authAPI } from '../services/api.js'

function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname}</div> }
function renderPage(user = {}, entries = ['/settings/seguranca'], index) {
  const u = { id: 'u1', name: 'André', plan: 'elite', twoFactorEnabled: false, ...user }
  sessionStorage.setItem('user', JSON.stringify(u))
  window.dispatchEvent(new CustomEvent('user-updated', { detail: u }))
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={index}>
      <Where />
      <Routes>
        <Route path="/settings/seguranca" element={<SettingsSecurity />} />
        <Route path="*" element={<div>outra tela</div>} />
      </Routes>
    </MemoryRouter>
  )
}
const type = (placeholder, value) => fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value } })
const submitPassword = () => fireEvent.click(screen.getByRole('button', { name: 'Atualizar senha' }))
const toggle = () => screen.getByRole('switch', { name: 'Autenticação em duas etapas' })
const stored = () => JSON.parse(sessionStorage.getItem('user'))
const fillOk = () => { type('Senha atual', 'Atual@123'); type('Nova senha', 'Nova@Senha99'); type('Confirmar nova senha', 'Nova@Senha99') }

beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear(); localStorage.clear()
  authAPI.changePassword.mockResolvedValue({ data: {} })
  authAPI.twoFASetup.mockResolvedValue({ data: { qrCode: 'data:image/png;base64,AAAA', manualKey: 'ABCD EFGH' } })
  authAPI.twoFAVerifySetup.mockResolvedValue({ data: { backupCodes: ['aaaa-1111', 'bbbb-2222'] } })
  authAPI.twoFADisable.mockResolvedValue({ data: {} })
  authAPI.twoFARegenerateCodes.mockResolvedValue({ data: { backupCodes: ['cccc-3333'] } })
  authAPI.twoFABackupCodesCount.mockResolvedValue({ data: { count: 8 } })
})

describe('Segurança — senha', () => {
  it('cabeçalho do design e formulário já aberto, com a barra de força vazia', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Segurança' })).toBeInTheDocument()
    expect(screen.getByText('Senha e duas etapas')).toBeInTheDocument()
    expect(screen.getByText('Alterar senha')).toBeInTheDocument()
    expect(screen.getByText('Mín. 8 com maiúscula, minúscula e número')).toBeInTheDocument() // a dica é a regra real e cabe numa linha (antes dizia "número e símbolo" e a regra exige maiúscula)
    for (const p of ['Senha atual', 'Nova senha', 'Confirmar nova senha']) expect(screen.getByPlaceholderText(p)).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Atualizar senha' })).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Força da nova senha' })).toHaveAttribute('aria-valuenow', '0')
  })

  it('a barra de força acompanha a nova senha (mesmas regras do cadastro)', () => {
    renderPage()
    const bar = () => screen.getByRole('progressbar', { name: 'Força da nova senha' })
    type('Nova senha', 'abc')
    expect(bar()).toHaveAttribute('aria-valuenow', '1')
    expect(screen.getByText('Muito fraca')).toBeInTheDocument()
    type('Nova senha', 'Password1')
    expect(bar()).toHaveAttribute('aria-valuenow', '4')
    expect(screen.getByText('Forte')).toBeInTheDocument()
    expect(bar().firstChild.style.width).toBe('100%')
    type('Nova senha', '')
    expect(bar()).toHaveAttribute('aria-valuenow', '0')
    expect(screen.queryByText('Forte')).not.toBeInTheDocument()
  })

  it.each([
    ['senha atual vazia', () => { type('Nova senha', 'Nova@Senha99'); type('Confirmar nova senha', 'Nova@Senha99') }, 'Informe a senha atual.'],
    ['nova senha fraca', () => { type('Senha atual', 'Atual@123'); type('Nova senha', 'fraca'); type('Confirmar nova senha', 'fraca') }, 'Mínimo 8 caracteres com maiúscula, minúscula e número.'],
    ['confirmação diferente', () => { type('Senha atual', 'Atual@123'); type('Nova senha', 'Nova@Senha99'); type('Confirmar nova senha', 'Outra@Senha1') }, 'As senhas não coincidem.'],
    ['nova igual à atual', () => { type('Senha atual', 'Nova@Senha99'); type('Nova senha', 'Nova@Senha99'); type('Confirmar nova senha', 'Nova@Senha99') }, 'A nova senha não pode ser igual à atual.'],
  ])('%s: mostra o erro no campo e não chama a API', (_nome, preencher, erro) => {
    renderPage()
    preencher()
    submitPassword()
    expect(screen.getByText(erro)).toBeInTheDocument()
    expect(authAPI.changePassword).not.toHaveBeenCalled()
  })

  it.each([
    ['sem maiúscula', 'abcdefg1'], ['sem minúscula', 'ABCDEFG1'], ['sem número', 'Abcdefgh'], ['curta demais', 'Abc1234'],
  ])('nova senha %s é recusada (%s)', (_nome, senha) => {
    renderPage()
    type('Senha atual', 'Atual@123'); type('Nova senha', senha); type('Confirmar nova senha', senha)
    submitPassword()
    expect(screen.getByText('Mínimo 8 caracteres com maiúscula, minúscula e número.')).toBeInTheDocument()
    expect(authAPI.changePassword).not.toHaveBeenCalled()
  })

  it('o mínimo aceito (8 caracteres com maiúscula, minúscula e número, sem símbolo) passa', async () => {
    renderPage()
    type('Senha atual', 'Atual@123'); type('Nova senha', 'Abcdefg1'); type('Confirmar nova senha', 'Abcdefg1')
    submitPassword()
    await waitFor(() => expect(authAPI.changePassword).toHaveBeenCalledWith('Atual@123', 'Abcdefg1'))
  })

  it('digitar de novo limpa o erro daquele campo', () => {
    renderPage()
    submitPassword()
    expect(screen.getByText('Informe a senha atual.')).toBeInTheDocument()
    type('Senha atual', 'x')
    expect(screen.queryByText('Informe a senha atual.')).not.toBeInTheDocument()
  })

  it('troca a senha: chama a API, limpa o formulário e avisa', async () => {
    renderPage()
    fillOk()
    submitPassword()
    await waitFor(() => expect(authAPI.changePassword).toHaveBeenCalledWith('Atual@123', 'Nova@Senha99'))
    expect(await screen.findByText('Senha alterada com sucesso!')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Senha atual')).toHaveValue('')
    expect(screen.getByPlaceholderText('Nova senha')).toHaveValue('')
  })

  it('senha atual errada aparece no campo da senha atual', async () => {
    authAPI.changePassword.mockRejectedValue({ response: { data: { error: 'Senha atual incorreta.' } } })
    renderPage()
    fillOk()
    submitPassword()
    expect(await screen.findByText('Senha atual incorreta.')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Senha atual')).toHaveClass('err')
  })

  it('outro erro do servidor vira aviso e o formulário continua preenchido', async () => {
    authAPI.changePassword.mockRejectedValue({ response: { data: { error: 'Muitas tentativas.' } } })
    renderPage()
    fillOk()
    submitPassword()
    expect(await screen.findByText('Muitas tentativas.')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Nova senha')).toHaveValue('Nova@Senha99')
  })

  it('o olho só aparece depois de digitar e alterna mostrar/ocultar', () => {
    renderPage()
    expect(screen.queryByRole('button', { name: /Mostrar/ })).not.toBeInTheDocument()
    type('Nova senha', 'Abc12345')
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar nova senha' }))
    expect(screen.getByPlaceholderText('Nova senha')).toHaveAttribute('type', 'text')
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar nova senha' }))
    expect(screen.getByPlaceholderText('Nova senha')).toHaveAttribute('type', 'password')
  })
})

describe('Segurança — autenticação em duas etapas', () => {
  it('cartão do design com o interruptor desligado', () => {
    renderPage()
    expect(screen.getByText('Autenticação em duas etapas', { selector: 'h2' })).toBeInTheDocument()
    expect(screen.getByText('Código por app autenticador a cada login')).toBeInTheDocument()
    expect(toggle()).toHaveAttribute('aria-checked', 'false')
    expect(authAPI.twoFABackupCodesCount).not.toHaveBeenCalled()
  })

  it('plano grátis: o interruptor abre o convite ao Pro e não inicia nada', () => {
    renderPage({ plan: 'free' })
    expect(screen.getByText(/Disponível nos planos Pro e Elite/)).toBeInTheDocument()
    fireEvent.click(toggle())
    expect(screen.getByRole('dialog', { name: 'Convite ao Pro' })).toHaveTextContent('A autenticação de dois fatores é exclusiva do plano Pro.')
    expect(authAPI.twoFASetup).not.toHaveBeenCalled()
    expect(toggle()).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'fechar convite' }))
    expect(screen.queryByRole('dialog', { name: 'Convite ao Pro' })).not.toBeInTheDocument()
  })

  it('"Fazer upgrade" (plano grátis) também abre o convite', () => {
    renderPage({ plan: 'free' })
    fireEvent.click(screen.getByRole('button', { name: 'Fazer upgrade' }))
    expect(screen.getByRole('dialog', { name: 'Convite ao Pro' })).toBeInTheDocument()
  })

  it('ativar: QR code, código de 6 dígitos, interruptor liga e mostra os códigos de recuperação', async () => {
    renderPage({ plan: 'pro' })
    fireEvent.click(toggle())
    expect(await screen.findByText('Ativar 2FA')).toBeInTheDocument()
    expect(screen.getByAltText('QR Code 2FA')).toBeInTheDocument()
    expect(screen.getByText('ABCD EFGH')).toBeInTheDocument()
    expect(toggle()).toHaveAttribute('aria-checked', 'false')           // só liga quando der certo

    fireEvent.change(screen.getByPlaceholderText('000000'), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e ativar' }))
    expect(screen.getByText('Digite os 6 dígitos.')).toBeInTheDocument()
    expect(authAPI.twoFAVerifySetup).not.toHaveBeenCalled()

    fireEvent.change(screen.getByPlaceholderText('000000'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e ativar' }))
    await waitFor(() => expect(authAPI.twoFAVerifySetup).toHaveBeenCalledWith('123456'))
    expect(await screen.findByText('Códigos de recuperação')).toBeInTheDocument()
    expect(screen.getByText('aaaa-1111')).toBeInTheDocument()
    expect(toggle()).toHaveAttribute('aria-checked', 'true')
    expect(stored().twoFactorEnabled).toBe(true)
    expect(screen.getByText('2FA ativado com sucesso!')).toBeInTheDocument()
    // os códigos só fecham depois de confirmar que foram anotados
    expect(screen.getByRole('button', { name: 'Fechar' })).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(screen.queryByText('Códigos de recuperação')).not.toBeInTheDocument()
  })

  it('código errado na ativação mostra o erro e o interruptor continua desligado', async () => {
    authAPI.twoFAVerifySetup.mockRejectedValue({ response: { data: { error: 'Código inválido.' } } })
    renderPage({ plan: 'pro' })
    fireEvent.click(toggle())
    await screen.findByText('Ativar 2FA')
    fireEvent.change(screen.getByPlaceholderText('000000'), { target: { value: '654321' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e ativar' }))
    expect(await screen.findByText('Código inválido.')).toBeInTheDocument()
    expect(toggle()).toHaveAttribute('aria-checked', 'false')
    expect(stored().twoFactorEnabled).toBe(false)
  })

  it('erro ao iniciar a configuração vira aviso', async () => {
    authAPI.twoFASetup.mockRejectedValue({ response: { data: { error: 'Erro ao configurar 2FA.' } } })
    renderPage({ plan: 'pro' })
    fireEvent.click(toggle())
    expect(await screen.findByText('Erro ao configurar 2FA.')).toBeInTheDocument()
    expect(screen.queryByText('Ativar 2FA')).not.toBeInTheDocument()
  })

  it('ativo: interruptor ligado, quantos códigos restam e "Regenerar códigos"', async () => {
    renderPage({ plan: 'pro', twoFactorEnabled: true })
    expect(toggle()).toHaveAttribute('aria-checked', 'true')
    expect(await screen.findByText('8 códigos de recuperação disponíveis')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Regenerar códigos' })).toBeInTheDocument()
  })

  it('poucos códigos restantes ficam em destaque', async () => {
    authAPI.twoFABackupCodesCount.mockResolvedValue({ data: { count: 1 } })
    renderPage({ plan: 'pro', twoFactorEnabled: true })
    expect(await screen.findByText('1 código de recuperação disponível')).toHaveClass('low')
  })

  it('desativar: o interruptor pede a senha; senha errada mostra o erro; certa desliga', async () => {
    authAPI.twoFADisable.mockRejectedValueOnce({ response: { data: { error: 'Senha incorreta.' } } })
    renderPage({ plan: 'pro', twoFactorEnabled: true })
    fireEvent.click(toggle())
    const dlg = (await screen.findByText('Digite sua senha para confirmar a desativação do 2FA.')).closest('.tfa-modal')
    fireEvent.click(within(dlg).getByRole('button', { name: 'Desativar 2FA' }))
    expect(within(dlg).getByText('Digite sua senha.')).toBeInTheDocument()
    fireEvent.change(within(dlg).getByPlaceholderText('Sua senha'), { target: { value: 'errada' } })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Desativar 2FA' }))
    expect(await within(dlg).findByText('Senha incorreta.')).toBeInTheDocument()
    expect(toggle()).toHaveAttribute('aria-checked', 'true')
    fireEvent.change(within(dlg).getByPlaceholderText('Sua senha'), { target: { value: 'certa' } })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Desativar 2FA' }))
    await waitFor(() => expect(authAPI.twoFADisable).toHaveBeenLastCalledWith('certa'))
    expect(await screen.findByText('2FA desativado.')).toBeInTheDocument()
    expect(toggle()).toHaveAttribute('aria-checked', 'false')
    expect(stored().twoFactorEnabled).toBe(false)
    expect(screen.queryByText(/códigos de recuperação disponíveis/)).not.toBeInTheDocument()
  })

  it('regenerar códigos: pede a senha, gera e mostra os novos', async () => {
    renderPage({ plan: 'pro', twoFactorEnabled: true })
    fireEvent.click(await screen.findByRole('button', { name: 'Regenerar códigos' }))
    fireEvent.change(await screen.findByPlaceholderText('Sua senha'), { target: { value: 'minha' } })
    fireEvent.click(screen.getByRole('button', { name: 'Gerar novos códigos' }))
    await waitFor(() => expect(authAPI.twoFARegenerateCodes).toHaveBeenCalledWith('minha'))
    expect(await screen.findByText('cccc-3333')).toBeInTheDocument()
    expect(screen.getByText('Novos códigos de recuperação gerados.')).toBeInTheDocument()
  })

  it('plano mudou para Grátis com 2FA ativo: avisa, deixa desativar, sem "Regenerar"', async () => {
    renderPage({ plan: 'free', twoFactorEnabled: true })
    expect(screen.getByText(/Seu plano mudou para Grátis/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Regenerar códigos' })).not.toBeInTheDocument()
    fireEvent.click(toggle())
    expect(await screen.findByText('Digite sua senha para confirmar a desativação do 2FA.')).toBeInTheDocument()
  })
})

describe('Segurança — navegação', () => {
  it('voltar retorna à tela anterior', async () => {
    renderPage({}, ['/settings', '/settings/seguranca'], 1)
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/settings'))
  })
})
