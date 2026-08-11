import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL must be configured');
    }

    super({
      adapter: new PrismaPg({ connectionString }),
      log:
        process.env.NODE_ENV === "development"
          ? ["query", "warn", "error"]
          : ["warn", "error"],
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  // Applies global soft-delete filter so isDeleted rows are never returned.
  // Call this once in main.ts after instantiation if using Prisma extensions.
  withSoftDelete() {
    return this.$extends({
      query: {
        post: {
          async findMany({ args, query }) {
            args.where = { ...args.where, isDeleted: false };
            return query(args);
          },
          async findFirst({ args, query }) {
            args.where = { ...args.where, isDeleted: false };
            return query(args);
          },
        },
        comment: {
          async findMany({ args, query }) {
            args.where = { ...args.where, isDeleted: false };
            return query(args);
          },
          async findFirst({ args, query }) {
            args.where = { ...args.where, isDeleted: false };
            return query(args);
          },
        },
      },
    });
  }
}
