import { useState } from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useDialogFocus } from '../hooks/useDialogFocus.js'

// Achado N2-10: no diálogo "Excluir conta permanentemente" o Tab saía para os botões atrás do véu e, ao fechar, o foco caía no
// <body>. O gerenciador único (montado no App) cuida de TODO diálogo modal: foco entra, Tab dá a volta, ao fechar volta a quem abriu.

function Harness({ withInput = false, modal = true }) {
  useDialogFocus()
  const [open, setOpen] = useState(false)
  const [nested, setNested] = useState(false)
  return (
    <div>
      <button onClick={() => setOpen(true)}>Abrir</button>
      <button>Atrás do véu</button>
      {open && (
        <div role="dialog" aria-modal={modal ? 'true' : undefined} aria-label="Confirmar">
          {withInput && <input aria-label="Senha" autoFocus />}
          <button onClick={() => setOpen(false)}>Cancelar</button>
          <button onClick={() => setNested(true)}>Mais um</button>
          {nested && (
            <div role="dialog" aria-modal="true" aria-label="Interno">
              <button onClick={() => setNested(false)}>Fechar interno</button>
              <button>Ok interno</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const focused = () => document.activeElement
const abrir = () => userEvent.click(screen.getByRole('button', { name: 'Abrir' }))

describe('useDialogFocus — o foco dos diálogos modais', () => {
  it('ao abrir, o foco entra no diálogo (no próprio diálogo: não abre o teclado do celular)', async () => {
    render(<Harness />)
    await abrir()
    await waitFor(() => expect(focused()).toBe(screen.getByRole('dialog', { name: 'Confirmar' })))
  })

  it('não rouba o foco de um campo que já o pegou (autoFocus)', async () => {
    render(<Harness withInput />)
    await abrir()
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    expect(focused()).toBe(screen.getByLabelText('Senha'))
  })

  it('com um campo autoFocus dentro do diálogo (que já pegou o foco), ao fechar o foco ainda volta a quem abriu', async () => {
    render(<Harness withInput />)
    const abrirBtn = screen.getByRole('button', { name: 'Abrir' })
    await userEvent.click(abrirBtn)
    await waitFor(() => expect(focused()).toBe(screen.getByLabelText('Senha')))
    screen.getByRole('button', { name: 'Cancelar' }).click()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(focused()).toBe(abrirBtn))
  })

  it('Tab e Shift+Tab dão a volta DENTRO do diálogo (nunca chegam ao que está atrás do véu)', async () => {
    render(<Harness />)
    await abrir()
    const cancelar = screen.getByRole('button', { name: 'Cancelar' })
    const maisUm = screen.getByRole('button', { name: 'Mais um' })
    await waitFor(() => expect(focused()).toBe(screen.getByRole('dialog')))
    await userEvent.tab();                 expect(focused()).toBe(cancelar)
    await userEvent.tab();                 expect(focused()).toBe(maisUm)
    await userEvent.tab();                 expect(focused()).toBe(cancelar)   // deu a volta, sem passar por "Atrás do véu"
    await userEvent.tab({ shift: true });  expect(focused()).toBe(maisUm)     // e de trás para frente
    await userEvent.tab({ shift: true });  expect(focused()).toBe(cancelar)
    expect(focused()).not.toBe(screen.getByRole('button', { name: 'Atrás do véu' }))
  })

  it('Shift+Tab logo ao abrir (foco no próprio diálogo) vai ao último, não ao que está atrás', async () => {
    render(<Harness />)
    await abrir()
    await waitFor(() => expect(focused()).toBe(screen.getByRole('dialog')))
    await userEvent.tab({ shift: true })
    expect(focused()).toBe(screen.getByRole('button', { name: 'Mais um' }))
  })

  it('ao fechar, o foco volta ao botão que abriu o diálogo (antes caía no <body>)', async () => {
    render(<Harness />)
    const abrirBtn = screen.getByRole('button', { name: 'Abrir' })
    await userEvent.click(abrirBtn)
    await userEvent.tab()
    await userEvent.keyboard('{Enter}') // Cancelar
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(focused()).toBe(abrirBtn))
  })

  it('com um diálogo dentro do outro, o Tab fica no de cima; ao fechá-lo o foco volta ao botão que o abriu', async () => {
    render(<Harness />)
    await abrir()
    await waitFor(() => expect(focused()).toBe(screen.getByRole('dialog', { name: 'Confirmar' })))
    const maisUm = screen.getByRole('button', { name: 'Mais um' })
    await userEvent.click(maisUm)
    const interno = await screen.findByRole('dialog', { name: 'Interno' })
    await waitFor(() => expect(focused()).toBe(interno))
    await userEvent.tab(); expect(focused()).toBe(screen.getByRole('button', { name: 'Fechar interno' }))
    await userEvent.tab(); expect(focused()).toBe(screen.getByRole('button', { name: 'Ok interno' }))
    await userEvent.tab(); expect(focused()).toBe(screen.getByRole('button', { name: 'Fechar interno' })) // não vai ao diálogo de baixo
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Interno' })).not.toBeInTheDocument())
    await waitFor(() => expect(focused()).toBe(maisUm))
  })

  it('não rouba o foco ao fechar quando ele já foi para outro lugar de propósito', async () => {
    render(<Harness />)
    await abrir()
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    const atras = screen.getByRole('button', { name: 'Atrás do véu' })
    atras.focus()                                         // o app levou o foco para outro lugar (ex.: um campo com erro)
    screen.getByRole('button', { name: 'Cancelar' }).click() // fecha sem mexer no foco
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(focused()).toBe(atras)                         // não volta para "Abrir"
  })

  it('toque que não foca (celular): nada é devolvido ao fechar, o foco não vai parar num campo antigo', async () => {
    render(<Harness />)
    const abrirBtn = screen.getByRole('button', { name: 'Abrir' })
    abrirBtn.focus()
    abrirBtn.blur() // o foco foi para o nada, como num toque em área que não foca (no iOS o botão tocado não recebe foco)
    fireEvent.click(abrirBtn) // clique sem foco
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    screen.getByRole('button', { name: 'Cancelar' }).click()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(focused()).toBe(document.body)
  })

  it('role="dialog" SEM aria-modal (chat lateral do desktop) não é prisão de foco', async () => {
    render(<Harness modal={false} />)
    await abrir()
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    expect(focused()).not.toBe(screen.getByRole('dialog'))
    await userEvent.tab()
    // o Tab segue a ordem normal da página
    expect(focused()).not.toBeNull()
  })
})
