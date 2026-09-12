const mongoose = require('mongoose');

/**
 * Settings model — optional per-user preferences
 * Currently frontend stores ambient/theme prefs in localStorage;
 * this model is reserved for future persistence of those settings
 * without blocking the core Journal/Page/Decoration flow.
 */
const settingsSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    theme: {
      type: String,
      enum: ['parchment', 'vintage', 'aged', 'handwritten'],
      default: 'parchment',
    },
    ambience: {
      grain: { type: Boolean, default: true },
      warmLight: { type: Boolean, default: true },
      soundEnabled: { type: Boolean, default: false },
      sound: { type: String, enum: ['rain', 'fireplace', 'birds', 'coffee', 'writing'], default: 'rain' },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Settings', settingsSchema);
