import { env } from "../config/env.js";
import { sendMail } from "./mailer.js";

const templates = {
  en: {
    verify: (name, link) => ({
      subject: "Verify your Aashraya email",
      text: `Hi ${name},\n\nPlease confirm your email address by opening this link:\n${link}\n\nIf you didn't create an Aashraya account, you can ignore this email.`,
    }),
    reset: (name, link) => ({
      subject: "Reset your Aashraya password",
      text: `Hi ${name},\n\nSomeone asked to reset your Aashraya password. Open this link within 1 hour to choose a new one:\n${link}\n\nIf this wasn't you, ignore this email - your password won't change.`,
    }),
    moderationAlert: (name, link) => ({
      subject: "A community post may need urgent attention",
      text: `Hi ${name},\n\nA post or comment on Aashraya was flagged for language suggesting someone may be at risk. Please review it as soon as you can:\n${link}\n\nYou can reach out to the writer privately from the moderation page.`,
    }),
    outreach: (name, link, note) => ({
      subject: "A message from the Aashraya team",
      text: `Hi ${name},\n\nSomeone from the Aashraya team noticed you might be going through a hard time and wanted to reach out. You don't have to face this alone.${note ? `\n\n"${note}"` : ""}\n\nIf you need to talk to someone now, the National Suicide Prevention Helpline (1166) is free from any mobile network. In an emergency call 100 or 102.\n\n${link}`,
    }),
    reminder: (name, link) => ({
      subject: "How are you feeling today?",
      text: `Hi ${name},\n\nThis is your gentle daily reminder to check in with yourself on Aashraya:\n${link}\n\nYou can turn these reminders off any time from your profile.`,
    }),
  },
  ne: {
    verify: (name, link) => ({
      subject: "आफ्नो आश्रय इमेल प्रमाणित गर्नुहोस्",
      text: `नमस्ते ${name},\n\nकृपया यो लिङ्क खोलेर आफ्नो इमेल ठेगाना प्रमाणित गर्नुहोस्:\n${link}\n\nयदि तपाईंले आश्रय खाता बनाउनुभएको होइन भने यो इमेललाई बेवास्ता गर्नुहोस्।`,
    }),
    reset: (name, link) => ({
      subject: "आफ्नो आश्रय पासवर्ड रिसेट गर्नुहोस्",
      text: `नमस्ते ${name},\n\nतपाईंको आश्रय पासवर्ड रिसेट गर्न अनुरोध गरिएको छ। नयाँ पासवर्ड राख्न १ घण्टाभित्र यो लिङ्क खोल्नुहोस्:\n${link}\n\nयदि यो तपाईं होइन भने यो इमेललाई बेवास्ता गर्नुहोस्।`,
    }),
    moderationAlert: (name, link) => ({
      subject: "समुदायको एउटा पोस्टलाई तत्काल ध्यान चाहिन सक्छ",
      text: `नमस्ते ${name},\n\nआश्रयमा कोही जोखिममा हुन सक्ने संकेत गर्ने भाषाका कारण एउटा पोस्ट वा प्रतिक्रिया फ्ल्याग भएको छ। कृपया सकेसम्म छिटो हेर्नुहोस्:\n${link}\n\nमोडरेसन पृष्ठबाट लेख्ने व्यक्तिलाई निजी रूपमा सम्पर्क गर्न सक्नुहुन्छ।`,
    }),
    outreach: (name, link, note) => ({
      subject: "आश्रय टोलीबाट सन्देश",
      text: `नमस्ते ${name},\n\nआश्रय टोलीका कसैले तपाईं गाह्रो समयबाट गुज्रिरहनुभएको हुन सक्छ भन्ने ठानेर सम्पर्क गर्न चाहनुभयो। तपाईंले यो एक्लै सामना गर्नुपर्दैन।${note ? `\n\n"${note}"` : ""}\n\nअहिले नै कसैसँग कुरा गर्नुपरे राष्ट्रिय आत्महत्या रोकथाम हेल्पलाइन (११६६) जुनसुकै मोबाइल नेटवर्कबाट निःशुल्क छ। आपतकालमा १०० वा १०२ मा फोन गर्नुहोस्।\n\n${link}`,
    }),
    reminder: (name, link) => ({
      subject: "आज तपाईंलाई कस्तो महसुस भइरहेको छ?",
      text: `नमस्ते ${name},\n\nआश्रयमा आफ्नो दैनिक मुड दर्ता गर्ने सम्झना:\n${link}\n\nतपाईं प्रोफाइलबाट यी सम्झनाहरू जुनसुकै बेला बन्द गर्न सक्नुहुन्छ।`,
    }),
  },
};

function send(user, kind, link, ...extra) {
  const lang = user.preferences?.language === "ne" ? "ne" : "en";
  const { subject, text } = templates[lang][kind](user.username, link, ...extra);
  return sendMail({ to: user.email, subject, text });
}

export const sendVerificationEmail = (user, token) =>
  send(user, "verify", `${env.appUrl}/verify-email?token=${token}`);

export const sendPasswordResetEmail = (user, token) =>
  send(user, "reset", `${env.appUrl}/reset-password?token=${token}`);

export const sendReminderEmail = (user) => send(user, "reminder", `${env.appUrl}/`);

export const sendModerationAlertEmail = (admin) => send(admin, "moderationAlert", `${env.appUrl}/admin/moderation`);

export const sendOutreachEmail = (user, note) => send(user, "outreach", `${env.appUrl}/notifications`, note);
