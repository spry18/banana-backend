class NotificationService {
    static sendFarmerStatusUpdate(mobile, name, status) {
        console.log(`[SMS OUT] To: ${mobile} | Msg: Hello ${name}, your banana plot inspection has been marked as: ${status}.`);
    }

    static sendLogisticsAlert(mobile, role, message) {
        console.log(`[WhatsApp OUT] To: ${mobile} | Role: ${role} | Msg: ${message}`);
    }
}

module.exports = NotificationService;
