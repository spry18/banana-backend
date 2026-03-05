const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../middlewares/auth.middleware');
const {
    registerUser,
    loginUser,
    getMe,
    getAllUsers,
    toggleUserStatus,
    updateUser,
} = require('./user.controller');

// Public
router.post('/login', loginUser);

// Admin-only: register new system users
router.post('/register', protect, authorize('Admin'), registerUser);

// Private
router.get('/me', protect, getMe);

// Admin-only: user management
router.get('/', protect, authorize('Admin'), getAllUsers);
router.patch('/:id/status', protect, authorize('Admin'), toggleUserStatus);
router.put('/:id', protect, authorize('Admin'), updateUser);

module.exports = router;
