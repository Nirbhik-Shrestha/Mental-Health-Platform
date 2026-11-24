import { describe, it, expect } from "vitest";
import request from "supertest";
import { useTestApp, signUp } from "./helpers.js";
import Center from "../models/centerModel.js";
import Blog from "../models/Blog.js";

const app = useTestApp();

const seedCenters = () =>
  Center.insertMany([
    { name: "Patan Wellbeing", location: "Jhamsikhel, Lalitpur", services: ["Counseling"], languages: ["Nepali", "English"], internship: true },
    { name: "Valley Therapy", location: "Kathmandu (Online-focused)", services: ["Psychotherapy", "Group therapy"], languages: ["Nepali"] },
    { name: "Bhaktapur Mind Care", location: "Bhaktapur", services: ["Psychiatry"], languages: ["Newari", "Nepali"] },
  ]);

describe("center directory", () => {
  it("is public and searches names, locations and services", async () => {
    await seedCenters();
    const all = await request(app).get("/api/centers").expect(200);
    expect(all.body.centers).toHaveLength(3);

    const byService = await request(app).get("/api/centers?q=therapy");
    expect(byService.body.centers.map((c) => c.name)).toEqual(["Valley Therapy"]);

    const byLocation = await request(app).get("/api/centers?q=lalit");
    expect(byLocation.body.centers.map((c) => c.name)).toEqual(["Patan Wellbeing"]);
  });

  it("filters by language, location and internships", async () => {
    await seedCenters();
    expect((await request(app).get("/api/centers?language=newari")).body.centers).toHaveLength(1);
    expect((await request(app).get("/api/centers?location=Kathmandu")).body.centers).toHaveLength(1);
    expect((await request(app).get("/api/centers?internship=true")).body.centers).toHaveLength(1);
  });

  it("treats search text literally", async () => {
    await seedCenters();
    expect((await request(app).get("/api/centers?q=.*")).body.centers).toHaveLength(0);
  });

  it("lists filter options", async () => {
    await seedCenters();
    const res = await request(app).get("/api/centers/filters").expect(200);
    expect(res.body.languages).toEqual(["English", "Nepali", "Newari"]);
    expect(res.body.locations).toEqual(["Bhaktapur", "Kathmandu", "Lalitpur"]);
  });

  it("returns 404 (not a hang or 500) for bad ids", async () => {
    await request(app).get("/api/centers/not-an-id").expect(404);
    await request(app).get("/api/centers/507f1f77bcf86cd799439011").expect(404);
  });

  it("only lets admins manage centers", async () => {
    const alice = await signUp(app, "alice");
    const admin = await signUp(app, "admin", { role: "admin" });
    const center = { name: "New Center", location: "Pokhara", coordinates: { lat: 28.2, lng: 83.98 } };

    await request(app).post("/api/centers").send(center).expect(401);
    await request(app).post("/api/centers").set(alice.auth).send(center).expect(403);
    const created = await request(app).post("/api/centers").set(admin.auth).send(center).expect(201);
    const id = created.body.center._id;

    const updated = await request(app).put(`/api/centers/${id}`).set(admin.auth).send({ name: "Renamed" }).expect(200);
    expect(updated.body.center.name).toBe("Renamed");
    expect(updated.body.center.location).toBeUndefined();

    await request(app).delete(`/api/centers/${id}`).set(alice.auth).expect(403);
    await request(app).delete(`/api/centers/${id}`).set(admin.auth).expect(204);
  });

  it("validates website URLs", async () => {
    const admin = await signUp(app, "admin", { role: "admin" });
    await request(app).post("/api/centers").set(admin.auth).send({ name: "X Center", website: "not a url" }).expect(400);
  });
});

describe("blogs", () => {
  const article = { title: "Coping with exam stress", content: "Exams are stressful. Here are a few things that help." };

  it("is public and hides drafts", async () => {
    const counselor = await signUp(app, "counselor", { role: "counselor" });
    await request(app).post("/api/blogs").set(counselor.auth).send(article).expect(201);
    const draft = await request(app)
      .post("/api/blogs")
      .set(counselor.auth)
      .send({ ...article, title: "Draft", published: false })
      .expect(201);

    const res = await request(app).get("/api/blogs").expect(200);
    expect(res.body.blogs.map((b) => b.title)).toEqual([article.title]);
    expect(res.body.blogs[0].author.username).toBe("counselor");
    await request(app).get(`/api/blogs/${draft.body.blog._id}`).expect(404);

    const manage = await request(app).get("/api/blogs/manage").set(counselor.auth).expect(200);
    expect(manage.body.blogs).toHaveLength(2);
  });

  it("lets counselors and admins write, but only edit their own (admins edit all)", async () => {
    const alice = await signUp(app, "alice");
    const c1 = await signUp(app, "writer1", { role: "counselor" });
    const c2 = await signUp(app, "writer2", { role: "counselor" });
    const admin = await signUp(app, "admin", { role: "admin" });

    await request(app).post("/api/blogs").set(alice.auth).send(article).expect(403);
    const id = (await request(app).post("/api/blogs").set(c1.auth).send(article)).body.blog._id;

    await request(app).put(`/api/blogs/${id}`).set(c2.auth).send(article).expect(403);
    await request(app).put(`/api/blogs/${id}`).set(admin.auth).send({ ...article, title: "Edited by admin" }).expect(200);
    await request(app).delete(`/api/blogs/${id}`).set(c2.auth).expect(403);
    await request(app).delete(`/api/blogs/${id}`).set(c1.auth).expect(204);
    expect(await Blog.countDocuments()).toBe(0);
  });
});
