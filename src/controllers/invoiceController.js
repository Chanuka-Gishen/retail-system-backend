import httpStatus from "http-status";
import { ObjectId } from "mongodb";

import customerModel from "../models/customerModel.js";
import invoiceModel from "../models/invoiceModel.js";

import { createInvoiceSchema } from "../schemas/invoice/createInvoiceSchema.js";
import { updateInvoiceSchema } from "../schemas/invoice/updateInvoiceSchema.js";

import ApiResponse from "../services/ApiResponse.js";
import {
  error_code,
  info_code,
  success_code,
} from "../constants/statusCodes.js";
import {
  customer_not_found,
  id_required,
  invoice_cannot_close_not_completed,
  invoice_cannot_complete_not_open,
  invoice_cannot_edit,
  invoice_created_success,
  invoice_item_not_found,
  invoice_not_found,
  invoice_not_items_cannot_complete,
  item_insufficient_stock_quantity,
  item_not_found,
  return_quantity_exceeded,
  return_record_expired,
  return_record_not_found,
  success_message,
} from "../constants/messageConstants.js";
import {
  INV_CUS_TYP_REGISTERED,
  INV_CUSTOMER_TYPES,
} from "../constants/invoiceConstants.js";
import invoiceItemModel from "../models/invoiceItemModel.js";
import { createInvoiceItemSchema } from "../schemas/invoice/createInvoiceItemSchema.js";
import inventoryModel from "../models/inventoryModel.js";
import { updateInvoiceItemSchema } from "../schemas/invoice/updateInvoiceItemSchema.js";
import itemBpHistoryModel from "../models/itemBpHistoryModel.js.js";
import {
  PRICE_CHANGE_ACTIVE,
  PRICE_CHANGE_COMPLETED,
  PRICE_CHANGE_CREATED,
} from "../constants/priceChangeStatus.js";
import {
  INVOICE_STATUS,
  STATUS_CLOSED,
  STATUS_COMPLETED,
  STATUS_EXPIRED,
  STATUS_OPEN,
  STATUS_PROCESSED,
} from "../constants/workorderStatus.js";
import {
  generateInvoiceNumber,
  generateReturnCode,
  isValidString,
} from "../services/commonServices.js";
import { updateAccountData } from "./inventoryController.js";
import { ACC_TYP_RECEIVABLES } from "../constants/accountTypes.js";
import {
  PAYMENT_TYPE_IN,
  PAYMENT_TYPE_OUT,
} from "../constants/paymentTypes.js";
import { PAY_STATUS } from "../constants/paymentStatus.js";
import invoiceItemReturnModel from "../models/returnModel.js";
import { returnItemSchema } from "../schemas/invoice/returnItemSchema.js";
import returnModel from "../models/returnModel.js";
import returnItemModel from "../models/returnItemModel.js";
import paymentModel from "../models/paymentModel.js";
import { PAY_SC_CUS_REFUNDS } from "../constants/paymentSource.js";
import { PAY_METHOD_CASH } from "../constants/paymentMethods.js";

