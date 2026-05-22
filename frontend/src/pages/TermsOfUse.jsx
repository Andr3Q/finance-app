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
  warn:    { background: 'rgba(255,170,0,.06)', border: '1px solid rgba(255,170,0,.2)', borderRadius: 12, padding: '14px 18px', marginBottom: 16, fontSize: 14, color: 'var(--t2)', lineHeight: 1.6 },
  link:    { color: 'var(--c)', textDecoration: 'none' },
}

export default function TermsOfUse() {
  return (
    <div style={S.page}>
      <header style={S.header}>
        <Link to="/" style={S.logo}>
          <img src="/logo-icon.png" alt="Finance" style={{ width: 28, height: 28 }} />
          <span style={{ fontWeight: 700, fontSize: 15 }}>FinançasPro</span>
        </Link>
        <span style={{ color: 'var(--bd)', fontSize: 18, marginLeft: 4 }}>/</span>
        <span style={{ fontSize: 14, color: 'var(--t3)' }}>Termos de Uso</span>
      </header>

      <div style={S.body}>
        <div style={S.badge}>Versão 1.0 · Brasil</div>
        <h1 style={S.h1}>Termos de Uso</h1>
        <p style={S.date}>Última atualização: 22 de maio de 2026 · Aplicável a todos os planos</p>

        <p style={S.p}>
          Ao criar uma conta ou usar o <strong>FinançasPro</strong>, você concorda com
          estes Termos de Uso. Leia com atenção — eles formam um contrato entre você e
          o FinançasPro. Se não concordar, não utilize o serviço.
        </p>

        <h2 style={S.h2}>1. O que é o FinançasPro</h2>
        <p style={S.p}>
          O FinançasPro é uma plataforma de controle financeiro pessoal que permite
          registrar transações, criar orçamentos, acompanhar metas e gerar relatórios
          financeiros. O serviço é prestado como SaaS (Software como Serviço) via
          acesso web.
        </p>
        <div style={S.warn}>
          <strong>⚠️ Importante:</strong> O FinançasPro é uma ferramenta de organização
          pessoal. Não somos uma instituição financeira, banco, corretora ou gestora
          de investimentos. Não movimentamos, captamos nem gerimos dinheiro de terceiros.
          As informações do app não constituem assessoria financeira ou de investimentos.
        </div>

        <h2 style={S.h2}>2. Cadastro e responsabilidades da conta</h2>
        <ul style={S.ul}>
          <li style={S.li}>Você deve ter pelo menos 18 anos para criar uma conta</li>
          <li style={S.li}>Forneça informações verdadeiras no cadastro — especialmente e-mail e nome</li>
          <li style={S.li}>Você é responsável pela segurança da sua senha — não a compartilhe</li>
          <li style={S.li}>Cada pessoa deve ter sua própria conta — não é permitido compartilhar acesso</li>
          <li style={S.li}>Notifique-nos imediatamente em caso de acesso não autorizado à sua conta</li>
        </ul>

        <h2 style={S.h2}>3. Planos e preços</h2>
        <div style={S.box}>
          <ul style={{ ...S.ul, marginBottom: 0 }}>
            <li style={S.li}><strong>Grátis:</strong> acesso básico sem cobrança, sujeito a limites de uso</li>
            <li style={S.li}><strong>Pro:</strong> R$ 9,90/mês ou R$ 99,00/ano — funcionalidades avançadas</li>
            <li style={S.li}><strong>Elite:</strong> R$ 34,90/mês ou R$ 334,80/ano — acesso completo incluindo IA</li>
          </ul>
        </div>
        <p style={S.p}>
          Os preços podem ser alterados com aviso prévio de 30 dias por e-mail.
          Cobranças já realizadas não são afetadas pela alteração de preço.
        </p>

        <h2 style={S.h2}>4. Pagamentos e renovação</h2>
        <ul style={S.ul}>
          <li style={S.li}>Pagamentos são processados pelo <strong>Mercado Pago</strong>, sujeitos à política deles</li>
          <li style={S.li}>Planos mensais renovam automaticamente a cada 31 dias</li>
          <li style={S.li}>Planos anuais renovam automaticamente após 366 dias</li>
          <li style={S.li}>Você receberá confirmação de cobrança por e-mail</li>
          <li style={S.li}>Em caso de falha no pagamento, o plano é rebaixado para Grátis automaticamente</li>
        </ul>

        <h2 style={S.h2}>5. Cancelamento e reembolso</h2>
        <ul style={S.ul}>
          <li style={S.li}><strong>Cancelamento:</strong> você pode cancelar a qualquer momento em Configurações → Planos, sem multa</li>
          <li style={S.li}><strong>Após cancelamento:</strong> o acesso ao plano pago fica ativo até o fim do período já pago</li>
          <li style={S.li}><strong>Reembolso:</strong> solicitações dentro de 7 dias da compra são analisadas caso a caso. Após 7 dias, não há reembolso proporcional</li>
          <li style={S.li}><strong>Plano Grátis:</strong> sem cobrança, pode ser cancelado (excluindo conta) a qualquer momento</li>
        </ul>

        <h2 style={S.h2}>6. Uso aceitável</h2>
        <p style={S.p}>É <strong>proibido</strong> usar o FinançasPro para:</p>
        <ul style={S.ul}>
          <li style={S.li}>Registrar transações fictícias com o objetivo de lavar dinheiro ou ocultar ativos</li>
          <li style={S.li}>Realizar ataques, tentativas de invasão ou engenharia reversa do sistema</li>
          <li style={S.li}>Criar contas em nome de terceiros sem autorização</li>
          <li style={S.li}>Qualquer atividade ilegal conforme a legislação brasileira</li>
        </ul>
        <p style={S.p}>
          O descumprimento destas regras pode resultar no encerramento imediato da conta,
          sem direito a reembolso.
        </p>

        <h2 style={S.h2}>7. Disponibilidade do serviço</h2>
        <p style={S.p}>
          Buscamos manter o serviço disponível 24/7, mas não garantimos disponibilidade
          ininterrupta. Manutenções programadas serão comunicadas com antecedência.
          Não nos responsabilizamos por perdas decorrentes de indisponibilidade temporária.
        </p>

        <h2 style={S.h2}>8. Seus dados</h2>
        <p style={S.p}>
          Você é o titular dos dados financeiros que insere no app. Não reivindicamos
          propriedade sobre seu conteúdo. Veja nossa{' '}
          <Link to="/privacidade" style={S.link}>Política de Privacidade</Link>{' '}
          para detalhes sobre coleta, uso e exclusão de dados.
        </p>

        <h2 style={S.h2}>9. Propriedade intelectual</h2>
        <p style={S.p}>
          A marca, design, código e funcionalidades do FinançasPro são de propriedade
          exclusiva do serviço. Você recebe uma licença de uso pessoal, não exclusiva
          e intransferível, pelo período da assinatura.
        </p>

        <h2 style={S.h2}>10. Limitação de responsabilidade</h2>
        <p style={S.p}>
          O FinançasPro não se responsabiliza por decisões financeiras tomadas com base
          nas informações exibidas no app. Os dados mostrados são aqueles que você mesmo
          inseriu. Verifique sempre suas informações com fontes oficiais (extratos bancários,
          notas fiscais, etc.).
        </p>

        <h2 style={S.h2}>11. Alterações nos termos</h2>
        <p style={S.p}>
          Podemos atualizar estes termos periodicamente. Mudanças significativas serão
          comunicadas por e-mail com 15 dias de antecedência. O uso contínuo após a
          data de vigência implica aceitação dos novos termos.
        </p>

        <h2 style={S.h2}>12. Legislação aplicável</h2>
        <p style={S.p}>
          Estes termos são regidos pela legislação brasileira — incluindo o Código de
          Defesa do Consumidor (Lei 8.078/1990) e a LGPD (Lei 13.709/2018). Fica eleito
          o foro da comarca de São Paulo/SP para resolução de disputas.
        </p>

        <hr style={S.divider} />

        <h2 style={{ ...S.h2, marginTop: 0 }}>Contato</h2>
        <div style={S.box}>
          <p style={{ fontSize: 14, color: 'var(--t2)', marginBottom: 4 }}>
            Dúvidas sobre estes termos ou sobre o serviço:
          </p>
          <p style={{ fontSize: 14, color: 'var(--t2)', marginBottom: 0 }}>
            <strong>E-mail:</strong>{' '}
            <a href="mailto:contato@financaspro.com.br" style={S.link}>
              contato@financaspro.com.br
            </a>
          </p>
        </div>

        <p style={{ ...S.p, marginTop: 24, fontSize: 12, color: 'var(--t3)' }}>
          <Link to="/privacidade" style={S.link}>Política de Privacidade</Link>
          {' · '}
          <Link to="/" style={S.link}>Voltar ao app</Link>
        </p>
      </div>
    </div>
  )
}
