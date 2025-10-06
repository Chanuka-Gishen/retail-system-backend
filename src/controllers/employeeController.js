import httpStatus from "http-status";
import { ObjectId } from "mongodb";

import employeeModel from "../models/employeeModel.js";
import { employeeSchema } from "../schemas/employee/employeeSchema.js";

import ApiResponse from "../services/ApiResponse.js";
import {
  error_code,
  info_code,
  success_code,
} from "../constants/statusCodes.js";
import {
  att_already_recorded,
  emp_exists,
  emp_id_exists,
  emp_leave_category_not_found,
  emp_leaves_limit_exceeded,
  emp_not_found,
  emp_registered_successfully,
  leave_rqst_already_pending,
  leave_rqst_not_found,
  success_message,
} from "../constants/messageConstants.js";
import {
  fDate,
  fTime,
  getDaysDifference,
  isValidString,
} from "../services/commonServices.js";
import employeeAttendenceModel from "../models/employeeAttendenceModel.js";
import {
  ATT_ABSENT,
  ATT_HALF_DAY,
  ATT_LEAVE,
  ATT_PRESENT,
} from "../constants/attendenceStatus.js";
import { employeeUpdateSchema } from "../schemas/employee/employeeUpdateSchema.js";
import { empAttendenceSchema } from "../schemas/employee/empAttendenceSchema.js";
import { is } from "date-fns/locale";
import {
  FULL_DAY_HOURS,
  HALF_DAY_HOURS,
  LEAVE_CAT_PERSONAL,
  LEAVE_CAT_SICK,
  LEAVE_CAT_VACATION,
  LEAVE_PERIOD_MORNING,
  LEAVE_STS_APPROVED,
  LEAVE_STS_PENDING,
  LEAVE_TYP_FULL,
  LEAVE_TYP_HALF,
} from "../constants/leaveConstants.js";
import leaveRequestModel from "../models/leaveRequestModel.js";
import { addLeaveRequestSchema } from "../schemas/employee/addLeaveSchema.js";
import { processLeaveSchema } from "../schemas/employee/processLeaveSchema.js";

