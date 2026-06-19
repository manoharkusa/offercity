const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema({
  shop:             { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
  title:            { type: String, required: true, trim: true },
  description:      { type: String },
  category:         { type: String, required: true },
  discount:         { type: Number, required: true, min: 0, max: 100 }, // percentage
  originalPrice:    { type: Number },
  discountedPrice:  { type: Number },
  validFrom:        { type: Date, default: Date.now },
  validUntil:       { type: Date, required: true },
  terms:            { type: String },
  images:           [{ type: String }],
  active:           { type: Boolean, default: true },
  views:            { type: Number, default: 0 }
}, { timestamps: true });

offerSchema.virtual('isExpired').get(function () {
  return this.validUntil < new Date();
});

module.exports = mongoose.model('Offer', offerSchema);
