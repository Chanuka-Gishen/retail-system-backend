import mongoose from "mongoose";
import {
  PAYROLL_STS,
  PAYROLL_STS_PENDING,
} from "../constants/payrollConstants.js";

const Schema = mongoose.Schema;

const payrollRunSchema = new Schema(
  {
    payPeriod: {
      startDate: { type: Date, required: true },
      endDate: { type: Date, required: true },
    },

    payrolls: [
      {
        type: Schema.Types.ObjectId,
        ref: "Payroll",
      },
    ],

    summary: {
      totalEmployees: { type: Number, default: 0 },
      totalBasicSalaries: { type: Number, default: 0 },
      totalAllowances: { type: Number, default: 0 },
      totalOvertime: { type: Number, default: 0 },
      totalBonuses: { type: Number, default: 0 },
      totalCommissions: { type: Number, default: 0 },
      totalOtherEarnings: { type: Number, default: 0 },
      totalGrossPay: { type: Number, default: 0 },
      totalDeductions: { type: Number, default: 0 },
      totalNetPay: { type: Number, default: 0 },
      totalEPFEmployee: { type: Number, default: 0 },
      totalEPFEmployer: { type: Number, default: 0 },
      totalETFEmployer: { type: Number, default: 0 },
    },

    status: {
      type: String,
      enum: PAYROLL_STS,
      default: PAYROLL_STS_PENDING,
    },

    processedBy: {
      type: Schema.Types.ObjectId,
      ref: "user",
    },

    processedDate: { type: Date },
  },
  {
    timestamps: true,
  }
);

const payrollRunModel = mongoose.model("payrollRunSchema", payrollRunSchema);

export default payrollRunModel;
