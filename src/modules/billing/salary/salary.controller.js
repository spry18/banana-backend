'use strict';
const asyncHandler = require('../shared/billing.asyncHandler');
const BillingEmployee = require('./employee.model');
const Payroll = require('./payroll.model');

/** GET /api/billing/salary/employees */
exports.getAll = asyncHandler(async (req, res) => {
  const { search = '', page = 1, limit = 20 } = req.query;
  const query = { isActive: true };
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { role: { $regex: search, $options: 'i' } },
    ];
  }
  const skip = (Number(page) - 1) * Number(limit);
  const [data, total] = await Promise.all([
    BillingEmployee.find(query).sort({ name: 1 }).skip(skip).limit(Number(limit)).lean(),
    BillingEmployee.countDocuments(query),
  ]);
  res.json({ success: true, data, pagination: { total, page: Number(page), limit: Number(limit) } });
});

/** GET /api/billing/salary/summary */
exports.getSummary = asyncHandler(async (req, res) => {
  const currentMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
  const [totalEmployees, monthlyPayroll, paidAgg, pendingAgg] = await Promise.all([
    BillingEmployee.countDocuments({ isActive: true }),
    BillingEmployee.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: null, total: { $sum: '$monthlySalary' } } },
    ]),
    Payroll.aggregate([
      { $match: { month: currentMonth, status: 'Paid' } },
      { $group: { _id: null, total: { $sum: '$totalPayable' }, count: { $sum: 1 } } },
    ]),
    Payroll.aggregate([
      { $match: { month: currentMonth, status: 'Pending' } },
      { $group: { _id: null, total: { $sum: '$totalPayable' }, count: { $sum: 1 } } },
    ]),
  ]);
  res.json({
    success: true,
    data: {
      totalEmployees,
      monthlyPayroll: monthlyPayroll[0]?.total ?? 0,
      paidThisMonth: paidAgg[0]?.total ?? 0,
      paidStaffCount: paidAgg[0]?.count ?? 0,
      pending: pendingAgg[0]?.total ?? 0,
      pendingStaffCount: pendingAgg[0]?.count ?? 0,
    },
  });
});

/** POST /api/billing/salary/employees */
exports.create = asyncHandler(async (req, res) => {
  const employee = await BillingEmployee.create(req.body);
  res.status(201).json({ success: true, data: employee });
});

/** GET /api/billing/salary/employees/:id */
exports.getById = asyncHandler(async (req, res) => {
  const employee = await BillingEmployee.findById(req.params.id).lean();
  if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
  // Include last 3 payrolls for profile panel
  const recentPayrolls = await Payroll.find({ employeeRef: req.params.id })
    .sort({ month: -1 })
    .limit(3)
    .lean();
  res.json({ success: true, data: { ...employee, recentPayrolls } });
});

/** PATCH /api/billing/salary/employees/:id */
exports.update = asyncHandler(async (req, res) => {
  const employee = await BillingEmployee.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  );
  if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
  res.json({ success: true, data: employee });
});

/** POST /api/billing/salary/payroll — Pay this month */
exports.createPayroll = asyncHandler(async (req, res) => {
  const { employeeId, month, salaryAmount, commissionAmount, totalPayable, bankName } = req.body;
  const employee = await BillingEmployee.findById(employeeId);
  if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
  // Check for duplicate payment this month
  const existing = await Payroll.findOne({ employeeRef: employeeId, month });
  if (existing) {
    return res.status(409).json({ success: false, message: `Salary for ${month} already recorded` });
  }
  const payroll = await Payroll.create({
    employeeRef: employeeId,
    employeeName: employee.name,
    month,
    salaryAmount: salaryAmount ?? employee.monthlySalary,
    commissionAmount: commissionAmount ?? 0,
    totalPayable: totalPayable ?? (employee.monthlySalary + (commissionAmount ?? 0)),
    bankName: bankName ?? employee.bankName,
    status: 'Paid',
    paidAt: new Date(),
  });
  res.status(201).json({ success: true, data: payroll });
});

/** GET /api/billing/salary/payroll/history */
exports.getPayrollHistory = asyncHandler(async (req, res) => {
  const { employeeId, page = 1, limit = 20 } = req.query;
  const query = employeeId ? { employeeRef: employeeId } : {};
  const skip = (Number(page) - 1) * Number(limit);
  const [data, total] = await Promise.all([
    Payroll.find(query).sort({ month: -1 }).skip(skip).limit(Number(limit)).lean(),
    Payroll.countDocuments(query),
  ]);
  res.json({ success: true, data, pagination: { total, page: Number(page), limit: Number(limit) } });
});
