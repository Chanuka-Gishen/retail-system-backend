import mongoose from "mongoose";

import {
  PAY_STATUS_COMPLETED,
  PAY_STATUS_PARTIALLY_PAID,
  PAY_STATUS_UNPAID,
} from "../constants/paymentStatus.js";

const Schema = mongoose.Schema;

const grnSchema = new Schema(
  {
    grnCode: {
      type: String,
      unique: true,
      required: true,
    },
    grnSupplier: {
      type: Schema.Types.ObjectId,
      ref: "supplier",
      required: true,
    },
    grnReceivedDate: {
      type: Date,
      required: true,
    },
    grnTotalValue: {
      type: Number,
      min: 1,
      required: true,
    },
    grnSubTotalValue: {
      type: Number,
      min: 1,
      required: true,
    },
    grnDiscountAmount: {
      type: Number,
      min: 0,
      required: true,
    },
    grnPaidAmount: {
      type: Number,
      min: 0,
      required: true,
    },
    grnDueAmount: {
      type: Number,
      min: 0,
      required: true,
    },
    grnPaymentStatus: {
      type: String,
      enum: [
        PAY_STATUS_UNPAID,
        PAY_STATUS_PARTIALLY_PAID,
        PAY_STATUS_COMPLETED,
      ],
      default: PAY_STATUS_UNPAID,
    },
    grnItems: [
      {
        _id: { type: Schema.Types.ObjectId, ref: "inventory", required: true },
        itemName: { type: String, required: true },
        stockQuantity: { type: Number, min: 1, required: true },
        stockUnitPrice: { type: Number, min: 1, required: true },
        stockTotalPrice: { type: Number, min: 1, required: true },
      },
    ],
  },
  { timestamps: true }
);

const grnModel = mongoose.model("grn", grnSchema);

export default grnModel;
