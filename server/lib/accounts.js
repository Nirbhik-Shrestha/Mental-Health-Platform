import User from "../models/User.js";
import Mood from "../models/Mood.js";
import JournalEntry from "../models/JournalEntry.js";
import SafetyPlan from "../models/SafetyPlan.js";
import ForumPost from "../models/ForumPost.js";
import Notification from "../models/Notification.js";
import Assessment from "../models/Assessment.js";
import Appointment from "../models/Appointment.js";
import ProgramProgress from "../models/ProgramProgress.js";
import { decrypt } from "./crypto.js";

/** Removes a user and everything they created, except blogs (kept, shown without an author). */
export async function deleteUserAndData(userId) {
  await Promise.all([
    Mood.deleteMany({ userId }),
    JournalEntry.deleteMany({ userId }),
    SafetyPlan.deleteMany({ userId }),
    Notification.deleteMany({ userId }),
    Assessment.deleteMany({ userId }),
    Appointment.deleteMany({ $or: [{ member: userId }, { counselor: userId }] }),
    ProgramProgress.deleteMany({ userId }),
    ForumPost.deleteMany({ author: userId }),
    ForumPost.updateMany(
      {},
      { $pull: { comments: { user: userId }, likes: userId, reports: { user: userId } } }
    ),
  ]);
  await User.deleteOne({ _id: userId });
}

/** Everything we store about a user, decrypted, for the "download my data" feature. */
export async function exportUserData(user) {
  const [moods, journal, plan, posts, assessments, withContact, appointments, programs] = await Promise.all([
    Mood.find({ userId: user._id }).sort({ day: 1 }).lean(),
    JournalEntry.find({ userId: user._id }).sort({ createdAt: 1 }).lean(),
    SafetyPlan.findOne({ userId: user._id }).lean(),
    ForumPost.find({ author: user._id }).sort({ createdAt: 1 }).lean(),
    Assessment.find({ userId: user._id }).sort({ createdAt: 1 }).lean(),
    User.findById(user._id).select("+trustedContact").lean(),
    Appointment.find({ member: user._id }).populate("counselor", "username").lean(),
    ProgramProgress.find({ userId: user._id }).lean(),
  ]);
  const contact = withContact?.trustedContact;
  const comments = await ForumPost.aggregate([
    { $unwind: "$comments" },
    { $match: { "comments.user": user._id } },
    { $project: { _id: 0, postId: "$_id", text: "$comments.text", createdAt: "$comments.createdAt" } },
  ]);

  return {
    exportedAt: new Date().toISOString(),
    profile: user.toJSON(),
    trustedContact: contact
      ? {
          name: decrypt(contact.name),
          email: decrypt(contact.email),
          relationship: contact.relationship,
          notifyOnHardDays: contact.notifyOnHardDays,
        }
      : null,
    moods: moods.map(({ mood, day, tags, note, timestamp }) => ({ day, mood, tags, note: decrypt(note), timestamp })),
    journal: journal.map(({ title, content, mood, createdAt, updatedAt }) => ({
      title: decrypt(title),
      content: decrypt(content),
      mood,
      createdAt,
      updatedAt,
    })),
    safetyPlan: plan ? JSON.parse(decrypt(plan.data)) : null,
    forumPosts: posts.map(({ _id, content, anonymous, createdAt }) => ({ id: _id, content, anonymous, createdAt })),
    forumComments: comments,
    programs: programs.map((p) => ({
      programId: p.programId,
      startedAt: p.startedAt,
      completedDays: p.completedDays.map(({ day, completedAt, reflection }) => ({ day, completedAt, reflection: decrypt(reflection) })),
    })),
    sessionRequests: appointments.map((a) => ({
      counselor: a.counselor?.username,
      mode: a.mode,
      preferredTimes: decrypt(a.preferredTimes),
      message: decrypt(a.message),
      status: a.status,
      scheduledFor: a.scheduledFor,
      createdAt: a.createdAt,
    })),
    selfChecks: assessments.map(({ kind, score, severity, createdAt, answers }) => ({
      kind,
      score,
      severity,
      answers: JSON.parse(decrypt(answers)),
      createdAt,
    })),
  };
}
