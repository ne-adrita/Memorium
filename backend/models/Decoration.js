const mongoose = require('mongoose');

const decorationSchema = new mongoose.Schema(
  {
    page: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Page',
      required: [true, 'Page reference is required'],
    },
    type: {
      type: String,
      required: [true, 'Decoration type is required'],
      enum: {
        values: ['sticky', 'sticker', 'paper', 'flower', 'tape'],
        message: '{VALUE} is not a valid decoration type',
      },
    },
    position: {
      x: {
        type: Number,
        required: [true, 'X position is required'],
        min: 0,
      },
      y: {
        type: Number,
        required: [true, 'Y position is required'],
        min: 0,
      },
    },
    size: {
      width: { type: Number, min: 0, default: null },
      height: { type: Number, min: 0, default: null },
    },
    rotation: {
      type: Number,
      default: 0,
      min: -180,
      max: 180,
    },
    // Explicit fields for common use-cases (queryable)
    text: {
      type: String,
      trim: true,
      maxlength: [1000, 'Text must be at most 1000 characters'],
      default: null,
    },
    emoji: {
      type: String,
      trim: true,
      maxlength: [10, 'Emoji must be at most 10 characters'],
      default: null,
    },
    // Flexible configuration for future frontend needs (e.g., color, font)
    config: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// A page can contain multiple decorations
decorationSchema.index({ page: 1 });
decorationSchema.index({ page: 1, type: 1 });

module.exports = mongoose.model('Decoration', decorationSchema);
