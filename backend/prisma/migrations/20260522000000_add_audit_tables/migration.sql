-- processed_payments: deduplicação de webhooks do Mercado Pago
CREATE TABLE "processed_payments" (
    "id"          TEXT NOT NULL,
    "paymentId"   TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "plan"        TEXT NOT NULL,
    "period"      TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "processed_payments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "processed_payments_paymentId_key" ON "processed_payments"("paymentId");
CREATE INDEX "processed_payments_userId_idx" ON "processed_payments"("userId");

-- login_audits: log de tentativas de login para detecção de ataques e auditoria
CREATE TABLE "login_audits" (
    "id"        TEXT NOT NULL,
    "email"     TEXT NOT NULL,
    "success"   BOOLEAN NOT NULL,
    "ip"        TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "login_audits_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "login_audits_email_createdAt_idx" ON "login_audits"("email", "createdAt");
