-- AlterEnum
-- Must be applied in its own transaction before any table referencing the new value is created.
ALTER TYPE "NotificationType" ADD VALUE 'NEW_POST';
