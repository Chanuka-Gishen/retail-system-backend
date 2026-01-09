import httpStatus from "http-status";
import { ObjectId } from "mongodb";
import PDFDocument from "pdfkit";

import ApiResponse from "../services/ApiResponse.js";
import {
  error_code,
  info_code,
  success_code,
  warning_code,
} from "../constants/statusCodes.js";
import workOrderModel from "../models/workorderModel.js";
import customerModel from "../models/customerModel.js";
import customerVehicleModel from "../models/customerVehicleModel.js";
import { workOrderSchema } from "../schemas/workorder/workOrderSchema.js";
import {
  customer_email_not_found,
  customer_not_found,
  item_not_found,
  success_message,
  vehicle_not_found,
  wo_already_completed,
  wo_exists,
  wo_invalid_status,
  wo_invoice_email_already_sent,
  wo_invoice_email_sent,
  wo_invoice_not_created,
  wo_not_closed,
  wo_not_found,
} from "../constants/messageConstants.js";
import {
  STATUS_CLOSED,
  STATUS_COMPLETED,
  STATUS_OPEN,
} from "../constants/workorderStatus.js";
import { workOrderUpdateSchema } from "../schemas/workorder/workorderUpdateSchema.js";
import { SEQ_WO } from "../constants/sequenceConstants.js";
import { getSequenceValue, updateSequenceValue } from "./sequenceController.js";
import {
  generateInvoiceNumber,
  isValidString,
} from "../services/commonServices.js";
import { generateInvoice } from "../services/pdfServices.js";
import {
  WO_TYPE_REPAIR,
  WO_TYPE_SERVICE,
} from "../constants/workorderTypes.js";
import { PAY_STATUS, PAY_STATUS_PAID } from "../constants/paymentStatus.js";
import { workOrderAssigneesSchema } from "../schemas/workorder/assignEmpSchema.js";
import inventoryModel from "../models/inventoryModel.js";
import itemBpHistoryModel from "../models/itemBpHistoryModel.js.js";
import {
  PRICE_CHANGE_ACTIVE,
  PRICE_CHANGE_COMPLETED,
  PRICE_CHANGE_CREATED,
} from "../constants/priceChangeStatus.js";
import { updateAccountData } from "./inventoryController.js";
import {
  PAYMENT_TYPE_IN,
  PAYMENT_TYPE_OUT,
} from "../constants/paymentTypes.js";
import { ACC_TYP_RECEIVABLES } from "../constants/accountTypes.js";
import { sendWorkorderInvoiceEmail } from "../services/emailServices.js";
import notificationModel from "../models/notificationModel.js";
import {
  NOTIFICATION_EMAIL,
  NOTIFICATION_TITLE_NOTIF,
} from "../constants/constants.js";

// Create workorder
export const createWorkOrderController = async (req, res) => {
  const { error, value } = workOrderSchema.validate(req.body);

  if (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json(ApiResponse.error(error_code, error.message));
  }
  try {
    const isCustomerExist = await customerModel.findById(
      new ObjectId(value.workOrderCustomer)
    );

    if (!isCustomerExist) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, customer_not_found));
    }

    const isVehicleExist = await customerVehicleModel.findById(
      new ObjectId(value.workOrderVehicle)
    );

    if (!isVehicleExist) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, vehicle_not_found));
    }

    const isOpenOrderExists = await workOrderModel.findOne({
      workOrderVehicle: new ObjectId(isVehicleExist._id),
      workOrderStatus: { $ne: STATUS_CLOSED },
    });

    if (isOpenOrderExists) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(
          ApiResponse.error(info_code, wo_exists + isVehicleExist.vehicleNumber)
        );
    }

    const newOrder = new workOrderModel({
      workOrderCustomer: new ObjectId(isCustomerExist._id),
      workOrderVehicle: new ObjectId(isVehicleExist._id),
      workOrderMileage: value.workOrderMileage,
      workOrderType: value.workOrderType,
    });

    await newOrder.save();

    return res
      .status(httpStatus.CREATED)
      .json(ApiResponse.response(success_code, success_message));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Update work order
