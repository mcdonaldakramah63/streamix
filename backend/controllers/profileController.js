// backend/controllers/profileController.js — FIXED PIN SAVE
const Profile = require('../models/Profile');

// GET all profiles
const getProfiles = async (req, res) => {
  try {
    const profiles = await Profile.find({ user: req.user._id })
      .select('-watchHistory -pin')
      .sort({ createdAt: 1 })
      .lean();
    res.json(profiles);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Create profile
const createProfile = async (req, res) => {
  try {
    const count = await Profile.countDocuments({ user: req.user._id });
    if (count >= 5) return res.status(400).json({ message: 'Maximum 5 profiles per account' });

    const { name, avatar = '🎬', color = '#14b8a6', isKids = false, pin } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'Profile name is required' });

    const profile = await Profile.create({
      user: req.user._id,
      name: name.trim(),
      avatar,
      color,
      isKids: Boolean(isKids),
      maturityLevel: Boolean(isKids) ? 'kids' : 'all',
      pin: !isKids && pin ? pin : null,
    });

    res.status(201).json(profile);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Update profile (including PIN)
const updateProfile = async (req, res) => {
  try {
    const profile = await Profile.findOne({ _id: req.params.id, user: req.user._id });
    if (!profile) return res.status(404).json({ message: 'Profile not found' });

    const { name, avatar, color, isKids, pin, maturityLevel } = req.body;

    if (name !== undefined) profile.name = name.trim();
    if (avatar !== undefined) profile.avatar = avatar;
    if (color !== undefined) profile.color = color;
    if (isKids !== undefined) {
      profile.isKids = Boolean(isKids);
      profile.maturityLevel = Boolean(isKids) ? 'kids' : 'all';
      if (profile.isKids) profile.pin = null; // remove PIN from kids profile
    }
    if (pin !== undefined && !profile.isKids) profile.pin = pin;
    if (maturityLevel) profile.maturityLevel = maturityLevel;

    await profile.save();
    res.json(profile);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Delete profile
const deleteProfile = async (req, res) => {
  try {
    const result = await Profile.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!result) return res.status(404).json({ message: 'Profile not found' });
    res.json({ message: 'Profile deleted' });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Record watch
const recordWatch = async (req, res) => {
  try {
    const profile = await Profile.findOne({ _id: req.params.id, user: req.user._id });
    if (!profile) return res.status(404).json({ message: 'Profile not found' });

    const { tmdbId, title, type, genres = [], language = 'en', progress = 0, completed = false } = req.body;

    profile.watchHistory = profile.watchHistory.filter(h => h.tmdbId !== Number(tmdbId));
    profile.watchHistory.unshift({
      tmdbId: Number(tmdbId),
      title,
      type,
      genres,
      language,
      progress: Math.min(Math.max(Number(progress), 0), 100),
      completed: Boolean(completed),
      watchedAt: new Date()
    });

    if (profile.watchHistory.length > 200) profile.watchHistory = profile.watchHistory.slice(0, 200);

    await profile.save();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Kid-safe content
const getKidSafeContent = async (req, res) => {
  try {
    const profile = await Profile.findById(req.params.id);
    if (!profile || !profile.isKids) {
      return res.status(403).json({ message: 'Access only for kids profiles' });
    }

    res.json({
      success: true,
      isKidsMode: true,
      rows: [
        { title: "Popular for Kids", items: [] },
        { title: "Cartoons & Animation", items: [] },
      ]
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Get recommendations
const getRecommendations = async (req, res) => {
  try {
    const profile = await Profile.findById(req.params.id).lean();
    if (!profile) return res.status(404).json({ message: 'Profile not found' });

    const genreScore = {};

    for (const h of profile.watchHistory.slice(0, 50)) {
      for (const g of (h.genres || [])) {
        genreScore[g] = (genreScore[g] || 0) + (h.completed ? 2 : 1);
      }
    }

    const topGenres = Object.entries(genreScore)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 5)
      .map(([id]) => Number(id));

    res.json({
      topGenres,
      lastWatched: profile.watchHistory.slice(0, 5),
      isKidsMode: profile.isKids
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Verify PIN
const verifyPin = async (req, res) => {
  try {
    const profile = await Profile.findOne({ _id: req.params.id, user: req.user._id });
    if (!profile) return res.status(404).json({ message: 'Profile not found' });

    const { pin } = req.body;
    if (profile.isKids || !profile.pin) {
      return res.status(400).json({ message: 'PIN not required for this profile' });
    }

    if (profile.pin === pin) {
      res.json({ success: true });
    } else {
      res.status(401).json({ message: 'Incorrect PIN' });
    }
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

module.exports = {
  getProfiles,
  createProfile,
  updateProfile,
  deleteProfile,
  recordWatch,
  getKidSafeContent,
  getRecommendations,
  verifyPin,
};