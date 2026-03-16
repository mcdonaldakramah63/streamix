const express = require('express')
const { body } = require('express-validator')
const { register, login } = require('../controllers/authController')
const { trackLoginAttempt } = require('../middleware/accountLock')

const r = express.Router()

const registerRules = [
  body('username').trim()
    .isLength({ min: 3, max: 30 }).withMessage('Username must be 3–30 characters')
    .matches(/^[a-zA-Z0-9_]+$/).withMessage('Username: letters, numbers and underscores only'),
  body('email')
    .isEmail().withMessage('Valid email required')
    .normalizeEmail()
    .isLength({ max: 100 }).withMessage('Email too long'),
  body('password')
    .isLength({ min: 8, max: 72 }).withMessage('Password must be 8–72 characters')
    .matches(/[A-Z]/).withMessage('Password needs at least one uppercase letter')
    .matches(/[0-9]/).withMessage('Password needs at least one number')
    .matches(/[^A-Za-z0-9]/).withMessage('Password needs at least one special character (!@#$...)'),
]

const loginRules = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password required'),
]

r.post('/register', registerRules, register)
r.post('/login', loginRules, trackLoginAttempt, login)

module.exports = r
