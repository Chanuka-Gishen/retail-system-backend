import mongoose from "mongoose";
import {
  INVOICE_STATUS,
  STATUS_OPEN,
} from "../constants/workorderStatus.js";
import { PAY_STATUS, PAY_STATUS_UNPAID } from "../constants/paymentStatus.js";
import { INV_CUSTOMER_TYPES } from "../constants/invoiceConstants.js";

const Schema = mongoose.Schema;

const invoiceSchema = new Schema(
  {
    invoiceCustomer: {
      type: Schema.Types.ObjectId,
      ref: "customer",
      default: null,
    },
    invoiceCustomerType: {
      type: String,
      required: true,
      enum: INV_CUSTOMER_TYPES,
    },
    invoiceNumber: {
      type: String,
      default: null,
    },
    invoiceNotes: {
      type: String,
      default: "",
    },
    invoiceStatus: {
      type: String,
      enum: INVOICE_STATUS,
      default: STATUS_OPEN,
    },
    invoicePaymentStatus: {
      type: String,
      enum: PAY_STATUS,
      default: PAY_STATUS_UNPAID,
    },
    invoiceDiscountPercentage: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    invoiceDiscountCash: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    invoiceTotalDiscount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    invoiceTotalAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    invoiceGrossTotal: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    invoiceSubTotal: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    invoicePaidAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    invoiceBalanceAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    invoiceCompletedAt: {
      type: Date,
      default: null,
    },
    invoiceClosedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

const invoiceModel = mongoose.model("invoice", invoiceSchema);

export default invoiceModel;
