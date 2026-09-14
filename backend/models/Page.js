const mongoose = require('mongoose');

const pageSchema = new mongoose.Schema(
  {
    journal: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Journal',
      required: [true, 'Journal reference is required'],
    },
    pageNumber: {
      type: Number,
      required: [true, 'Page number is required'],
      min: [1, 'Page number must be at least 1'],
      // ordering clearly represented; unique per journal via compound index
    },
    title: {
      type: String,
      trim: true,
      maxlength: [200, 'Title must be at most 200 characters'],
      default: '',
    },
    content: {
      type: String,
      default: '',
      // HTML string from contenteditable; validated as string
    },
    theme: {
      type: String,
      enum: {
        values: [
          'burgundy-journal',
          'rose-paper',
          'scarlet-vintage',
          'crimson-classic',
          'midnight-blue',
          'ocean-blue',
          'dusty-blue',
          'royal-blue',
          'forest-green',
          'sage-garden',
          'moss-vintage',
          'emerald-classic',
          'plum-velvet',
          'lavender-paper',
          'royal-purple',
          'dusty-violet',
          'classic-leather',
          'coffee-brown',
          'walnut',
          'sepia-vintage',
          'rose-blush',
          'dusty-pink',
          'blush',
          'vintage-pink',
          // legacy + alias
          'parchment',
          'vintage',
          'aged',
          'handwritten',
          'rose',
        ],
        message: '{VALUE} is not a valid theme',
      },
      default: 'classic-leather',
    },
    paper: {
      type: String,
      enum: {
        values: ['plain', 'ruled', 'dotted', 'grid', 'vintage', 'handmade', 'torn'],
        message: '{VALUE} is not a valid paper',
      },
      default: 'plain',
      trim: true,
    },
    // --- Diary metadata (Step 11I) — all optional, vintage diary feel ---
    date: {
      type: Date,
      default: null,
    },
    mood: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
      validate: {
        validator(v) {
          if (v == null || v === '') return true;
          return ['happy', 'calm', 'sad', 'angry', 'loved', 'tired'].includes(v);
        },
        message: '{VALUE} is not a valid mood',
      },
    },
    weather: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
      validate: {
        validator(v) {
          if (v == null || v === '') return true;
          return ['sunny', 'rainy', 'cloudy', 'night'].includes(v);
        },
        message: '{VALUE} is not a valid weather',
      },
    },
    location: {
      type: String,
      trim: true,
      maxlength: [120, 'Location must be at most 120 characters'],
      default: '',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Page ordering must be unique per journal
pageSchema.index({ journal: 1, pageNumber: 1 }, { unique: true });
pageSchema.index({ journal: 1, updatedAt: -1 });

// Virtual for decorations on this page
pageSchema.virtual('decorations', {
  ref: 'Decoration',
  localField: '_id',
  foreignField: 'page',
});

module.exports = mongoose.model('Page', pageSchema);
