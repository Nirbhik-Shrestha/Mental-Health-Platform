import { isTest } from "../config/env.js";

export const notFound = (_req, res) => res.status(404).json({ error: "Not found" });

// Express 5 forwards rejected promises from async handlers here.
// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, _req, res, _next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON body" });
  if (err.type === "entity.too.large") return res.status(413).json({ error: "Request is too large" });
  // Malformed ObjectId in a URL - treat as "doesn't exist" rather than a server error.
  if (err.name === "CastError") return res.status(404).json({ error: "Not found" });
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern ?? {})[0];
    return res.status(409).json({ error: field ? `That ${field} is already in use` : "Already exists" });
  }
  if (err.name === "ValidationError") return res.status(400).json({ error: "Please check the highlighted fields" });

  if (!isTest) console.error(err);
  res.status(500).json({ error: "Something went wrong. Please try again" });
};
