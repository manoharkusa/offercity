const mongoose = require('mongoose');

const shopSchema = new mongoose.Schema({
  owner:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name:        { type: String, required: true, trim: true },
  description: { type: String },
  category:    { type: String, required: true },
  address:     { type: String, required: true },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true }  // [longitude, latitude]
  },
  phone:    { type: String },
  images:   [{ type: String }],
  approved: { type: Boolean, default: false },
  rating:   { type: Number, default: 0 },
  totalReviews: { type: Number, default: 0 }
}, { timestamps: true });

shopSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Shop', shopSchema);
