const { AsyncLocalStorage } = require('async_hooks');
const mongoose = require('mongoose');
const { formatError } = require('../utils/errorFormatter');

const asyncLocalStorage = new AsyncLocalStorage();

// Store original Mongoose thenable methods
const originalQueryThen = mongoose.Query.prototype.then;
const originalModelSave = mongoose.Model.prototype.save;

// Patch Mongoose Query prototype to capture database query errors
mongoose.Query.prototype.then = function(onFulfilled, onRejected) {
    const res = asyncLocalStorage.getStore();
    return originalQueryThen.call(this, onFulfilled, (err) => {
        if (err && res) {
            res.__lastMongooseError = err;
        }
        if (onRejected) {
            return onRejected(err);
        } else {
            throw err;
        }
    });
};

// Patch Mongoose Model save prototype to capture database validation/duplicate key/save errors
mongoose.Model.prototype.save = function(options) {
    const res = asyncLocalStorage.getStore();
    return originalModelSave.call(this, options).catch((err) => {
        if (res) {
            res.__lastMongooseError = err;
        }
        throw err;
    });
};

// Patch Mongoose Aggregate prototype to capture database aggregation errors
if (mongoose.Aggregate && mongoose.Aggregate.prototype.then) {
    const originalAggregateThen = mongoose.Aggregate.prototype.then;
    mongoose.Aggregate.prototype.then = function(onFulfilled, onRejected) {
        const res = asyncLocalStorage.getStore();
        return originalAggregateThen.call(this, onFulfilled, (err) => {
            if (err && res) {
                res.__lastMongooseError = err;
            }
            if (onRejected) {
                return onRejected(err);
            } else {
                throw err;
            }
        });
    };
}

/**
 * Express middleware to hook into and format all backend error messages before sending to FE.
 */
const responseInterceptor = (req, res, next) => {
    // Run request pipeline within the AsyncLocalStorage context so Mongoose patches can locate 'res'
    asyncLocalStorage.run(res, () => {
        const originalStatus = res.status;
        const originalJson = res.json;
        let currentStatus = 200;

        // Wrap res.status to track the HTTP status code
        res.status = function(code) {
            currentStatus = code;
            originalStatus.call(this, code);
            return this;
        };

        // Wrap res.json to catch and format errors
        res.json = function(body) {
            const isErrorStatus = currentStatus >= 400;
            const lastError = res.__lastMongooseError;

            if (isErrorStatus || lastError) {
                let errorToFormat = lastError;

                // Fallback to body.error or body.message string/object if no explicit Mongoose error is captured
                if (!errorToFormat && body && typeof body === 'object') {
                    errorToFormat = body.error || body.message;
                }

                if (errorToFormat) {
                    const { statusCode: formattedStatus, message: formattedMessage } = formatError(errorToFormat);

                    // Only override status code if currentStatus is 500 and formattedStatus is not 500,
                    // or if formattedStatus is 4xx and we want to correct a 500.
                    if (formattedStatus !== currentStatus && (currentStatus === 500 || formattedStatus !== 500)) {
                        currentStatus = formattedStatus;
                        originalStatus.call(this, formattedStatus);
                    }

                    // Reformat response body payload structure
                    if (body && typeof body === 'object') {
                        body.message = formattedMessage;
                        delete body.error; // remove raw/nested error detail
                    } else {
                        body = { message: formattedMessage };
                    }
                }
            }

            return originalJson.call(this, body);
        };

        next();
    });
};

module.exports = { responseInterceptor };
