const User = require('./user.model');
const jwt = require('jsonwebtoken');
const { logSystemAction } = require('../../utils/auditLogger');

// Generate JWT
const generateToken = (id, role) => {
    return jwt.sign({ id, role }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });
};

// @desc    Register a new user
// @route   POST /api/users/register
// @access  Public (or Admin only later depending on RBAC)
const registerUser = async (req, res) => {
    try {
        const { firstName, lastName, mobileNo, password, role } = req.body;

        // Validate required fields
        if (!firstName || !lastName || !mobileNo || !password || !role) {
            return res.status(400).json({ message: 'Please provide all required fields (firstName, lastName, mobileNo, password, role)' });
        }

        // Check if user exists
        const userExists = await User.findOne({ mobileNo });
        if (userExists) {
            return res.status(400).json({ message: 'User with this mobile number already exists' });
        }

        // Create user
        const user = await User.create({
            firstName,
            lastName,
            mobileNo,
            passwordHash: password, // The pre-save hook will hash this
            role,
        });

        if (user) {
            res.status(201).json({
                _id: user.id,
                firstName: user.firstName,
                lastName: user.lastName,
                mobileNo: user.mobileNo,
                role: user.role,
                isActive: user.isActive,
            });
        } else {
            res.status(400).json({ message: 'Invalid user data' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Auth user & get token
// @route   POST /api/users/login
// @access  Public
const loginUser = async (req, res) => {
    try {
        const { mobileNo, password } = req.body;

        // --- HARDCODED ADMIN LOGIN FOR DEV/TESTING ---
        if (mobileNo === '9999999999' && password === 'password123') {
            const adminId = '111111111111111111111111'; // Mock 24-char hex ObjectId
            return res.json({
                _id: adminId,
                firstName: 'Super',
                lastName: 'Admin',
                mobileNo: '9999999999',
                role: 'Admin',
                token: generateToken(adminId, 'Admin'),
            });
        }
        // ---------------------------------------------

        // 1. Check if fields are provided at all
        if (!mobileNo && !password) {
            return res.status(400).json({ message: 'Mobile number and password are required.' });
        }
        if (!mobileNo) {
            return res.status(400).json({ message: 'Mobile number is required.' });
        }
        if (!password) {
            return res.status(400).json({ message: 'Password is required.' });
        }

        // 2. Validate mobile number format (must be exactly 10 digits)
        const mobileRegex = /^\d{10}$/;
        if (!mobileRegex.test(mobileNo)) {
            return res.status(400).json({ message: 'Invalid mobile number. Please enter a valid 10-digit mobile number.' });
        }

        // 3. Check if a user with this mobile number exists
        const user = await User.findOne({ mobileNo });
        if (!user) {
            return res.status(401).json({ message: 'No account found with this mobile number.' });
        }

        // 4. Check if the account is active
        if (!user.isActive) {
            return res.status(403).json({ message: 'Your account has been deactivated. Please contact the administrator.' });
        }

        // 5. Verify the password
        const isPasswordCorrect = await user.comparePassword(password);
        if (!isPasswordCorrect) {
            return res.status(401).json({ message: 'Incorrect password. Please try again.' });
        }

        // 6. All checks passed — issue token
        await logSystemAction(user._id, 'LOGIN', 'Users', user._id, 'User logged into the system');
        res.json({
            _id: user.id,
            firstName: user.firstName,
            lastName: user.lastName,
            mobileNo: user.mobileNo,
            role: user.role,
            token: generateToken(user._id, user.role),
        });

    } catch (error) {
        res.status(500).json({ message: 'Server error. Please try again later.', error: error.message });
    }
};

// @desc    Get current logged in user
// @route   GET /api/users/me
// @access  Private
const getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-passwordHash');
        if (user) {
            res.json(user);
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Get all users (Admin)
// @route   GET /api/users
// @access  Private (Admin)
const getAllUsers = async (req, res) => {
    try {
        const { role, isActive, page = 1, limit = 20 } = req.query;
        const filter = {};
        if (role) filter.role = role;
        if (isActive !== undefined) filter.isActive = isActive === 'true';

        const skip = (Number(page) - 1) * Number(limit);
        const [users, total] = await Promise.all([
            User.find(filter)
                .select('-passwordHash')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit)),
            User.countDocuments(filter),
        ]);

        res.json({
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            data: users,
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Toggle user active/inactive status
// @route   PATCH /api/users/:id/status
// @access  Private (Admin)
const toggleUserStatus = async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-passwordHash');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Prevent Admin from deactivating themselves
        if (user._id.toString() === req.user._id.toString()) {
            return res.status(400).json({ message: 'You cannot change your own account status' });
        }

        const before = { isActive: user.isActive };
        user.isActive = !user.isActive;
        await user.save();

        await logSystemAction(
            req.user._id,
            'UPDATE',
            'Users',
            user._id,
            `Admin toggled user status to ${user.isActive ? 'Active' : 'Inactive'}`,
            before,
            { isActive: user.isActive }
        );

        res.json({
            message: `User account has been ${user.isActive ? 'activated' : 'deactivated'}`,
            isActive: user.isActive,
        });
    } catch (error) {
        if (error.name === 'CastError') {
            return res.status(400).json({ message: 'Invalid user ID format' });
        }
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

module.exports = {
    registerUser,
    loginUser,
    getMe,
    getAllUsers,
    toggleUserStatus,
};
