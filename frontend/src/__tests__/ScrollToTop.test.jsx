import { render, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom'
import ScrollToTop from '../components/layout/ScrollToTop.jsx'

function Pages() {
  const navigate = useNavigate()
  return (
    <>
      <button onClick={() => navigate('/termos')}>ir</button>
      <button onClick={() => navigate('/outra', { replace: true })}>trocar</button>
      <button onClick={() => navigate(-1)}>voltar</button>
      <button onClick={() => navigate('/termos?aba=2')}>mesma rota, outro parametro</button>
      <Routes>
        <Route path="*" element={<div />} />
      </Routes>
    </>
  )
}

function setup(initial = ['/settings']) {
  const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  const utils = render(<MemoryRouter initialEntries={initial} initialIndex={initial.length - 1}><ScrollToTop /><Pages /></MemoryRouter>)
  return { scrollTo, ...utils }
}

afterEach(() => vi.restoreAllMocks())

describe('ScrollToTop', () => {
  it('abrir outra tela (toque em link/botão) volta ao topo — Termos abria no meio do texto', () => {
    const { scrollTo, getByText } = setup()
    scrollTo.mockClear()
    fireEvent.click(getByText('ir'))
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' })
  })

  it('trocar de tela sem empilhar (replace) também vai ao topo', () => {
    const { scrollTo, getByText } = setup()
    scrollTo.mockClear()
    fireEvent.click(getByText('trocar'))
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' })
  })

  it('voltar (POP) não mexe na rolagem: o navegador devolve a posição de antes', () => {
    const { scrollTo, getByText } = setup(['/settings', '/termos'])
    scrollTo.mockClear()
    fireEvent.click(getByText('voltar'))
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('só mudar o parâmetro da mesma tela não joga a pessoa para o topo', () => {
    const { scrollTo, getByText } = setup(['/termos'])
    scrollTo.mockClear()
    fireEvent.click(getByText('mesma rota, outro parametro'))
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('a primeira renderização (abrir o app) não força rolagem nenhuma', () => {
    const { scrollTo } = setup()
    // MemoryRouter começa em POP: o navegador cuida de restaurar
    expect(scrollTo).not.toHaveBeenCalled()
  })
})
