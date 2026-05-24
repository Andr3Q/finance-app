-- Índices para detecção de brute-force por IP e por falhas consecutivas
CREATE INDEX IF NOT EXISTS "login_audits_success_createdAt_idx" ON "login_audits"("success", "createdAt");
CREATE INDEX IF NOT EXISTS "login_audits_ip_createdAt_idx" ON "login_audits"("ip", "createdAt");
