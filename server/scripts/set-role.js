// Usage: npm run set-role -- <username> <user|counselor|admin>
// Admins can't be created through the API, so the first one is made here.
import mongoose from "mongoose";
import { env } from "../config/env.js";
import User, { ROLES } from "../models/User.js";

const [username, role] = process.argv.slice(2);
if (!username || !ROLES.includes(role)) {
  console.error(`Usage: npm run set-role -- <username> <${ROLES.join("|")}>`);
  process.exit(1);
}

await mongoose.connect(env.mongoUri);
const user = await User.findOneAndUpdate({ username }, { role }, { new: true });
console.log(user ? `${user.username} is now ${user.role}` : `No user named "${username}"`);
await mongoose.disconnect();
process.exitCode = user ? 0 : 1;
