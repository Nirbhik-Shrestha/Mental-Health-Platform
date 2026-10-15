import mongoose from "mongoose";

const centerSchema = new mongoose.Schema({
  name: String,
  location: String,
  services: [String],
  approaches: String,
  internship: Boolean,
  hours: String,
  languages: [String],
  fees: String,
  contact: String,
});

export default  mongoose.model("Center", centerSchema);
