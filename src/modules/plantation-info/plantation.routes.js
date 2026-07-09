const express = require('express');
const router = express.Router();
const {
    createPlantation,
    getPlantations,
    getPlantationById,
    updatePlantation,
    deletePlantation,
} = require('./plantation.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

// POST /api/plantation-info - Public submission (Google Form replacement)
router.post('/', createPlantation);

// GET /api/plantation-info - List all (Admin, Field Owner)
router.get('/', protect, authorize('Admin', 'Field Owner'), getPlantations);

// GET /api/plantation-info/:id - Get detail (Admin, Field Owner)
router.get('/:id', protect, authorize('Admin', 'Field Owner'), getPlantationById);

// PUT /api/plantation-info/:id - Update (Admin, Field Owner)
router.put('/:id', protect, authorize('Admin', 'Field Owner'), updatePlantation);

// DELETE /api/plantation-info/:id - Delete (Admin only)
router.delete('/:id', protect, authorize('Admin'), deletePlantation);

module.exports = router;
