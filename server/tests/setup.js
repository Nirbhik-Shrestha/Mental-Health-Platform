// Runs before each test file, before config/env.js is imported.
process.env.NODE_ENV = "test";
process.env.MONGO_URI = "mongodb://set-by-test-helpers";
process.env.JWT_SECRET = "test-secret-test-secret-test-secret-1234";
process.env.DATA_ENCRYPTION_KEY = "0".repeat(64);
process.env.APP_URL = "http://app.test";
