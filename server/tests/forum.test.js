import { describe, it, expect } from "vitest";
import request from "supertest";
import { useTestApp, signUp } from "./helpers.js";
import ForumPost from "../models/ForumPost.js";

const app = useTestApp();

const createPost = (user, body) =>
  request(app)
    .post("/api/forum")
    .set(user.auth)
    .send(typeof body === "string" ? { content: body } : body);

describe("posts", () => {
  it("creates a post with author and sentiment", async () => {
    const alice = await signUp(app, "alice");
    const res = await createPost(alice, "Had a lovely, peaceful walk today").expect(201);
    expect(res.body.post).toMatchObject({ author: { username: "alice" }, isMine: true, likeCount: 0 });
    expect((await ForumPost.findById(res.body.post._id)).sentiment).toBe("positive");
  });

  it("never reveals who wrote an anonymous post", async () => {
    const alice = await signUp(app, "alice");
    const bob = await signUp(app, "bob");
    await createPost(alice, { content: "Something personal", anonymous: true }).expect(201);

    const asBob = await request(app).get("/api/forum").set(bob.auth).expect(200);
    expect(asBob.body.posts[0]).toMatchObject({ anonymous: true, author: null, isMine: false });
    expect(JSON.stringify(asBob.body)).not.toContain(alice.user._id);

    const asAlice = await request(app).get("/api/forum").set(alice.auth);
    expect(asAlice.body.posts[0].isMine).toBe(true);
  });

  it("toggles likes", async () => {
    const alice = await signUp(app, "alice");
    const post = (await createPost(alice, "hi")).body.post;
    let res = await request(app).post(`/api/forum/${post._id}/like`).set(alice.auth).expect(200);
    expect(res.body.post).toMatchObject({ likeCount: 1, likedByMe: true });
    res = await request(app).post(`/api/forum/${post._id}/like`).set(alice.auth).expect(200);
    expect(res.body.post).toMatchObject({ likeCount: 0, likedByMe: false });
  });

  it("lets only the author or an admin delete", async () => {
    const alice = await signUp(app, "alice");
    const bob = await signUp(app, "bob");
    const admin = await signUp(app, "admin", { role: "admin" });
    const first = (await createPost(alice, "one")).body.post;
    const second = (await createPost(alice, "two")).body.post;

    await request(app).delete(`/api/forum/${first._id}`).set(bob.auth).expect(403);
    await request(app).delete(`/api/forum/${first._id}`).set(alice.auth).expect(204);
    await request(app).delete(`/api/forum/${second._id}`).set(admin.auth).expect(204);
    expect(await ForumPost.countDocuments()).toBe(0);
  });

  it("returns 404 for malformed and missing ids", async () => {
    const alice = await signUp(app, "alice");
    await request(app).post("/api/forum/not-an-id/like").set(alice.auth).expect(404);
    await request(app).delete("/api/forum/507f1f77bcf86cd799439011").set(alice.auth).expect(404);
  });

  it("paginates", async () => {
    const alice = await signUp(app, "alice");
    await ForumPost.insertMany(
      Array.from({ length: 25 }, (_, i) => ({ author: alice.user._id, content: `post ${i}` }))
    );
    const page1 = await request(app).get("/api/forum").set(alice.auth);
    const page2 = await request(app).get("/api/forum?page=2").set(alice.auth);
    expect(page1.body).toMatchObject({ hasMore: true });
    expect(page1.body.posts).toHaveLength(20);
    expect(page2.body).toMatchObject({ hasMore: false });
    expect(page2.body.posts).toHaveLength(5);
  });
});

describe("comments", () => {
  it("shows commenter names after reloading the feed", async () => {
    const alice = await signUp(app, "alice");
    const bob = await signUp(app, "bob");
    const post = (await createPost(alice, "hi")).body.post;
    await request(app).post(`/api/forum/${post._id}/comments`).set(bob.auth).send({ text: "hello!" }).expect(201);

    const feed = await request(app).get("/api/forum").set(alice.auth);
    expect(feed.body.posts[0].comments[0]).toMatchObject({ text: "hello!", author: { username: "bob" }, isMine: false });
  });

  it("supports anonymous comments and deletion by the commenter", async () => {
    const alice = await signUp(app, "alice");
    const bob = await signUp(app, "bob");
    const post = (await createPost(alice, "hi")).body.post;
    const res = await request(app)
      .post(`/api/forum/${post._id}/comments`)
      .set(bob.auth)
      .send({ text: "me too", anonymous: true });
    const comment = res.body.post.comments[0];
    expect(comment.author).toBeNull();

    await request(app).delete(`/api/forum/${post._id}/comments/${comment._id}`).set(alice.auth).expect(403);
    const after = await request(app).delete(`/api/forum/${post._id}/comments/${comment._id}`).set(bob.auth).expect(200);
    expect(after.body.post.comments).toHaveLength(0);
  });
});

describe("safety", () => {
  it("flags risk language and offers support to the writer", async () => {
    const alice = await signUp(app, "alice");
    const res = await createPost(alice, "I don't see the point, I want to end it all").expect(201);
    expect(res.body.support).toEqual({ needsSupport: true, reasons: ["risk"] });
    const stored = await ForumPost.findById(res.body.post._id);
    expect(stored).toMatchObject({ riskFlag: true, needsReview: true });
  });

  it("recognises Nepali phrases", async () => {
    const alice = await signUp(app, "alice");
    const res = await createPost(alice, "मलाई बाँच्न मन छैन").expect(201);
    expect(res.body.support.reasons).toEqual(["risk"]);
  });

  it("offers support after a run of negative posts", async () => {
    const alice = await signUp(app, "alice");
    await createPost(alice, "I feel terrible and sad");
    const second = await createPost(alice, "Everything is awful and I hate it");
    expect(second.body.support).toBeUndefined();
    const third = await createPost(alice, "Another horrible, miserable day");
    expect(third.body.support).toEqual({ needsSupport: true, reasons: ["posts"] });
  });

  it("queues reported posts, one report per user", async () => {
    const alice = await signUp(app, "alice");
    const bob = await signUp(app, "bob");
    const post = (await createPost(alice, "hi")).body.post;
    await request(app).post(`/api/forum/${post._id}/report`).set(bob.auth).send({ reason: "spam" }).expect(200);
    const res = await request(app)
      .post(`/api/forum/${post._id}/report`)
      .set(bob.auth)
      .send({ reason: "harassment" })
      .expect(200);
    expect(res.body.post.reportedByMe).toBe(true);

    const stored = await ForumPost.findById(post._id);
    expect(stored.reports).toHaveLength(1);
    expect(stored.reports[0].reason).toBe("harassment");
    expect(stored.needsReview).toBe(true);
  });

  it("rejects unknown report reasons", async () => {
    const alice = await signUp(app, "alice");
    const post = (await createPost(alice, "hi")).body.post;
    await request(app).post(`/api/forum/${post._id}/report`).set(alice.auth).send({ reason: "meh" }).expect(400);
  });
});
