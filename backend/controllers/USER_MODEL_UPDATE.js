// Add this to your User.js model inside the userSchema
// Find the continueWatching field and replace it with this full schema:

/*
  In backend/models/User.js, find:
    continueWatching: [...]
  and replace the entire array schema with this:
*/

const continueWatchingSchema = {
  continueWatching: [
    {
      movieId:     { type: Number, required: true },
      title:       { type: String, required: true },
      poster:      { type: String, default: '' },
      backdrop:    { type: String, default: '' },
      type:        { type: String, enum: ['movie', 'tv'], default: 'movie' },
      season:      { type: Number, default: null },
      episode:     { type: Number, default: null },
      episodeName: { type: String, default: '' },
      progress:    { type: Number, default: 0, min: 0, max: 100 },  // % watched
      durationMins:{ type: Number, default: null },
      watchedAt:   { type: Date, default: Date.now },
    }
  ]
}

// Also update your routes/users.js to add:
// GET    /api/users/continue-watching
// DELETE /api/users/continue-watching/:movieId
// (see userRoutes.js for the full routes file)
