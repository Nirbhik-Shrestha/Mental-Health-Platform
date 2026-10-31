import mongoose from "mongoose";

const centerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    location: { type: String, trim: true },
    services: [{ type: String, trim: true }],
    approaches: { type: String },
    internship: { type: Boolean, default: false },
    hours: { type: String },
    languages: [{ type: String, trim: true }],
    fees: { type: String },
    modes: [{ type: String, enum: ["in-person", "online", "phone"] }],
    slidingScale: { type: Boolean, default: false }, // free or pay-what-you-can option
    contact: { type: String },
    website: { type: String },
    // Result of the last automated link check.
    linkStatus: {
      ok: { type: Boolean },
      status: { type: Number },
      checkedAt: { type: Date },
    },
    coordinates: {
      lat: { type: Number, min: -90, max: 90 },
      lng: { type: Number, min: -180, max: 180 },
    },
    // `verified` means the Aashraya team visited in person. Other entries record where
    // the information came from so members can judge it.
    verified: { type: Boolean, default: false },
    source: {
      kind: { type: String, enum: ["field-visit", "web"] },
      url: { type: String },
      checkedAt: { type: Date },
    },
  },
  { timestamps: true }
);

export default mongoose.model("Center", centerSchema);
