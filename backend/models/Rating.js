// backend/models/Rating.js — NEW FILE
const mongoose = require('mongoose')

const ratingSchema = new mongoose.Schema({
  userId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tmdbId:  { type: Number, required: true },
  type:    { type: String, enum: ['movie', 'tv'], required: true },
  rating:  { type: Number, min: 1, max: 5, required: true },
}, { timestamps: true })

ratingSchema.index({ userId: 1, tmdbId: 1, type: 1 }, { unique: true })

const Rating = mongoose.models.Rating || mongoose.model('Rating', schema);
module.exports = Rating;
