import { Link } from 'react-router-dom'
import LegalPage from '../components/ui/LegalPage.jsx'

// Termos de Uso (Nancy 2, tela 34). O print mostra um resumo de 5 itens; aqui fica o texto jurídico completo e vigente
// (versão 1.0, 22/05/2026) no visual novo. Trocar o texto é decisão jurídica, não de tela.
const footer = (
  <>
    <p className="lg-foot-line">Dúvidas: <a href="mailto:contato@nancy.com.br" className="lg-link">contato@nancy.com.br</a></p>
    <p className="lg-foot-line"><Link to="/privacidade" className="lg-link">Política de Privacidade</Link></p>
  </>
)

export default function TermsOfUse() {
  return (
    <LegalPage title="Termos de Uso" subtitle="Atualizado em mai/2026" footer={footer}>
      <p className="lg-meta">Última atualização: 22 de maio de 2026 · Versão 1.0 · Aplicável a todos os planos</p>
        <p className="lg-p">
          Ao criar uma conta ou usar o <strong>Nancy</strong>, você concorda com
          estes Termos de Uso. Leia com atenção — eles formam um contrato entre você e
          o Nancy. Se não concordar, não utilize o serviço.
        </p>

        <h2 className="lg-h">1. O que é o Nancy</h2>
        <p className="lg-p">
          O Nancy é uma plataforma de controle financeiro pessoal que permite
          registrar transações, criar orçamentos, acompanhar metas e gerar relatórios
          financeiros. O serviço é prestado como SaaS (Software como Serviço) via
          acesso web.
        </p>
        <div className="lg-warn">
          <strong>Importante:</strong> O Nancy é uma ferramenta de organização
          pessoal. Não somos uma instituição financeira, banco, corretora ou gestora
          de investimentos. Não movimentamos, captamos nem gerimos dinheiro de terceiros.
          As informações do app não constituem assessoria financeira ou de investimentos.
        </div>

        <h2 className="lg-h">2. Cadastro e responsabilidades da conta</h2>
        <ul className="lg-ul">
          <li className="lg-li">Você deve ter pelo menos 18 anos para criar uma conta</li>
          <li className="lg-li">Forneça informações verdadeiras no cadastro — especialmente e-mail e nome</li>
          <li className="lg-li">Você é responsável pela segurança da sua senha — não a compartilhe</li>
          <li className="lg-li">Cada pessoa deve ter sua própria conta — não é permitido compartilhar acesso</li>
          <li className="lg-li">Notifique-nos imediatamente em caso de acesso não autorizado à sua conta</li>
        </ul>

        <h2 className="lg-h">3. Planos e preços</h2>
        <div className="lg-box">
          <ul className="lg-ul lg-ul-flush">
            <li className="lg-li"><strong>Grátis:</strong> acesso básico sem cobrança, sujeito a limites de uso</li>
            <li className="lg-li"><strong>Pro:</strong> R$ 9,90/mês ou R$ 99,00/ano — funcionalidades avançadas</li>
            <li className="lg-li"><strong>Elite:</strong> R$ 34,90/mês ou R$ 334,80/ano — acesso completo incluindo IA</li>
          </ul>
        </div>
        <p className="lg-p">
          Os preços podem ser alterados com aviso prévio de 30 dias por e-mail.
          Cobranças já realizadas não são afetadas pela alteração de preço.
        </p>

        <h2 className="lg-h">4. Pagamentos e renovação</h2>
        <ul className="lg-ul">
          <li className="lg-li">Pagamentos são processados pelo <strong>Mercado Pago</strong>, sujeitos à política deles</li>
          <li className="lg-li">Cada pagamento libera o plano por um período: 31 dias no mensal e 366 dias no anual</li>
          <li className="lg-li">Os planos <strong>não renovam automaticamente</strong>: ao fim do período pago a conta volta para o plano Grátis, a menos que você pague de novo</li>
          <li className="lg-li">Você receberá confirmação de cobrança por e-mail</li>
          <li className="lg-li">Se o pagamento não for aprovado, o plano não é ativado e a conta continua como está</li>
        </ul>

        <h2 className="lg-h">5. Cancelamento e reembolso</h2>
        <ul className="lg-ul">
          <li className="lg-li"><strong>Não renovar:</strong> como o plano não renova sozinho, não há nada a cancelar; se quiser registrar que não vai renovar, use o botão "Não renovar" em Perfil → Pagamentos, sem multa</li>
          <li className="lg-li"><strong>Fim do período:</strong> o acesso ao plano pago fica ativo até o fim do período já pago</li>
          <li className="lg-li"><strong>Reembolso:</strong> solicitações dentro de 7 dias da compra são analisadas caso a caso. Após 7 dias, não há reembolso proporcional</li>
          <li className="lg-li"><strong>Plano Grátis:</strong> sem cobrança, pode ser cancelado (excluindo conta) a qualquer momento</li>
        </ul>

        <h2 className="lg-h">6. Uso aceitável</h2>
        <p className="lg-p">É <strong>proibido</strong> usar o Nancy para:</p>
        <ul className="lg-ul">
          <li className="lg-li">Registrar transações fictícias com o objetivo de lavar dinheiro ou ocultar ativos</li>
          <li className="lg-li">Realizar ataques, tentativas de invasão ou engenharia reversa do sistema</li>
          <li className="lg-li">Criar contas em nome de terceiros sem autorização</li>
          <li className="lg-li">Qualquer atividade ilegal conforme a legislação brasileira</li>
        </ul>
        <p className="lg-p">
          O descumprimento destas regras pode resultar no encerramento imediato da conta,
          sem direito a reembolso.
        </p>

        <h2 className="lg-h">7. Disponibilidade do serviço</h2>
        <p className="lg-p">
          Buscamos manter o serviço disponível 24/7, mas não garantimos disponibilidade
          ininterrupta. Manutenções programadas serão comunicadas com antecedência.
          Não nos responsabilizamos por perdas decorrentes de indisponibilidade temporária.
        </p>

        <h2 className="lg-h">8. Seus dados</h2>
        <p className="lg-p">
          Você é o titular dos dados financeiros que insere no app. Não reivindicamos
          propriedade sobre seu conteúdo. Veja nossa{' '}
          <Link to="/privacidade" className="lg-link">Política de Privacidade</Link>{' '}
          para detalhes sobre coleta, uso e exclusão de dados.
        </p>

        <h2 className="lg-h">9. Propriedade intelectual</h2>
        <p className="lg-p">
          A marca, design, código e funcionalidades do Nancy são de propriedade
          exclusiva do serviço. Você recebe uma licença de uso pessoal, não exclusiva
          e intransferível, pelo período da assinatura.
        </p>

        <h2 className="lg-h">10. Limitação de responsabilidade</h2>
        <p className="lg-p">
          O Nancy não se responsabiliza por decisões financeiras tomadas com base
          nas informações exibidas no app. Os dados mostrados são aqueles que você mesmo
          inseriu. Verifique sempre suas informações com fontes oficiais (extratos bancários,
          notas fiscais, etc.).
        </p>

        <h2 className="lg-h">11. Alterações nos termos</h2>
        <p className="lg-p">
          Podemos atualizar estes termos periodicamente. Mudanças significativas serão
          comunicadas por e-mail com 15 dias de antecedência. O uso contínuo após a
          data de vigência implica aceitação dos novos termos.
        </p>

        <h2 className="lg-h">12. Legislação aplicável</h2>
        <p className="lg-p">
          Estes termos são regidos pela legislação brasileira — incluindo o Código de
          Defesa do Consumidor (Lei 8.078/1990) e a LGPD (Lei 13.709/2018). Fica eleito
          o foro da comarca de São Paulo/SP para resolução de disputas.
        </p>
    </LegalPage>
  )
}
