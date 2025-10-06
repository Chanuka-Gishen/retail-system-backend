import { ObjectId } from "mongodb";
import httpStatus from "http-status";

import ApiResponse from "../services/ApiResponse.js";
import { createEmpSalarySchema } from "../schemas/employee/createEmpSalarySchema.js";
import employeeModel from "../models/employeeModel.js";
import {
  error_code,
  info_code,
  success_code,
} from "../constants/statusCodes.js";
import {
  att_incomplete,
  emp_bonus_cannot_delete_processed,
  emp_bonus_record_not_found,
  emp_not_found,
  emp_not_found_to_payroll,
  emp_salary_change_records_empty,
  emp_salary_schema_exists,
  emp_salary_schema_not_found,
  success_message,
  success_message_delete,
} from "../constants/messageConstants.js";
import empSalaryModel from "../models/empSalaryModel.js";
import { updateEmpSalarySchema } from "../schemas/employee/updateEmpSalarySchema.js";
import salaryChangeModel from "../models/salaryChangeModel.js";
import addEmpBonusSchema from "../schemas/employee/addEmpBonusSchema.js";
import empBonusModel from "../models/empBonusModel.js";
import { SAL_BONUS_STS_PROCESSED } from "../constants/payrollConstants.js";
import { salaryChangeSchema } from "../schemas/employee/salaryChangeSchema.js";
import { payrollSchema } from "../schemas/employee/payrollSchema.js";
import employeeAttendenceModel from "../models/employeeAttendenceModel.js";
import {
  ATT_ABSENT,
  ATT_HALF_DAY,
  ATT_LEAVE,
  ATT_PRESENT,
} from "../constants/attendenceStatus.js";
import paymentModel from "../models/paymentModel.js";

