const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  user:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  shop:    { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
  offer:   { type: mongoose.Schema.Types.ObjectId, ref: 'Offer' },
  rating:  { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, trim: true }
}, { timestamps: true });

reviewSchema.index({ user: 1, shop: 1 }, { unique: true });

module.exports = mongoose.model('Review', reviewSchema);
