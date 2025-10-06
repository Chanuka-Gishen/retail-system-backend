import mongoose from "mongoose";
import {
  SAL_BONUS_STATUS,
  SAL_BONUS_STS_NOT_PROCESSED,
} from "../constants/payrollConstants.js";

const Schema = mongoose.Schema;

const empBonusSchema = new Schema(
  {
    bonusEmp: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },

    bonusDescription: { type: String, required: true },

    bonusAmount: { type: Number, required: true, min: 0 },

    bonusMonth: { type: String, required: true },

    bonusStatus: {
      type: String,
      enum: SAL_BONUS_STATUS,
      default: SAL_BONUS_STS_NOT_PROCESSED,
    },

    bonusEnteredBy: {
      type: Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const empBonusModel = mongoose.model("empBonus", empBonusSchema);

export default empBonusModel;
