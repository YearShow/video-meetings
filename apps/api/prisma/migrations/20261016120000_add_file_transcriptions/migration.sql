-- CreateEnum
CREATE TYPE "TranscriptionStatus" AS ENUM ('QUEUED', 'IN_PROGRESS', 'DONE', 'ERROR');

-- CreateTable
CREATE TABLE "file_transcriptions" (
    "id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "status" "TranscriptionStatus" NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "text" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "file_transcriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "file_transcriptions_file_id_key" ON "file_transcriptions"("file_id");

-- CreateIndex
CREATE INDEX "file_transcriptions_status_idx" ON "file_transcriptions"("status");

-- AddForeignKey
ALTER TABLE "file_transcriptions" ADD CONSTRAINT "file_transcriptions_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "meeting_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
