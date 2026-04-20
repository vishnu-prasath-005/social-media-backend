-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "media_urls" TEXT[] DEFAULT ARRAY[]::TEXT[];
