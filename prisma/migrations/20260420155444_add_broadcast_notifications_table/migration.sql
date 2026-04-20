-- CreateTable
-- The NEW_POST enum value was added in the previous migration (committed separately
-- to satisfy PostgreSQL's requirement that new enum values be committed before use).
CREATE TABLE "broadcast_notifications" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL DEFAULT 'NEW_POST',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "broadcast_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "broadcast_notifications_created_at_idx" ON "broadcast_notifications"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "broadcast_notifications" ADD CONSTRAINT "broadcast_notifications_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcast_notifications" ADD CONSTRAINT "broadcast_notifications_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
