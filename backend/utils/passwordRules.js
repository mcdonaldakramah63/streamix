// Shared password policy — used by registration and password change
const { body } = require('express-validator')

const passwordRules = (field) => [
  body(field)
    .isString().withMessage('Password required')
    .isLength({ min: 8, max: 72 }).withMessage('Password must be 8–72 characters')
    .matches(/[A-Z]/).withMessage('Password needs at least one uppercase letter')
    .matches(/[0-9]/).withMessage('Password needs at least one number')
    .matches(/[^A-Za-z0-9]/).withMessage('Password needs at least one special character (!@#$...)'),
]

module.exports = { passwordRules }
