import { MongoMemoryServer } from "mongodb-memory-server";

// One MongoDB for the whole run; each test file gets its own database on it
// (see helpers.js). Starting a server per file raced for ports when files ran in parallel.
export default async function setup(project) {
  const mongo = await MongoMemoryServer.create();
  project.provide("mongoUri", mongo.getUri());
  return () => mongo.stop();
}
