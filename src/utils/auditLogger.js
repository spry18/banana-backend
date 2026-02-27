const SystemAudit = require('../modules/auditing/systemAudit.model');

/**
 * Log a system action to the SystemAudit collection.
 * Wrapped in try/catch to ensure it doesn't break the main API request if logging fails.
 * 
 * @param {String} userId - The ID of the user performing the action
 * @param {String} action - The action performed (e.g., CREATE, UPDATE, DELETE)
 * @param {String} moduleName - The module where the action occurred
 * @param {String} [documentId] - The ID of the affected document (optional)
 * @param {String} [details] - Additional details about the action (optional)
 */
const logSystemAction = async (userId, action, moduleName, documentId = null, details = '') => {
    try {
        await SystemAudit.create({
            userId,
            action,
            moduleName,
            documentId,
            details,
        });
    } catch (error) {
        // Log the error to purely the console, don't throw it upward
        console.error('Failed to write to System Audit Log:', error);
    }
};

module.exports = {
    logSystemAction,
};
