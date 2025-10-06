import mongoose from "mongoose";
import { PAY_FREQ_MONTHLY, PAY_FREQUENCE } from "../constants/payrollConstants.js";

const Schema = mongoose.Schema;

const empSalarySchema = new Schema(
  {
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: "employee",
      required: true,
      unique: true,
    },

    baseSalary: { type: Number, required: true },

    payFrequency: {
      type: String,
      enum: PAY_FREQUENCE,
      required: true,
      default: PAY_FREQ_MONTHLY,
    },

    epfEligible: { type: Boolean, default: true },
    etfEligible: { type: Boolean, default: true },

    recurringAllowances: [
      {
        _id: false,
        type: { type: String, required: true }, // e.g., 'housing', 'transport'
        amount: { type: Number, required: true },
        enteredBy: {
          type: Schema.Types.ObjectId,
          ref: "user",
        },
      },
    ],

    otherRecurringEarnings: [
      {
        _id: false,
        description: { type: String },
        amount: { type: Number },
        enteredBy: {
          type: Schema.Types.ObjectId,
          ref: "user",
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

const empSalaryModel = mongoose.model("empSalary", empSalarySchema);

export default empSalaryModel;
