const User = require('../models/User')

const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
    if (!user) return res.status(404).json({ message: 'User not found' })
    res.json(user)
  } catch (e) {
    res.status(500).json({ message: 'Failed to fetch profile' })
  }
}

const updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
    if (!user) return res.status(404).json({ message: 'User not found' })

    // Only allow safe fields — never let users set isAdmin, _id, etc.
    const { username, email, password, avatar } = req.body

    if (username) {
      if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
        return res.status(400).json({ message: 'Invalid username format' })
      }
      user.username = username.trim()
    }
    if (email) {
      if (!/^\S+@\S+\.\S+$/.test(email)) {
        return res.status(400).json({ message: 'Invalid email format' })
      }
      user.email = email.toLowerCase().trim()
    }
    if (avatar) {
      // Only allow http/https URLs for avatar
      if (!/^https?:\/\//.test(avatar)) {
        return res.status(400).json({ message: 'Avatar must be a valid URL' })
      }
      user.avatar = avatar.slice(0, 500)
    }
    if (password) {
      if (password.length < 8) {
        return res.status(400).json({ message: 'Password must be at least 8 characters' })
      }
      user.password = password
    }

    const updated = await user.save()
    res.json({
      _id:      updated._id,
      username: updated.username,
      email:    updated.email,
      avatar:   updated.avatar,
      isAdmin:  updated.isAdmin,
    })
  } catch (e) {
    if (e.code === 11000) return res.status(400).json({ message: 'Username or email already taken' })
    res.status(500).json({ message: 'Update failed' })
  }
}

const updateContinueWatching = async (req, res) => {
  const { movieId, title, poster, progress } = req.body
  if (!movieId || typeof progress !== 'number') {
    return res.status(400).json({ message: 'movieId and progress required' })
  }
  try {
    const user = await User.findById(req.user._id)
    const idx  = user.continueWatching.findIndex(m => m.movieId === Number(movieId))
    if (idx >= 0) {
      user.continueWatching[idx].progress  = Math.min(100, Math.max(0, progress))
      user.continueWatching[idx].updatedAt = new Date()
    } else {
      user.continueWatching.unshift({ movieId: Number(movieId), title, poster, progress })
      if (user.continueWatching.length > 20) user.continueWatching.pop()
    }
    await user.save()
    res.json({ message: 'Progress saved' })
  } catch (e) { res.status(500).json({ message: 'Failed to save progress' }) }
}

const addRecentlyViewed = async (req, res) => {
  const { movieId, title, poster } = req.body
  if (!movieId) return res.status(400).json({ message: 'movieId required' })
  try {
    const user = await User.findById(req.user._id)
    user.recentlyViewed = user.recentlyViewed.filter(m => m.movieId !== Number(movieId))
    user.recentlyViewed.unshift({ movieId: Number(movieId), title, poster })
    if (user.recentlyViewed.length > 30) user.recentlyViewed.pop()
    await user.save()
    res.json({ message: 'Saved' })
  } catch (e) { res.status(500).json({ message: 'Failed to save' }) }
}

module.exports = { getProfile, updateProfile, updateContinueWatching, addRecentlyViewed }
