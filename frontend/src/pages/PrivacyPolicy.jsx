import { Link } from 'react-router-dom'

const S = {
  page:    { minHeight: '100vh', background: 'var(--bg)', color: 'var(--t1)', fontFamily: 'var(--fs)' },
  header:  { borderBottom: '1px solid var(--bd)', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 12 },
  logo:    { display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'var(--t1)' },
  body:    { maxWidth: 720, margin: '0 auto', padding: '40px 24px 80px' },
  badge:   { display: 'inline-block', fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--c)', background: 'rgba(74,196,110,.1)', border: '1px solid rgba(74,196,110,.2)', borderRadius: 6, padding: '3px 10px', marginBottom: 12 },
  h1:      { fontSize: 28, fontWeight: 800, marginBottom: 6, lineHeight: 1.2 },
  date:    { fontSize: 13, color: 'var(--t3)', marginBottom: 36 },
  h2:      { fontSize: 17, fontWeight: 700, marginTop: 36, marginBottom: 10, color: 'var(--t1)' },
  p:       { fontSize: 14, lineHeight: 1.7, color: 'var(--t2)', marginBottom: 12 },
  ul:      { paddingLeft: 20, marginBottom: 12 },
  li:      { fontSize: 14, lineHeight: 1.7, color: 'var(--t2)', marginBottom: 4 },
  divider: { border: 'none', borderTop: '1px solid var(--bd)', margin: '32px 0' },
  box:     { background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 12, padding: '16px 20px', marginBottom: 16 },
  contact: { fontSize: 14, color: 'var(--t2)' },
  link:    { color: 'var(--c)', textDecoration: 'none' },
}

