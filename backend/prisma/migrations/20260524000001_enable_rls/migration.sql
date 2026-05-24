-- Enable RLS on internal/sensitive tables not protected by PostgREST
-- Backend connects via postgres superuser (bypasses RLS) — no impact on API behavior

ALTER TABLE "public"."InstallmentPlan"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."security_scans"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."processed_payments"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."login_audits"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."two_factor_backup_codes" ENABLE ROW LEVEL SECURITY;

-- No permissive policies added → PostgREST (anon/authenticated roles) denied by default
-- The backend uses the postgres superuser which bypasses RLS entirely
