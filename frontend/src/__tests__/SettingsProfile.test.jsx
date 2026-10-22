import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import SettingsProfile from '../pages/SettingsProfile.jsx'

vi.mock('../services/api.js', () => ({
  authAPI: { updateProfile: vi.fn(), changeEmail: vi.fn(), resendVerification: vi.fn(), updateAvatar: vi.fn(), removeAvatar: vi.fn() },
}))
vi.mock('../utils/avatarImage.js', async (orig) => ({ ...(await orig()), resizeToAvatar: vi.fn() }))
vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))

import { authAPI } from '../services/api.js'
import { resizeToAvatar } from '../utils/avatarImage.js'

const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='      // o que o resize devolve (vai para a API)
const STAMP = '2026-10-22T15:00:00.000Z'                     // versão devolvida pelo servidor
const URL_OF = (v) => `/api/auth/avatar?v=${encodeURIComponent(v)}`
function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname}</div> }
function renderPage(user = {}, entries = ['/settings/perfil'], index) {
  const u = { id: 'u1', name: 'André Pereira', email: 'andre@nancy.app', plan: 'elite', emailVerified: true, ...user }
  sessionStorage.setItem('user', JSON.stringify(u))
  window.dispatchEvent(new CustomEvent('user-updated', { detail: u }))
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={index}>
      <Where />
      <Routes>
        <Route path="/settings/perfil" element={<SettingsProfile />} />
        <Route path="*" element={<div>outra tela</div>} />
      </Routes>
    </MemoryRouter>
  )
}
const stored = () => JSON.parse(sessionStorage.getItem('user'))
const nameInput = () => screen.getByLabelText('Nome')
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
const pickFile = (file) => fireEvent.change(screen.getByLabelText('Escolher foto de perfil'), { target: { files: [file] } })
const imgFile = (type = 'image/png') => new File(['x'], 'foto.png', { type })

beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear(); localStorage.clear()
  authAPI.updateProfile.mockResolvedValue({ data: {} })
  authAPI.updateAvatar.mockResolvedValue({ data: { avatarUpdatedAt: STAMP } })
  authAPI.removeAvatar.mockResolvedValue({ data: {} })
  authAPI.resendVerification.mockResolvedValue({ data: {} })
  authAPI.changeEmail.mockResolvedValue({ data: {} })
  resizeToAvatar.mockResolvedValue(PHOTO)
})

