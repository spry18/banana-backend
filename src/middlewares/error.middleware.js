const multer = require('multer');

const { formatError } = require('../utils/errorFormatter');

const notFound = (req, res, next) => {
    const error = new Error(`Not Found - ${req.originalUrl}`);
    res.status(404);
    next(error);
};

const errorHandler = (err, req, res, next) => {
    const { statusCode, message } = formatError(err);

    // Log the actual error stack trace for backend developers
    console.error('--- Global Error Handler Catch ---');
    console.error(err);

    res.status(statusCode).json({
        message: message,
        stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    });
};

module.exports = {
    notFound,
    errorHandler,
};
