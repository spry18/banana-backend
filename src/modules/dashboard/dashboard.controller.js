const Enquiry = require('../enquiries/enquiry.model');
const Packing = require('../execution/packing.model');
const Trip = require('../execution/trip.model');

// @desc    Get dashboard analytics
// @route   GET /api/dashboard/stats
// @access  Protected (Admin, Operational Manager)
const getAdminStats = async (req, res) => {
    try {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(startOfDay);
        endOfDay.setDate(endOfDay.getDate() + 1);

        const todayFilter = { createdAt: { $gte: startOfDay, $lt: endOfDay } };

        // Enquiries Stats
        const totalEnquiries = await Enquiry.countDocuments(todayFilter);
        const pendingEnquiries = await Enquiry.countDocuments({ status: { $in: ['PENDING', 'SELECTED'] }, ...todayFilter });
        const completedEnquiries = await Enquiry.countDocuments({ status: 'DELIVERED', ...todayFilter }); // Or whatever constitutes completed
        const unassignedEnquiries = await Enquiry.countDocuments({ status: 'PENDING', assignedSelectorId: null });

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
                completed: completedEnquiries,
                unassigned: unassignedEnquiries
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
