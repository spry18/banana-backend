class NotificationService {
    static sendEnquiryReceived(mobile, name, enquiryId) {
        console.log(`[SMS OUT] To: ${mobile} | Msg: Hello ${name}, we received your plot details (Ref: ${enquiryId}). A field selector will be assigned soon.`);
    }
    static sendInspectionRejected(mobile, name) {
        console.log(`[SMS OUT] To: ${mobile} | Msg: Hello ${name}, unfortunately, your plot was not selected during this inspection.`);
    }
    static sendScheduleConfirmed(mobile, name, date, munshiName, munshiMobile) {
        console.log(`[SMS OUT] To: ${mobile} | Msg: Hello ${name}, harvest scheduled for ${date}. Munshi ${munshiName} (${munshiMobile}) will lead the team.`);
    }
    static sendPackingSummary(mobile, name, totalBoxes, wastage) {
        console.log(`[SMS OUT] To: ${mobile} | Msg: Hello ${name}, packing is complete. Total Boxes: ${totalBoxes}, Wastage: ${wastage}kg. The truck is being loaded.`);
    }
    static sendLogisticsAlert(mobile, role, message) {
        console.log(`[WhatsApp OUT] To: ${mobile} | Role: ${role} | Msg: ${message}`);
    }
    static sendDealCancelled(mobile, name) {
        console.log(`[SMS OUT] To: ${mobile} | Msg: Hello ${name}, as discussed, your plot enquiry has been closed as we couldn't finalize the commercial terms. Thank you for considering VaxTrack.`);
    }
    static sendDieselAdvanceReceipt(mobile, driverName, amount, vehicleNumber) {
        console.log(`[WhatsApp OUT] To: ${mobile} | Msg: Hello ${driverName}, a diesel advance of ₹${amount} has been issued to you for vehicle ${vehicleNumber}. Please retain your fuel receipts for records.`);
    }
    static sendPetrolAdvanceReceipt(mobile, name, amount, vehicleNumber) {
        const vehicleInfo = vehicleNumber ? ` for vehicle ${vehicleNumber}` : '';
        console.log(`[WhatsApp OUT] To: ${mobile} | Msg: Hello ${name}, a petrol advance of ₹${amount} has been issued to you${vehicleInfo}. Please retain your fuel receipts for records.`);
    }
}
module.exports = NotificationService;
