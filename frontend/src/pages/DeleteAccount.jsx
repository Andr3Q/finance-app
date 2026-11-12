import { Link } from 'react-router-dom'
import LegalPage from '../components/ui/LegalPage.jsx'

// Como excluir a conta e os dados (página pública, sem login). É o endereço que a Play Console pede na "Segurança dos dados" e que qualquer
// pessoa pode abrir sem entrar no app. O passo a passo repete, palavra por palavra, a tela "Meus dados" (pages/SettingsData.jsx); o que é
// apagado e o que permanece por um tempo repete a Política de Privacidade (seções 8 e 9) e o que a rota DELETE /api/auth/account faz.
const footer = (
  <>
    <p className="lg-foot-line">Dúvidas: <a href="mailto:privacidade@myfinancepro.com.br" className="lg-link">privacidade@myfinancepro.com.br</a></p>
    <p className="lg-foot-line"><Link to="/privacidade" className="lg-link">Política de Privacidade</Link> · <Link to="/termos" className="lg-link">Termos de Uso</Link></p>
  </>
)

export default function DeleteAccount() {
  return (
    <LegalPage title="Excluir conta e dados" subtitle="Como apagar sua conta do Nancy" footer={footer}>
      <p className="lg-meta">Nancy · responsável: André Pereira de Almeida</p>
      <p className="lg-p">
        Você pode excluir a sua conta do <strong>Nancy</strong>, e os dados dela, quando quiser e sem precisar dar um motivo.
        Há duas formas: pelo próprio aplicativo (a mais rápida) ou por e-mail.
      </p>

      <h2 className="lg-h">1. Pelo aplicativo</h2>
      <ul className="lg-ul">
        <li className="lg-li"><strong>Passo 1:</strong> entre no Nancy (aplicativo da Play Store ou myfinancepro.com.br) com o seu e-mail e a sua senha.</li>
        <li className="lg-li"><strong>Passo 2:</strong> toque em <strong>Perfil</strong>, na barra de baixo (no computador, é o seu nome no fim do menu lateral).</li>
        <li className="lg-li"><strong>Passo 3:</strong> abra <strong>Meus dados</strong>.</li>
        <li className="lg-li"><strong>Passo 4:</strong> toque em <strong>Excluir minha conta</strong>. O aviso &quot;Esta ação não pode ser desfeita&quot; aparece.</li>
        <li className="lg-li"><strong>Passo 5:</strong> digite a sua senha em &quot;Confirme sua senha para continuar&quot; e toque em <strong>Excluir conta</strong>.</li>
      </ul>
      <p className="lg-p">Antes de excluir, se quiser guardar uma cópia, exporte os seus dados na mesma tela (<strong>Meus dados</strong>), em CSV, PDF ou JSON.</p>

      <h2 className="lg-h">2. Por e-mail, se você não consegue entrar</h2>
      <p className="lg-p">
        Se esqueceu a senha, use <strong>Esqueci a senha</strong> na tela de entrada e depois siga o passo a passo acima. Se mesmo assim não conseguir
        entrar, escreva para{' '}
        <a href="mailto:privacidade@myfinancepro.com.br?subject=Excluir%20minha%20conta%20do%20Nancy" className="lg-link">privacidade@myfinancepro.com.br</a>,{' '}
        <strong>do e-mail que você usou no cadastro</strong>, pedindo a exclusão da conta. Respondemos em até <strong>15 dias úteis</strong>, como
        exige a LGPD.
      </p>

      <h2 className="lg-h">O que é apagado</h2>
      <ul className="lg-ul">
        <li className="lg-li">Sua conta: nome, e-mail e senha</li>
        <li className="lg-li">Seus lançamentos, categorias e limites</li>
        <li className="lg-li">Suas contas fixas, metas e compras parceladas</li>
        <li className="lg-li">Sua foto de perfil e as inscrições de notificação</li>
        <li className="lg-li">O histórico de pagamentos do seu plano e os registros de acesso à sua conta</li>
      </ul>
      <p className="lg-p">
        A exclusão é <strong>permanente e imediata</strong>: os seus dados são removidos do banco no momento em que você confirma, e não é possível
        recuperá-los depois. Se você tinha um plano pago, o acesso a ele termina junto com a conta.
      </p>

      <h2 className="lg-h">O que pode permanecer por um tempo</h2>
      <ul className="lg-ul">
        <li className="lg-li"><strong>Cópias de segurança:</strong> são criptografadas e podem guardar os seus dados por até cerca de 12 meses; depois disso são apagadas automaticamente.</li>
        <li className="lg-li"><strong>Registros de segurança dos servidores</strong> (como o endereço IP): mantidos por 90 dias, para investigar incidentes.</li>
      </ul>
      <p className="lg-p">Os detalhes estão na <Link to="/privacidade" className="lg-link">Política de Privacidade</Link>, seções 8 e 9.</p>
    </LegalPage>
  )
}
