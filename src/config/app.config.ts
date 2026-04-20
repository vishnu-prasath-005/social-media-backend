import { registerAs } from "@nestjs/config";

export default registerAs("app", () => ({
  env: process.env.NODE_ENV ?? "production",
  port: parseInt(process.env.PORT ?? "3001", 10),
  prefix: process.env.API_PREFIX ?? "api/v1",
  corsOrigin:
    process.env.CORS_ORIGIN ??
    "https://social-media-frontend-production-b374.up.railway.app",
  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL ?? "60", 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? "100", 10),
  },
}));
