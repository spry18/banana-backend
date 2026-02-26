const User = require('./user.model');
const jwt = require('jsonwebtoken');

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

        // Find user
        const user = await User.findOne({ mobileNo });

        // Check user & password match
        if (user && user.isActive && (await user.comparePassword(password))) {
            res.json({
                _id: user.id,
                firstName: user.firstName,
                lastName: user.lastName,
                mobileNo: user.mobileNo,
                role: user.role,
                token: generateToken(user._id, user.role),
            });
        } else {
            res.status(401).json({ message: 'Invalid mobile number or password, or user inactive' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

module.exports = {
    registerUser,
    loginUser,
};