// Create employee salary schema
export const createEmpSalarySchemaController = async (req, res) => {
  const { error, value } = createEmpSalarySchema.validate(req.body);

  if (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json(ApiResponse.error(error_code, error.message));
  }
  try {
    const emp = await employeeModel.findById(new ObjectId(value.employeeId));

    if (!emp) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json(ApiResponse.error(error_code, emp_not_found));
    }

    const existingSchema = await empSalaryModel.findOne({
      employeeId: new ObjectId(value.employeeId),
    });

    if (existingSchema) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, emp_salary_schema_exists));
    }

    const recurringAllowances = value.recurringAllowances.map((item) => ({
      ...item,
      enteredBy: new ObjectId(req.user.id),
    }));

    const otherEarnings = value.otherRecurringEarnings.map((item) => ({
      ...item,
      enteredBy: new ObjectId(req.user.id),
    }));

    await empSalaryModel.create({
      ...value,
      recurringAllowances,
      otherRecurringEarnings: otherEarnings,
      employeeId: new ObjectId(emp._id),
    });

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Update employee salary schema
export const updateEmpSalarySchemaController = async (req, res) => {
  const { error, value } = updateEmpSalarySchema.validate(req.body);

  if (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json(ApiResponse.error(error_code, error.message));
  }
  try {
    const salarySchema = await empSalaryModel.findById(new ObjectId(value._id));

    if (!salarySchema) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json(ApiResponse.error(error_code, emp_salary_schema_not_found));
    }

    const recurringAllowances = value.recurringAllowances.map((item) => ({
      ...item,
      enteredBy: item.enteredBy ?? new ObjectId(req.user.id),
    }));

    const otherEarnings = value.otherRecurringEarnings.map((item) => ({
      ...item,
      enteredBy: item.enteredBy ?? new ObjectId(req.user.id),
    }));

    salarySchema.recurringAllowances = recurringAllowances;
    salarySchema.otherRecurringEarnings = otherEarnings;
    salarySchema.epfEligible = value.epfEligible;
    salarySchema.etfEligible = value.etfEligible;

    await salarySchema.save();

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Update employee salary
export const updateEmployeeSalaryController = async (req, res) => {
  const { error, value } = salaryChangeSchema.validate(req.body);

  if (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json(ApiResponse.error(error_code, error.message));
  }
  try {
    const emp = await employeeModel.findById(new ObjectId(value.employee));

    if (!emp) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json(ApiResponse.error(error_code, emp_not_found));
    }

    const empSalSchema = await empSalaryModel.findOne({
      employeeId: new ObjectId(emp._id),
    });

    if (!empSalSchema) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json(ApiResponse.error(error_code, emp_salary_schema_not_found));
    }

    const salaryDifference = value.newSalary - empSalSchema.baseSalary;
    const salaryDifferencePerc =
      (salaryDifference / empSalSchema.baseSalary) * 100;

    const effectiveDate = new Date();
    effectiveDate.setDate(effectiveDate.getDate() + 1);
    effectiveDate.setHours(0, 0, 0, 0);

    await salaryChangeModel.create({
      employee: new ObjectId(emp._id),
      currentSalary: empSalSchema.baseSalary,
      newSalary: value.newSalary,
      difference: salaryDifference,
      percentageChange: Math.round(salaryDifferencePerc * 100) / 100,
      changeType: value.changeType,
      reason: value.reason,
      effectiveDate,
      approvedBy: new ObjectId(req.user.id),
    });

    empSalSchema.baseSalary = value.newSalary;
    await empSalSchema.save();

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Fetch employee salary schema
export const getEmpSalarySchemaController = async (req, res) => {
  const id = req.query.id;
  try {
    const data = await empSalaryModel.findOne({ employeeId: new ObjectId(id) });

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message, data));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Add employees bonus
export const addEmpBonusesController = async (req, res) => {
  const { error, value } = addEmpBonusSchema.validate(req.body);

  if (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json(ApiResponse.error(error_code, error.message));
  }
  try {
    const emp = await employeeModel.findById(new ObjectId(value.bonusEmp));

    if (!emp) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json(ApiResponse.error(error_code, emp_not_found));
    }

    const empSalSchema = await empSalaryModel.findOne({
      employeeId: new ObjectId(emp._id),
    });

    if (!empSalSchema) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json(ApiResponse.error(error_code, emp_salary_schema_not_found));
    }

    const bonusDate = new Date(value.bonusMonth);
    const bonusMonth = `${bonusDate.getFullYear()}-${bonusDate.getMonth()}`;

    await empBonusModel.create({
      bonusEmp: new ObjectId(emp._id),
      bonusAmount: value.bonusAmount,
      bonusDescription: value.bonusDescription,
      bonusMonth,
      bonusEnteredBy: new ObjectId(req.user.id),
    });

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Delete employee bonus not processed
export const deleteEmpBonusController = async (req, res) => {
  const id = req.query.id;
  try {
    const record = await empBonusModel.findById(new ObjectId(id));

    if (!record) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json(ApiResponse.error(error_code, emp_bonus_record_not_found));
    }

    if (record.bonusStatus === SAL_BONUS_STS_PROCESSED) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, emp_bonus_cannot_delete_processed));
    }

    await empBonusModel.deleteOne(record);

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message_delete));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Get employee bonus history
export const getEmpBonusHistoryController = async (req, res) => {
  const id = req.query.id;

  const page = parseInt(req.query.page || 0);
  const limit = parseInt(req.query.limit || 10);

  const skip = page * limit;

  try {
    const data = await empBonusModel
      .find({ bonusEmp: new ObjectId(id) })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path: "bonusEnteredBy",
        select: "userFirstName userLastName",
      });

    const count = await empBonusModel.countDocuments({
      bonusEmp: new ObjectId(id),
    });

    return res
      .status(httpStatus.OK)
      .json(
        ApiResponse.response(success_code, success_message, { data, count })
      );
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Get employee salary change history
export const getEmpSalaryChangeHistoryController = async (req, res) => {
  const id = req.query.id;

  const page = parseInt(req.query.page || 0);
  const limit = parseInt(req.query.limit || 10);

  const skip = page * limit;

  try {
    const data = await salaryChangeModel
      .find({ employee: new ObjectId(id) })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path: "approvedBy",
        select: "userFirstName userLastName",
      });

    const count = await salaryChangeModel.countDocuments({
      employee: new ObjectId(id),
    });

    return res
      .status(httpStatus.OK)
      .json(
        ApiResponse.response(success_code, success_message, { data, count })
      );
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Undo last salary change
export const undoLastSalaryChangeController = async (req, res) => {
  const id = req.query.id;

  try {
    const emp = await employeeModel.findById(new ObjectId(id));

    if (!emp) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json(ApiResponse.error(error_code, emp_not_found));
    }

    const salSchema = await empSalaryModel.findOne({
      employeeId: new ObjectId(emp._id),
    });

    if (!salSchema) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, emp_salary_schema_not_found));
    }

    const record = await salaryChangeModel
      .find({ employee: new ObjectId(emp._id) })
      .sort({ createdAt: -1 });

    if (record.length === 0) {
      return res
        .status(httpStatus.OK)
        .json(ApiResponse.response(info_code, emp_salary_change_records_empty));
    }

    salSchema.baseSalary = record[0].currentSalary;
    await salSchema.save();

    await salaryChangeModel.deleteOne(record[0]);

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Generate monthly employees payrolls
export const generateMonthlyPayrollController = async (req, res) => {
  const { error, value } = payrollSchema.validate(req.body);

  if (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json(ApiResponse.error(error_code, error.message));
  }

  const { selectedEmployees, selectAll, fromDate, toDate } = value;

  const startDate = new Date(fromDate);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(toDate);
  endDate.setHours(23, 59, 59, 999);

  try {
    const employees = await employeeModel.find({ empIsActive: true });
    if (!employees.length) {
      return res
        .status(httpStatus.PRECONDITION_FAILED)
        .json(ApiResponse.error(info_code, emp_not_found_to_payroll));
    }

    let payrollsDocs = [];
    let totalGross = 0;
    let totalDeductions = 0;
    let totalEarnings = 0;
    let totalNet = 0;

    for (const emp of employees) {
      const empSalSchema = await empSalaryModel.findOne({
        employeeId: new ObjectId(emp._id),
      });

      if (!empSalSchema) {
        return res
          .status(httpStatus.PRECONDITION_FAILED)
          .json(
            ApiResponse.error(
              error_code,
              `${emp_salary_schema_not_found} for EmpID ${emp.empId}`
            )
          );
      }

      const attendanceRecords = await employeeAttendenceModel.find({
        employee: new ObjectId(emp._id),
        date: { $gte: startDate, $lte: endDate },
      });

      const totalDays = getWorkingDays(startDate, endDate);
      if (attendanceRecords.length < totalDays) {
        return res
          .status(httpStatus.NOT_FOUND)
          .json(
            ApiResponse.error(error_code, `${att_incomplete}${emp.empFullName}`)
          );
      }

      let totalAttendedDays = 0;
      let totalAbsentDays = 0;
      let totalLeaveDays = 0;
      let totalHalfDays = 0;
      let totalWorkHours = 0;
      let totalOvertimeHours = 0;

      attendanceRecords.forEach((record) => {
        // Count attendance statuses
        if (record.status === ATT_PRESENT) {
          totalAttendedDays++;
        } else if (record.status === ATT_ABSENT) {
          totalAbsentDays++;
        } else if (record.status === ATT_LEAVE) {
          totalLeaveDays++;
        } else if (record.status === ATT_HALF_DAY) {
          totalHalfDays++;
        }

        // Sum work hours (convert to number in case they're stored as strings)
        totalWorkHours += Number(record.workHours) || 0;
        totalOvertimeHours += Number(record.overTimeHours) || 0;
      });

      const empBonuses = await empBonusModel.find({
        bonusMonth: `${startDate.getFullYear()}-${startDate.getMonth()}`,
      });

      const empPayments = await paymentModel.find({
        paymentEmployee: new ObjectId(emp._id),
        createdAt: { $gte: startDate, $lte: endDate },
      });

      const basicSalary = empSalSchema.baseSalary;
      const perDaySalary = Math.round((basicSalary / totalDays) * 100) / 100;

      const totalBonusAmount = empBonuses.reduce((sum, record) => {
        return sum + record.bonusAmount;
      }, 0);

      const totalAllowances = empSalSchema.recurringAllowances.reduce(
        (sum, allowance) => sum + (allowance.amount || 0),
        0
      );

      const totalOtherEarnings = empSalSchema.otherRecurringEarnings.reduce(
        (sum, earning) => sum + (earning.amount || 0),
        0
      );

      const totalAdvancePayments = empPayments.reduce((sum, record) => {
        return sum + record.paymentAmount;
      }, 0);
      // deductions, leave + overtime pay

      const totalLeaveDeductions =
        totalAbsentDays * perDaySalary + totalAbsentDays * 1000;
    }

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Helper fn to calculate working days excluding Sundays
const getWorkingDays = (start, end) => {
  const startDate = new Date(start);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(end);
  endDate.setHours(23, 59, 59, 999);
  let count = 0;

  while (startDate <= endDate) {
    const day = startDate.getDay();
    if (day !== 0) count++; // 0 = Sunday
    startDate.setDate(startDate.getDate() + 1);
  }

  return count;
};
