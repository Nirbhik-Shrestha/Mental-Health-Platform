import { describe, it, expect } from "vitest";
import request from "supertest";
import { useTestApp, signUp } from "./helpers.js";
import User from "../models/User.js";
import Mood from "../models/Mood.js";
import ForumPost from "../models/ForumPost.js";
import { toDay } from "../lib/dates.js";

const app = useTestApp();

describe("admin access control", () => {
  it("blocks regular users from every admin endpoint", async () => {
    const { auth } = await signUp(app, "alice");
    const { user: bob } = await signUp(app, "bob");

    await request(app).get("/api/admin/users").set(auth).expect(403);
    await request(app).delete(`/api/admin/users/${bob._id}`).set(auth).expect(403);
    await request(app).patch(`/api/admin/users/${bob._id}/role`).set(auth).send({ role: "admin" }).expect(403);
    await request(app).get("/api/admin/moderation").set(auth).expect(403);
    await request(app).get("/api/admin/analytics").set(auth).expect(403);
    expect(await User.exists({ username: "bob" })).toBeTruthy();
  });

  it("requires login", async () => {
    await request(app).get("/api/admin/users").expect(401);
  });

  it("picks up role changes immediately, without a new login", async () => {
    const { auth } = await signUp(app, "alice", { role: "admin" });
    await request(app).get("/api/admin/users").set(auth).expect(200);
    await User.updateOne({ username: "alice" }, { role: "user" });
    await request(app).get("/api/admin/users").set(auth).expect(403);
  });
});

describe("user management", () => {
  it("lists users without secrets", async () => {
    const { auth } = await signUp(app, "admin", { role: "admin" });
    await signUp(app, "alice");
    const res = await request(app).get("/api/admin/users").set(auth).expect(200);
    expect(res.body.users.map((u) => u.username).sort()).toEqual(["admin", "alice"]);
    expect(JSON.stringify(res.body)).not.toMatch(/password|Token/);
  });

  it("deletes a user and their data", async () => {
    const { auth } = await signUp(app, "admin", { role: "admin" });
    const alice = await signUp(app, "alice");
    await request(app).post("/api/mood").set(alice.auth).send({ mood: "Happy" }).expect(201);
    await request(app).post("/api/forum").set(alice.auth).send({ content: "hello" }).expect(201);

    await request(app).delete(`/api/admin/users/${alice.user._id}`).set(auth).expect(204);
    expect(await User.exists({ username: "alice" })).toBeNull();
    expect(await Mood.countDocuments()).toBe(0);
    expect(await ForumPost.countDocuments()).toBe(0);
  });

  it("won't let an admin delete or demote themselves", async () => {
    const { auth, user } = await signUp(app, "admin", { role: "admin" });
    await request(app).delete(`/api/admin/users/${user._id}`).set(auth).expect(400);
    await request(app).patch(`/api/admin/users/${user._id}/role`).set(auth).send({ role: "user" }).expect(400);
  });

  it("changes roles", async () => {
    const { auth } = await signUp(app, "admin", { role: "admin" });
    const alice = await signUp(app, "alice");
    await request(app)
      .patch(`/api/admin/users/${alice.user._id}/role`)
      .set(auth)
      .send({ role: "counselor" })
      .expect(200);
    await request(app)
      .post("/api/blogs")
      .set(alice.auth)
      .send({ title: "Sleep and mood", content: "Sleep matters more than most people think." })
      .expect(201);
  });
});

describe("moderation", () => {
  it("queues risky posts and can hide them from the feed", async () => {
    const { auth } = await signUp(app, "admin", { role: "admin" });
    const alice = await signUp(app, "alice");
    const post = (
      await request(app).post("/api/forum").set(alice.auth).send({ content: "I want to die", anonymous: true })
    ).body.post;

    const queue = await request(app).get("/api/admin/moderation").set(auth).expect(200);
    expect(queue.body.posts).toHaveLength(1);
    // Admins can see who wrote an anonymous post, for safety follow-up.
    expect(queue.body.posts[0].author.username).toBe("alice");

    await request(app).patch(`/api/admin/moderation/${post._id}`).set(auth).send({ action: "hide" }).expect(200);
    expect((await request(app).get("/api/forum").set(alice.auth)).body.posts).toHaveLength(0);
    expect((await request(app).get("/api/admin/moderation").set(auth)).body.posts).toHaveLength(0);

    await request(app).patch(`/api/admin/moderation/${post._id}`).set(auth).send({ action: "restore" }).expect(200);
    expect((await request(app).get("/api/forum").set(alice.auth)).body.posts).toHaveLength(1);
  });
});

describe("analytics", () => {
  it("withholds daily averages for groups smaller than three", async () => {
    const { auth } = await signUp(app, "admin", { role: "admin" });
    const users = [await signUp(app, "user1"), await signUp(app, "user2")];
    for (const u of users) await request(app).post("/api/mood").set(u.auth).send({ mood: "Sad" });

    let res = await request(app).get("/api/admin/analytics").set(auth).expect(200);
    let todayRow = res.body.moods.trend.find((row) => row.day === toDay());
    expect(todayRow).toEqual({ day: toDay(), checkIns: 2, average: null });

    const third = await signUp(app, "user3");
    await request(app).post("/api/mood").set(third.auth).send({ mood: "Happy" });
    res = await request(app).get("/api/admin/analytics").set(auth).expect(200);
    todayRow = res.body.moods.trend.find((row) => row.day === toDay());
    expect(todayRow.average).toBeCloseTo((1 + 1 + 5) / 3, 2);
    expect(res.body.users).toMatchObject({ total: 4, activeLast7Days: 3 });
    expect(res.body.moods.trend).toHaveLength(30);
  });
});
