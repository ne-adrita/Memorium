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
        values: ['parchment', 'vintage', 'aged', 'handwritten'],
        message: '{VALUE} is not a valid theme',
      },
      default: 'parchment',
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
