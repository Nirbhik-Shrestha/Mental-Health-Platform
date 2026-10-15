import mongoose from 'mongoose';

const StreakSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  currentStreak: {
    type: Number,
    default: 1,
  },
  lastEntryDate: {
    type: Date,
    default: Date.now,
  }
});

export default mongoose.model('Streak', StreakSchema);

