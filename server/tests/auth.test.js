import { describe, it, expect } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { useTestApp, signUp, tokenFromEmail, PASSWORD } from "./helpers.js";
import User from "../models/User.js";
import { testOutbox } from "../lib/mailer.js";

const app = useTestApp();

describe("registration", () => {
  it("registers a user and never returns the password", async () => {
    const { user } = await signUp(app, "alice");
    expect(user.username).toBe("alice");
    expect(user.role).toBe("user");
    expect(user).not.toHaveProperty("password");
  });

  it("ignores a role sent by the client", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ username: "mallory", email: "m@example.com", password: PASSWORD, role: "admin" })
      .expect(201);
    expect((await User.findOne({ username: "mallory" })).role).toBe("user");
  });

  it("rejects a taken username or email", async () => {
    await signUp(app, "alice");
    await request(app)
      .post("/api/auth/register")
      .send({ username: "alice", email: "other@example.com", password: PASSWORD })
      .expect(409);
    await request(app)
      .post("/api/auth/register")
      .send({ username: "alice2", email: "ALICE@example.com", password: PASSWORD })
      .expect(409);
  });

  it("validates input with field-level details", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ username: "a", email: "nope", password: "short" })
      .expect(400);
    expect(res.body.details.map((d) => d.path).sort()).toEqual(["email", "password", "username"]);
  });

  it("treats empty optional fields as not provided", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ username: "bob", email: "bob@example.com", password: PASSWORD, contact: "", dob: "" })
      .expect(201);
  });
});

describe("login", () => {
  it("accepts username or email", async () => {
    await signUp(app, "alice");
    await request(app).post("/api/auth/login").send({ username: "alice@example.com", password: PASSWORD }).expect(200);
  });

  it("gives the same error for an unknown user and a wrong password", async () => {
    await signUp(app, "alice");
    const wrong = await request(app).post("/api/auth/login").send({ username: "alice", password: "wrong-password" });
    const unknown = await request(app).post("/api/auth/login").send({ username: "nobody", password: "wrong-password" });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error).toBe(unknown.body.error);
  });

  it("rate limits repeated failures for an account", async () => {
    await signUp(app, "victim");
    for (let i = 0; i < 10; i++) {
      await request(app).post("/api/auth/login").send({ username: "victim", password: "guess" }).expect(401);
    }
    await request(app).post("/api/auth/login").send({ username: "victim", password: PASSWORD }).expect(429);
  });
});

describe("sessions", () => {
  it("requires a valid token", async () => {
    await request(app).get("/api/auth/me").expect(401);
    await request(app).get("/api/auth/me").set("Authorization", "Bearer not-a-token").expect(401);
  });

  it("returns the current user from /api/auth/me", async () => {
    const { auth } = await signUp(app, "alice");
    const res = await request(app).get("/api/auth/me").set(auth).expect(200);
    expect(res.body.user.username).toBe("alice");
  });

  it("still accepts tokens issued by the previous version (id claim)", async () => {
    const { user } = await signUp(app, "alice");
    const legacy = jwt.sign({ id: user._id, role: "user" }, process.env.JWT_SECRET);
    await request(app).get("/api/auth/me").set("Authorization", `Bearer ${legacy}`).expect(200);
  });

  it("rejects tokens for deleted users", async () => {
    const { auth } = await signUp(app, "alice");
    await User.deleteMany({});
    await request(app).get("/api/auth/me").set(auth).expect(401);
  });
});

describe("email verification", () => {
  it("verifies with the emailed token, once", async () => {
    const { auth } = await signUp(app, "alice");
    const token = tokenFromEmail("alice@example.com");
    expect(token).toBeTruthy();

    await request(app).post("/api/auth/verify-email").send({ token }).expect(200);
    expect((await request(app).get("/api/auth/me").set(auth)).body.user.emailVerified).toBe(true);
    await request(app).post("/api/auth/verify-email").send({ token }).expect(400);
  });

  it("stores only a hash of the token", async () => {
    await signUp(app, "alice");
    const stored = await User.findOne({ username: "alice" }).select("+emailVerificationToken");
    expect(stored.emailVerificationToken).not.toBe(tokenFromEmail("alice@example.com"));
  });
});

describe("password reset", () => {
  it("resets the password and signs out old sessions", async () => {
    const { auth } = await signUp(app, "alice");
    await request(app).post("/api/auth/forgot-password").send({ email: "alice@example.com" }).expect(200);
    const token = tokenFromEmail("alice@example.com");

    await request(app).post("/api/auth/reset-password").send({ token, password: "a-brand-new-password" }).expect(200);

    await request(app).get("/api/auth/me").set(auth).expect(401);
    await request(app).post("/api/auth/login").send({ username: "alice", password: PASSWORD }).expect(401);
    await request(app)
      .post("/api/auth/login")
      .send({ username: "alice", password: "a-brand-new-password" })
      .expect(200);
    await request(app).post("/api/auth/reset-password").send({ token, password: "another-password" }).expect(400);
  });

  it("responds the same for unknown emails and sends nothing", async () => {
    const res = await request(app).post("/api/auth/forgot-password").send({ email: "ghost@example.com" }).expect(200);
    expect(res.body.message).toMatch(/if that email is registered/i);
    expect(testOutbox).toHaveLength(0);
  });

  it("rejects expired tokens", async () => {
    await signUp(app, "alice");
    await request(app).post("/api/auth/forgot-password").send({ email: "alice@example.com" });
    const token = tokenFromEmail("alice@example.com");
    await User.updateOne({ username: "alice" }, { passwordResetExpires: new Date(Date.now() - 1000) });
    await request(app).post("/api/auth/reset-password").send({ token, password: "a-brand-new-password" }).expect(400);
  });
});

describe("app", () => {
  it("sends security headers and JSON 404s", async () => {
    const res = await request(app).get("/api/does-not-exist").expect(404);
    expect(res.body).toEqual({ error: "Not found" });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});
