-- Rastreamento atômico de recompensa de indicação (achado de auditoria de
-- segurança, 2026-10-21): antes, a contagem do teto de 5 recompensas e o
-- crédito de dias ao indicador não eram atômicos, permitindo que requisições
-- concorrentes (reprocessar o mesmo token de verificação, ou vários indicados
-- verificando ao mesmo tempo) multiplicassem a recompensa muito além do
-- pretendido.
ALTER TABLE "User" ADD COLUMN "referralRewardedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "referralRewardsGiven" INTEGER NOT NULL DEFAULT 0;
