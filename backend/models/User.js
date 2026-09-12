const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [50, 'Name must be at most 50 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
      select: false,
    },
    avatar: {
      type: String,
      default: null,
      trim: true,
    },
    bio: {
      type: String,
      maxlength: [500, 'Bio must be at most 500 characters'],
      default: '',
      trim: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        delete ret.passwordHash;
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// Email must be unique — creates unique index
userSchema.index({ email: 1 }, { unique: true });

// Virtual for journals owned by user (not stored, for population)
userSchema.virtual('journals', {
  ref: 'Journal',
  localField: '_id',
  foreignField: 'owner',
});

module.exports = mongoose.model('User', userSchema);
