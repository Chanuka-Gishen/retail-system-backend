import mongoose from "mongoose";
import { WO_STATUS, WO_STATUS_OPEN } from "../constants/workorderStatus.js";
import { PAY_STATUS, PAY_STATUS_UNPAID } from "../constants/paymentStatus.js";
import { WO_TYPES } from "../constants/workorderTypes.js";

const Schema = mongoose.Schema;

const workOrderSchema = new Schema(
  {
    workOrderCustomer: {
      type: Schema.Types.ObjectId,
      ref: "customer",
      required: true,
    },
    workOrderVehicle: {
      type: Schema.Types.ObjectId,
      ref: "vehicle",
      required: true,
    },
    workOrderType: {
      type: String,
      enum: WO_TYPES,
      required: true,
    },
    workOrderMileage: {
      type: Number,
      required: true,
      min: 0,
    },
    workOrderInvoiceNumber: {
      type: String,
      default: null,
    },
    workOrderAssignees: [
      {
        _id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "employee",
        },
        empFullName: {
          type: String,
          required: true,
        },
      },
    ],
    workOrderServiceItems: [
      {
        _id: false,
        inventoryItem: {
          type: Schema.Types.ObjectId,
          ref: "inventory",
          required: true,
        },
        inventoryItemName: {
          type: String,
          default: "",
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
          min: 0.1,
        },
        exQuantity: {
          type: Number,
          required: true,
          min: 0,
        },
        unitPrice: {
          type: Number,
          required: true,
          min: 0,
        },
        cashDiscount: {
          type: Number,
          required: true,
          min: 0,
          default: 0,
        },
        totalPrice: {
          type: Number,
          required: true,
          min: 0,
        },
      },
    ],
    workOrderCustomItems: [
      {
        _id: false,
        inventoryItemName: {
          type: String,
          default: "",
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
          min: 0.1,
        },
        unitPrice: {
          type: Number,
          required: true,
          min: 0,
        },
        cashDiscount: {
          type: Number,
          required: true,
          min: 0,
          default: 0,
        },
        totalPrice: {
          type: Number,
          required: true,
          min: 0,
        },
      },
    ],
    workOrderCustomChargers: [
      {
        _id: false,
        chargeName: {
          type: String,
          required: true,
        },
        chargeAmount: {
          type: Number,
          required: true,
          min: 0,
          default: 0,
        },
      },
    ],
    workOrderServiceCharge: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    workOrderOtherChargers: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    workOrderNotes: {
      type: String,
      default: "",
    },
    workOrderStatus: {
      type: String,
      enum: WO_STATUS,
      default: WO_STATUS_OPEN,
    },
    workOrderPaymentStatus: {
      type: String,
      enum: PAY_STATUS,
      default: PAY_STATUS_UNPAID,
    },
    workOrderDiscountPercentage: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    workOrderDiscountCash: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    workOrderGrossAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    workOrderTotalAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    workOrderPaidAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    workOrderBalanceAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
  },
  { timestamps: true }
);

const workOrderModel = mongoose.model("workorder", workOrderSchema);

export default workOrderModel;
