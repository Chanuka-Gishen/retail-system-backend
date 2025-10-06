import mongoose from "mongoose";
import { PAY_METHODS } from "../constants/paymentMethods.js";
import { PAYMENT_TYPES } from "../constants/paymentTypes.js";
import { PAY_SC_COMBINED } from "../constants/paymentSource.js";
import {
  PAY_STATUS_COMPLETED,
  PAY_STATUS_PENDING,
} from "../constants/paymentStatus.js";
import {
  PAY_INPUT_GENERATED,
  PAY_INPUT_TYPES,
} from "../constants/paymentInputType.js";

const Schema = mongoose.Schema;

const paymentSchema = new Schema(
  {
    paymentInvoice: {
      type: Schema.Types.ObjectId,
      ref: "invoice",
      default: null,
    },
    paymentCustomer: {
      type: Schema.Types.ObjectId,
      ref: "customer",
      default: null,
    },
    paymentStockMovement: {
      type: Schema.Types.ObjectId,
      ref: "stockmovement",
      default: null,
    },
    paymentGrnRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "goodsReceivedNote",
      default: null,
    },
    paymentReturnRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "itemReturn",
      default: null,
    },
    paymentSupplier: {
      type: Schema.Types.ObjectId,
      ref: "supplier",
      default: null,
    },
    paymentEmployee: {
      type: Schema.Types.ObjectId,
      ref: "employee",
      default: null,
    },
    paymentType: {
      type: String,
      enum: PAYMENT_TYPES,
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: [PAY_STATUS_PENDING, PAY_STATUS_COMPLETED],
      default: PAY_STATUS_COMPLETED,
      required: true,
    },
    paymentSource: {
      type: String,
      enum: PAY_SC_COMBINED,
      required: true,
    },
    paymentAmount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    paymentMethod: {
      type: String,
      enum: PAY_METHODS,
      required: true,
    },
    paymentTransactionId: {
      type: String,
      default: "",
    },
    paymentNotes: {
      type: String,
      default: "",
    },
    paymentInputType: {
      type: String,
      enum: PAY_INPUT_TYPES,
      required: true,
      default: PAY_INPUT_GENERATED,
    },
    paymentIsDeleted: {
      type: Boolean,
      required: true,
      default: false,
    },
    paymentDeletedBy: {
      type: Schema.Types.ObjectId,
      ref: "user",
      default: null,
    },
    paymentDeletedAt: {
      type: Date,
      default: null,
    },
    paymentCollectedBy: {
      type: Schema.Types.ObjectId,
      ref: "user",
    },
  },
  { timestamps: true }
);

const paymentModel = mongoose.model("payment", paymentSchema);

export default paymentModel;
