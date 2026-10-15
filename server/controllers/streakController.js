import Streak from '../models/Streak.js';

export const updateStreak = async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date().setHours(0, 0, 0, 0);

    let streak = await Streak.findOne({ userId });

    if (!streak) {
      streak = await Streak.create({ userId });
    } else {
      const last = new Date(streak.lastEntryDate).setHours(0, 0, 0, 0);
      const diff = (today - last) / (1000 * 60 * 60 * 24);

      if (diff === 1) {
        streak.currentStreak += 1;
      } else if (diff > 1) {
        streak.currentStreak = 1; // reset streak
      }

      streak.lastEntryDate = today;
      await streak.save();
    }

    res.status(200).json({ streak: streak.currentStreak });
  } catch (err) {
    res.status(500).json({ message: 'Streak update failed', error: err.message });
  }
};

export const getStreak = async (req, res) => {
  try {
    const userId = req.user.id;
    const streak = await Streak.findOne({ userId });

    if (!streak) {
      return res.status(200).json({ streak: 0 });
    }

    res.status(200).json({ streak: streak.currentStreak });
  } catch (err) {
    res.status(500).json({ message: 'Failed to get streak', error: err.message });
  }
};
