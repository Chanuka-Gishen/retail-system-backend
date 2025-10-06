import mongoose from "mongoose";
import {
  PAYROLL_PAYMENT_STS,
  PAYROLL_PAYMENT_STS_PENDING,
} from "../constants/payrollConstants.js";

const Schema = mongoose.Schema;

const payrollSchema = new Schema(
  {
    payEmployee: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },

    payPeriod: {
      startDate: { type: Date, required: true },
      endDate: { type: Date, required: true },
    },

    payEmpBasicSalary: { type: Number, required: true },

    payAllowances: [
      {
        type: { type: String, required: true },
        amount: { type: Number, required: true },
      },
    ],

    payOvertime: {
      hours: { type: Number, default: 0 },
      rate: { type: Number, default: 0 },
      amount: { type: Number, default: 0 },
    },

    payBonuses: [
      {
        description: { type: String },
        amount: { type: Number },
      },
    ],
    payOtherEarnings: [
      {
        description: { type: String },
        amount: { type: Number },
      },
    ],

    payDeductions: [
      {
        type: { type: String, required: true },
        amount: { type: Number, required: true },
      },
    ],

    grossPay: { type: Number, required: true },
    totalDeductions: { type: Number, required: true },
    totalEarnings: { type: Number, required: true },
    netPay: { type: Number, required: true },

    payStatus: {
      type: String,
      enum: PAYROLL_PAYMENT_STS,
      default: PAYROLL_PAYMENT_STS_PENDING,
    },

    paidDate: { type: Date },
  },
  {
    timestamps: true,
  }
);

const payrollModel = mongoose.model("payrollSchema", payrollSchema);

export default payrollModel;
