import { describe, it, expect } from "vitest";
import request from "supertest";
import { useTestApp, signUp, tokenFromEmail, PASSWORD } from "./helpers.js";
import User from "../models/User.js";
import Mood from "../models/Mood.js";
import JournalEntry from "../models/JournalEntry.js";
import SafetyPlan from "../models/SafetyPlan.js";
import ForumPost from "../models/ForumPost.js";

const app = useTestApp();

describe("profile", () => {
  it("updates the profile (the bug where saving hit a missing route)", async () => {
    const alice = await signUp(app, "alice");
    const res = await request(app)
      .put("/api/me")
      .set(alice.auth)
      .send({ username: "alice", email: "alice@example.com", contact: "9800000000", address: "Patan", dob: "1999-05-01" })
      .expect(200);
    expect(res.body.user).toMatchObject({ contact: "9800000000", address: "Patan" });

    const cleared = await request(app)
      .put("/api/me")
      .set(alice.auth)
      .send({ username: "alice", email: "alice@example.com", contact: "", address: "" })
      .expect(200);
    expect(cleared.body.user.contact).toBeUndefined();
  });

  it("requires re-verification when the email changes", async () => {
    const alice = await signUp(app, "alice");
    await request(app).post("/api/auth/verify-email").send({ token: tokenFromEmail("alice@example.com") });
    const res = await request(app)
      .put("/api/me")
      .set(alice.auth)
      .send({ username: "alice", email: "new@example.com" })
      .expect(200);
    expect(res.body.user.emailVerified).toBe(false);
    expect(tokenFromEmail("new@example.com")).toBeTruthy();
  });

  it("refuses a username that's taken", async () => {
    const alice = await signUp(app, "alice");
    await signUp(app, "bob");
    await request(app).put("/api/me").set(alice.auth).send({ username: "bob", email: "alice@example.com" }).expect(409);
  });

  it("updates language and reminder preferences", async () => {
    const alice = await signUp(app, "alice");
    const res = await request(app)
      .put("/api/me/preferences")
      .set(alice.auth)
      .send({ language: "ne", reminders: { enabled: true, hour: 21 } })
      .expect(200);
    expect(res.body.user.preferences).toEqual({ language: "ne", reminders: { enabled: true, hour: 21 } });
  });
});

describe("password change", () => {
  it("checks the current password, signs out other sessions and returns a new token", async () => {
    const alice = await signUp(app, "alice");
    await request(app)
      .put("/api/me/password")
      .set(alice.auth)
      .send({ currentPassword: "wrong", newPassword: "new-password-123" })
      .expect(400);

    const res = await request(app)
      .put("/api/me/password")
      .set(alice.auth)
      .send({ currentPassword: PASSWORD, newPassword: "new-password-123" })
      .expect(200);

    await request(app).get("/api/me").set(alice.auth).expect(401);
    await request(app).get("/api/me").set("Authorization", `Bearer ${res.body.token}`).expect(200);
  });
});

describe("journal", () => {
  it("creates, edits and deletes private entries", async () => {
    const alice = await signUp(app, "alice");
    const created = await request(app)
      .post("/api/journal")
      .set(alice.auth)
      .send({ title: "Monday", content: "Felt anxious before the exam", mood: "Anxious" })
      .expect(201);
    const id = created.body.entry._id;

    await request(app).put(`/api/journal/${id}`).set(alice.auth).send({ content: "Exam went fine" }).expect(200);
    const list = await request(app).get("/api/journal").set(alice.auth).expect(200);
    expect(list.body.entries[0]).toMatchObject({ title: "", content: "Exam went fine", mood: null, kind: "entry" });

    const record = await request(app)
      .post("/api/journal")
      .set(alice.auth)
      .send({ kind: "thought-record", content: "Situation: exam. Balanced thought: I prepared" })
      .expect(201);
    expect(record.body.entry.kind).toBe("thought-record");
    await request(app).post("/api/journal").set(alice.auth).send({ kind: "diary", content: "x" }).expect(400);
    await request(app).delete(`/api/journal/${record.body.entry._id}`).set(alice.auth).expect(204);

    await request(app).delete(`/api/journal/${id}`).set(alice.auth).expect(204);
    expect(await JournalEntry.countDocuments()).toBe(0);
  });

  it("keeps entries private to their owner", async () => {
    const alice = await signUp(app, "alice");
    const bob = await signUp(app, "bob");
    const id = (await request(app).post("/api/journal").set(alice.auth).send({ content: "private" })).body.entry._id;

    expect((await request(app).get("/api/journal").set(bob.auth)).body.entries).toHaveLength(0);
    await request(app).put(`/api/journal/${id}`).set(bob.auth).send({ content: "hacked" }).expect(404);
    await request(app).delete(`/api/journal/${id}`).set(bob.auth).expect(404);
  });

  it("encrypts entries at rest", async () => {
    const alice = await signUp(app, "alice");
    await request(app).post("/api/journal").set(alice.auth).send({ title: "Dear diary", content: "my secret" });
    const raw = await JournalEntry.collection.findOne({});
    expect(raw.title).not.toContain("diary");
    expect(raw.content).not.toContain("secret");
  });
});

