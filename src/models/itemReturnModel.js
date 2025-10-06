import mongoose from "mongoose";

import { RETURN_TYPS } from "../constants/returnTypes.js";
import { RETURN_STS } from "../constants/returnStatus.js";
import { RETURN_REASONS } from "../constants/returnReasons.js";

const Schema = mongoose.Schema;

const itemReturnsSchema = new Schema(
  {
    grnRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "grn",
      required: true,
    },
    returnItem: {
      type: Schema.Types.ObjectId,
      ref: "inventory",
      required: true,
    },
    returnSupplier: {
      type: Schema.Types.ObjectId,
      ref: "supplier",
      required: true,
    },
    returnStockMovement: {
      type: Schema.Types.ObjectId,
      ref: "stockmovement",
      required: true,
    },
    returnType: {
      type: String,
      enum: RETURN_TYPS,
      default: null,
    },
    returnQty: {
      type: Number,
      min: 1,
      required: true,
    },
    returnReason: {
      type: String,
      enum: RETURN_REASONS,
      required: true,
    },
    returnNote: {
      type: String,
      default: "",
    },
    returnStockValue: {
      type: Number,
      min: 0.1,
      required: true,
    },
    returnStatus: {
      type: String,
      enum: RETURN_STS,
      required: true,
    },
    returnIssuedBy: {
      type: Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    returnProcessedBy: {
      type: Schema.Types.ObjectId,
      ref: "user",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const itemReturnModel = mongoose.model("itemReturn", itemReturnsSchema);

export default itemReturnModel;
