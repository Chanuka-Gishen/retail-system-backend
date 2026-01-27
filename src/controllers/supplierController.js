import httpStatus from "http-status";
import { ObjectId } from "mongodb";

import ApiResponse from "../services/ApiResponse.js";
import { error_code, success_code } from "../constants/statusCodes.js";
import { supplierValidationSchema } from "../schemas/supplier/supplierSchema.js";
import supplierModel from "../models/supplierModel.js";
import {
  grn_not_found,
  payment_already_completed,
  return_already_processed,
  return_not_processed,
  return_qty_not_valid,
  return_record_not_found,
  sm_not_found,
  success_message,
  supplier_not_found,
  supplier_registered,
  supplier_return_record_exists,
} from "../constants/messageConstants.js";
import { isValidString } from "../services/commonServices.js";
import stockMovementModel from "../models/stockMovementModel.js";
import paymentModel from "../models/paymentModel.js";
import {
  PAY_STATUS_COMPLETED,
  PAY_STATUS_PENDING,
} from "../constants/paymentStatus.js";
import {
  PAYMENT_TYPE_IN,
  PAYMENT_TYPE_OUT,
} from "../constants/paymentTypes.js";
import { PAY_SC_RETURNS, PAY_SC_INVENTORY } from "../constants/paymentSource.js";
import {
  PAY_METHOD_BACK_TRN,
  PAY_METHOD_CARD,
  PAY_METHOD_CASH,
  PAY_METHOD_CHEQUE,
  PAY_METHOD_CREDIT,
  PAY_METHOD_MOBILE,
  PAY_METHOD_OTHER,
} from "../constants/paymentMethods.js";
import {
  ACC_TYP_BANK,
  ACC_TYP_CASH,
  ACC_TYP_PAYABLES,
} from "../constants/accountTypes.js";
import { updateAccountData } from "./inventoryController.js";
import { stockPaymentSchema } from "../schemas/payments/stockPaymentSchema.js";
import grnModel from "../models/grnModel.js";
import { returnStockSchema } from "../schemas/grn/returnStockSchema.js";
import itemReturnModel from "../models/itemReturnModel.js";
import {
  RETURN_STS,
  RETURN_STS_CANCELED,
  RETURN_STS_PENDING,
  RETURN_STS_PROCESSED,
} from "../constants/returnStatus.js";
import { returnProcessSchema } from "../schemas/grn/returnProcessSchema.js";
import {
  RETURN_TYP_CASH,
  RETURN_TYP_REPLACEMENT,
  RETURN_TYPS,
} from "../constants/returnTypes.js";
import { PAY_INPUT_MANUALLY } from "../constants/paymentInputType.js";
import { STOCK_IN, STOCK_RETURN } from "../constants/stockMovementTypes.js";
import inventoryModel from "../models/inventoryModel.js";
import {
  ITEM_STS_INSTOCK,
  ITEM_STS_LOW_STOCK,
  ITEM_STS_OUTOFSTOCK,
} from "../constants/itemStatus.js";
import { UpdateReturnStockSchema } from "../schemas/grn/updateReturnStockSchema.js";

