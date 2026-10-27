import vader from "vader-sentiment";

/** VADER sentiment (English only). Falls back to neutral rather than failing a post. */
export function analyzeSentiment(text) {
  try {
    const { compound } = vader.SentimentIntensityAnalyzer.polarity_scores(text);
    if (compound >= 0.05) return "positive";
    if (compound <= -0.05) return "negative";
    return "neutral";
  } catch {
    return "neutral";
  }
}

// Phrases that suggest the writer may be at risk. Matches surface support resources
// to the writer and put the post in the moderation queue; they never block posting.
// Covers English, Romanized Nepali and Devanagari since VADER only understands English.
const RISK_PATTERNS = [
  /\bsuicid(e|al)\b/i,
  /\bkill(ing)?\s+my\s*self\b/i,
  /\b(hurt|harm)(ing)?\s+my\s*self\b/i,
  /\bself[-\s]?harm/i,
  /\bcut(ting)?\s+my\s*self\b/i,
  /\b(want|wanna|going|ready)\s+to\s+die\b/i,
  /\bend\s+(my\s+life|it\s+all)\b/i,
  /\bno\s+reason\s+to\s+live\b/i,
  /\bbetter\s+off\s+dead\b/i,
  /\ba+tma\s?hatya\b/i,
  /\bmarna\s+mann?\b/i,
  /\bbach(na|ne)\s+mann?\s+(chaina|xaina)\b/i,
  /आत्महत्या/,
  /मर्न\s*मन/,
  /बाँच्न\s*मन\s*छैन/,
];

export const detectRiskLanguage = (text) => RISK_PATTERNS.some((pattern) => pattern.test(text));
