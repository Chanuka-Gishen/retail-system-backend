import mongoose from "mongoose";
import { REFUND_REASONS } from "../constants/invoiceConstants.js";
import {
  RETURN_STS_PENDING,
  RETURN_STS_PROCESSED,
} from "../constants/returnStatus.js";

const Schema = mongoose.Schema;

const returnItemSchema = new Schema(
  {
    returnInvoice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "return",
      required: true,
    },
    returnInvoiceItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "invoiceItem",
      required: true,
    },
    returnInventoryItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "inventory",
      required: true,
    },
    returnItemBp: {
      type: Number,
      required: true,
      min: 0.01,
    },
    returnItemSp: {
      type: Number,
      required: true,
      min: 0.01,
    },
    returnOriginalQuantity: {
      type: Number,
      required: true,
      min: 1,
    },
    returnQuantity: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: function (value) {
          return value <= this.returnOriginalQuantity;
        },
        message: "Return quantity cannot exceed original quantity",
      },
    },
    returnReason: {
      type: String,
      required: true,
      enum: REFUND_REASONS,
    },
    returnItemTotalValue: {
      type: Number,
      required: true,
    },
    returnItemStatus: {
      type: String,
      enum: [RETURN_STS_PENDING, RETURN_STS_PROCESSED],
      default: RETURN_STS_PENDING,
    },
  },
  { timestamps: true }
);

const returnItemModel = mongoose.model("returnItem", returnItemSchema);

export default returnItemModel;
