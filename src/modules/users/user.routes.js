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
    logoutUser,
} = require('./user.controller');

// Public
router.post('/login', loginUser);

// Admin-only: register new system users
router.post('/register', protect, authorize('Admin'), registerUser);

// Private
router.get('/me', protect, getMe);

// Logout — MUST come before /:id wildcards, otherwise "logout" is captured as :id
router.post('/logout', protect, logoutUser);

// Admin + OM + Munshi: GET /api/users?role=... is used for dropdown population
router.get('/', protect, authorize('Admin', 'Operational Manager', 'Munshi'), getAllUsers);
router.patch('/:id/status', protect, authorize('Admin'), toggleUserStatus);
router.put('/:id', protect, authorize('Admin'), updateUser);

module.exports = router;
