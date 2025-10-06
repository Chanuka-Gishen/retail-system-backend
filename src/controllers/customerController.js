import httpStatus from "http-status";
import { ObjectId } from "mongodb";

import ApiResponse from "../services/ApiResponse.js";
import {
  error_code,
  info_code,
  success_code,
} from "../constants/statusCodes.js";

import customerModel from "../models/customerModel.js";
import {
  cannot_send_sms_now,
  customer_not_found,
  customer_receivables_not,
  customer_registered_successfully,
  existing_customer,
  existing_vehicle,
  success_message,
} from "../constants/messageConstants.js";
import { customerSchema } from "../schemas/customer/customerSchema.js";
import customerVehicleModel from "../models/customerVehicleModel.js";
import {
  formatCurrency,
  formatMobileNumber,
  formatText,
  isValidString,
} from "../services/commonServices.js";
import { customerUpdateSchema } from "../schemas/customer/customerUpdateSchema.js";
import { bulkSmsSchema } from "../schemas/bulkSmsSchema.js";
import constantModel from "../models/constantModel.js";
import {
  CONSTANT_SMS,
  NOTIFICATION_SMS,
  NOTIFICATION_TITLE_GREETINGS,
  NOTIFICATION_TITLE_NOTIF,
  NOTIFICATION_TITLE_OFFERS,
} from "../constants/constants.js";
import workOrderModel from "../models/workorderModel.js";
import notificationModel from "../models/notificationModel.js";

