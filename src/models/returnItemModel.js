import mongoose from "mongoose";
import { REFUND_REASONS } from "../constants/invoiceConstants.js";

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
  },
  { timestamps: true }
);

const returnItemModel = mongoose.model("returnItem", returnItemSchema);

export default returnItemModel;
