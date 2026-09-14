const mongoose = require('mongoose');

const journalSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Journal owner is required'],
    },
    title: {
      type: String,
      required: [true, 'Journal title is required'],
      trim: true,
      maxlength: [120, 'Title must be at most 120 characters'],
      default: 'My Journal',
    },
    description: {
      type: String,
      maxlength: [500, 'Description must be at most 500 characters'],
      default: '',
      trim: true,
    },
    cover: {
      color: {
        type: String,
        default: '#5C3D2E',
        trim: true,
      },
      texture: {
        type: String,
        enum: ['leather', 'fabric', 'paper', 'linen'],
        default: 'leather',
      },
    },
    themeId: {
      type: String,
      default: 'classic-leather',
      trim: true,
      validate: {
        validator(v) {
          const allowed = [
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
          ];
          return allowed.includes(v);
        },
        message: '{VALUE} is not a valid themeId',
      },
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
    isPinned: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// A user can own multiple journals
journalSchema.index({ owner: 1 });
journalSchema.index({ owner: 1, updatedAt: -1 });
journalSchema.index({ owner: 1, isPinned: -1, updatedAt: -1 });

// Virtual for pages in this journal
journalSchema.virtual('pages', {
  ref: 'Page',
  localField: '_id',
  foreignField: 'journal',
});

module.exports = mongoose.model('Journal', journalSchema);
