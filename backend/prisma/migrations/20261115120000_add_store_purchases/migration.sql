-- Compra de plano pelas lojas (Google Play agora; Apple depois). Só ADICIONA: coluna anulável em "User" e uma tabela nova.
-- Nada muda para quem assina pelo site (Mercado Pago).

-- Quem cobra o plano de agora: 'mercadopago' | 'google_play' | 'apple' (null = trata-se como Mercado Pago).
ALTER TABLE "User" ADD COLUMN "planSource" TEXT;

CREATE TABLE "store_purchases" (
    "id"            TEXT         NOT NULL,
    "provider"      TEXT         NOT NULL,
    "purchaseToken" TEXT         NOT NULL,
    "productId"     TEXT         NOT NULL,
    "plan"          TEXT         NOT NULL,
    "period"        TEXT         NOT NULL,
    "state"         TEXT         NOT NULL,
    "autoRenewing"  BOOLEAN      NOT NULL DEFAULT false,
    "expiresAt"     TIMESTAMP(3),
    "acknowledged"  BOOLEAN      NOT NULL DEFAULT false,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    "userId"        TEXT         NOT NULL,

    CONSTRAINT "store_purchases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "store_purchases_provider_purchaseToken_key" ON "store_purchases"("provider", "purchaseToken");
CREATE INDEX "store_purchases_userId_idx" ON "store_purchases"("userId");

ALTER TABLE "store_purchases" ADD CONSTRAINT "store_purchases_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Toda tabela do app liga o RLS (a Data API do Supabase expõe o schema "public"); o backend conecta como dono e não é afetado.
ALTER TABLE "store_purchases" ENABLE ROW LEVEL SECURITY;