describe("safety plan", () => {
  it("starts empty, saves, and is encrypted at rest", async () => {
    const alice = await signUp(app, "alice");
    const empty = await request(app).get("/api/safety-plan").set(alice.auth).expect(200);
    expect(empty.body.plan.warningSigns).toEqual([]);

    const plan = {
      warningSigns: ["Not sleeping"],
      copingStrategies: ["Box breathing"],
      supportContacts: [{ name: "Didi", phone: "9800000001" }],
    };
    await request(app).put("/api/safety-plan").set(alice.auth).send(plan).expect(200);
    const saved = await request(app).get("/api/safety-plan").set(alice.auth).expect(200);
    expect(saved.body.plan).toMatchObject(plan);
    expect(saved.body.plan.reasonsToLive).toEqual([]);

    const raw = await SafetyPlan.collection.findOne({});
    expect(raw.data).not.toContain("Didi");
  });
});

describe("data export and account deletion", () => {
  it("exports everything, decrypted", async () => {
    const alice = await signUp(app, "alice");
    await request(app).post("/api/mood").set(alice.auth).send({ mood: "Happy", note: "good day" });
    await request(app).post("/api/journal").set(alice.auth).send({ content: "dear diary" });
    await request(app).put("/api/safety-plan").set(alice.auth).send({ reasonsToLive: ["my cat"] });
    await request(app).post("/api/forum").set(alice.auth).send({ content: "hello forum" });

    const res = await request(app).get("/api/me/export").set(alice.auth).expect(200);
    expect(res.headers["content-disposition"]).toContain("attachment");
    expect(res.body.moods[0].note).toBe("good day");
    expect(res.body.journal[0].content).toBe("dear diary");
    expect(res.body.safetyPlan.reasonsToLive).toEqual(["my cat"]);
    expect(res.body.forumPosts[0].content).toBe("hello forum");
    expect(res.body.profile).not.toHaveProperty("password");
  });

  it("deletes the account and all personal data after confirming the password", async () => {
    const alice = await signUp(app, "alice");
    const bob = await signUp(app, "bob");
    const bobPost = (await request(app).post("/api/forum").set(bob.auth).send({ content: "bob's post" })).body.post;
    await request(app).post(`/api/forum/${bobPost._id}/comments`).set(alice.auth).send({ text: "alice was here" });
    await request(app).post(`/api/forum/${bobPost._id}/like`).set(alice.auth);
    await request(app).post("/api/mood").set(alice.auth).send({ mood: "Okay" });
    await request(app).post("/api/journal").set(alice.auth).send({ content: "x" });
    await request(app).post("/api/forum").set(alice.auth).send({ content: "alice's post" });

    await request(app).delete("/api/me").set(alice.auth).send({ password: "wrong" }).expect(400);
    await request(app).delete("/api/me").set(alice.auth).send({ password: PASSWORD }).expect(204);

    expect(await User.exists({ username: "alice" })).toBeNull();
    expect(await Mood.countDocuments()).toBe(0);
    expect(await JournalEntry.countDocuments()).toBe(0);
    const remaining = await ForumPost.find();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].comments).toHaveLength(0);
    expect(remaining[0].likes).toHaveLength(0);
  });
});
