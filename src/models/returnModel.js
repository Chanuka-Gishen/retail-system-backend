import mongoose from "mongoose";
import { RETURN_STATUS, STATUS_ISSUED } from "../constants/workorderStatus.js";

const Schema = mongoose.Schema;

const returnSchema = new Schema(
  {
    returnCode: {
      type: String,
      required: true,
      unique: true,
    },
    returnInvoice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "invoice",
      required: true,
    },
    returnTotalValue: {
      type: Number,
      required: true,
    },
    returnExpiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000 * 7),
    },
    returnStatus: {
      type: String,
      required: true,
      enums: RETURN_STATUS,
      default: STATUS_ISSUED,
    },
    returnIssuedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    returnProcessedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      default: null,
    },
  },
  { timestamps: true }
);

const returnModel = mongoose.model("return", returnSchema);

export default returnModel;
