const Enquiry = require('../enquiries/enquiry.model');
const Packing = require('../execution/packing.model');
const Trip = require('../execution/trip.model');

// @desc    Get dashboard analytics
// @route   GET /api/dashboard/stats
// @access  Protected (Admin, Operational Manager)
const getAdminStats = async (req, res) => {
    try {
        // Enquiries Stats
        const totalEnquiries = await Enquiry.countDocuments();
        const pendingEnquiries = await Enquiry.countDocuments({ status: { $in: ['PENDING', 'SELECTED'] } });
        const completedEnquiries = await Enquiry.countDocuments({ status: 'DELIVERED' }); // Or whatever constitutes completed

        // Packing Stats
        const packingStats = await Packing.aggregate([
            {
                $group: {
                    _id: null,
                    totalBoxes: { $sum: '$totalBoxes' },
                    wastageKg: { $sum: '$wastageKg' }
                }
            }
        ]);

        // Trip Stats
        const tripStats = await Trip.aggregate([
            {
                $group: {
                    _id: null,
                    totalKm: { $sum: '$totalKm' },
                    tollExpense: { $sum: '$tollExpense' }
                }
            }
        ]);

        res.status(200).json({
            enquiries: {
                total: totalEnquiries,
                pending: pendingEnquiries,
                completed: completedEnquiries
            },
            packing: {
                totalBoxes: packingStats.length > 0 ? packingStats[0].totalBoxes : 0,
                wastageKg: packingStats.length > 0 ? packingStats[0].wastageKg : 0
            },
            trips: {
                totalKm: tripStats.length > 0 ? tripStats[0].totalKm : 0,
                tollExpense: tripStats.length > 0 ? tripStats[0].tollExpense : 0
            }
        });

    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({ message: 'Server error while fetching dashboard stats' });
    }
};

module.exports = {
    getAdminStats
};
