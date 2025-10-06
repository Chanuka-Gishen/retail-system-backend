import httpStatus from "http-status";
import { ObjectId } from "mongodb";

import customerModel from "../models/customerModel";
import invoiceModel from "../models/invoiceModel.js";

import { createInvoiceSchema } from "../schemas/invoice/createInvoiceSchema.js";
import { updateInvoiceSchema } from "../schemas/invoice/updateInvoiceSchema.js";

import ApiResponse from "../services/ApiResponse.js";
import { error_code, success_code } from "../constants/statusCodes.js";
import {
  invoice_created_success,
  invoice_not_found,
  success_message,
} from "../constants/messageConstants.js";
import { INV_CUS_TYP_REGISTERED } from "../constants/invoiceConstants";
import invoiceItemModel from "../models/invoiceItemModel.js";

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
export const updateInvocieController = async (req, res) => {
  const { error, value } = updateInvoiceSchema.validate(req.body);

  if (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json(ApiResponse.error(error_code, error.message));
  }

  const { _id, invoiceDiscountPercentage, invoiceDiscountCash } = value;

  try {
    const invoice = await invoiceModel.findById(_id);

    if (!invoice) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json(ApiResponse.error(error_code, invoice_not_found));
    }

    const invoiceItems = await invoiceItemModel.find({
      invoice: new ObjectId(invoice._id),
    });

    // Calculate item-level totals
    let invoiceSubTotal = 0;
    let invoiceGrossTotal = 0;

    // Calculate totals from items
    for (const item of invoiceItems) {
      const itemGrossPrice =
        item.unitBuyingPrice * (item.quantity + item.exQuantity);
      const itemNetPrice = item.unitPrice * (item.quantity + item.exQuantity);

      invoiceSubTotal += itemNetPrice;
      invoiceGrossTotal += itemGrossPrice;
    }

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

    invoice.invoiceDiscountPercentage = invoiceDiscountPercentage;
    invoice.invoiceDiscountCash = invoiceDiscountCash;
    invoice.invoiceTotalDiscount = invoiceTotalDiscount;
    invoice.invoiceTotalAmount = invoiceSubTotal;
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
export const addInvoiceItemController = async (req, res) => {};

// Update invoice item controller (Open invoices)
export const updateInvoiceItemController = async (req, res) => {};

// Delete invoice item controller (Open invoices)
export const deleteInvoiceItemController = async (req, res) => {};

// Get complete invocie controller (Closed invoices)
export const getInvoiceController = async (req, res) => {};

// Get invoice info controller (without items)
export const getInvoiceInfoController = async (req, res) => {};

// Get invoice items controller (without other info)
export const getInvoiceItemsController = async (req, res) => {};