// Register supplier
export const registerSupplierController = async (req, res) => {
  const { error, value } = supplierValidationSchema.validate(req.body);

  if (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json(ApiResponse.error(error_code, error.message));
  }

  try {
    const newSupplier = new supplierModel({
      ...value,
    });

    await newSupplier.save();

    return res
      .status(httpStatus.CREATED)
      .json(ApiResponse.response(success_code, supplier_registered));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Update supplier
export const updateSupplierController = async (req, res) => {
  const id = req.query.id;

  const { error, value } = supplierValidationSchema.validate(req.body);

  if (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json(ApiResponse.error(error_code, error.message));
  }

  try {
    const supplier = await supplierModel.findById(new ObjectId(id));

    if (!supplier) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, supplier_not_found));
    }

    Object.assign(supplier, value);

    await supplier.save();

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Create supplier payments
export const createSupplierPaymentsController = async (req, res) => {
  const { error, value } = stockPaymentSchema.validate(req.body);

  if (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json(ApiResponse.error(error_code, error.message));
  }

  try {
    const data = await stockMovementModel.findById(
      new ObjectId(value.paymentStockMovement)
    );

    if (!data) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, supplier_not_found));
    }

    if (data.stockPaymentStatus === PAY_STATUS_COMPLETED) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, payment_already_completed));
    }

    const balanceAmount = data.stockPaymentBalance - value.paymentAmount;

    if (balanceAmount < 0) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(info_code, payment_exceeded_balance));
    }

    const newPayment = new paymentModel({
      paymentAmount: value.paymentAmount,
      paymentStockMovement: new ObjectId(data._id),
      paymentSupplier: data.stockSupplier
        ? new ObjectId(data.stockSupplier._id)
        : null,
      paymentMethod: value.paymentMethod,
      paymentCollectedBy: new ObjectId(req.user.id),
      paymentType: PAYMENT_TYPE_OUT,
      paymentSource: PAY_SC_INVENTORY,
      paymentNotes: isValidString(value.paymentNotes)
        ? value.paymentNotes
        : "Supplier payments",
      paymentTransactionId: value.paymentTransactionId,
    });

    const savedPayment = await newPayment.save();

    if (data.stockPaymentMethod === PAY_METHOD_CREDIT) {
      await updateAccountData(
        ACC_TYP_PAYABLES,
        PAYMENT_TYPE_OUT,
        savedPayment.paymentAmount
      );
    }

    if (
      [PAY_METHOD_CASH, PAY_METHOD_MOBILE, PAY_METHOD_OTHER].includes(
        savedPayment.paymentMethod
      )
    ) {
      await updateAccountData(
        ACC_TYP_CASH,
        PAYMENT_TYPE_OUT,
        savedPayment.paymentAmount
      );
    }

    if (
      [PAY_METHOD_BACK_TRN, PAY_METHOD_CARD, PAY_METHOD_CHEQUE].includes(
        savedPayment.paymentMethod
      )
    ) {
      await updateAccountData(
        ACC_TYP_BANK,
        PAYMENT_TYPE_OUT,
        savedPayment.paymentAmount
      );
    }

    data.stockPaymentPaidAmount += savedPayment.paymentAmount;
    data.stockPaymentBalance = balanceAmount;
    data.stockPaymentStatus =
      balanceAmount === 0 ? PAY_STATUS_COMPLETED : PAY_STATUS_PENDING;

    await data.save();

    await supplierModel.findByIdAndUpdate(
      new ObjectId(data.stockSupplier._id),
      { $inc: { supplierDueAmount: -Math.abs(savedPayment.paymentAmount) } }
    );

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Get all suppliers
export const getAllSuppliersController = async (req, res) => {
  const page = parseInt(req.query.page);
  const limit = parseInt(req.query.limit);

  const skip = page * limit;

  const supplierName = req.query.name;

  const query = {};

  if (isValidString(supplierName)) {
    query.supplierName = {
      $regex: `${supplierName}`,
      $options: "i",
    };
  }
  try {
    const data = await supplierModel.find(query).skip(skip).limit(limit);
    const count = await supplierModel.countDocuments(query);
    return res
      .status(httpStatus.CREATED)
      .json(
        ApiResponse.response(success_code, success_message, { data, count })
      );
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Get supplier info
export const getSupplierInfoController = async (req, res) => {
  const id = req.query.id;

  try {
    const data = await supplierModel.findById(new ObjectId(id));

    if (!data) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, supplier_not_found));
    } else {
      return res
        .status(httpStatus.OK)
        .json(ApiResponse.response(success_code, success_message, data));
    }
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Get supplier movements
export const getSupplierMovementsController = async (req, res) => {
  const id = req.query.id;

  const page = parseInt(req.query.page);
  const limit = parseInt(req.query.limit);

  const skip = page * limit;

  try {
    const data = await stockMovementModel
      .find({ "stockSupplier._id": new ObjectId(id) })
      .populate({
        path: "stockItem",
        select: "itemCode itemName itemCategory ",
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const count = await stockMovementModel.countDocuments({
      "stockSupplier._id": new ObjectId(id),
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

// Get supplier GRN Records
export const getSupplierGrnRecordsController = async (req, res) => {
  const id = req.query.id;

  const page = parseInt(req.query.page);
  const limit = parseInt(req.query.limit);

  const skip = page * limit;

  try {
    const data = await grnModel
      .find({ grnSupplier: new ObjectId(id) })
      .populate({
        path: "grnItems._id",
        select: "itemCode itemName itemCategory",
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const count = await grnModel.countDocuments({
      grnSupplier: new ObjectId(id),
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

// Get supplier recent payments made
export const getSupplierRecentPaymentsController = async (req, res) => {
  const id = req.query.id;

  const page = parseInt(req.query.page);
  const limit = parseInt(req.query.limit) || 10;

  const skip = page * limit;

  try {
    const data = await paymentModel
      .find({ paymentSupplier: new ObjectId(id) })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const count = await paymentModel.countDocuments({
      paymentSupplier: new ObjectId(id),
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

// Get suppliers for selection - _id and supplierName
export const getSuppliersForSelectionController = async (req, res) => {
  const supplierName = req.query.name;

  try {
    const query = {};

    if (isValidString(supplierName)) {
      query.supplierName = {
        $regex: `${supplierName}`,
        $options: "i",
      };
    }

    const data = (
      await supplierModel.find(query).select("_id supplierName")
    ).map((doc) => ({
      _id: doc._id,
      supplierName: doc.supplierName,
    }));

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message, data));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Get supplier GRN record info
export const getSupplierGrnRecordInfoController = async (req, res) => {
  const id = req.query.id;

  try {
    const data = await grnModel.findById(new ObjectId(id));

    if (!data) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, grn_not_found));
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

// Get supplier return items records
export const getSupplierReturnItemsController = async (req, res) => {
  const id = req.query.id;

  const page = parseInt(req.query.page);
  const limit = parseInt(req.query.limit) || 10;
  const typeFilter = req.query.typeFilter;
  const statusFilter = req.query.statusFilter;

  const skip = page * limit;

  const query = {
    returnSupplier: new ObjectId(id),
  };

  if (RETURN_TYPS.includes(typeFilter)) {
    query.returnType = typeFilter;
  }

  if (RETURN_STS.includes(statusFilter)) {
    query.returnStatus = statusFilter;
  }

  try {
    const data = await itemReturnModel
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path: "grnRef",
        select: "grnCode grnReceivedDate grnSubTotalValue",
      })
      .populate({
        path: "returnItem",
        select: "itemCode itemName",
      });
    const count = await itemReturnModel.countDocuments(query);

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

// Return supplier stock
export const returnSupplierStockController = async (req, res) => {
  const { error, value } = returnStockSchema.validate(req.body);

  if (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json(ApiResponse.error(error_code, error.message));
  }

  try {
    const { grnId, grnItemId, returnQty, returnReason, returnNote } = value;

    const record = await stockMovementModel.findOne({
      $and: [
        { stockGrnRef: new ObjectId(grnId) },
        { stockItem: new ObjectId(grnItemId) },
      ],
    });

    if (!record) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, sm_not_found));
    }

    if (record.stockQuantity < returnQty) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, return_qty_not_valid));
    }

    const returnRecord = await itemReturnModel.findOne({
      returnStockMovement: record._id,
    });

    if (returnRecord) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, supplier_return_record_exists));
    }

    const returnStockValue = record.stockPricePerUnit * returnQty;

    const newReturn = new itemReturnModel({
      grnRef: new ObjectId(record.stockGrnRef),
      returnStockMovement: new ObjectId(record._id),
      returnItem: new ObjectId(record.stockItem),
      returnSupplier: new ObjectId(record.stockSupplier._id),
      returnQty,
      returnReason,
      returnNote,
      returnStockValue,
      returnStatus: RETURN_STS_PENDING,
      returnIssuedBy: new ObjectId(req.user.id),
    });

    await newReturn.save();

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Update return record
export const updateReturnStockController = async (req, res) => {
  const { error, value } = UpdateReturnStockSchema.validate(req.body);

  if (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json(ApiResponse.error(error_code, error.message));
  }

  try {
    const { id, returnQty, returnReason, returnNote } = value;

    const record = await itemReturnModel.findById(new ObjectId(id));

    if (!record) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, return_record_not_found));
    }

    const stockMv = await stockMovementModel.findById(
      record.returnStockMovement
    );

    if (stockMv.stockQuantity < returnQty) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, return_qty_not_valid));
    }

    const returnStockValue = stockMv.stockPricePerUnit * returnQty;

    record.returnQty = returnQty;
    record.returnReason = returnReason;
    record.returnNote = returnNote;
    record.returnStockValue = returnStockValue;
    record.returnIssuedBy = new ObjectId(req.user.id);

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

// Process supplier stock
export const processReturnStockController = async (req, res) => {
  const { error, value } = returnProcessSchema.validate(req.body);

  if (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json(ApiResponse.error(error_code, error.message));
  }

  const { _id, returnType, paymentMethod, paymentTransactionId } = value;

  try {
    const record = await itemReturnModel
      .findById(new ObjectId(_id))
      .populate("returnSupplier");

    if (!record) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, return_record_not_found));
    }

    if (record.returnStatus != RETURN_STS_PENDING) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, return_already_processed));
    }

    const item = await inventoryModel.findById(new ObjectId(record.returnItem));

    const stockMv = await stockMovementModel.findById(
      new ObjectId(record.returnStockMovement)
    );

    switch (returnType) {
      case RETURN_TYP_CASH:
        const newPayment = new paymentModel({
          paymentGrnRef: new ObjectId(record.grnRef),
          paymentReturnRef: new ObjectId(record._id),
          paymentSupplier: new ObjectId(record.returnSupplier._id),
          paymentType: PAYMENT_TYPE_IN,
          paymentSource: PAY_SC_RETURNS,
          paymentAmount: record.returnStockValue,
          paymentMethod,
          paymentTransactionId,
          paymentInputType: PAY_INPUT_MANUALLY,
          paymentCollectedBy: new ObjectId(req.user.id),
        });

        const savedPayment = await newPayment.save();

        if (savedPayment.paymentMethod === PAY_METHOD_CREDIT) {
          await updateAccountData(
            ACC_TYP_PAYABLES,
            PAYMENT_TYPE_IN,
            savedPayment.paymentAmount
          );
        }

        if (
          [PAY_METHOD_CASH, PAY_METHOD_MOBILE, PAY_METHOD_OTHER].includes(
            savedPayment.paymentMethod
          )
        ) {
          await updateAccountData(
            ACC_TYP_CASH,
            PAYMENT_TYPE_IN,
            savedPayment.paymentAmount
          );
        }

        if (
          [PAY_METHOD_BACK_TRN, PAY_METHOD_CARD, PAY_METHOD_CHEQUE].includes(
            savedPayment.paymentMethod
          )
        ) {
          await updateAccountData(
            ACC_TYP_BANK,
            PAYMENT_TYPE_IN,
            savedPayment.paymentAmount
          );
        }

        const newQuantity = item.itemQuantity - record.returnQty;

        await stockMovementModel.create({
          stockItem: new ObjectId(record.returnItem),
          stockGrnRef: new ObjectId(record.grnRef),
          stockSupplier: {
            _id: new ObjectId(record.returnSupplier._id),
            supplierName: record.returnSupplier.supplierName,
          },
          stockMovementType: STOCK_RETURN,
          stockQuantity: record.returnQty,
          stockPreviousQuantity: item.itemQuantity,
          stockNewQuantity: newQuantity,
          stockPricePerUnit: stockMv.stockPricePerUnit,
          stockTotalValue: stockMv.stockTotalValue,
          stockPerformedBy: new ObjectId(req.user.id),
        });

        item.itemQuantity = newQuantity;

        // Update status if below threshold
        if (newQuantity < item.itemThreshold) {
          item.itemStatus = ITEM_STS_LOW_STOCK;
        } else if (newQuantity === 0) {
          item.itemStatus = ITEM_STS_OUTOFSTOCK;
        } else {
          item.itemStatus = ITEM_STS_INSTOCK;
        }

        await item.save();

        break;
      case RETURN_TYP_REPLACEMENT:
        await stockMovementModel.create({
          stockItem: new ObjectId(record.returnItem),
          stockGrnRef: new ObjectId(record.grnRef),
          stockSupplier: {
            _id: new ObjectId(record.returnSupplier._id),
            supplierName: record.returnSupplier.supplierName,
          },
          stockMovementType: STOCK_RETURN,
          stockQuantity: record.returnQty,
          stockPreviousQuantity: item.itemQuantity,
          stockNewQuantity: item.itemQuantity - record.returnQty,
          stockPricePerUnit: stockMv.stockPricePerUnit,
          stockTotalValue: stockMv.stockTotalValue,
          stockPerformedBy: new ObjectId(req.user.id),
        });

        await stockMovementModel.create({
          stockItem: new ObjectId(record.returnItem),
          stockGrnRef: new ObjectId(record.grnRef),
          stockSupplier: {
            _id: new ObjectId(record.returnSupplier._id),
            supplierName: record.returnSupplier.supplierName,
          },
          stockMovementType: STOCK_IN,
          stockQuantity: record.returnQty,
          stockPreviousQuantity: item.itemQuantity - record.returnQty,
          stockNewQuantity: item.itemQuantity,
          stockPricePerUnit: stockMv.stockPricePerUnit,
          stockTotalValue: stockMv.stockTotalValue,
          stockPerformedBy: new ObjectId(req.user.id),
        });

        break;
      default:
        return res
          .status(httpStatus.PRECONDITION_FAILED)
          .json(ApiResponse.error(error_code, return_not_processed));
    }

    record.returnType = returnType;
    record.returnStatus = RETURN_STS_PROCESSED;
    record.returnProcessedBy = new ObjectId(req.user.id);

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

// Cancel return stock
export const cancelReturnStockController = async (req, res) => {
  const id = req.query.id;

  try {
    const record = await itemReturnModel.findById(new ObjectId(id));

    if (!record) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, return_record_not_found));
    }

    if (record.returnStatus != RETURN_STS_PENDING) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, return_already_processed));
    }

    record.returnStatus = RETURN_STS_CANCELED;
    record.returnProcessedBy = new ObjectId(req.user.id);

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
