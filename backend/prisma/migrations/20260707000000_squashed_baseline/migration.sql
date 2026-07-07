-- ══════════════════════════════════════════════════════════════════════
-- Squashed baseline — substitui as 28 migrations anteriores
-- Representa o schema completo em 2026-07-07
-- Produção: já aplicado via `prisma migrate resolve --applied`
-- Staging:  aplicado do zero via `prisma migrate reset --force --skip-seed`
-- ══════════════════════════════════════════════════════════════════════

-- CreateTable
CREATE TABLE "User" (
    "id"                    TEXT            NOT NULL,
    "name"                  TEXT            NOT NULL,
    "email"                 TEXT            NOT NULL,
    "password"              TEXT            NOT NULL,
    "salary"                DECIMAL(19,4)   NOT NULL DEFAULT 0,
    "reportEmail"           TEXT,
    "createdAt"             TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "autoLaunchMonth"       INTEGER,
    "autoLaunchYear"        INTEGER,
    "resetToken"            TEXT,
    "resetTokenExpiry"      TIMESTAMP(3),
    "plan"                  TEXT            NOT NULL DEFAULT 'free',
    "planExpiresAt"         TIMESTAMP(3),
    "planPeriod"            TEXT            DEFAULT 'monthly',
    "trialEndsAt"           TIMESTAMP(3),
    "referralCode"          TEXT,
    "referredBy"            TEXT,
    "twoFactorSecret"       TEXT,
    "twoFactorEnabled"      BOOLEAN         NOT NULL DEFAULT false,
    "lastUsedTotpToken"     TEXT,
    "lastUsedTotpAt"        TIMESTAMP(3),
    "tokenVersion"          INTEGER         NOT NULL DEFAULT 0,
    "onboardingComplete"    BOOLEAN         NOT NULL DEFAULT false,
    "renewalReminderSent"   BOOLEAN         NOT NULL DEFAULT false,
    "trialReminderSent"     BOOLEAN         NOT NULL DEFAULT false,
    "weeklyDigestSentAt"    TIMESTAMP(3),
    "emailVerified"         BOOLEAN         NOT NULL DEFAULT false,
    "emailVerifyToken"      TEXT,
    "emailVerifyExpiry"     TIMESTAMP(3),
    "notifBudgetAlert"      BOOLEAN         NOT NULL DEFAULT true,
    "notifBudgetReminder"   BOOLEAN         NOT NULL DEFAULT true,
    "budgetAlertMonth"      INTEGER,
    "budgetAlertYear"       INTEGER,
    "budgetReminderSentAt"  TIMESTAMP(3),
    "failedLoginCount"      INTEGER         NOT NULL DEFAULT 0,
    "accountLockedAt"       TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id"          TEXT            NOT NULL,
    "description" TEXT            NOT NULL,
    "amount"      DECIMAL(19,4)   NOT NULL,
    "type"        TEXT            NOT NULL,
    "category"    TEXT            NOT NULL,
    "date"        TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived"    BOOLEAN         NOT NULL DEFAULT false,
    "month"       INTEGER         NOT NULL,
    "year"        INTEGER         NOT NULL,
    "userId"      TEXT            NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id"                TEXT            NOT NULL,
    "name"              TEXT            NOT NULL,
    "amount"            DECIMAL(19,4)   NOT NULL,
    "dueDay"            INTEGER,
    "endDate"           TIMESTAMP(3),
    "endDateNotifSent"  BOOLEAN         NOT NULL DEFAULT false,
    "userId"            TEXT            NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryLimit" (
    "id"       TEXT            NOT NULL,
    "category" TEXT            NOT NULL,
    "amount"   DECIMAL(19,4)   NOT NULL,
    "userId"   TEXT            NOT NULL,

    CONSTRAINT "CategoryLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "id"            TEXT            NOT NULL,
    "title"         TEXT            NOT NULL,
    "targetAmount"  DECIMAL(19,4)   NOT NULL,
    "currentAmount" DECIMAL(19,4)   NOT NULL DEFAULT 0,
    "color"         TEXT            NOT NULL DEFAULT '#4ac46e',
    "deadline"      TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId"        TEXT            NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id"        TEXT            NOT NULL,
    "endpoint"  TEXT            NOT NULL,
    "p256dh"    TEXT            NOT NULL,
    "auth"      TEXT            NOT NULL,
    "userId"    TEXT            NOT NULL,
    "createdAt" TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallmentPlan" (
    "id"                TEXT            NOT NULL,
    "name"              TEXT            NOT NULL,
    "totalInstallments" INTEGER         NOT NULL,
    "paidInstallments"  INTEGER         NOT NULL DEFAULT 0,
    "amount"            DECIMAL(19,4)   NOT NULL,
    "startMonth"        INTEGER         NOT NULL,
    "startYear"         INTEGER         NOT NULL,
    "lastTransactionId" TEXT,
    "createdAt"         TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId"            TEXT            NOT NULL,

    CONSTRAINT "InstallmentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "two_factor_backup_codes" (
    "id"        TEXT            NOT NULL,
    "codeHash"  TEXT            NOT NULL,
    "usedAt"    TIMESTAMP(3),
    "createdAt" TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId"    TEXT            NOT NULL,

    CONSTRAINT "two_factor_backup_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_payments" (
    "id"          TEXT            NOT NULL,
    "paymentId"   TEXT            NOT NULL,
    "userId"      TEXT            NOT NULL,
    "plan"        TEXT            NOT NULL,
    "period"      TEXT            NOT NULL,
    "processedAt" TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_unlock_tokens" (
    "id"        TEXT            NOT NULL,
    "tokenHash" TEXT            NOT NULL,
    "expiresAt" TIMESTAMP(3)    NOT NULL,
    "usedAt"    TIMESTAMP(3),
    "createdAt" TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId"    TEXT            NOT NULL,

    CONSTRAINT "account_unlock_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_audits" (
    "id"        TEXT            NOT NULL,
    "email"     TEXT            NOT NULL,
    "success"   BOOLEAN         NOT NULL,
    "ip"        TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable (não está no schema.prisma — gerenciada só via SQL)
CREATE TABLE "security_scans" (
    "id"        TEXT            NOT NULL,
    "tool"      TEXT            NOT NULL,
    "status"    TEXT            NOT NULL,
    "vulnCount" INTEGER         NOT NULL DEFAULT 0,
    "details"   JSONB,
    "runAt"     TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_scans_pkey" PRIMARY KEY ("id")
);

-- ── Indexes ──────────────────────────────────────────────────────────

CREATE UNIQUE INDEX "User_email_key"         ON "User"("email");
CREATE UNIQUE INDEX "User_referralCode_key"  ON "User"("referralCode");
CREATE INDEX "User_resetToken_idx"           ON "User"("resetToken");
CREATE INDEX "User_emailVerifyToken_idx"     ON "User"("emailVerifyToken");

CREATE INDEX "Transaction_userId_month_year_archived_idx" ON "Transaction"("userId", "month", "year", "archived");
CREATE INDEX "Transaction_userId_type_month_year_idx"     ON "Transaction"("userId", "type", "month", "year");

CREATE INDEX "Budget_userId_idx"             ON "Budget"("userId");

CREATE UNIQUE INDEX "CategoryLimit_userId_category_key" ON "CategoryLimit"("userId", "category");

CREATE INDEX "Goal_userId_idx"               ON "Goal"("userId");

CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX "PushSubscription_userId_idx"   ON "PushSubscription"("userId");

CREATE INDEX "InstallmentPlan_userId_idx"    ON "InstallmentPlan"("userId");

CREATE INDEX "two_factor_backup_codes_userId_idx" ON "two_factor_backup_codes"("userId");

CREATE UNIQUE INDEX "processed_payments_paymentId_key" ON "processed_payments"("paymentId");
CREATE INDEX "processed_payments_userId_idx" ON "processed_payments"("userId");

CREATE UNIQUE INDEX "account_unlock_tokens_tokenHash_key" ON "account_unlock_tokens"("tokenHash");
CREATE INDEX "account_unlock_tokens_userId_idx" ON "account_unlock_tokens"("userId");

CREATE INDEX "login_audits_email_createdAt_idx"   ON "login_audits"("email",   "createdAt");
CREATE INDEX "login_audits_success_createdAt_idx" ON "login_audits"("success", "createdAt");
CREATE INDEX "login_audits_ip_createdAt_idx"      ON "login_audits"("ip",      "createdAt");

CREATE INDEX "security_scans_tool_runAt_idx" ON "security_scans"("tool", "runAt");

-- ── Foreign Keys ─────────────────────────────────────────────────────

ALTER TABLE "Transaction"  ADD CONSTRAINT "Transaction_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Budget" ADD CONSTRAINT "Budget_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CategoryLimit" ADD CONSTRAINT "CategoryLimit_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Goal" ADD CONSTRAINT "Goal_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InstallmentPlan" ADD CONSTRAINT "InstallmentPlan_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "two_factor_backup_codes" ADD CONSTRAINT "two_factor_backup_codes_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "account_unlock_tokens" ADD CONSTRAINT "account_unlock_tokens_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Row Level Security ────────────────────────────────────────────────
-- Backend conecta via superuser (bypassa RLS). O objetivo é bloquear
-- acesso direto pelo PostgREST/Supabase REST API (roles anon/authenticated).

ALTER TABLE "public"."User"                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Transaction"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Budget"                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Goal"                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."CategoryLimit"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."InstallmentPlan"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."security_scans"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."processed_payments"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."login_audits"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."two_factor_backup_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."account_unlock_tokens"  ENABLE ROW LEVEL SECURITY;
