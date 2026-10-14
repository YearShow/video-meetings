-- CreateTable
CREATE TABLE "meeting_participants" (
    "id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,

    CONSTRAINT "meeting_participants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meeting_participants_user_id_idx" ON "meeting_participants"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_participants_meeting_id_user_id_key" ON "meeting_participants"("meeting_id", "user_id");

-- AddForeignKey
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Перенос данных: старые participants содержали email. Участники без аккаунта
-- (нет пользователя с таким email) не переносятся и удаляются вместе с колонкой.
-- gen_random_uuid() даёт UUID v4: id строки нигде не интерпретируется.
INSERT INTO "meeting_participants" ("id", "meeting_id", "user_id", "email")
SELECT DISTINCT ON (m."id", u."id") gen_random_uuid()::text, m."id", u."id", u."email"
FROM "meetings" m
CROSS JOIN LATERAL unnest(m."participants") AS p(email)
JOIN "users" u ON u."email" = lower(btrim(p.email))
ORDER BY m."id", u."id";

-- AlterTable
ALTER TABLE "meetings" DROP COLUMN "participants";
