-- Habilita RLS nas tabelas principais que faltavam.
-- O backend conecta como superuser (bypassa RLS automaticamente).
-- O objetivo é bloquear acesso direto via PostgREST/Supabase REST API
-- por roles anon/authenticated sem políticas explícitas.
-- Sem policies = deny-by-default para qualquer role não-superuser.

ALTER TABLE "public"."User"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Transaction"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Budget"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Goal"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."CategoryLimit" ENABLE ROW LEVEL SECURITY;
