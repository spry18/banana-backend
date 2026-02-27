const express = require('express');
const router = express.Router();
const { registerUser, loginUser, getMe } = require('./user.controller');
const { protect } = require('../../middlewares/auth.middleware');

router.post('/register', registerUser);
router.post('/login', loginUser);
router.route('/me').get(protect, getMe);

module.exports = router;
