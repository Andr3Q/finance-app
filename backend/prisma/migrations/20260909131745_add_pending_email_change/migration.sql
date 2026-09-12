-- AlterTable
ALTER TABLE "User" ADD COLUMN     "pendingEmail" TEXT,
ADD COLUMN     "pendingEmailExpiry" TIMESTAMP(3),
ADD COLUMN     "pendingEmailToken" TEXT;

-- CreateIndex
CREATE INDEX "User_pendingEmailToken_idx" ON "User"("pendingEmailToken");