export const updateWorkOrderController = async (req, res) => {
  const { error, value } = workOrderUpdateSchema.validate(req.body);

  if (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json(ApiResponse.error(error_code, error.message));
  }

  try {
    const workOrder = await workOrderModel.findById(new ObjectId(value._id));

    if (!workOrder) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, wo_not_found));
    }

    if (workOrder.workOrderStatus === STATUS_CLOSED) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(info_code, wo_already_completed));
    }

    const serviceItemsTotal = calculateItemTotal(value.workOrderServiceItems);
    const customItemsTotal = calculateItemTotal(value.workOrderCustomItems);

    // Calculate total
    const totalCharges = value.workOrderCustomChargers.reduce(
      (sum, charge) => sum + charge.chargeAmount || 0,
      0
    );

    const subtotal =
      serviceItemsTotal +
      customItemsTotal +
      totalCharges +
      value.workOrderServiceCharge +
      value.workOrderOtherChargers;

    const percentageDiscount =
      subtotal * (value.workOrderDiscountPercentage / 100);
    const cashDiscount = value.workOrderDiscountCash;
    const totalDiscount = percentageDiscount + cashDiscount;

    const totalAmount = subtotal - totalDiscount;
    const balanceAmount = totalAmount - workOrder.workOrderPaidAmount;

    const totalDifference = totalAmount - workOrder.workOrderTotalAmount;

    workOrder.workOrderMileage = value.workOrderMileage;

    // Update inventory quantity--------------------------------------

    const newRecords = compareItemLists(
      workOrder.workOrderServiceItems,
      value.workOrderServiceItems
    ).added;
    const deletedRecords = compareItemLists(
      workOrder.workOrderServiceItems,
      value.workOrderServiceItems
    ).deleted;
    const updatedRecords = compareItemLists(
      workOrder.workOrderServiceItems,
      value.workOrderServiceItems
    ).updated;

    if (newRecords.length > 0) {
      for (const item of newRecords) {
        const dbItem = await inventoryModel.findById(
          new ObjectId(item.inventoryItem)
        );

        if (!dbItem) {
          return res
            .status(httpStatus.BAD_REQUEST)
            .json(ApiResponse.error(error_code, item_not_found));
        }

        if (dbItem.itemQuantity < item.quantity) {
          return res
            .status(httpStatus.PRECONDITION_FAILED)
            .json(
              ApiResponse.response(
                info_code,
                `Insufficient stock for item: ${dbItem.itemName}`
              )
            );
        }

        // Check for buying price changes and update

        const newQtyMargin = dbItem.itemBpChangeMargin - item.quantity;

        if (newQtyMargin <= 0) {
          const latestBpChange = await itemBpHistoryModel
            .findOne({ changeStatus: PRICE_CHANGE_CREATED })
            .sort({ createdAt: 1 });

          if (latestBpChange) {
            dbItem.itemBpChangeMargin = latestBpChange.stockMargin;
            dbItem.itemBuyingPrice = latestBpChange.itemNewPrice;

            await dbItem.save();

            latestBpChange.changeStatus = PRICE_CHANGE_ACTIVE;
            latestBpChange.effectiveFrom = new Date();

            await latestBpChange.save();

            await itemBpHistoryModel.findOneAndUpdate(
              { changeStatus: PRICE_CHANGE_ACTIVE },
              {
                $set: {
                  changeStatus: PRICE_CHANGE_COMPLETED,
                  effectiveTo: new Date(),
                },
              }
            );
          }
        }
      }

      await Promise.all(
        newRecords.map(async (item) => {
          await inventoryModel.findByIdAndUpdate(
            new ObjectId(item.inventoryItem),
            {
              $inc: { itemQuantity: -item.quantity },
            }
          );
        })
      );
    }

    if (deletedRecords.length > 0) {
      await Promise.all(
        deletedRecords.map(async (item) => {
          await inventoryModel.findByIdAndUpdate(
            new ObjectId(item.inventoryItem),
            {
              $inc: { itemQuantity: +item.quantity },
            }
          );
        })
      );
    }

    if (updatedRecords.length > 0) {
      for (const item of updatedRecords) {
        const dbItem = await inventoryModel.findById(
          new ObjectId(item.inventoryItem)
        );

        if (!dbItem) {
          return res
            .status(httpStatus.BAD_REQUEST)
            .json(ApiResponse.error(error_code, item_not_found));
        }

        if (dbItem.itemQuantity + item.quantityChange < 0) {
          return res
            .status(httpStatus.PRECONDITION_FAILED)
            .json(
              ApiResponse.response(
                info_code,
                `Insufficient stock for item: ${dbItem.itemName}`
              )
            );
        }

        // Check for buying price changes and update

        const newQtyMargin = dbItem.itemBpChangeMargin + item.quantityChange;

        if (newQtyMargin <= 0) {
          const latestBpChange = await itemBpHistoryModel
            .findOne({ changeStatus: PRICE_CHANGE_CREATED })
            .sort({ createdAt: 1 });

          if (latestBpChange) {
            dbItem.itemBpChangeMargin = latestBpChange.stockMargin;
            dbItem.itemBuyingPrice = latestBpChange.itemNewPrice;

            await dbItem.save();

            latestBpChange.changeStatus = PRICE_CHANGE_ACTIVE;
            latestBpChange.effectiveFrom = new Date();

            await latestBpChange.save();

            await itemBpHistoryModel.findOneAndUpdate(
              { changeStatus: PRICE_CHANGE_ACTIVE },
              {
                $set: {
                  changeStatus: PRICE_CHANGE_COMPLETED,
                  effectiveTo: new Date(),
                },
              }
            );
          }
        }
      }

      await Promise.all(
        updatedRecords.map(async (item) => {
          if (item.quantityChange != 0) {
            await inventoryModel.findByIdAndUpdate(
              new ObjectId(item.inventoryItem),
              {
                $inc: { itemQuantity: item.quantityChange },
              }
            );
          }
        })
      );
    }

    //-------------------------------------------------------------

    const sortedServiceItems = value.workOrderServiceItems.sort((a, b) => {
      const nameA = a.inventoryItemName.toUpperCase(); // ignore case
      const nameB = b.inventoryItemName.toUpperCase(); // ignore case
      return nameA.localeCompare(nameB);
    });

    const sortedCustomItems = value.workOrderCustomItems.sort((a, b) => {
      const nameA = a.inventoryItemName.toUpperCase(); // ignore case
      const nameB = b.inventoryItemName.toUpperCase(); // ignore case
      return nameA.localeCompare(nameB);
    });

    const sortedCustomChargers = value.workOrderCustomChargers.sort((a, b) => {
      const nameA = a.chargeName.toUpperCase(); // ignore case
      const nameB = b.chargeName.toUpperCase(); // ignore case
      return nameA.localeCompare(nameB);
    });

    workOrder.workOrderServiceItems = sortedServiceItems.map((item) => ({
      ...item,
      inventoryItem: new ObjectId(item.inventoryItem),
      cashDiscount: item.cashDiscount || 0,
      totalPrice:
        (item.quantity + item.exQuantity || 0) * item.unitPrice -
        (item.cashDiscount || 0),
    }));

    workOrder.workOrderCustomItems = sortedCustomItems.map((item) => ({
      ...item,
      cashDiscount: item.cashDiscount || 0,
      totalPrice: item.quantity * item.unitPrice - (item.cashDiscount || 0),
    }));

    workOrder.workOrderCustomChargers = sortedCustomChargers;

    workOrder.workOrderType = value.workOrderType;
    workOrder.workOrderServiceCharge = value.workOrderServiceCharge;
    workOrder.workOrderOtherChargers = value.workOrderOtherChargers;
    workOrder.workOrderNotes = value.workOrderNotes;
    workOrder.workOrderDiscountPercentage = value.workOrderDiscountPercentage;
    workOrder.workOrderDiscountCash = value.workOrderDiscountCash;
    workOrder.workOrderTotalAmount = totalAmount;
    workOrder.workOrderGrossAmount = subtotal;
    workOrder.workOrderBalanceAmount = balanceAmount;

    await workOrder.save();

    // if (value.workOrderStatus === STATUS_COMPLETED) {
    //   await Promise.all(
    //     savedWorkOrder.workOrderServiceItems.map(async (item) => {
    //       await Inventory.findByIdAndUpdate(new ObjectId(item.inventoryItem), {
    //         $inc: { itemQuantity: -item.quantity },
    //       });
    //     })
    //   );
    // }

    if (totalDifference != 0) {
      const paymentType =
        totalDifference > 0 ? PAYMENT_TYPE_IN : PAYMENT_TYPE_OUT;

      await updateAccountData(
        ACC_TYP_RECEIVABLES,
        PAYMENT_TYPE_IN,
        totalDifference
      );
    }

    return res
      .status(httpStatus.CREATED)
      .json(ApiResponse.response(success_code, success_message));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Get work orders with filter
