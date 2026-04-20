import { registerAs } from "@nestjs/config";

export default registerAs("jwt", () => {
  console.log("JWT_ACCESS_SECRET exists:", !!process.env.JWT_ACCESS_SECRET);
  return {
    accessSecret:
      process.env.JWT_ACCESS_SECRET ??
      "change_me_access_secret_minimum_32_chars",
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? "15m",
    refreshSecret:
      process.env.JWT_REFRESH_SECRET ??
      "change_me_refresh_secret_minimum_32_chars",
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? "7d",
  };
});
