import mongoose from "mongoose";
import { ACC_TYPES } from "../constants/accountTypes.js";

const Schema = mongoose.Schema;

const accountBalanceSchema = new Schema(
  {
    accountType: {
      // Broad classification
      type: String,
      enum: ACC_TYPES,
    },
    accountCurrentBalance: {
      // Always up-to-date amount
      type: Number,
      required: true,
      default: 0,
    },
    accountCurrency: {
      type: String,
      default: "LKR",
    },
  },
  { timestamps: true }
);

const accountBalanceModel = mongoose.model(
  "accountBalance",
  accountBalanceSchema
);

export default accountBalanceModel;
