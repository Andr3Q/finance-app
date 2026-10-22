-- Preferências de notificação (tela "Preferências", Nancy 2): salário, resumo em stories, dicas da Nancy IA
-- e relatório semanal por e-mail. Os três primeiros começam ligados (são avisos dentro do app, como já eram).
-- O relatório semanal por e-mail passa a ser uma escolha: quem já recebia (todo mundo, pelo disparo antigo
-- ao abrir o app) continua recebendo — as linhas existentes entram com true — e as contas novas começam
-- com false. Todas as colunas são sem reescrita da tabela (valor padrão constante).
ALTER TABLE "User" ADD COLUMN "notifSalary"  BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "notifStories" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "notifTips"    BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "notifWeeklyEmail" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ALTER COLUMN "notifWeeklyEmail" SET DEFAULT false;