export default function PrivacyPolicy() {
  return (
    <div style={S.page}>
      <header style={S.header}>
        <Link to="/" style={S.logo}>
          <img src="/logo-icon.png" alt="Finance" style={{ width: 28, height: 28 }} />
          <span style={{ fontWeight: 700, fontSize: 15 }}>FinançasPro</span>
        </Link>
        <span style={{ color: 'var(--bd)', fontSize: 18, marginLeft: 4 }}>/</span>
        <span style={{ fontSize: 14, color: 'var(--t3)' }}>Política de Privacidade</span>
      </header>

      <div style={S.body}>
        <div style={S.badge}>LGPD · Lei 13.709/2018</div>
        <h1 style={S.h1}>Política de Privacidade</h1>
        <p style={S.date}>Última atualização: 22 de maio de 2026 · Versão 1.0</p>

        <p style={S.p}>
          Esta Política de Privacidade descreve como o <strong>FinançasPro</strong> coleta, usa,
          armazena e protege os dados pessoais dos usuários, em conformidade com a
          Lei Geral de Proteção de Dados (LGPD — Lei 13.709/2018).
        </p>

        <h2 style={S.h2}>1. Quem somos</h2>
        <p style={S.p}>
          O FinançasPro é um aplicativo de controle financeiro pessoal. O controlador
          responsável pelo tratamento dos seus dados pode ser contatado pelo e-mail
          abaixo. Ao usar o app, você concorda com esta política.
        </p>

        <h2 style={S.h2}>2. Dados que coletamos</h2>
        <ul style={S.ul}>
          <li style={S.li}><strong>Dados de cadastro:</strong> nome, e-mail e senha (armazenada como hash bcrypt — nunca em texto claro)</li>
          <li style={S.li}><strong>Dados financeiros:</strong> transações, categorias, valores, datas, contas fixas e metas que você cadastra</li>
          <li style={S.li}><strong>Dados de uso:</strong> salário informado, preferências do app</li>
          <li style={S.li}><strong>Dados técnicos:</strong> endereço IP e tipo de dispositivo registrados nos logs de acesso (para segurança)</li>
          <li style={S.li}><strong>Dados de pagamento:</strong> apenas o status da assinatura. Dados do cartão são tratados exclusivamente pelo Mercado Pago — não temos acesso a eles</li>
        </ul>

        <h2 style={S.h2}>3. Como usamos seus dados</h2>
        <ul style={S.ul}>
          <li style={S.li}>Fornecer as funcionalidades do app (dashboard, relatórios, metas)</li>
          <li style={S.li}>Enviar relatórios mensais em PDF por e-mail (quando solicitado)</li>
          <li style={S.li}>Detectar tentativas de acesso não autorizado (logs de segurança)</li>
          <li style={S.li}>Processar pagamentos de assinatura via Mercado Pago</li>
          <li style={S.li}>Cumprir obrigações legais</li>
        </ul>
        <p style={S.p}>
          <strong>Não vendemos, alugamos nem compartilhamos seus dados financeiros com terceiros
          para fins de marketing.</strong>
        </p>

        <h2 style={S.h2}>4. Base legal (LGPD)</h2>
        <ul style={S.ul}>
          <li style={S.li}><strong>Execução de contrato</strong> (Art. 7º, V): para prestar o serviço contratado</li>
          <li style={S.li}><strong>Consentimento</strong> (Art. 7º, I): para envio de notificações e e-mails opcionais</li>
          <li style={S.li}><strong>Legítimo interesse</strong> (Art. 7º, IX): para segurança e prevenção de fraudes</li>
          <li style={S.li}><strong>Cumprimento de obrigação legal</strong> (Art. 7º, II): quando exigido por lei</li>
        </ul>

        <h2 style={S.h2}>5. Armazenamento e segurança</h2>
        <ul style={S.ul}>
          <li style={S.li}>Dados armazenados no Brasil via Supabase (PostgreSQL) com conexão SSL/TLS obrigatória</li>
          <li style={S.li}>Aplicação hospedada no Google Cloud Run (southamerica-east1 — São Paulo)</li>
          <li style={S.li}>Senhas protegidas com bcrypt (12 rounds) — irreversível</li>
          <li style={S.li}>Comunicação protegida com HTTPS + HSTS</li>
          <li style={S.li}>Scans automáticos de vulnerabilidades (Trivy + npm audit)</li>
        </ul>

        <h2 style={S.h2}>6. Compartilhamento com terceiros</h2>
        <p style={S.p}>Seus dados podem ser processados pelos seguintes fornecedores, todos com políticas de privacidade próprias:</p>
        <ul style={S.ul}>
          <li style={S.li}><strong>Supabase</strong> — banco de dados (infraestrutura)</li>
          <li style={S.li}><strong>Google Cloud</strong> — hospedagem da aplicação</li>
          <li style={S.li}><strong>Mercado Pago</strong> — processamento de pagamentos</li>
          <li style={S.li}><strong>Groq</strong> — processamento do assistente de IA (apenas a mensagem enviada, sem dados financeiros identificáveis)</li>
        </ul>

        <h2 style={S.h2}>7. Seus direitos (LGPD Art. 18)</h2>
        <div style={S.box}>
          <ul style={{ ...S.ul, marginBottom: 0 }}>
            <li style={S.li}><strong>Acesso:</strong> solicitar cópia de todos os dados que temos sobre você</li>
            <li style={S.li}><strong>Correção:</strong> atualizar dados incorretos ou desatualizados (disponível em Configurações)</li>
            <li style={S.li}><strong>Exclusão:</strong> apagar sua conta e todos os dados associados (disponível em Configurações → Excluir conta)</li>
            <li style={S.li}><strong>Portabilidade:</strong> exportar seus dados em formato CSV (disponível em Transações)</li>
            <li style={S.li}><strong>Revogação de consentimento:</strong> cancelar notificações a qualquer momento em Configurações</li>
            <li style={S.li}><strong>Informação:</strong> saber com quem compartilhamos seus dados (esta política)</li>
          </ul>
        </div>

        <h2 style={S.h2}>8. Retenção de dados</h2>
        <ul style={S.ul}>
          <li style={S.li}>Dados da conta: mantidos enquanto a conta estiver ativa</li>
          <li style={S.li}>Após exclusão da conta: todos os dados são removidos permanentemente em até 30 dias</li>
          <li style={S.li}>Logs de segurança (IPs): mantidos por 90 dias para investigação de incidentes</li>
        </ul>

        <h2 style={S.h2}>9. Cookies e armazenamento local</h2>
        <ul style={S.ul}>
          <li style={S.li}><strong>Cookie de sessão (HttpOnly):</strong> necessário para autenticação — não pode ser lido por JavaScript</li>
          <li style={S.li}><strong>sessionStorage:</strong> dados do usuário em memória temporária — apagado ao fechar o navegador</li>
          <li style={S.li}><strong>localStorage:</strong> preferências de tema (claro/escuro)</li>
        </ul>
        <p style={S.p}>Não usamos cookies de rastreamento, analytics ou publicidade.</p>

        <h2 style={S.h2}>10. Alterações nesta política</h2>
        <p style={S.p}>
          Notificaremos por e-mail sobre alterações significativas com pelo menos 15 dias
          de antecedência. O uso contínuo do app após a data de vigência implica
          aceitação da política atualizada.
        </p>

        <hr style={S.divider} />

        <h2 style={{ ...S.h2, marginTop: 0 }}>Contato e Encarregado de Dados (DPO)</h2>
        <div style={S.box}>
          <p style={{ ...S.contact, marginBottom: 4 }}>Para exercer seus direitos ou tirar dúvidas:</p>
          <p style={{ ...S.contact, marginBottom: 4 }}>
            <strong>E-mail:</strong>{' '}
            <a href="mailto:privacidade@financaspro.com.br" style={S.link}>
              privacidade@financaspro.com.br
            </a>
          </p>
          <p style={{ ...S.contact, marginBottom: 0 }}>
            Respondemos em até <strong>15 dias úteis</strong>, conforme exigido pela LGPD.
          </p>
        </div>

        <p style={{ ...S.p, marginTop: 24, fontSize: 12, color: 'var(--t3)' }}>
          <Link to="/termos" style={S.link}>Termos de Uso</Link>
          {' · '}
          <Link to="/" style={S.link}>Voltar ao app</Link>
        </p>
      </div>
    </div>
  )
}
