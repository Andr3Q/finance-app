-- Proteção anti-brute-force: conta falhas de login consecutivas por usuário.
-- failedLoginCount: zerado após login bem-sucedido, incrementado a cada falha.
-- accountLockedAt: preenchido quando atinge 10 falhas consecutivas.
ALTER TABLE "User" ADD COLUMN "failedLoginCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "accountLockedAt" TIMESTAMP(3);

-- Tabela de tokens de desbloqueio de conta.
-- Mesmo padrão do resetToken: apenas o SHA-256 vai para o banco, nunca o token puro.
CREATE TABLE "account_unlock_tokens" (
    "id"        TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt"    TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId"    TEXT NOT NULL,

    CONSTRAINT "account_unlock_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "account_unlock_tokens_tokenHash_key" ON "account_unlock_tokens"("tokenHash");
CREATE INDEX "account_unlock_tokens_userId_idx" ON "account_unlock_tokens"("userId");

ALTER TABLE "account_unlock_tokens" ADD CONSTRAINT "account_unlock_tokens_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
