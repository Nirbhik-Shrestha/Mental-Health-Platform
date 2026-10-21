import "dotenv/config";

const required = ["MONGO_URI", "JWT_SECRET", "DATA_ENCRYPTION_KEY"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  throw new Error(`Missing required environment variables: ${missing.join(", ")} (see .env.example)`);
}

const generateHint =
  "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"";

if (process.env.JWT_SECRET.length < 32) {
  throw new Error(`JWT_SECRET must be at least 32 characters. ${generateHint}`);
}

if (!/^[0-9a-f]{64}$/i.test(process.env.DATA_ENCRYPTION_KEY)) {
  throw new Error(`DATA_ENCRYPTION_KEY must be 64 hex characters (32 bytes). ${generateHint}`);
}

const clientOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1d",
  clientOrigins,
  appUrl: (process.env.APP_URL || clientOrigins[0]).replace(/\/$/, ""),
  trustProxy: process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) : false,
  encryptionKey: Buffer.from(process.env.DATA_ENCRYPTION_KEY, "hex"),
  remindersEnabled: process.env.REMINDERS_ENABLED !== "false",
  requireAdmin2fa: process.env.REQUIRE_ADMIN_2FA === "true",
  linkCheckEnabled: process.env.LINK_CHECK_ENABLED !== "false",
  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
    subject: process.env.VAPID_SUBJECT || "mailto:admin@aashraya.local",
  },
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.MAIL_FROM || "Aashraya <no-reply@aashraya.local>",
  },
};

export const isTest = env.nodeEnv === "test";
export const isProduction = env.nodeEnv === "production";
