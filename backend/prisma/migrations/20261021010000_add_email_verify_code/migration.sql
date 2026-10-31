-- Verificação de e-mail por código de 6 dígitos (tela "Confirme seu e-mail",
-- Nancy 2), alternativa ao link existente (emailVerifyToken/emailVerifyExpiry)
-- pro mesmo evento. Expira em 15min (não 24h como o link) e conta tentativas
-- erradas — 6 dígitos tem entropia baixa (1 em 1M), não dá pra confiar só no
-- rate limit por IP contra brute-force.
ALTER TABLE "User" ADD COLUMN "emailVerifyCode" TEXT;
ALTER TABLE "User" ADD COLUMN "emailVerifyCodeExpiry" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "emailVerifyCodeAttempts" INTEGER NOT NULL DEFAULT 0;
