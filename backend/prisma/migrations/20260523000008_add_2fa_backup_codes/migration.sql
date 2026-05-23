CREATE TABLE "two_factor_backup_codes" (
  "id"        TEXT NOT NULL,
  "codeHash"  TEXT NOT NULL,
  "usedAt"    TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userId"    TEXT NOT NULL,
  CONSTRAINT "two_factor_backup_codes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "two_factor_backup_codes_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "two_factor_backup_codes_userId_idx" ON "two_factor_backup_codes"("userId");
