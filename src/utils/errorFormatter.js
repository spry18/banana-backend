const multer = require('multer');

/**
 * Formats a raw error object or string into a clean, client-friendly status and message.
 * @param {Error|string} err - The error to format.
 * @returns {{statusCode: number, message: string}}
 */
function formatError(err) {
    let statusCode = 500;
    let message = 'An unexpected server error occurred. Please try again.';

    if (!err) {
        return { statusCode, message };
    }

    // Handle string error messages (e.g. from error.message in caught errors)
    if (typeof err === 'string') {
        if (err.includes('Cast to ObjectId failed') || err.includes('CastError')) {
            const match = err.match(/path "([^"]+)"/);
            const path = match ? match[1] : 'field';
            return {
                statusCode: 400,
                message: `Invalid ID format for path: ${path}`
            };
        }
        if (err.includes('duplicate key error') || err.includes('E11000')) {
            const match = err.match(/key: \{ ([^:]+):/) || err.match(/dup key: \{ ([^:]+):/);
            const field = match ? match[1].trim() : 'field';
            const fieldLabels = {
                mobileNo: 'mobile number',
                mobile: 'mobile number',
                email: 'email address',
                enquiryId: 'enquiry reference',
            };
            const fieldLabel = fieldLabels[field] || field;
            return {
                statusCode: 400,
                message: `A record with this ${fieldLabel} already exists. Please use a unique value.`
            };
        }
        if (err.includes('validation failed') || err.includes('ValidationError')) {
            // Clean up typical Mongoose validation prefixes
            let cleanMsg = err.replace(/.*validation failed:?/i, '').trim();
            return {
                statusCode: 400,
                message: cleanMsg || err
            };
        }
        if (err.includes('Only allowed image formats')) {
            return {
                statusCode: 400,
                message: err
            };
        }
        if (err.includes('Unexpected field') || err.includes('LIMIT_UNEXPECTED_FILE')) {
            return {
                statusCode: 400,
                message: 'Too many photos uploaded. Maximum allowed is 25.'
            };
        }
        if (err.includes('LIMIT_FILE_SIZE')) {
            return {
                statusCode: 400,
                message: 'File size is too large. Maximum allowed is 25MB per file.'
            };
        }
        if (err.includes('jwt expired') || err.includes('TokenExpiredError')) {
            return {
                statusCode: 401,
                message: 'Your session has expired. Please log in again.'
            };
        }
        if (err.includes('invalid token') || err.includes('JsonWebTokenError')) {
            return {
                statusCode: 401,
                message: 'Invalid authentication token. Please log in again.'
            };
        }
        return { statusCode, message: err };
    }

    // Handle actual Error instances
    // 1. Multer Errors
    if (err instanceof multer.MulterError || err.name === 'MulterError') {
        statusCode = 400;
        switch (err.code) {
            case 'LIMIT_UNEXPECTED_FILE':
                message = 'Too many photos uploaded. Maximum allowed is 25.';
                break;
            case 'LIMIT_FILE_SIZE':
                message = 'File size is too large. Maximum allowed is 25MB per file.';
                break;
            case 'LIMIT_FILE_COUNT':
                message = 'File count limit exceeded.';
                break;
            default:
                message = `File upload error: ${err.message}`;
        }
        return { statusCode, message };
    }

    // 2. Custom File Filter Image Type Errors
    if (err.message && err.message.includes('Only allowed image formats')) {
        return {
            statusCode: 400,
            message: err.message
        };
    }

    // 3. Mongoose Schema Validation Errors
    if (err.name === 'ValidationError') {
        return {
            statusCode: 400,
            message: Object.values(err.errors).map((val) => val.message).join(', ')
        };
    }

    // 4. Mongoose ID Cast Errors
    if (err.name === 'CastError') {
        return {
            statusCode: 400,
            message: `Invalid ID format for path: ${err.path}`
        };
    }

    // 5. Mongoose Duplicate Key Constraints (code 11000)
    if (err.code === 11000) {
        const rawField = Object.keys(err.keyValue || {})[0] || 'field';
        const fieldLabels = {
            mobileNo: 'mobile number',
            mobile: 'mobile number',
            email: 'email address',
            enquiryId: 'enquiry reference',
        };
        const fieldLabel = fieldLabels[rawField] || rawField;
        return {
            statusCode: 400,
            message: `A record with this ${fieldLabel} already exists. Please use a unique value.`
        };
    }

    // 6. JSON Payload Syntax Errors
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return {
            statusCode: 400,
            message: 'Malformed JSON payload. Please check your request body syntax.'
        };
    }

    // 7. JWT Authentication Errors
    if (err.name === 'JsonWebTokenError') {
        return {
            statusCode: 401,
            message: 'Invalid authentication token. Please log in again.'
        };
    }
    if (err.name === 'TokenExpiredError') {
        return {
            statusCode: 401,
            message: 'Your session has expired. Please log in again.'
        };
    }

    // Fallback
    return {
        statusCode: err.status || err.statusCode || 500,
        message: err.message || message
    };
}

module.exports = { formatError };
