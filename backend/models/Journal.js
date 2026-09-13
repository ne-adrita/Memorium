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

// Virtual for pages in this journal
journalSchema.virtual('pages', {
  ref: 'Page',
  localField: '_id',
  foreignField: 'journal',
});

module.exports = mongoose.model('Journal', journalSchema);