// Register employee controller
export const createEmployeeController = async (req, res) => {
  const { error, value } = employeeSchema.validate(req.body);

  if (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json(ApiResponse.error(error_code, error.message));
  }

  try {
    const isExistingEmployee = await employeeModel.findOne({
      empNic: value.empNic,
    });

    if (isExistingEmployee) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(info_code, emp_exists));
    }

    const newEmp = new employeeModel({
      empId: value.empId.toUpperCase(),
      ...value,
    });

    await newEmp.save();

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, emp_registered_successfully));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Update employee details
export const updateEmployeeDetailsController = async (req, res) => {
  const { error, value } = employeeUpdateSchema.validate(req.body);

  if (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json(ApiResponse.error(error_code, error.message));
  }

  try {
    const emp = await employeeModel.findById(new ObjectId(value._id));

    if (!emp) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json(ApiResponse.error(error_code, emp_not_found));
    }

    if (emp.empId != value.empId) {
      const existingId = await employeeModel.findOne({
        empId: value.empId.toUpperCase(),
      });

      if (existingId) {
        return res
          .status(httpStatus.NOT_FOUND)
          .json(ApiResponse.error(error_code, emp_id_exists));
      }
    }

    if (emp.empNic != value.empNic) {
      const existingNic = await employeeModel.findOne({ empNic: value.empNic });

      if (existingNic) {
        return res
          .status(httpStatus.NOT_FOUND)
          .json(ApiResponse.error(error_code, emp_exists));
      }
    }

    value.empId = value.empId.toUpperCase();
    delete value._id;

    Object.assign(emp, value);

    await emp.save();

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Get all employee list controller
export const getEmployeesController = async (req, res) => {
  try {
    const page = parseInt(req.query.page);
    const limit = parseInt(req.query.limit);

    const skip = page * limit;

    const empName = req.query.name;
    const empNic = req.query.nic;

    const query = {};

    if (isValidString(empName)) {
      query.empFullName = {
        $regex: `${empName}`,
        $options: "i",
      };
    }

    if (isValidString(empNic)) {
      query.empNic = {
        $regex: `${empNic}`,
        $options: "i",
      };
    }

    const employees = await employeeModel
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    const count = await employeeModel.countDocuments(query);

    return res.status(httpStatus.OK).json(
      ApiResponse.response(success_code, success_message, {
        data: employees,
        count,
      })
    );
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Get employee information controller
export const getEmployeeController = async (req, res) => {
  try {
    const id = req.query.id;

    const employee = await employeeModel
      .findById(new ObjectId(id))
      .select("+empNic");

    if (!employee) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json(ApiResponse.error(error_code, emp_not_found));
    }

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message, employee));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Get employee attendence
export const getEmployeeAttendenceController = async (req, res) => {
  const page = parseInt(req.query.page);
  const limit = parseInt(req.query.limit);

  const skip = page * limit;

  const id = req.query.id;

  try {
    const data = await employeeAttendenceModel
      .find({ employee: new ObjectId(id) })
      .skip(skip)
      .limit(limit);
    const count = await employeeAttendenceModel.countDocuments({
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

// Get employees for selection
export const getEmployeesForSelectionController = async (req, res) => {
  const isIdRequired = req.query.isIdRequired || false;

  let data;

  try {
    if (!isIdRequired) {
      data = await employeeModel
        .find({ empIsActive: true })
        .select("_id empFullName");
    } else {
      data = await employeeModel
        .find({ empIsActive: true })
        .select("_id empFullName empId");
    }

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message, data));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Get employees attendences  - filter
export const getAllAttendencesController = async (req, res) => {
  const page = parseInt(req.query.page);
  const limit = parseInt(req.query.limit);

  const skip = page * limit;

  const filterEmpName = req.query.name;
  const filterEmpId = req.query.empId;
  const filterMonth = req.query.date;

  const query = {};

  if (filterMonth) {
    // Create dates with proper time handling
    const monthToFind = new Date(filterMonth).getMonth();
    const yearToFind = new Date(filterMonth).getFullYear();

    // Set start date to first day of month at 00:00:00.000
    const startDate = new Date(yearToFind, monthToFind, 1, 0, 0, 0, 0);

    // Set end date to last day of month at 23:59:59.999
    const endDate = new Date(yearToFind, monthToFind + 1, 0, 23, 59, 59, 999);

    query.date = {
      $gte: startDate,
      $lte: endDate,
    };
  }

  try {
    const data = await employeeAttendenceModel.aggregate([
      {
        $match: query,
      },
      {
        $lookup: {
          from: "employees",
          as: "employee",
          let: { employeeId: "$employee" }, // Define variables
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$_id", "$$employeeId"] }, // Match unit ID
                ...(isValidString(filterEmpName) && {
                  empFullName: {
                    $regex: `^${filterEmpName}`,
                    $options: "i",
                  },
                }),
                ...(isValidString(filterEmpId) && {
                  empId: {
                    $regex: `^${filterEmpId}`,
                    $options: "i",
                  },
                }),
              },
            },
          ],
        },
      },
      {
        $unwind: {
          path: "$employee",
        },
      },
      {
        $sort: { date: -1 },
      },
      {
        $skip: skip,
      },
      {
        $limit: limit,
      },
    ]);

    const documentCount = await employeeAttendenceModel.aggregate([
      {
        $match: query,
      },
      {
        $lookup: {
          from: "employees",
          as: "employee",
          let: { employeeId: "$employee" }, // Define variables
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$_id", "$$employeeId"] }, // Match unit ID
                ...(isValidString(filterEmpName) && {
                  empFullName: {
                    $regex: `^${filterEmpName}`,
                    $options: "i",
                  },
                }),
                ...(isValidString(filterEmpId) && {
                  empId: {
                    $regex: `^${filterEmpId}`,
                    $options: "i",
                  },
                }),
              },
            },
          ],
        },
      },
      {
        $unwind: {
          path: "$employee",
        },
      },
      {
        $count: "totalCount",
      },
    ]);

    const count = documentCount.length > 0 ? documentCount[0].totalCount : 0;

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

// Get employer attendence
export const getEmpAttendenceController = async (req, res) => {
  const id = req.query.id;
  const page = parseInt(req.query.page);
  const limit = parseInt(req.query.limit);

  const skip = page * limit;

  try {
    const emp = await employeeModel.findById(new ObjectId(id));

    if (!emp) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json(ApiResponse.error(error_code, emp_not_found));
    }

    const data = await employeeAttendenceModel
      .find({ employee: new ObjectId(id) })
      .skip(skip)
      .limit(limit);
    const count = await employeeAttendenceModel.countDocuments({
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

// Add employee attendence - Daily
export const addEmployeeAttendenceDailyController = async (req, res) => {
  const { error, value } = empAttendenceSchema.validate(req.body);

  if (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json(ApiResponse.error(error_code, error.message));
  }

  const { date, records } = value;

  const bulkOps = [];

  try {
    const emps = await employeeModel.find();

    for (const record of records) {
      const emp = emps.find((item) => item.empId === record.empId.toString());

      if (!emp) {
        return res
          .status(httpStatus.NOT_FOUND)
          .json(
            ApiResponse.error(error_code, emp_not_found + `, ${record.empId}`)
          );
      }

      const totalHours = calculateTimeDifference(
        record.checkIn,
        record.checkOut
      );

      const workHours = parseFloat(
        totalHours > FULL_DAY_HOURS ? FULL_DAY_HOURS : totalHours
      ).toFixed(2);
      const overTimeHours = parseFloat(
        totalHours > FULL_DAY_HOURS ? totalHours - FULL_DAY_HOURS : 0
      ).toFixed(2);

      const status =
        totalHours > HALF_DAY_HOURS
          ? ATT_PRESENT
          : totalHours === 0
          ? ATT_ABSENT
          : ATT_HALF_DAY;

      bulkOps.push({
        updateOne: {
          filter: {
            employee: new ObjectId(emp._id),
            date: date,
            status: { $ne: ATT_LEAVE },
          },
          update: {
            $set: {
              employee: new ObjectId(emp._id),
              date: date,
              status: status,
              checkIn: record.checkIn,
              checkOut: record.checkOut,
              totalHours: totalHours,
              workHours,
              overTimeHours,
            },
          },
          upsert: true,
        },
      });
    }
    let result = null;
    if (bulkOps.length > 0) {
      result = await employeeAttendenceModel.bulkWrite(bulkOps);
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

// Fetch employee leave requests
export const getEmpLeaveRequestsController = async (req, res) => {
  const filterByStatus = req.query.status || LEAVE_STS_PENDING;

  const page = parseInt(req.query.page);
  const limit = parseInt(req.query.limit);

  const skip = page * limit;

  try {
    const data = await leaveRequestModel
      .find({ leaveRequestStatus: filterByStatus })
      .sort({ leaveRequestStartDate: -1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path: "leaveRequestEmp",
        select: "empFullName empId",
      })
      .populate({
        path: "leaveRequestCreatedBy",
        select: "userFirstName userLastName",
      })
      .populate({
        path: "leaveRequestApprovedBy",
        select: "userFirstName userLastName",
      });
    const count = await leaveRequestModel.countDocuments({
      leaveRequestStatus: filterByStatus,
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

// Create employee leave request
export const createEmpLeaveRequestController = async (req, res) => {
  const { error, value } = addLeaveRequestSchema.validate(req.body);

  if (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json(ApiResponse.error(error_code, error.message));
  }

  const {
    leaveRequestEmp,
    leaveRequestCategory,
    leaveRequestStartDate,
    leaveRequestEndDate,
    leaveRequestType,
    leaveRequestHalfDayPeriod,
    leaveRequestReason,
  } = value;

  const startDate = new Date(leaveRequestStartDate);
  startDate.setHours(0, 0, 0, 0);

  let endDate = null;

  if (leaveRequestType === LEAVE_TYP_FULL && leaveRequestEndDate) {
    endDate = new Date(leaveRequestEndDate);
    endDate.setHours(23, 59, 59, 999);
  }

  const startDateMonth = new Date(
    startDate.getFullYear(),
    startDate.getMonth(),
    1
  );
  const endDateMonth = new Date(
    startDate.getFullYear(),
    startDate.getMonth() + 1,
    0
  );

  startDateMonth.setHours(0, 0, 0);
  endDateMonth.setHours(23, 59, 59, 999);

  const leaveRequestNoOfDays =
    leaveRequestType === LEAVE_TYP_HALF
      ? 0.5
      : getDaysDifference(startDate, endDate);

  try {
    const isEmpExists = await employeeModel.findById(
      new ObjectId(leaveRequestEmp)
    );

    if (!isEmpExists) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, emp_not_found));
    }

    const count = await employeeAttendenceModel.aggregate([
      {
        $match: {
          employee: new ObjectId(isEmpExists._id),
          date: {
            $gte: startDateMonth,
            $lte: endDateMonth,
          },
          status: ATT_LEAVE,
          leaveRequest: { $exists: true, $ne: null },
        },
      },
      {
        $lookup: {
          from: "leaveRequest",
          localField: "leaveRequest",
          foreignField: "_id",
          as: "leaveRequest",
        },
      },
      { $unwind: "$leaveRequest" },
      {
        $match: {
          "leaveRequest.leaveRequestCategory": leaveRequestCategory,
        },
      },
      {
        $count: "totalCount",
      },
    ]);

    const countLeaves = count.length > 0 ? count[0].totalCount : 0;

    switch (leaveRequestCategory) {
      case LEAVE_CAT_VACATION:
        if (
          isEmpExists.empLeaveBalance.vacation <
          countLeaves + leaveRequestNoOfDays
        ) {
          return res
            .status(httpStatus.BAD_REQUEST)
            .json(ApiResponse.error(error_code, emp_leaves_limit_exceeded));
        }
        break;
      case LEAVE_CAT_SICK:
        if (
          isEmpExists.empLeaveBalance.sick <
          countLeaves + leaveRequestNoOfDays
        ) {
          return res
            .status(httpStatus.BAD_REQUEST)
            .json(ApiResponse.error(error_code, emp_leaves_limit_exceeded));
        }
        break;
      case LEAVE_CAT_PERSONAL:
        if (
          isEmpExists.empLeaveBalance.personal <
          countLeaves + leaveRequestNoOfDays
        ) {
          return res
            .status(httpStatus.BAD_REQUEST)
            .json(ApiResponse.error(error_code, emp_leaves_limit_exceeded));
        }
        break;

      default:
        return res
          .status(httpStatus.BAD_REQUEST)
          .json(ApiResponse.error(error_code, emp_leave_category_not_found));
    }

    const isExistRecord = await leaveRequestModel.findOne({
      leaveRequestEmp: new ObjectId(leaveRequestEmp),
      leaveRequestStatus: LEAVE_STS_PENDING,
    });

    if (isExistRecord) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, leave_rqst_already_pending));
    }

    await leaveRequestModel.create({
      leaveRequestEmp: new ObjectId(leaveRequestEmp),
      leaveRequestStartDate: startDate,
      leaveRequestEndDate: endDate,
      leaveRequestCategory,
      leaveRequestType,
      leaveRequestHalfDayPeriod,
      leaveRequestReason,
      leaveRequestNoOfDays,
      leaveRequestCreatedBy: new ObjectId(req.user.id),
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

// Process employee leave request
export const processEmpLeaveRequestController = async (req, res) => {
  const { error, value } = processLeaveSchema.validate(req.body);

  if (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json(ApiResponse.error(error_code, error.message));
  }

  const { _id, leaveRequestStatus, leaveRequestRejectionReason } = value;

  try {
    const record = await leaveRequestModel.findById(new ObjectId(_id));

    if (!record || record?.leaveRequestStatus != LEAVE_STS_PENDING) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, leave_rqst_not_found));
    }

    if (leaveRequestStatus === LEAVE_STS_APPROVED) {
      const startDate = new Date(record.leaveRequestStartDate);
      const endDate =
        record.leaveRequestType === LEAVE_TYP_FULL
          ? new Date(record.leaveRequestEndDate)
          : new Date(record.leaveRequestStartDate);
      endDate.setHours(23, 59, 59, 999);

      // Generate records for each date
      const attendanceRecords = [];

      // ------------------------------------------------------Check half day time hours and total hours-------------------

      while (startDate <= endDate) {
        // Skip weekends
        if (startDate.getDay() !== 0) {
          const isExistAttendence = await employeeAttendenceModel.findOne({
            employee: new ObjectId(record.leaveRequestEmp),
            date: startDate,
          });

          if (isExistAttendence) {
            return res
              .status(httpStatus.BAD_REQUEST)
              .json(
                ApiResponse.error(
                  error_code,
                  att_already_recorded + fDate(startDate)
                )
              );
          }

          const isHalfDay = record.leaveRequestType === LEAVE_TYP_HALF;

          const checkIn = !isHalfDay
            ? new Date(startDate.setHours(8, 0, 0))
            : isHalfDay &&
              record.leaveRequestHalfDayPeriod === LEAVE_PERIOD_MORNING
            ? new Date(startDate.setHours(8, 0, 0))
            : new Date(startDate.setHours(13, 0, 0));

          const checkOut = !isHalfDay
            ? new Date(endDate.setHours(18, 0, 0))
            : isHalfDay &&
              record.leaveRequestHalfDayPeriod === LEAVE_PERIOD_MORNING
            ? new Date(endDate.setHours(13, 0, 0))
            : new Date(endDate.setHours(18, 0, 0));

          attendanceRecords.push({
            employee: new ObjectId(record.leaveRequestEmp),
            date: new Date(startDate),
            status: ATT_LEAVE,
            leaveRequest: new ObjectId(record._id),
            checkIn,
            checkOut,
            totalHours: isHalfDay ? HALF_DAY_HOURS : FULL_DAY_HOURS,
            workHours: isHalfDay ? HALF_DAY_HOURS : FULL_DAY_HOURS,
            overTimeHours: 0,
          });
        }

        // Move to next day
        startDate.setDate(startDate.getDate() + 1);
      }

      await employeeAttendenceModel.insertMany(attendanceRecords);
    }

    record.leaveRequestStatus = leaveRequestStatus;
    record.leaveRequestRejectionReason = leaveRequestRejectionReason;
    record.leaveRequestApprovedAt = new Date();
    record.leaveRequestApprovedBy = new ObjectId(req.user.id);

    await record.save();

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

//--------------------------------------------------------------------------

// Calculate time difference for attendence
const calculateTimeDifference = (checkIn, checkOut) => {
  // Ensure valid dates
  if (!(checkIn instanceof Date) || !(checkOut instanceof Date)) {
    throw new Error("Invalid date objects provided");
  }

  // Calculate difference in milliseconds
  const diffMs = checkOut - checkIn;

  // Convert to hours (with 2 decimal places)
  const hours = parseFloat((diffMs / (1000 * 60 * 60)).toFixed(2));

  return hours;
};
