const mongoose = require('mongoose');

const imageSchema = new mongoose.Schema(
  {
    page: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Page',
      required: [true, 'Page reference is required'],
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
    },
    originalName: {
      type: String,
      required: true,
      trim: true,
      maxlength: [255, 'Original name too long'],
    },
    filename: {
      type: String,
      required: true,
      trim: true,
    },
    mimeType: {
      type: String,
      required: true,
      enum: {
        values: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'],
        message: '{VALUE} is not an allowed image type',
      },
    },
    size: {
      type: Number,
      required: true,
      min: 0,
      max: 5 * 1024 * 1024,
    },
    path: {
      type: String,
      required: true,
    },
    position: {
      x: { type: Number, default: 24, min: 0 },
      y: { type: Number, default: 24, min: 0 },
    },
    sizeInfo: {
      width: { type: Number, default: null, min: 0 },
      height: { type: Number, default: null, min: 0 },
    },
    rotation: {
      type: Number,
      default: 0,
      min: -180,
      max: 180,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

imageSchema.index({ page: 1 });
imageSchema.index({ user: 1 });
imageSchema.index({ page: 1, createdAt: 1 });

module.exports = mongoose.model('Image', imageSchema);
