// Loads curated data from server/data into the database.
// Usage: npm run seed                 (centers and resources; adds missing records only)
//        npm run seed -- --update     (also overwrites existing records with the files' data)
//        npm run seed:centers / npm run seed:resources   (just one collection)
import mongoose from "mongoose";
import { env } from "../config/env.js";
import Center from "../models/centerModel.js";
import Resource from "../models/Resource.js";
import { seedCollection, describeCounts } from "../lib/seed.js";

const update = process.argv.includes("--update");
const only = process.argv.find((arg) => arg.startsWith("--only="))?.slice("--only=".length);

const targets = [
  { name: "centers", label: "Centers", model: Center, file: "centers.json" },
  { name: "resources", label: "Resources", model: Resource, file: "resources.json" },
].filter((target) => !only || target.name === only);

await mongoose.connect(env.mongoUri);
for (const { label, model, file } of targets) {
  console.log(describeCounts(label, await seedCollection(model, file, { update })));
}
await mongoose.disconnect();