// Create new invoice controller
export const createInvoiceController = async (req, res) => {
  const { error, value } = createInvoiceSchema.validate(req.body);

  if (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json(ApiResponse.error(error_code, error.message));
  }

  const { invoiceCustomerType, invoiceCustomer } = value;

  try {
    let customer = null;
    if (invoiceCustomerType === INV_CUS_TYP_REGISTERED && invoiceCustomer) {
      const existingCustomer = await customerModel.findById(
        new ObjectId(invoiceCustomer)
      );
      if (existingCustomer) {
        customer = new ObjectId(existingCustomer._id);
      }
    }

    const newInvoice = new invoiceModel({
      invoiceCustomerType,
      invoiceCustomer: customer,
    });

    await newInvoice.save();

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, invoice_created_success));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Update invoice info controller (except items)
export const updateInvoiceController = async (req, res) => {
  const { error, value } = updateInvoiceSchema.validate(req.body);

  if (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json(ApiResponse.error(error_code, error.message));
  }

  const {
    _id,
    invoiceCustomerType,
    invoiceCustomer,
    invoiceDiscountPercentage,
    invoiceDiscountCash,
  } = value;

  try {
    const invoice = await invoiceModel.findById(_id);

    if (!invoice) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json(ApiResponse.error(error_code, invoice_not_found));
    }

    // Calculate item-level totals
    const invoiceSubTotal = invoice.invoiceTotalAmount;
    const invoiceGrossTotal = invoice.invoiceGrossTotal;

    // Calculate discounts
    const percentageDiscountAmount =
      (invoiceSubTotal * invoiceDiscountPercentage) / 100;
    const invoiceTotalDiscount = percentageDiscountAmount + invoiceDiscountCash;

    // Calculate final totals
    const invoiceTotalAmount = invoiceSubTotal - invoiceTotalDiscount;
    const invoiceBalanceAmount = invoiceTotalAmount - invoice.invoicePaidAmount;

    // Ensure amounts are not negative
    const finalTotalAmount = Math.max(0, invoiceTotalAmount);
    const finalBalanceAmount = Math.max(0, invoiceBalanceAmount);

    if (invoiceCustomerType === INV_CUS_TYP_REGISTERED && invoiceCustomer) {
      const customer = await customerModel.findById(
        new ObjectId(invoiceCustomer)
      );

      if (!customer) {
        return res
          .status(httpStatus.NOT_FOUND)
          .json(ApiResponse.error(error_code, customer_not_found));
      }

      invoice.invoiceCustomer = new ObjectId(customer._id);
    } else {
      invoice.invoiceCustomer = null;
    }

    invoice.invoiceCustomerType = invoiceCustomerType;
    invoice.invoiceDiscountPercentage = invoiceDiscountPercentage;
    invoice.invoiceDiscountCash = invoiceDiscountCash;
    invoice.invoiceTotalDiscount = invoiceTotalDiscount;
    invoice.invoiceGrossTotal = invoiceGrossTotal;
    invoice.invoiceSubTotal = finalTotalAmount;
    invoice.invoiceBalanceAmount = finalBalanceAmount;

    await invoice.save();

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Add invoice item controller
export const addInvoiceItemController = async (req, res) => {
  const { error, value } = createInvoiceItemSchema.validate(req.body);

  if (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json(ApiResponse.error(error_code, error.message));
  }

  const { invoice, item } = value;

  try {
    const existingInvoice = await invoiceModel.findById(new ObjectId(invoice));

    if (!existingInvoice) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json(ApiResponse.error(error_code, invoice_not_found));
    }

    if (existingInvoice.invoiceStatus != STATUS_OPEN) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json(ApiResponse.error(error_code, invoice_cannot_edit));
    }

    const existingItem = await inventoryModel.findById(new ObjectId(item));

    if (!existingItem) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json(ApiResponse.error(error_code, item_not_found));
    }

    const existingInvoiceItem = await invoiceItemModel.findOne({
      invoice: new ObjectId(existingInvoice._id),
      item: new ObjectId(existingItem._id),
    });

    if (existingItem.itemQuantity < 1) {
      return res
        .status(httpStatus.PRECONDITION_FAILED)
        .json(
          ApiResponse.error(
            info_code,
            item_insufficient_stock_quantity + existingItem.itemName
          )
        );
    }

    let invoiceGrossTotal = 0;
    let invoiceNetTotal = 0;

    if (existingInvoiceItem) {
      const totalQuantity = existingInvoiceItem.quantity + 1;

      if (existingItem.itemQuantity < totalQuantity) {
        return res
          .status(httpStatus.PRECONDITION_FAILED)
          .json(
            ApiResponse.error(
              info_code,
              item_insufficient_stock_quantity + existingItem.itemName
            )
          );
      }

      const totalGrossPrice =
        existingInvoiceItem.unitBuyingPrice * totalQuantity;
      const buyingPrice = existingInvoiceItem.unitBuyingPrice;
      const totalNetPrice = totalQuantity * existingInvoiceItem.unitPrice;

      invoiceGrossTotal = totalGrossPrice - existingInvoiceItem.totalGrossPrice;
      invoiceNetTotal = totalNetPrice - existingInvoiceItem.totalNetPrice;

      existingInvoiceItem.quantity = totalQuantity;
      existingInvoiceItem.unitBuyingPrice = buyingPrice;
      existingInvoiceItem.totalGrossPrice = totalGrossPrice;
      existingInvoiceItem.totalNetPrice = totalNetPrice;

      await existingInvoiceItem.save();
    } else {
      invoiceNetTotal = existingItem.itemSellingPrice;
      invoiceGrossTotal = existingItem.itemBuyingPrice;

      const newInvoiceItem = new invoiceItemModel({
        invoice: new ObjectId(existingInvoice._id),
        item: new ObjectId(existingItem._id),
        quantity: 1,
        unitBuyingPrice: existingItem.itemBuyingPrice,
        unitPrice: existingItem.itemSellingPrice,
        totalGrossPrice: invoiceGrossTotal,
        totalNetPrice: invoiceNetTotal,
      });

      await newInvoiceItem.save();
    }

    await invoiceModel.findByIdAndUpdate(new ObjectId(existingInvoice._id), {
      $inc: {
        invoiceTotalAmount: invoiceNetTotal,
        invoiceGrossTotal: invoiceGrossTotal,
        invoiceSubTotal: invoiceNetTotal,
      },
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

// Update invoice item controller (Open invoices)
export const updateInvoiceItemController = async (req, res) => {
  const { error, value } = updateInvoiceItemSchema.validate(req.body);

  if (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json(ApiResponse.error(error_code, error.message));
  }

  const { _id, quantity } = value;

  try {
    const existingInvoiceItem = await invoiceItemModel
      .findById(new ObjectId(_id))
      .populate("invoice");

    if (!existingInvoiceItem) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json(ApiResponse.error(error_code, invoice_item_not_found));
    }

    if (existingInvoiceItem.invoice.invoiceStatus != STATUS_OPEN) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json(ApiResponse.error(error_code, invoice_cannot_edit));
    }

    if (quantity != existingInvoiceItem.quantity) {
      const quantityDifference = quantity - existingInvoiceItem.quantity;

      const item = await inventoryModel.findById(
        new ObjectId(existingInvoiceItem.item)
      );

      if (item.itemQuantity < quantity) {
        return res
          .status(httpStatus.PRECONDITION_FAILED)
          .json(
            ApiResponse.error(
              info_code,
              item_insufficient_stock_quantity + item.itemName
            )
          );
      }

      const unitPrice =
        item.itemWholesaleThreshold <= quantity
          ? item.itemWholesalePrice
          : item.itemSellingPrice;

      //----------- invoice
      const totalSubGrossPrice =
        Math.round(
          quantityDifference * existingInvoiceItem.unitBuyingPrice * 100
        ) / 100;
      const totalSubNetPrice =
        Math.round(quantityDifference * unitPrice * 100) / 100;
      //-------------------

      existingInvoiceItem.unitPrice = unitPrice;
      existingInvoiceItem.quantity = quantity;
      existingInvoiceItem.totalGrossPrice =
        Math.round(quantity * existingInvoiceItem.unitBuyingPrice * 100) / 100;
      existingInvoiceItem.totalNetPrice =
        Math.round(quantity * existingInvoiceItem.unitPrice * 100) / 100;

      await existingInvoiceItem.save();

      await invoiceModel.findByIdAndUpdate(
        new ObjectId(existingInvoiceItem.invoice),
        {
          $inc: {
            invoiceTotalAmount: totalSubNetPrice,
            invoiceGrossTotal: totalSubGrossPrice,
            invoiceSubTotal: totalSubNetPrice,
          },
        }
      );
    }

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message));
  } catch (error) {
    console.log(error);

    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Delete invoice item controller (Open invoices)
export const deleteInvoiceItemController = async (req, res) => {
  const id = req.query.id;

  try {
    const invoiceItem = await invoiceItemModel
      .findById(new ObjectId(id))
      .populate("invoice");

    if (invoiceItem.invoice.invoiceStatus != STATUS_OPEN) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json(ApiResponse.error(error_code, invoice_cannot_edit));
    }

    if (!invoiceItem) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json(ApiResponse.error(error_code, invoice_item_not_found));
    }

    await invoiceModel.findByIdAndUpdate(
      new ObjectId(invoiceItem.invoice._id),
      {
        $inc: {
          invoiceTotalAmount: -invoiceItem.totalNetPrice,
          invoiceSubTotal: -invoiceItem.totalNetPrice,
          invoiceGrossTotal: -invoiceItem.totalGrossPrice,
        },
      }
    );

    await invoiceItemModel.findByIdAndDelete(new ObjectId(invoiceItem._id));

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Get invoices - All Closed
export const getInvoicesController = async (req, res) => {
  const page = parseInt(req.query.page) || 0;
  const limit = parseInt(req.query.limit) || 30;

  const skip = page * limit;

  const invoiceNumber = req.query.number;
  const customerType = req.query.type;
  const payStatus = req.query.status;
  const customerName = req.query.name;
  const customerMobile = req.query.mobile;

  const query = { invoiceStatus: STATUS_CLOSED };

  if (INV_CUSTOMER_TYPES.includes(customerType)) {
    query.invoiceCustomerType = customerType;
  }

  if (PAY_STATUS.includes(payStatus)) {
    query.invoicePaymentStatus = payStatus;
  }

  if (isValidString(invoiceNumber)) {
    query.invoiceNumber = {
      $regex: `${invoiceNumber}`,
      $options: "i",
    };
  }

  try {
    const data = await invoiceModel.aggregate([
      {
        $match: query,
      },
      {
        $lookup: {
          from: "customers",
          as: "customer",
          let: { customerId: "$invoiceCustomer" }, // Define variables
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
                ...(isValidString(customerMobile) && {
                  customerMobile: {
                    $regex: `^${customerMobile}`,
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
          preserveNullAndEmptyArrays: true,
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

    const countResult = await invoiceModel.aggregate([
      {
        $match: query,
      },
      {
        $lookup: {
          from: "customers",
          as: "customer",
          let: { customerId: "$invoiceCustomer" }, // Define variables
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
                ...(isValidString(customerMobile) && {
                  customerMobile: {
                    $regex: `^${customerMobile}`,
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
          preserveNullAndEmptyArrays: true,
        },
      },
      { $count: "total" },
    ]);

    const count = countResult[0]?.total || 0;

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

// Get invoices - Open/Completed
export const getNotClosedInvoicesController = async (req, res) => {
  const page = parseInt(req.query.page) || 0;
  const limit = parseInt(req.query.limit) || 30;

  const skip = page * limit;

  try {
    const data = await invoiceModel
      .find({ invoiceStatus: { $in: [STATUS_OPEN, STATUS_COMPLETED] } })
      .skip(skip)
      .limit(limit)
      .populate({ path: "invoiceCustomer", strictPopulate: false });

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message, data));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Get invoice info controller (without items)
export const getInvoiceInfoController = async (req, res) => {
  const id = req.query.id;

  try {
    const invoice = await invoiceModel
      .findById(new ObjectId(id))
      .populate({ path: "invoiceCustomer", strictPopulate: false });

    if (!invoice) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json(ApiResponse.error(error_code, invoice_not_found));
    }

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message, invoice));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Get invoice items controller (without other info)
export const getInvoiceItemsController = async (req, res) => {
  const id = req.query.id;

  try {
    const invoiceItems = await invoiceItemModel
      .find({
        invoice: new ObjectId(id),
      })
      .populate("item");

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message, invoiceItems));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Complete invoice controller
export const completeInvoiceController = async (req, res) => {
  const id = req.query.id;

  try {
    const invoice = await invoiceModel.findById(new ObjectId(id));

    if (!invoice) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json(ApiResponse.error(error_code, invoice_not_found));
    }

    if (invoice.invoiceStatus != STATUS_OPEN) {
      return res
        .status(httpStatus.PRECONDITION_FAILED)
        .json(ApiResponse.error(error_code, invoice_cannot_complete_not_open));
    }

    const invoiceItems = await invoiceItemModel
      .find({ invoice: new ObjectId(invoice._id) })
      .populate("item");

    if (invoiceItems.length === 0) {
      return res
        .status(httpStatus.PRECONDITION_FAILED)
        .json(ApiResponse.error(error_code, invoice_not_items_cannot_complete));
    }

    let totalDiscount = 0;
    let grossTotal = 0;
    let total = 0;
    let subTotal = 0;

    for (const item of invoiceItems) {
      const newQtyMargin = item.item.itemBpChangeMargin - item.quantity;

      let buyingPrice = item.item.itemBuyingPrice;
      let totalGrossPrice = Math.round(item.quantity * buyingPrice * 100) / 100;

      if (newQtyMargin <= 0) {
        const latestBpChange = await itemBpHistoryModel
          .findOne({ changeStatus: PRICE_CHANGE_CREATED })
          .sort({ createdAt: 1 });

        if (latestBpChange) {
          const oldQuantity = item.item.itemBpChangeMargin;
          const newQuantity = item.quantity - item.item.itemBpChangeMargin;

          const oldQuantityValue = oldQuantity * item.item.itemBuyingPrice;
          const newQuantityValue = newQuantity * latestBpChange.itemNewPrice;

          buyingPrice =
            Math.round(
              ((oldQuantityValue + newQuantityValue) / item.quantity) * 100
            ) / 100;
          totalGrossPrice =
            Math.round((oldQuantityValue + newQuantityValue) * 100) / 100;

          // Updated inventory, BpHistoryModel new and old

          await inventoryModel.findByIdAndUpdate(new ObjectId(item.item._id), {
            $set: {
              itemBpChangeMargin: latestBpChange.stockMargin,
              itemBuyingPrice: latestBpChange.itemNewPrice,
            },
          });

          await itemBpHistoryModel.findOneAndUpdate(
            { changeStatus: PRICE_CHANGE_ACTIVE },
            {
              $set: {
                changeStatus: PRICE_CHANGE_COMPLETED,
                effectiveTo: new Date(),
              },
            }
          );

          latestBpChange.changeStatus = PRICE_CHANGE_ACTIVE;
          latestBpChange.effectiveFrom = new Date();

          await latestBpChange.save();

          item.unitBuyingPrice = buyingPrice;
          item.totalGrossPrice = totalGrossPrice;

          await item.save();
        }
      }

      const totalPrice = Math.round(item.quantity * item.unitPrice * 100) / 100;

      grossTotal += totalGrossPrice;
      total += totalPrice;
      subTotal += totalPrice - totalDiscount;
    }

    const invoiceNumber = await generateInvoiceNumber();

    invoice.invoiceStatus = STATUS_COMPLETED;
    invoice.invoiceNumber = invoiceNumber;
    invoice.invoiceTotalAmount = total;
    invoice.invoiceGrossTotal = grossTotal;
    invoice.invoiceSubTotal = subTotal;
    invoice.invoiceCompletedAt = new Date();

    const savedInvoice = await invoice.save();

    await updateAccountData(
      ACC_TYP_RECEIVABLES,
      PAYMENT_TYPE_IN,
      savedInvoice.invoiceSubTotal
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

// Close invoice
export const closeInvoiceController = async (req, res) => {
  const id = req.query.id;

  try {
    const invoice = await invoiceModel.findById(new ObjectId(id));

    if (!invoice) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json(ApiResponse.error(error_code, invoice_not_found));
    }

    if (invoice.invoiceStatus != STATUS_COMPLETED) {
      return res
        .status(httpStatus.PRECONDITION_FAILED)
        .json(
          ApiResponse.error(error_code, invoice_cannot_close_not_completed)
        );
    }

    invoice.invoiceStatus = STATUS_CLOSED;
    invoice.invoiceClosedAt = new Date();
    await invoice.save();

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Return invoice item controller
export const returnInvoiceItemController = async (req, res) => {
  const { error, value } = returnItemSchema.validate(req.body);

  if (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json(ApiResponse.error(error_code, error.message));
  }

  const { returnInvoice, returnItems } = value;

  try {
    const invoice = await invoiceModel.findById(new ObjectId(returnInvoice));

    if (!invoice) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json(ApiResponse.error(error_code, invoice_not_found));
    }

    const existingReturnRecord = await returnModel.findOne({
      returnInvoice: new ObjectId(invoice._id),
    });

    let existingReturnItems = [];

    if (existingReturnRecord) {
      existingReturnItems = await returnItemModel.find({
        returnInvoice: new ObjectId(existingReturnRecord._id),
      });
    }

    let subTotalValue = 0;
    const newReturnItems = [];

    for (const item of returnItems) {
      const { returnInvoiceItem, returnQuantity, returnReason } = item;

      const invoiceItem = await invoiceItemModel.findById(
        new ObjectId(returnInvoiceItem)
      );

      if (!invoiceItem) {
        return res
          .status(httpStatus.NOT_FOUND)
          .json(ApiResponse.error(error_code, invoice_item_not_found));
      }

      let processedQty = 0;

      if (existingReturnItems.length > 0) {
        const existingItem = existingReturnItems.find(
          (v) => v.returnInvoiceItem === returnInvoiceItem
        );

        if (existingItem) {
          processedQty = existingItem.returnQuantity;
        }
      }

      const totalQty = processedQty + returnQuantity;

      if (totalQty > invoiceItem.quantity) {
        return res
          .status(httpStatus.BAD_REQUEST)
          .json(ApiResponse.error(error_code, return_quantity_exceeded));
      }

      const totalValue = returnQuantity * invoiceItem.unitPrice;
      subTotalValue += totalValue;

      newReturnItems.push({
        returnInvoiceItem: new ObjectId(invoiceItem._id),
        returnInventoryItem: new ObjectId(invoiceItem.item),
        returnOriginalQuantity: invoiceItem.quantity,
        returnQuantity: returnQuantity,
        returnItemTotalValue: totalValue,
        returnReason: returnReason,
      });
    }

    const returnCode = await generateReturnCode();

    const newReturnInvoice = new returnModel({
      returnInvoice: new ObjectId(invoice._id),
      returnCode,
      returnTotalValue: subTotalValue,
      returnIssuedBy: new ObjectId(req.user.id),
    });

    const savedReturnInvoice = await newReturnInvoice.save();

    const updatedReturnItems = newReturnItems.map((item) => {
      return new returnItemModel({
        ...item,
        returnInvoice: new ObjectId(savedReturnInvoice._id),
      });
    });

    await returnItemModel.create(updatedReturnItems);

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Get return items for a invoice controller
export const getReturnInvoiceItemsController = async (req, res) => {
  const id = req.query.id;

  try {
    if (!id) {
      return res
        .status(httpStatus.PRECONDITION_FAILED)
        .json(ApiResponse.response(info_code, id_required));
    }

    const data = await returnModel.aggregate([
      {
        $match: {
          returnInvoice: new ObjectId(id),
        },
      },
      {
        $lookup: {
          from: "returnitems",
          let: { invoiceId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$returnInvoice", "$$invoiceId"] },
              },
            },
            {
              $lookup: {
                from: "inventories",
                let: { inventoryId: "$returnInventoryItem" },
                pipeline: [
                  {
                    $match: {
                      $expr: { $eq: ["$_id", "$$inventoryId"] },
                    },
                  },
                  {
                    $project: {
                      itemName: 1,
                      itemCode: 1,
                    },
                  },
                ],
                as: "returnInventoryItem",
              },
            },
            { $unwind: "$returnInventoryItem" },
          ],
          as: "returnItems",
        },
      },
      {
        $lookup: {
          from: "users",
          let: { userId: "$returnIssuedBy" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$_id", "$$userId"] },
              },
            },
            {
              $project: {
                userFirstName: 1,
                userLastName: 1,
              },
            },
          ],
          as: "returnIssuedBy",
        },
      },
      {
        $unwind: "$returnIssuedBy",
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

// Process return record
export const processReturnRecordController = async (req, res) => {
  const id = req.query.id;

  if (!id) {
    return res
      .status(httpStatus.PRECONDITION_FAILED)
      .json(ApiResponse.response(info_code, id_required));
  }

  try {
    const data = await returnModel.findById(new ObjectId(id));

    if (!data) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json(ApiResponse.response(error_code, return_record_not_found));
    }

    const today = new Date();

    if (today > data.returnExpiresAt) {
      data.returnStatus = STATUS_EXPIRED;
      data.returnProcessedBy = new ObjectId(req.user.id);

      await data.save();

      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.response(info_code, return_record_expired));
    }

    data.returnStatus = STATUS_PROCESSED;
    data.returnProcessedBy = new ObjectId(req.user.id);

    const savedData = await data.save();

    await paymentModel.create({
      paymentInvoice: new ObjectId(savedData.returnInvoice),
      paymentAmount: savedData.returnTotalValue,
      paymentReturnRef: new ObjectId(savedData._id),
      paymentType: PAYMENT_TYPE_OUT,
      paymentSource: PAY_SC_CUS_REFUNDS,
      paymentMethod: PAY_METHOD_CASH,
      paymentCollectedBy: new ObjectId(req.user.id),
    });

    // TODO
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Today sales - Statistics
export const todayInvoiceSalesController = async (req, res) => {
  try {
    const result = await invoiceModel.aggregate([
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
          total: { $sum: "$invoiceSubTotal" },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          total: 1,
          count: "$count",
        },
      },
    ]);

    return res
      .status(httpStatus.OK)
      .json(
        ApiResponse.response(
          success_code,
          success_message,
          result[0]?.total ?? 0
        )
      );
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Today sales profit - Statistics
export const todayGrossProfitController = async (req, res) => {
  try {
    const result = await invoiceModel.aggregate([
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
          total: { $sum: "$invoiceGrossTotal" },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          total: 1,
          count: "$count",
        },
      },
    ]);

    return res
      .status(httpStatus.OK)
      .json(
        ApiResponse.response(
          success_code,
          success_message,
          result[0]?.total ?? 0
        )
      );
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Today invoices count - Statistics
export const todayInvoicesCountController = async (req, res) => {
  try {
    const result = await invoiceModel.countDocuments({
      createdAt: {
        $gte: new Date(new Date().setHours(0, 0, 0, 0)), // Start of today
        $lt: new Date(new Date().setHours(23, 59, 59, 999)), // End of today
      },
    });

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message, result ?? 0));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Past Sales - Statistics
export const pastInvoiceSalesController = async (req, res) => {
  const days = req.query.days || 7;
  try {
    const data = await invoiceModel.aggregate([
      [
        {
          $match: {
            createdAt: {
              $gte: new Date(
                new Date().setHours(0, 0, 0, 0) - days * 24 * 60 * 60 * 1000
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
            total: { $sum: "$invoiceSubTotal" },
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
            total: 1,
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

// Past invoices Count - Statistics
export const pastInvoicesCountController = async (req, res) => {
  const days = req.query.days || 7;

  try {
    const data = await invoiceModel.aggregate([
      {
        $match: {
          createdAt: {
            $gte: new Date(
              new Date().setHours(0, 0, 0, 0) - days * 24 * 60 * 60 * 1000
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
