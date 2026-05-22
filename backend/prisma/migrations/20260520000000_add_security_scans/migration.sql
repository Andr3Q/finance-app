CREATE TABLE "security_scans" (
    "id"        TEXT        NOT NULL,
    "tool"      TEXT        NOT NULL,
    "status"    TEXT        NOT NULL,
    "vulnCount" INTEGER     NOT NULL DEFAULT 0,
    "details"   JSONB,
    "runAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "security_scans_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "security_scans_tool_runAt_idx" ON "security_scans"("tool", "runAt");