export const getAllWorkordersController = async (req, res) => {
  try {
    const page = parseInt(req.query.page);
    const limit = parseInt(req.query.limit);

    const skip = page * limit;

    const customerName = req.query.name;
    const vehicleNumber = req.query.vehicleNo;
    const invoiceNumber = req.query.invoiceNo;
    const paymentStatus = req.query.paymentStatus;

    const query = {};
    query.workOrderStatus = STATUS_CLOSED;

    if (isValidString(invoiceNumber)) {
      query.workOrderInvoiceNumber = {
        $regex: `${invoiceNumber}`,
        $options: "i",
      };
    }

    if (PAY_STATUS.includes(paymentStatus)) {
      query.workOrderPaymentStatus = paymentStatus;
    }

    const result = await workOrderModel.aggregate([
      {
        $match: query,
      },
      {
        $lookup: {
          from: "customers",
          as: "customer",
          let: { customerId: "$workOrderCustomer" }, // Define variables
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$_id", "$$customerId"] }, // Match unit ID
                ...(isValidString(customerName) && {
                  customerName: {
                    $regex: `^${customerName}`,
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
          path: "$customer",
        },
      },
      {
        $lookup: {
          from: "vehicles",
          as: "vehicle",
          let: { vehicleId: "$workOrderVehicle" }, // Define variables
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$_id", "$$vehicleId"] }, // Match unit ID
                ...(isValidString(vehicleNumber) && {
                  vehicleNumber: {
                    $regex: `${vehicleNumber}`,
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
          path: "$vehicle",
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

    const documentCount = await workOrderModel.aggregate([
      {
        $match: query,
      },
      {
        $lookup: {
          from: "customers",
          as: "customer",
          let: { customerId: "$workOrderCustomer" }, // Define variables
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$_id", "$$customerId"] }, // Match unit ID
                ...(isValidString(customerName) && {
                  customerName: {
                    $regex: `^${customerName}`,
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
          path: "$customer",
        },
      },
      {
        $lookup: {
          from: "vehicles",
          as: "vehicle",
          let: { vehicleId: "$workOrderVehicle" }, // Define variables
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$_id", "$$vehicleId"] }, // Match unit ID
                ...(isValidString(vehicleNumber) && {
                  vehicleNumber: {
                    $regex: `^${vehicleNumber}`,
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
          path: "$vehicle",
        },
      },
      {
        $count: "totalCount",
      },
    ]);

    const count = documentCount.length > 0 ? documentCount[0].totalCount : 0;

    return res.status(httpStatus.OK).json(
      ApiResponse.response(success_code, success_message, {
        data: result,
        count,
      })
    );
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Get active work orders
export const getActiveWorkOrdersController = async (req, res) => {
  try {
    const data = await workOrderModel
      .find({ workOrderStatus: { $ne: STATUS_CLOSED } })
      .populate("workOrderCustomer")
      .populate("workOrderVehicle");

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message, data));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Download PDF invoice - workorder
export const downloadWorkOrderController = async (req, res) => {
  const id = req.query.id;
  try {
    const data = await workOrderModel
      .findById(new ObjectId(id))
      .populate("workOrderCustomer")
      .populate("workOrderVehicle");

    if (!data) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, wo_not_found));
    }

    if (
      data.workOrderStatus === STATUS_OPEN ||
      data.workOrderTotalAmount === 0
    ) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, wo_invoice_not_created));
    }

    // Create a new PDF document
    const doc = new PDFDocument({
      size: [420, 595],
      margins: { top: 20, left: 20, right: 20, bottom: 20 },
    });

    // Set response headers
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename=${data.workOrderInvoiceNumber}.pdf`
    );

    // Stream the PDF buffer to the response
    doc.pipe(res);

    const itemList = [
      ...data.workOrderServiceItems,
      ...data.workOrderCustomItems,
    ].sort((a, b) => a.inventoryItemName.localeCompare(b.inventoryItemName));

    await generateInvoice(doc, data, itemList);

    doc.end();
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Update work order to COMPLETE status
export const updateToCompleteController = async (req, res) => {
  const id = req.query.id;
  try {
    const job = await workOrderModel.findById(new ObjectId(id));

    if (!job) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, wo_not_found));
    }

    if (job.workOrderStatus != STATUS_OPEN) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, wo_invalid_status));
    }

    if (job.workOrderTotalAmount > 0) {
      await updateSequenceValue(SEQ_WO);
      const sequenceValue = await getSequenceValue(SEQ_WO);

      const invoiceNumber = generateInvoiceNumber(sequenceValue);
      job.workOrderInvoiceNumber = invoiceNumber;
    }

    job.workOrderStatus = STATUS_COMPLETED;

    await job.save();

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Update work order to CLOSED status
export const updateToCloseController = async (req, res) => {
  const id = req.query.id;
  try {
    const job = await workOrderModel.findById(new ObjectId(id));

    if (!job) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, wo_not_found));
    }

    if (job.workOrderStatus != STATUS_COMPLETED) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, wo_invalid_status));
    }

    job.workOrderStatus = STATUS_CLOSED;
    job.workOrderPaymentStatus =
      job.workOrderTotalAmount === 0
        ? PAY_STATUS_PAID
        : job.workOrderPaymentStatus;
    job.workOrderType = job.workOrderType ?? WO_TYPE_SERVICE;
    await job.save();

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Get work order details
export const getWorkOrderController = async (req, res) => {
  const id = req.query.id;

  try {
    const job = await workOrderModel.aggregate([
      {
        $match: { _id: new ObjectId(id) },
      },
      {
        $lookup: {
          from: "customers",
          localField: "workOrderCustomer",
          foreignField: "_id",
          as: "workOrderCustomer",
        },
      },
      {
        $lookup: {
          from: "vehicles",
          localField: "workOrderVehicle",
          foreignField: "_id",
          as: "workOrderVehicle",
        },
      },
      {
        $unwind: "$workOrderCustomer",
      },
      {
        $unwind: "$workOrderVehicle",
      },
      {
        $lookup: {
          from: "payments",
          localField: "_id",
          foreignField: "paymentworkOrder",
          as: "workOrderPayments",
        },
      },
    ]);

    if (!job) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, wo_not_found));
    }

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message, job[0]));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Get employee workorders
export const getEmployeeWorkordersController = async (req, res) => {
  const page = parseInt(req.query.page);
  const limit = parseInt(req.query.limit);

  const skip = page * limit;

  const id = req.query.id;

  try {
    const data = await workOrderModel
      .find({ "workOrderAssignees._id": new ObjectId(id) })
      .skip(skip)
      .limit(limit)
      .populate("workOrderVehicle");
    const count = await workOrderModel.countDocuments({
      "workOrderAssignees._id": new ObjectId(id),
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

// Get customer workorders
export const getCustomerWorkordersController = async (req, res) => {
  const id = req.query.id;

  const page = parseInt(req.query.page);
  const limit = parseInt(req.query.limit);

  const skip = page * limit;
  try {
    const customer = await customerModel.findById(new ObjectId(id));

    if (!customer) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json(ApiResponse(error_code, customer_not_found));
    }

    const data = await workOrderModel
      .find({ workOrderCustomer: new ObjectId(customer._id) })
      .skip(skip)
      .limit(limit)
      .populate("workOrderVehicle")
      .sort({ createdAt: -1 });

    const count = await workOrderModel.countDocuments({
      workOrderCustomer: new ObjectId(customer._id),
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

// Get customer revenue and receivables
export const getCustomerPaymentStatsController = async (req, res) => {
  const id = req.query.id;

  try {
    const result = await workOrderModel.aggregate([
      {
        $match: {
          workOrderCustomer: new ObjectId(id),
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

    return res.status(httpStatus.OK).json(
      ApiResponse.response(success_code, success_message, {
        totalRevenue: result.length > 0 ? result[0].totalRevenue : 0,
        totalReceivable: result.length > 0 ? result[0].totalReceivable : 0,
      })
    );
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Assign employees to the workorder
export const workOrderAssigneesController = async (req, res) => {
  const id = req.query.id;
  const { error, value } = workOrderAssigneesSchema.validate(req.body);

  if (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json(ApiResponse.error(error_code, error.message));
  }

  try {
    const workorder = await workOrderModel.findById(new ObjectId(id));

    if (!workorder) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, wo_not_found));
    }

    workorder.workOrderAssignees = value;
    workorder.workOrderType = workorder.workOrderType ?? WO_TYPE_REPAIR;

    await workorder.save();

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Send workorder invoice to customer email
export const workorderInvoiceEmailController = async (req, res) => {
  const id = req.query.id;
  const isResend = req.query.isResend;

  try {
    const data = await workOrderModel
      .findById(new ObjectId(id))
      .populate("workOrderCustomer")
      .populate("workOrderVehicle");

    if (!data) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, wo_not_found));
    }

    if (!isValidString(data.workOrderCustomer?.customerEmail)) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, customer_email_not_found));
    }

    if (data.workOrderStatus != STATUS_CLOSED) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(info_code, wo_not_closed));
    }

    const existingEmail = await notificationModel.findOne({
      notificationWorkorder: new ObjectId(data._id),
    });

    if (!isResend && existingEmail) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(warning_code, wo_invoice_email_already_sent));
    }

    await sendWorkorderInvoiceEmail(data.workOrderCustomer.customerEmail, data);

    await notificationModel.create({
      notificationWorkorder: new ObjectId(data._id),
      notificationCustomer: new ObjectId(data.workOrderCustomer._id),
      notificationType: NOTIFICATION_EMAIL,
      notificationTitle: NOTIFICATION_TITLE_NOTIF,
      notificationContent: "Workorder invoice emailed",
    });

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, wo_invoice_email_sent));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Statistics - Total revenue per day last 7 days
export const totalRevenueChartController = async (req, res) => {
  try {
    const data = await workOrderModel.aggregate([
      [
        {
          $match: {
            createdAt: {
              $gte: new Date(
                new Date().setHours(0, 0, 0, 0) - 7 * 24 * 60 * 60 * 1000
              ), // Last 7 days
              $lt: new Date(new Date().setHours(23, 59, 59, 999)),
            },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$createdAt",
              },
            },
            totalRevenue: { $sum: "$workOrderTotalAmount" },
            count: { $sum: 1 },
          },
        },
        {
          $sort: {
            _id: 1,
          },
        },
        {
          $project: {
            date: "$_id",
            totalRevenue: 1,
            _id: 0,
          },
        },
      ],
    ]);

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message, data));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Statistics - Total jobs per day last 7 days
export const totalJobsChartController = async (req, res) => {
  try {
    const data = await workOrderModel.aggregate([
      {
        $match: {
          createdAt: {
            $gte: new Date(
              new Date().setHours(0, 0, 0, 0) - 7 * 24 * 60 * 60 * 1000
            ), // Last 7 days
            $lt: new Date(new Date().setHours(23, 59, 59, 999)),
          },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$createdAt",
            },
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: {
          _id: 1,
        },
      },
      {
        $project: {
          date: "$_id",
          count: 1,
          _id: 0,
        },
      },
    ]);

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message, data));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Get today total revenue
export const getTodayTotalRevenueController = async (req, res) => {
  try {
    const data = await workOrderModel.aggregate([
      {
        $match: {
          createdAt: {
            $gte: new Date(new Date().setHours(0, 0, 0, 0)), // Start of today
            $lt: new Date(new Date().setHours(23, 59, 59, 999)), // End of today
          },
        },
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$workOrderPaidAmount" },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          totalRevenue: 1,
          orderCount: "$count",
        },
      },
    ]);

    const totalRevenue = data.length > 0 ? data[0].totalRevenue : 0;

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message, totalRevenue));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Get total receivables
export const getTotalReceivablesController = async (req, res) => {
  try {
    const data = await workOrderModel.aggregate([
      {
        $match: {
          workOrderBalanceAmount: { $gt: 0 }, // Only orders with outstanding balance
        },
      },
      { 
        $group: {
          _id: null,
          totalReceivables: { $sum: "$workOrderBalanceAmount" },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          totalReceivables: 1,
          outstandingOrderCount: "$count",
        },
      },
    ]);

    return res
      .status(httpStatus.OK)
      .json(
        ApiResponse.response(
          success_code,
          success_message,
          data[0].totalReceivables
        )
      );
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Get total active jobs count
export const getTotalActiveJobsCountController = async (req, res) => {
  try {
    const data = await workOrderModel.countDocuments({
      workOrderStatus: { $ne: STATUS_CLOSED },
    });

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message, data));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Calculate total amount
export const calculateItemTotal = (items) => {
  return items.reduce((sum, item) => {
    item.totalPrice = (item.quantity + (item.exQuantity || 0)) * item.unitPrice;
    return sum + item.totalPrice - (item.cashDiscount || 0);
  }, 0);
};

// Compare service items
const compareItemLists = (oldItems, newItems) => {
  const oldMap = Object.fromEntries(
    oldItems.map((item) => [item.inventoryItem, item])
  );
  const newMap = Object.fromEntries(
    newItems.map((item) => [item.inventoryItem, item])
  );

  // New items: in newItems but not in oldItems
  const added = newItems.filter((item) => !oldMap[item.inventoryItem]);

  // Deleted items: in oldItems but not in newItems
  const deleted = oldItems.filter((item) => !newMap[item.inventoryItem]);

  // Updated items: same itemCode, but different quantity or unit price
  const updated = newItems
    .filter((item) => {
      const old = oldMap[item.inventoryItem];
      if (!old) return false;
      return old.quantity !== item.quantity || old.unitPrice !== item.unitPrice;
    })
    .map((item) => {
      const old = oldMap[item.inventoryItem];
      return {
        inventoryItem: item.inventoryItem,
        inventoryItemName: item.inventoryItemName,
        oldQuantity: old.quantity,
        newQuantity: item.quantity,
        quantityChange: old.quantity - item.quantity,
        oldUnitPrice: old.unitPrice,
        newUnitPrice: item.unitPrice,
      };
    });

  return { added, deleted, updated };
};
