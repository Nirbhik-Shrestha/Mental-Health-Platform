import { beforeAll, afterAll, afterEach, inject } from "vitest";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import request from "supertest";
import { createApp } from "../app.js";
import User from "../models/User.js";
import { testOutbox } from "../lib/mailer.js";

export const PASSWORD = "correct-horse-battery";

/** Connects the test file to its own database on the shared in-memory MongoDB and returns the Express app. */
export function useTestApp() {
  const app = createApp();

  beforeAll(async () => {
    await mongoose.connect(inject("mongoUri"), { dbName: `test_${randomUUID()}` });
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  });

  afterEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
    testOutbox.length = 0;
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  return app;
}

/** Registers and logs in a user. Returns { user, token, auth } where auth is the header object. */
export async function signUp(app, username = "alice", { role = "user", ...fields } = {}) {
  await request(app)
    .post("/api/auth/register")
    .send({ username, email: `${username}@example.com`, password: PASSWORD, ...fields })
    .expect(201);
  if (role !== "user") await User.updateOne({ username }, { role });

  const res = await request(app).post("/api/auth/login").send({ username, password: PASSWORD }).expect(200);
  return { user: res.body.user, token: res.body.token, auth: { Authorization: `Bearer ${res.body.token}` } };
}

/** Pulls the ?token= value out of the most recent email to `to`. */
export function tokenFromEmail(to) {
  const mail = testOutbox.findLast((message) => message.to === to);
  return mail?.text.match(/token=([a-f0-9]+)/)?.[1];
}
