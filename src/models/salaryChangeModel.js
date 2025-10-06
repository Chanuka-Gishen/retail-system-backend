import mongoose from "mongoose";
import { SAL_CHANGE_TYPES } from "../constants/payrollConstants.js";

const Schema = mongoose.Schema;

const salaryChangeSchema = new Schema(
  {
    employee: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
    currentSalary: {
      type: Number,
      required: true,
      min: 0,
    },
    newSalary: {
      type: Number,
      required: true,
      min: 0,
    },
    difference: {
      type: Number,
      required: true,
    },
    percentageChange: {
      type: Number,
      required: true,
    },
    effectiveDate: {
      type: Date,
      required: true,
      default: Date.now(),
    },
    changeType: {
      type: String,
      required: true,
      enum: SAL_CHANGE_TYPES,
    },
    reason: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected", "Processed"],
      default: "Approved",
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: "user",
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save hook to calculate difference and percentage
salaryChangeSchema.pre("save", function (next) {
  this.difference = this.newSalary - this.currentSalary;
  this.percentageChange = (
    (this.difference / this.currentSalary) *
    100
  ).toFixed(2);
  next();
});

// Indexes for faster queries
salaryChangeSchema.index({ employee: 1, effectiveDate: -1 }); // Get changes by employee
salaryChangeSchema.index({ changeType: 1 }); // Filter by change type
salaryChangeSchema.index({ status: 1 }); // Filter by approval status
salaryChangeSchema.index({ effectiveDate: 1 }); // For date range queries

const salaryChangeModel = mongoose.model("SalaryChange", salaryChangeSchema);

export default salaryChangeModel;
