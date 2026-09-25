-- AlterTable
ALTER TABLE "sales" ADD COLUMN "client_ref" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "sales_client_ref_key" ON "sales"("client_ref");
