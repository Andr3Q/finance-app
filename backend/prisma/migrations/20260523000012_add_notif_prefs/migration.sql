ALTER TABLE "User" ADD COLUMN "notifBudgetAlert"     BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "notifBudgetReminder"  BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "budgetAlertMonth"     INTEGER;
ALTER TABLE "User" ADD COLUMN "budgetAlertYear"      INTEGER;
ALTER TABLE "User" ADD COLUMN "budgetReminderSentAt" TIMESTAMP(3);
