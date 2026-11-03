import mongoose from "mongoose";

export const ROLES = ["user", "counselor", "admin"];
export const LANGUAGES = ["en", "ne"];

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    contact: { type: String, trim: true },
    address: { type: String, trim: true },
    dob: { type: Date },
    role: { type: String, enum: ROLES, default: "user" },

    emailVerified: { type: Boolean, default: false },
    emailVerificationToken: { type: String, select: false },
    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
    // Bumped on password change/reset; sessions carrying an older version are rejected.
    tokenVersion: { type: Number, default: 0 },

    twoFactor: {
      enabled: { type: Boolean, default: false },
      secret: { type: String, select: false }, // encrypted TOTP secret
      pendingSecret: { type: String, select: false }, // encrypted, during setup
      enabledAt: { type: Date },
    },

    preferences: {
      language: { type: String, enum: LANGUAGES, default: "en" },
      reminders: {
        enabled: { type: Boolean, default: false },
        hour: { type: Number, min: 0, max: 23, default: 20 },
      },
    },
    lastReminderDay: { type: String },

    // Someone the member chose to be told when they ask for help. Name/email encrypted.
    trustedContact: {
      type: {
        name: { type: String, required: true },
        email: { type: String, required: true },
        relationship: { type: String },
        language: { type: String, enum: LANGUAGES, default: "en" },
        senderName: { type: String }, // how the member is named in emails to the contact
        notifyOnHardDays: { type: Boolean, default: false },
        addedAt: { type: Date, default: Date.now },
        helpRequests: [{ type: Date }], // recent manual alerts, for rate limiting
        lastAutoAlertAt: { type: Date },
      },
      select: false,
    },
    hasTrustedContact: { type: Boolean, default: false },

    // Public profile for members with the counselor role.
    counselorProfile: {
      bio: { type: String },
      specialties: [{ type: String }],
      languages: [{ type: String }],
      modes: [{ type: String, enum: ["in-person", "online", "phone"] }],
      location: { type: String },
      availability: { type: String }, // free text, e.g. "Weekday evenings"
      acceptingRequests: { type: Boolean, default: false },
    },

    // Web push subscriptions, one per device/browser.
    pushSubscriptions: {
      type: [
        {
          endpoint: { type: String, required: true },
          keys: { p256dh: String, auth: String },
          createdAt: { type: Date, default: Date.now },
        },
      ],
      select: false,
    },
  },
  { timestamps: true }
);

userSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.password;
    delete ret.emailVerificationToken;
    delete ret.passwordResetToken;
    delete ret.passwordResetExpires;
    delete ret.lastReminderDay;
    delete ret.tokenVersion;
    ret.twoFactorEnabled = Boolean(ret.twoFactor?.enabled);
    delete ret.twoFactor;
    delete ret.trustedContact;
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model("User", userSchema);
