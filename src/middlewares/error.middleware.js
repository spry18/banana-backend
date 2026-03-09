const notFound = (req, res, next) => {
    const error = new Error(`Not Found - ${req.originalUrl}`);
    res.status(404);
    next(error);
};

const errorHandler = (err, req, res, next) => {
    let statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    let message = err.message;

    // Handle Mongoose "CastError"
    if (err.name === 'CastError') {
        statusCode = 404;
        message = 'Resource not found';
    }

    // Handle Mongoose Duplicate Key Error
    if (err.code === 11000) {
        statusCode = 400;
        const field = Object.keys(err.keyValue)[0];
        message = `Duplicate value entered for field: ${field}. Please use another value.`;
    }

    res.status(statusCode).json({
        message: message,
        stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    });
};

module.exports = {
    notFound,
    errorHandler,
};