describe('Dados pessoais', () => {
  it('mostra título, avatar com iniciais, nome, e-mail só leitura e o selo de verificado', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Perfil' })).toBeInTheDocument()
    expect(screen.getByText('Nome, e-mail e verificação')).toBeInTheDocument()
    expect(document.querySelector('.dp-av').textContent).toBe('AP')
    expect(nameInput()).toHaveValue('André Pereira')
    expect(screen.getByLabelText('E-mail')).toHaveValue('andre@nancy.app')
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('readonly')
    expect(screen.getByText('✓ E-mail verificado')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Alterar foto' })).toBeInTheDocument()
  })

  it('salva o nome (trim), manda só o nome, atualiza o usuário e avisa', async () => {
    renderPage({ salary: 5000 })
    fireEvent.change(nameInput(), { target: { value: '  Ana Souza  ' } })
    save()
    await waitFor(() => expect(authAPI.updateProfile).toHaveBeenCalledWith({ name: 'Ana Souza' }))
    expect(authAPI.updateProfile.mock.calls[0][0]).not.toHaveProperty('email')
    expect(await screen.findByText('Perfil atualizado!')).toBeInTheDocument()
    expect(stored().name).toBe('Ana Souza')
    expect(nameInput()).toHaveValue('Ana Souza')
  })

  it('Enter no campo de nome também salva', async () => {
    renderPage()
    fireEvent.change(nameInput(), { target: { value: 'Outro Nome' } })
    fireEvent.submit(nameInput().closest('form'))
    await waitFor(() => expect(authAPI.updateProfile).toHaveBeenCalledWith({ name: 'Outro Nome' }))
  })

  it('nome curto ou vazio não chama a API', () => {
    renderPage()
    fireEvent.change(nameInput(), { target: { value: ' A ' } })
    save()
    expect(screen.getByRole('alert')).toHaveTextContent('Nome deve ter entre 2 e 100 caracteres.')
    expect(authAPI.updateProfile).not.toHaveBeenCalled()
  })

  it('erro do servidor aparece e o nome digitado continua', async () => {
    authAPI.updateProfile.mockRejectedValue({ response: { data: { error: 'Algo deu errado.' } } })
    renderPage()
    fireEvent.change(nameInput(), { target: { value: 'Novo Nome' } })
    save()
    expect(await screen.findByText('Algo deu errado.')).toBeInTheDocument()
    expect(nameInput()).toHaveValue('Novo Nome')
    expect(stored().name).toBe('André Pereira')
  })

  it('e-mail não verificado: selo de aviso e "Reenviar e-mail" (continua dando pra reenviar)', async () => {
    renderPage({ emailVerified: false })
    expect(screen.getByText('E-mail não verificado')).toBeInTheDocument()
    expect(screen.queryByText('✓ E-mail verificado')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reenviar e-mail' }))
    await waitFor(() => expect(authAPI.resendVerification).toHaveBeenCalledTimes(1))
    expect(await screen.findByText(/E-mail de verificação enviado/)).toBeInTheDocument()
  })

  it('falha ao reenviar mostra o erro', async () => {
    authAPI.resendVerification.mockRejectedValue(new Error('off'))
    renderPage({ emailVerified: false })
    fireEvent.click(screen.getByRole('button', { name: 'Reenviar e-mail' }))
    expect(await screen.findByText('Erro ao enviar e-mail. Tente novamente.')).toBeInTheDocument()
  })

  it('situação do e-mail ainda desconhecida: nenhum selo (não pisca "não verificado")', () => {
    renderPage({ emailVerified: undefined })
    expect(screen.queryByText(/E-mail (não )?verificado/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reenviar e-mail' })).not.toBeInTheDocument()
  })

  it('"Trocar e-mail" abre novo e-mail + senha; envia, avisa, fecha e guarda a troca pendente', async () => {
    renderPage()
    expect(screen.queryByPlaceholderText('novo@email.com')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Trocar e-mail' }))
    fireEvent.change(screen.getByPlaceholderText('novo@email.com'), { target: { value: ' novo@example.com ' } })
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'MinhaSenh4a' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar link de confirmação' }))
    await waitFor(() => expect(authAPI.changeEmail).toHaveBeenCalledWith('novo@example.com', 'MinhaSenh4a'))
    expect(await screen.findByText(/Enviamos um link de confirmação para novo@example.com/)).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('novo@email.com')).not.toBeInTheDocument()
    expect(stored().pendingEmail).toBe('novo@example.com')
    // o e-mail de login continua o de antes até confirmar
    expect(screen.getByLabelText('E-mail')).toHaveValue('andre@nancy.app')
  })

  it('erro na troca de e-mail aparece e o formulário continua aberto; "Cancelar" fecha', async () => {
    authAPI.changeEmail.mockRejectedValue({ response: { data: { error: 'Senha incorreta.' } } })
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Trocar e-mail' }))
    fireEvent.change(screen.getByPlaceholderText('novo@email.com'), { target: { value: 'novo@example.com' } })
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'errada' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar link de confirmação' }))
    expect(await screen.findByText('Senha incorreta.')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('novo@email.com')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByPlaceholderText('novo@email.com')).not.toBeInTheDocument()
  })

  it('troca pendente aparece como aviso enquanto o formulário está fechado', () => {
    renderPage({ pendingEmail: 'novo@example.com' })
    expect(screen.getByText(/Troca pendente para/)).toHaveTextContent('novo@example.com')
  })
})

describe('Dados pessoais — foto', () => {
  it('escolher uma foto reduz, envia, mostra no avatar e guarda no usuário', async () => {
    renderPage()
    const file = imgFile()
    pickFile(file)
    await waitFor(() => expect(authAPI.updateAvatar).toHaveBeenCalledWith(PHOTO))
    expect(resizeToAvatar).toHaveBeenCalledWith(file)
    expect(await screen.findByText('Foto atualizada!')).toBeInTheDocument()
    expect(within(document.querySelector('.dp-av')).getByRole('img')).toHaveAttribute('src', URL_OF(STAMP))
    expect(stored().avatarUpdatedAt).toBe(STAMP)
    expect(stored().avatar).toBeUndefined()          // a imagem em si nunca fica no navegador (só a versão)
    expect(screen.getByRole('button', { name: 'Remover' })).toBeInTheDocument()
  })

  it('"Alterar foto" abre o seletor de arquivos', () => {
    renderPage()
    const input = screen.getByLabelText('Escolher foto de perfil')
    const click = vi.spyOn(input, 'click').mockImplementation(() => {})
    fireEvent.click(screen.getByRole('button', { name: 'Alterar foto' }))
    expect(click).toHaveBeenCalled()
  })

  it.each([
    ['not-image', 'Escolha uma imagem (JPG, PNG ou WebP).'],
    ['too-big', 'Essa imagem é grande demais. Escolha outra.'],
    ['bad image', 'Não foi possível usar essa imagem.'],
  ])('imagem recusada (%s) avisa e não envia', async (code, msg) => {
    resizeToAvatar.mockRejectedValue(new Error(code))
    renderPage()
    pickFile(imgFile())
    expect(await screen.findByText(msg)).toBeInTheDocument()
    expect(authAPI.updateAvatar).not.toHaveBeenCalled()
    expect(stored().avatarUpdatedAt).toBeUndefined()
  })

  it('erro do servidor ao salvar a foto aparece e a foto antiga continua', async () => {
    authAPI.updateAvatar.mockRejectedValue({ response: { data: { error: 'Imagem inválida ou grande demais.' } } })
    renderPage({ avatarUpdatedAt: STAMP })
    pickFile(imgFile())
    expect(await screen.findByText('Imagem inválida ou grande demais.')).toBeInTheDocument()
    expect(stored().avatarUpdatedAt).toBe(STAMP)
    expect(within(document.querySelector('.dp-av')).getByRole('img')).toHaveAttribute('src', URL_OF(STAMP))
  })

  it('"Remover" apaga a foto e volta às iniciais', async () => {
    renderPage({ avatarUpdatedAt: STAMP })
    expect(within(document.querySelector('.dp-av')).getByRole('img')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remover' }))
    await waitFor(() => expect(authAPI.removeAvatar).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Foto removida.')).toBeInTheDocument()
    expect(document.querySelector('.dp-av img')).toBeNull()
    expect(document.querySelector('.dp-av').textContent).toBe('AP')
    expect(stored().avatarUpdatedAt).toBeNull()
  })

  it('sem foto não existe "Remover"', () => {
    renderPage()
    expect(screen.queryByRole('button', { name: 'Remover' })).not.toBeInTheDocument()
  })
})

describe('Dados pessoais — navegação', () => {
  it('voltar retorna à tela anterior; aberta direto, vai ao Perfil', async () => {
    renderPage({}, ['/settings', '/settings/perfil'], 1)
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/settings'))
  })
})
