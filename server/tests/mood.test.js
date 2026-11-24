import { describe, it, expect } from "vitest";
import request from "supertest";
import { useTestApp, signUp } from "./helpers.js";
import Mood from "../models/Mood.js";
import { toDay, addDays, hourIn } from "../lib/dates.js";
import { currentStreak, longestStreak } from "../lib/moods.js";

const app = useTestApp();

const logPastMoods = (userId, moods) =>
  Mood.insertMany(moods.map((mood, i) => ({ userId, mood, day: addDays(toDay(), -(i + 1)) })));

describe("dates", () => {
  it("uses Nepal time (UTC+5:45) for calendar days", () => {
    expect(toDay(new Date("2025-01-01T18:14:00Z"))).toBe("2025-01-01");
    expect(toDay(new Date("2025-01-01T18:15:00Z"))).toBe("2025-01-02");
    expect(hourIn(new Date("2025-01-01T18:15:00Z"))).toBe(0);
  });

  it("adds days across month boundaries", () => {
    expect(addDays("2025-02-28", 1)).toBe("2025-03-01");
    expect(addDays("2025-01-01", -1)).toBe("2024-12-31");
  });
});

describe("streaks", () => {
  const today = "2025-06-10";
  it("counts back from today", () => {
    expect(currentStreak(["2025-06-10", "2025-06-09", "2025-06-08", "2025-06-06"], today)).toBe(3);
  });
  it("isn't broken until a full day is missed", () => {
    expect(currentStreak(["2025-06-09", "2025-06-08"], today)).toBe(2);
    expect(currentStreak(["2025-06-08"], today)).toBe(0);
  });
  it("finds the longest run", () => {
    expect(longestStreak(["2025-06-01", "2025-06-02", "2025-06-03", "2025-06-05", "2025-06-06"])).toBe(3);
    expect(longestStreak([])).toBe(0);
  });
});

describe("check-ins", () => {
  it("logs today's mood and updates it instead of duplicating", async () => {
    const alice = await signUp(app, "alice");
    let res = await request(app).post("/api/mood").set(alice.auth).send({ mood: "Sad" }).expect(201);
    expect(res.body).toMatchObject({ streak: 1, entry: { mood: "Sad", day: toDay() } });

    res = await request(app)
      .post("/api/mood")
      .set(alice.auth)
      .send({ mood: "Calm", tags: ["exercise", "exercise"], note: "Went for a run" })
      .expect(201);
    expect(res.body.entry).toMatchObject({ mood: "Calm", tags: ["exercise"], note: "Went for a run" });
    expect(await Mood.countDocuments()).toBe(1);

    const today = await request(app).get("/api/mood/today").set(alice.auth).expect(200);
    expect(today.body.entry.note).toBe("Went for a run");
  });

  it("encrypts notes at rest", async () => {
    const alice = await signUp(app, "alice");
    await request(app).post("/api/mood").set(alice.auth).send({ mood: "Okay", note: "secret thoughts" });
    const raw = await Mood.collection.findOne({});
    expect(raw.note).not.toContain("secret");
  });

  it("returns null when there's no check-in today", async () => {
    const alice = await signUp(app, "alice");
    const res = await request(app).get("/api/mood/today").set(alice.auth).expect(200);
    expect(res.body.entry).toBeNull();
  });

  it("rejects unknown moods and tags", async () => {
    const alice = await signUp(app, "alice");
    await request(app).post("/api/mood").set(alice.auth).send({ mood: "Meh" }).expect(400);
    await request(app).post("/api/mood").set(alice.auth).send({ mood: "Okay", tags: ["nope"] }).expect(400);
  });

  it("keeps each user's moods separate", async () => {
    const alice = await signUp(app, "alice");
    const bob = await signUp(app, "bob");
    await request(app).post("/api/mood").set(alice.auth).send({ mood: "Happy" });
    const res = await request(app).get("/api/mood/history").set(bob.auth).expect(200);
    expect(res.body.entries).toHaveLength(0);
  });

  it("serves the navbar streak", async () => {
    const alice = await signUp(app, "alice");
    await logPastMoods(alice.user._id, ["Okay", "Okay", "Okay"]);
    expect((await request(app).get("/api/streak").set(alice.auth)).body.streak).toBe(3);
    await request(app).post("/api/mood").set(alice.auth).send({ mood: "Happy" });
    expect((await request(app).get("/api/streak").set(alice.auth)).body.streak).toBe(4);
  });
});

describe("insights", () => {
  it("summarises moods, tags and streaks", async () => {
    const alice = await signUp(app, "alice");
    await Mood.insertMany([
      { userId: alice.user._id, mood: "Happy", day: addDays(toDay(), -1), tags: ["exercise"] },
      { userId: alice.user._id, mood: "Calm", day: addDays(toDay(), -2), tags: ["exercise", "sleep"] },
      { userId: alice.user._id, mood: "Sad", day: addDays(toDay(), -4), tags: ["work"] },
      { userId: alice.user._id, mood: "Sad", day: addDays(toDay(), -60) },
    ]);
    const res = await request(app).get("/api/mood/insights?days=30").set(alice.auth).expect(200);
    expect(res.body).toMatchObject({
      checkIns: 3,
      streak: 2,
      longestStreak: 2,
      totalDays: 4,
      distribution: { Happy: 1, Calm: 1, Sad: 1, Okay: 0 },
      average: Math.round(((5 + 4 + 1) / 3) * 100) / 100,
    });
    expect(res.body.trend.map((t) => t.mood)).toEqual(["Sad", "Calm", "Happy"]);
    expect(res.body.tags.find((t) => t.tag === "exercise")).toEqual({ tag: "exercise", count: 2, average: 4.5 });
  });

  it("suggests support after three negative check-ins in a row", async () => {
    const alice = await signUp(app, "alice");
    await logPastMoods(alice.user._id, ["Sad", "Anxious"]);
    let res = await request(app).get("/api/mood/insights").set(alice.auth);
    expect(res.body.support.needsSupport).toBe(false);

    res = await request(app).post("/api/mood").set(alice.auth).send({ mood: "Angry" });
    expect(res.body.support).toEqual({ needsSupport: true, reasons: ["moods"] });
  });
});
