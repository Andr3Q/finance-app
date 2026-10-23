import { Link } from 'react-router-dom'
import LegalPage from '../components/ui/LegalPage.jsx'

// Política de Privacidade (Nancy 2, tela 35). O print mostra um resumo de 5 itens; aqui fica o texto jurídico completo e
// vigente (versão 1.0, 22/05/2026) — inclusive o contato do Encarregado (DPO), exigido pela LGPD — no visual novo.
// Trocar o texto é decisão jurídica, não de tela.
const footer = (
  <>
    <p className="lg-foot-line">Dúvidas: <a href="mailto:privacidade@nancy.com.br" className="lg-link">privacidade@nancy.com.br</a></p>
    <p className="lg-foot-line"><Link to="/termos" className="lg-link">Termos de Uso</Link></p>
  </>
)

export default function PrivacyPolicy() {
  return (
    <LegalPage title="Política de Privacidade" subtitle="Conforme a LGPD" footer={footer}>
      <p className="lg-meta">LGPD · Lei 13.709/2018 · Última atualização: 22 de maio de 2026 · Versão 1.0</p>
      <p className="lg-p">
        Esta Política de Privacidade descreve como o <strong>Nancy</strong> coleta, usa,
        armazena e protege os dados pessoais dos usuários, em conformidade com a
        Lei Geral de Proteção de Dados (LGPD — Lei 13.709/2018).
      </p>

      <h2 className="lg-h">1. Quem somos</h2>
      <p className="lg-p">
        O Nancy é um aplicativo de controle financeiro pessoal. O controlador
        responsável pelo tratamento dos seus dados pode ser contatado pelo e-mail
        abaixo. Ao usar o app, você concorda com esta política.
      </p>

      <h2 className="lg-h">2. Dados que coletamos</h2>
      <ul className="lg-ul">
        <li className="lg-li"><strong>Dados de cadastro:</strong> nome, e-mail e senha (armazenada como hash bcrypt — nunca em texto claro)</li>
        <li className="lg-li"><strong>Dados financeiros:</strong> transações, categorias, valores, datas, contas fixas e metas que você cadastra</li>
        <li className="lg-li"><strong>Dados de uso:</strong> salário informado, preferências do app</li>
        <li className="lg-li"><strong>Dados técnicos:</strong> endereço IP e tipo de dispositivo registrados nos logs de acesso (para segurança)</li>
        <li className="lg-li"><strong>Dados de pagamento:</strong> apenas o status da assinatura. Dados do cartão são tratados exclusivamente pelo Mercado Pago — não temos acesso a eles</li>
      </ul>

      <h2 className="lg-h">3. Como usamos seus dados</h2>
      <ul className="lg-ul">
        <li className="lg-li">Fornecer as funcionalidades do app (dashboard, relatórios, metas)</li>
        <li className="lg-li">Enviar relatórios mensais em PDF por e-mail (quando solicitado)</li>
        <li className="lg-li">Detectar tentativas de acesso não autorizado (logs de segurança)</li>
        <li className="lg-li">Processar pagamentos de assinatura via Mercado Pago</li>
        <li className="lg-li">Cumprir obrigações legais</li>
      </ul>
      <p className="lg-p">
        <strong>Não vendemos, alugamos nem compartilhamos seus dados financeiros com terceiros
        para fins de marketing.</strong>
      </p>

      <h2 className="lg-h">4. Base legal (LGPD)</h2>
      <ul className="lg-ul">
        <li className="lg-li"><strong>Execução de contrato</strong> (Art. 7º, V): para prestar o serviço contratado</li>
        <li className="lg-li"><strong>Consentimento</strong> (Art. 7º, I): para envio de notificações e e-mails opcionais</li>
        <li className="lg-li"><strong>Legítimo interesse</strong> (Art. 7º, IX): para segurança e prevenção de fraudes</li>
        <li className="lg-li"><strong>Cumprimento de obrigação legal</strong> (Art. 7º, II): quando exigido por lei</li>
      </ul>

      <h2 className="lg-h">5. Armazenamento e segurança</h2>
      <ul className="lg-ul">
        <li className="lg-li">Dados armazenados no Brasil via Supabase (PostgreSQL) com conexão SSL/TLS obrigatória</li>
        <li className="lg-li">Aplicação hospedada no Google Cloud Run (southamerica-east1 — São Paulo)</li>
        <li className="lg-li">Senhas protegidas com bcrypt (12 rounds) — irreversível</li>
        <li className="lg-li">Comunicação protegida com HTTPS + HSTS</li>
        <li className="lg-li">Scans automáticos de vulnerabilidades (Trivy + npm audit)</li>
      </ul>

      <h2 className="lg-h">6. Compartilhamento com terceiros</h2>
      <p className="lg-p">Seus dados podem ser processados pelos seguintes fornecedores, todos com políticas de privacidade próprias:</p>
      <ul className="lg-ul">
        <li className="lg-li"><strong>Supabase</strong> — banco de dados (infraestrutura)</li>
        <li className="lg-li"><strong>Google Cloud</strong> — hospedagem da aplicação</li>
        <li className="lg-li"><strong>Mercado Pago</strong> — processamento de pagamentos</li>
        <li className="lg-li"><strong>Groq</strong> — processamento do assistente de IA (apenas a mensagem enviada, sem dados financeiros identificáveis)</li>
      </ul>

      <h2 className="lg-h">7. Seus direitos (LGPD Art. 18)</h2>
      <div className="lg-box">
        <ul className="lg-ul lg-ul-flush">
          <li className="lg-li"><strong>Acesso:</strong> solicitar cópia de todos os dados que temos sobre você</li>
          <li className="lg-li"><strong>Correção:</strong> atualizar dados incorretos ou desatualizados (disponível em Configurações)</li>
          <li className="lg-li"><strong>Exclusão:</strong> apagar sua conta e todos os dados associados (disponível em Configurações → Excluir conta)</li>
          <li className="lg-li"><strong>Portabilidade:</strong> exportar seus dados em formato CSV (disponível em Transações)</li>
          <li className="lg-li"><strong>Revogação de consentimento:</strong> cancelar notificações a qualquer momento em Configurações</li>
          <li className="lg-li"><strong>Informação:</strong> saber com quem compartilhamos seus dados (esta política)</li>
        </ul>
      </div>

      <h2 className="lg-h">8. Retenção de dados</h2>
      <ul className="lg-ul">
        <li className="lg-li">Dados da conta: mantidos enquanto a conta estiver ativa</li>
        <li className="lg-li">Após exclusão da conta: todos os dados são removidos permanentemente em até 30 dias</li>
        <li className="lg-li">Logs de segurança (IPs): mantidos por 90 dias para investigação de incidentes</li>
      </ul>

      <h2 className="lg-h">9. Cookies e armazenamento local</h2>
      <ul className="lg-ul">
        <li className="lg-li"><strong>Cookie de sessão (HttpOnly):</strong> necessário para autenticação — não pode ser lido por JavaScript</li>
        <li className="lg-li"><strong>sessionStorage:</strong> dados do usuário em memória temporária — apagado ao fechar o navegador</li>
        <li className="lg-li"><strong>localStorage:</strong> preferências de tema (claro/escuro)</li>
      </ul>
      <p className="lg-p">Não usamos cookies de rastreamento, analytics ou publicidade.</p>

      <h2 className="lg-h">10. Alterações nesta política</h2>
      <p className="lg-p">
        Notificaremos por e-mail sobre alterações significativas com pelo menos 15 dias
        de antecedência. O uso contínuo do app após a data de vigência implica
        aceitação da política atualizada.
      </p>

      <h2 className="lg-h">Contato e Encarregado de Dados (DPO)</h2>
      <div className="lg-box">
        <p className="lg-p">Para exercer seus direitos ou tirar dúvidas:</p>
        <p className="lg-p">
          <strong>E-mail:</strong>{' '}
          <a href="mailto:privacidade@nancy.com.br" className="lg-link">
            privacidade@nancy.com.br
          </a>
        </p>
        <p className="lg-p">
          Respondemos em até <strong>15 dias úteis</strong>, conforme exigido pela LGPD.
        </p>
      </div>
    </LegalPage>
  )
}