// Register customer - admin
export const registerCustomerController = async (req, res) => {
  try {
    const { error, value } = customerSchema.validate(req.body);

    if (error) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, error.message));
    }
    const {
      customerPrefix,
      customerType,
      customerName,
      customerMobile,
      customerSecondaryMobile,
      customerEmail,
      vehicleNumber,
      vehicleManufacturer,
      vehicleModel,
      vehicleType,
    } = value;

    const isExistCustomer = await customerModel.findOne({ customerMobile });

    if (isExistCustomer) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(info_code, existing_customer));
    }

    const formattedVehicleNumber = formatText(vehicleNumber);

    const isExistingVehicle = await customerVehicleModel
      .findOne({ formattedVehicleNumber })
      .populate("vehicleOwner");

    if (isExistingVehicle) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(
          ApiResponse.error(
            info_code,
            existing_vehicle + isExistingVehicle.vehicleOwner.customerName
          )
        );
    }

    const newCustomer = new customerModel({
      customerPrefix,
      customerType,
      customerName,
      customerMobile: formatMobileNumber(customerMobile),
      customerSecondaryMobile: customerSecondaryMobile
        ? formatMobileNumber(customerSecondaryMobile)
        : "",
      customerEmail,
    });

    const savedCustomer = await newCustomer.save();

    const newVehicle = new customerVehicleModel({
      vehicleOwner: savedCustomer._id,
      vehicleManufacturer,
      vehicleModel,
      vehicleNumber: formattedVehicleNumber,
      vehicleType,
    });

    await newVehicle.save();

    return res
      .status(httpStatus.OK)
      .json(
        ApiResponse.response(
          success_code,
          customer_registered_successfully,
          savedCustomer
        )
      );
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Update customer - Super admin
export const updateCustomerController = async (req, res) => {
  const id = req.query.id;

  try {
    const { error, value } = customerUpdateSchema.validate(req.body);

    if (error) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, error.message));
    }

    const customer = await customerModel.findById(new ObjectId(id));

    if (!customer) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json(ApiResponse.error(error_code, customer_not_found));
    }

    if (customer.customerMobile != value.customerMobile) {
      const isExistCustomer = await customerModel.findOne({
        customerMobile: value.customerMobile,
      });

      if (isExistCustomer) {
        return res
          .status(httpStatus.BAD_REQUEST)
          .json(ApiResponse.error(info_code, existing_customer));
      }
    }

    value.customerMobile = formatMobileNumber(value.customerMobile);
    value.customerSecondaryMobile = value.customerSecondaryMobile
      ? formatMobileNumber(value.customerSecondaryMobile)
      : value.customerSecondaryMobile;

    Object.assign(customer, value);

    await customer.save();

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Get all customers - admin
export const getAllCustomersController = async (req, res) => {
  try {
    const page = parseInt(req.query.page);
    const limit = parseInt(req.query.limit);

    const skip = page * limit;

    const customerName = req.query.name;
    const customerMobile = req.query.mobile;
    const customerSecMobile = req.query.secMobile;
    const filteredVehicleNumber = req.query.vehicleNumber;

    const query = {};

    if (isValidString(customerName)) {
      query.customerName = {
        $regex: `${customerName}`,
        $options: "i",
      };
    }

    if (isValidString(customerMobile)) {
      query.customerMobile = {
        $regex: `${customerMobile}`,
        $options: "i",
      };
    }

    if (isValidString(customerSecMobile)) {
      query.customerSecondaryMobile = {
        $regex: `${customerSecMobile}`,
        $options: "i",
      };
    }

    const data = await customerModel.aggregate([
      {
        $match: query,
      },
      {
        $lookup: {
          from: "vehicles",
          localField: "_id",
          foreignField: "vehicleOwner",
          as: "customerVehicles",
        },
      },
      {
        $match: {
          ...(isValidString(filteredVehicleNumber) && {
            "customerVehicles.vehicleNumber": {
              $regex: `${filteredVehicleNumber}`,
              $options: "i",
            },
          }),
        },
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $skip: skip,
      },
      {
        $limit: limit,
      },
    ]);

    const totalCount = await customerModel.aggregate([
      {
        $match: query,
      },
      {
        $lookup: {
          from: "vehicles",
          localField: "_id",
          foreignField: "vehicleOwner",
          as: "customerVehicles",
        },
      },
      {
        $match: {
          ...(isValidString(filteredVehicleNumber) && {
            "customerVehicles.vehicleNumber": {
              $regex: filteredVehicleNumber,
              $options: "i",
            },
          }),
        },
      },
      {
        $count: "totalCount",
      },
    ]);

    const count = totalCount.length > 0 ? totalCount[0].totalCount : 0;

    return res.status(httpStatus.OK).json(
      ApiResponse.response(success_code, success_message, {
        data,
        count,
      })
    );
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Get customer information populated - admin
export const getCustomerInfoController = async (req, res) => {
  try {
    const id = req.query.id;

    const result = await customerModel.aggregate([
      { $match: { _id: new ObjectId(id) } },
      {
        $lookup: {
          from: "vehicles",
          localField: "_id",
          foreignField: "vehicleOwner",
          as: "customerVehicles",
        },
      },
    ]);

    if (result.length === 0) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json(ApiResponse.error(error_code, customer_not_found));
    }

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message, result[0]));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Get all sms notifications
export const getSmsNotitificationsController = async (req, res) => {
  const page = parseInt(req.query.page);
  const limit = parseInt(req.query.limit);

  const skip = page * limit;
  try {
    const data = await notificationModel
      .find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const count = await notificationModel.countDocuments();

    return res.status(httpStatus.OK).json(
      ApiResponse.response(success_code, success_message, {
        data,
        count,
      })
    );
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Get customer sms notifications
export const getCustomerSmsNotificationsController = async (req, res) => {
  const page = parseInt(req.query.page);
  const limit = parseInt(req.query.limit);
  const id = req.query.id;

  const skip = page * limit;

  try {
    const customer = await customerModel.findById(new ObjectId(id));

    const data = await notificationModel
      .find({
        $or: [
          { notificationCustomer: new ObjectId(id) },
          {
            $and: [
              { createdAt: { $gt: customer.createdAt } },
              {
                notificationTitle: {
                  $in: [
                    NOTIFICATION_TITLE_GREETINGS,
                    NOTIFICATION_TITLE_OFFERS,
                  ],
                },
              },
            ],
          },
        ],
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const count = await notificationModel.countDocuments({
      $or: [
        { notificationCustomer: new ObjectId(id) },
        {
          $and: [
            { createdAt: { $gt: customer.createdAt } },
            {
              notificationTitle: {
                $in: [NOTIFICATION_TITLE_GREETINGS, NOTIFICATION_TITLE_OFFERS],
              },
            },
          ],
        },
      ],
    });

    return res.status(httpStatus.OK).json(
      ApiResponse.response(success_code, success_message, {
        data,
        count,
      })
    );
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Send bulk sms notifications to customers - TODO
export const sendBulkSmsController = async (req, res) => {
  const { value, error } = bulkSmsSchema.validate(req.body);

  if (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json(ApiResponse.error(error_code, error.message));
  }

  try {
    const canProceed = await constantModel.findOne({
      constantName: CONSTANT_SMS,
    });

    if (!canProceed || !canProceed.constantIsAvailable) {
      return res
        .status(httpStatus.PRECONDITION_FAILED)
        .json(ApiResponse.error(info_code, cannot_send_sms_now));
    }

    await constantModel.findOneAndUpdate(
      { constantName: CONSTANT_SMS },
      { constantIsAvailable: false }
    );

    let processedNumbers = [];
    const batchSize = 100;
    let skip = 0;
    let hasMore = true;

    while (hasMore) {
      // Get a batch of customers
      const customers = await customerModel
        .find()
        .select("customerMobile")
        .skip(skip)
        .limit(batchSize)
        .lean();

      if (customers.length < 100) {
        hasMore = false;
      }

      const batchNumbers = customers
        .map((customer) => {
          if (!customer.customerMobile) return null;

          // Remove all non-digit characters
          let cleanNumber = customer.customerMobile.replace(/\D/g, "");

          // Remove leading zeros
          cleanNumber = cleanNumber.replace(/^0+/, "");

          if (cleanNumber.length > 9) return null;

          return cleanNumber;
        })
        .filter(Boolean); // Remove null/undefined values

      processedNumbers = [...processedNumbers, ...batchNumbers];
      skip += batchSize;

      // Optional: Add delay between batches to prevent DB overload
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await notificationModel.create({
      notificationContent: value.messageContent,
      notificationType: NOTIFICATION_SMS,
      notificationTitle: value.messageType,
      notificationRecipientCount: processedNumbers.length,
      messageSuccessCount: 1,
      messageFailedCount: 0,
    });

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  } finally {
    await constantModel.findOneAndUpdate(
      { constantName: CONSTANT_SMS },
      { constantIsAvailable: true }
    );
  }
};

// Send customer invoice balance remainder
export const sendInvoiceBalanceRemainder = async (req, res) => {
  const id = req.query.id;

  try {
    const customer = await customerModel.findById(new ObjectId(id));

    if (!customer) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, customer_not_found));
    }

    const result = await workOrderModel.aggregate([
      {
        $match: {
          workOrderCustomer: new ObjectId(customer._id),
        },
      },
      {
        $group: {
          _id: "$workOrderCustomer",
          totalRevenue: { $sum: "$workOrderTotalAmount" },
          totalPaid: { $sum: "$workOrderPaidAmount" },
          totalReceivable: { $sum: "$workOrderBalanceAmount" },
          workOrderCount: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          totalRevenue: 1,
          totalPaid: 1,
          totalReceivable: 1,
          workOrderCount: 1,
        },
      },
    ]);

    const totalReceivable = result.length > 0 ? result[0].totalReceivable : 0;

    if (totalReceivable <= 0) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, customer_receivables_not));
    }

    const messageContent = `Hi ${customer.customerPrefix} ${
      customer.customerName
    }, your vehicle service/repair payment of ${formatCurrency(
      totalReceivable
    )} is pending. Kindly settle at your earliest. Thank you!`;

    await notificationModel.create({
      notificationType: NOTIFICATION_SMS,
      notificationTitle: NOTIFICATION_TITLE_NOTIF,
      notificationContent: messageContent,
      notificationCustomer: new ObjectId(customer._id),
      notificationRecipientCount: 1,
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

// Stats - Total Unique Customers Count
export const getUniqueCustomersCountController = async (req, res) => {
  try {
    const result = await workOrderModel.aggregate([
      {
        $group: {
          _id: "$workOrderCustomer",
        },
      },
      {
        $count: "count",
      },
    ]);

    const count = result[0]?.count || 0;

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message, count));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Stats - Repeating Customers Count
export const getRepeatingCustomersCountController = async (req, res) => {
  try {
    const result = await workOrderModel.aggregate([
      {
        $group: {
          _id: "$workOrderCustomer",
          orderCount: { $sum: 1 },
        },
      },
      {
        $match: {
          orderCount: { $gt: 1 },
        },
      },
      {
        $count: "count",
      },
    ]);

    const count = result[0]?.count || 0;

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message, count));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Stats - New Customers Count this month
export const getNewCustomersCountController = async (req, res) => {
  try {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();

    // Current month data
    const currentMonthStart = new Date(currentYear, currentMonth, 1);
    const currentMonthEnd = new Date(
      currentYear,
      currentMonth + 1,
      0,
      23,
      59,
      59,
      999
    );

    // Previous month data
    const prevMonthStart = new Date(currentYear, currentMonth - 1, 1);
    const prevMonthEnd = new Date(
      currentYear,
      currentMonth,
      0,
      23,
      59,
      59,
      999
    );

    const [currentMonthData, prevMonthData] = await Promise.all([
      workOrderModel.aggregate([
        {
          $match: {
            createdAt: { $gte: currentMonthStart, $lte: currentMonthEnd },
          },
        },
        {
          $group: {
            _id: "$workOrderCustomer",
          },
        },
        {
          $count: "newCustomers",
        },
      ]),
      workOrderModel.aggregate([
        {
          $match: {
            createdAt: { $gte: prevMonthStart, $lte: prevMonthEnd },
          },
        },
        {
          $group: {
            _id: "$workOrderCustomer",
          },
        },
        {
          $count: "newCustomers",
        },
      ]),
    ]);

    const currentCount = currentMonthData[0]?.newCustomers || 0;
    const prevCount = prevMonthData[0]?.newCustomers || 0;

    let percentageChange = 0;
    if (prevCount > 0) {
      percentageChange = ((currentCount - prevCount) / prevCount) * 100;
    } else if (currentCount > 0) {
      percentageChange = 100;
    }

    return res.status(httpStatus.OK).json(
      ApiResponse.response(success_code, success_message, {
        currentMonthCount: currentCount,
        previousMonthCount: prevCount,
        percentageChange: percentageChange.toFixed(2),
      })
    );
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};
