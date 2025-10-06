import mongoose from "mongoose";
import { STOCK_MV_TYPES } from "../constants/stockMovementTypes.js";

const Schema = mongoose.Schema;

const stockMovementSchema = new Schema(
  {
    stockItem: {
      type: Schema.Types.ObjectId,
      ref: "inventory",
      required: true,
    },
    stockMovementType: {
      type: String,
      enum: STOCK_MV_TYPES,
      required: true,
    },
    stockQuantity: {
      type: Number,
      required: true,
      min: 0,
    },
    stockPreviousQuantity: {
      type: Number,
      required: true,
      min: 0,
    },
    stockNewQuantity: {
      type: Number,
      required: true,
      min: 0,
    },
    stockUnit: {
      type: String,
      required: true,
      default: "Pieces",
    },
    stockPricePerUnit: {
      type: Number,
      required: true,
      min: 0,
    },
    stockTotalValue: {
      type: Number,
      required: true,
      min: 0,
    },
    stockSupplier: {
      type: Schema.Types.ObjectId,
      ref: "supplier",
      default: null,
    },
    stockGrnRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "goodsReceivedNote",
      default: null,
    },
    stockIsReturned: { type: Boolean, default: false },
    stockReturnedRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "itemReturn",
      default: null,
    },
    stockNotes: {
      type: String,
      default: "",
    },
    stockPerformedBy: {
      type: Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
  },
  { timestamps: true }
);

const stockMovementModel = mongoose.model("stockmovement", stockMovementSchema);

export default stockMovementModel;
