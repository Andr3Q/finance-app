-- Habilita RLS na tabela account_unlock_tokens.
-- Tabela criada após a migration rls_main_tables, por isso ficou de fora.
-- Sem policies = deny-by-default para roles anon/authenticated via PostgREST.
-- O backend acessa via superuser (Prisma + DATABASE_URL), que bypassa RLS.

ALTER TABLE "public"."account_unlock_tokens" ENABLE ROW LEVEL SECURITY;
