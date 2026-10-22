import cron from "node-cron";
import Resource from "../models/Resource.js";
import Center from "../models/centerModel.js";
import { checkAll } from "../lib/linkCheck.js";
import { notify, adminIds } from "../lib/notify.js";
import { TIMEZONE } from "../lib/dates.js";

/**
 * Checks every resource link and center website, stores the result on each record,
 * and returns the broken ones. Admins are notified when `notifyAdmins` is set.
 */
export async function runLinkCheck({ notifyAdmins = false } = {}) {
  const [resources, centers] = await Promise.all([
    Resource.find().select("title url"),
    Center.find({ website: { $nin: [null, ""] } }).select("name website"),
  ]);
  const targets = [
    ...resources.map((doc) => ({ doc, url: doc.url, kind: "resource", label: doc.title })),
    ...centers.map((doc) => ({ doc, url: doc.website, kind: "center", label: doc.name })),
  ];

  const results = await checkAll(targets.map((target) => target.url));
  const broken = [];
  await Promise.all(
    targets.map(async (target, i) => {
      const { ok, status, checkedAt } = results[i];
      await target.doc.updateOne({ linkStatus: { ok, status, checkedAt } });
      if (!ok) broken.push({ kind: target.kind, id: target.doc._id, label: target.label, url: target.url, status });
    })
  );

  if (notifyAdmins && broken.length) {
    await notify(await adminIds(), { type: "links.broken", data: { count: broken.length }, link: "/admin/resources" });
  }
  return { checked: targets.length, broken };
}

// 03:00 Nepal time on the 1st of each month.
export function startLinkCheckJob() {
  return cron.schedule(
    "0 3 1 * *",
    () => runLinkCheck({ notifyAdmins: true }).catch((err) => console.error("Link check failed:", err)),
    { timezone: TIMEZONE }
  );
}
