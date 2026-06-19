const jwt = require('jsonwebtoken');
const User = require('../modules/users/user.model');

// Protect routes
const protect = async (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        try {
            // Get token from header
            token = req.headers.authorization.split(' ')[1];

            // Verify token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Daily 4:00 AM IST session expiration check
            const now = new Date();
            const istOffset = 5.5 * 60 * 60 * 1000;
            const nowIst = new Date(now.getTime() + istOffset);
            const ist4AmToday = new Date(nowIst);
            ist4AmToday.setUTCHours(4, 0, 0, 0);
            let last4AmIst = new Date(ist4AmToday.getTime() - istOffset);
            if (last4AmIst > now) {
                last4AmIst = new Date(last4AmIst.getTime() - 24 * 60 * 60 * 1000);
            }
            const last4AmIstSec = Math.floor(last4AmIst.getTime() / 1000);

            if (decoded.iat && decoded.iat < last4AmIstSec) {
                return res.status(401).json({ message: 'Session expired (daily 4:00 AM auto-logout), please log in again.' });
            }

            // Handle hardcoded mock Admin for dev/testing
            if (decoded.id === '111111111111111111111111') {
                req.user = {
                    _id: decoded.id,
                    role: 'Admin',
                    firstName: 'Super',
                    lastName: 'Admin'
                };
            } else {
                // Get user from the token
                req.user = await User.findById(decoded.id).select('-passwordHash');

                if (!req.user) {
                    return res.status(401).json({ message: 'Not authorized, user not found' });
                }
            }

            next();
        } catch (error) {
            console.error(error);
            next(error);
        }
    }

    if (!token) {
        res.status(401).json({ message: 'Not authorized, no token' });
    }
};

// Grant access to specific roles
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                message: `User role ${req.user.role} is not authorized to access this route`,
            });
        }
        next();
    };
};

module.exports = { protect, authorize };
