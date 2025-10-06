import mongoose from "mongoose";
import {
  LEAVE_CAT,
  LEAVE_PERIODS,
  LEAVE_STS,
  LEAVE_STS_PENDING,
  LEAVE_TYP_FULL,
  LEAVE_TYP_HALF,
  LEAVE_TYPES,
} from "../constants/leaveConstants.js";

const Schema = mongoose.Schema;

const leaveRequestSchema = new Schema(
  {
    leaveRequestEmp: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "employee",
      required: [true, "Employee reference is required"],
    },
    leaveRequestCategory: {
      type: String,
      enum: {
        values: LEAVE_CAT,
        message: "Leave category must be either sick, vacation or personal",
      },
      required: [true, "Leave category is required"],
    },
    leaveRequestStartDate: {
      type: Date,
      required: [true, "Start date is required"],
      validate: {
        validator: function (date) {
          return date >= new Date();
        },
        message: "Start date cannot be in the past",
      },
    },
    leaveRequestEndDate: {
      type: Date,
      required: function () {
        return this.leaveRequestType === LEAVE_TYP_FULL;
      },
      validate: {
        validator: function (date) {
          if (this.leaveRequestType !== LEAVE_TYP_FULL) return true;

          return date && date >= this.leaveRequestStartDate;
        },
        message: "End date must be after start date",
      },
      default: null,
    },
    leaveRequestNoOfDays: {
      type: Number,
      required: true,
      min: 0.1,
    },
    leaveRequestType: {
      type: String,
      enum: {
        values: LEAVE_TYPES,
        message: "Leave type must be either full or half",
      },
      required: [true, "Leave type is required"],
    },
    leaveRequestHalfDayPeriod: {
      type: String,
      required: function () {
        return this.leaveRequestType === LEAVE_TYP_HALF;
      },
      validate: {
        validator: function (value) {
          // Skip validation if not required
          if (this.leaveRequestType !== LEAVE_TYP_HALF) return true;
          return LEAVE_PERIODS.includes(value);
        },
        message:
          "Half-day period must be morning or afternoon when leave type is HALF",
      },
      default: null,
    },
    leaveRequestStatus: {
      type: String,
      enum: {
        values: LEAVE_STS,
        message: "Status must be pending, approved, or rejected",
      },
      default: LEAVE_STS_PENDING,
    },
    leaveRequestReason: {
      type: String,
      required: function () {
        return this.leaveRequestType === LEAVE_TYP_HALF;
      },
      maxlength: [500, "Reason cannot exceed 500 characters"],
    },
    leaveRequestCreatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
    },
    leaveRequestApprovedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
    },
    leaveRequestApprovedAt: {
      type: Date,
      default: null,
    },
    leaveRequestRejectionReason: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

const leaveRequestModel = mongoose.model("leaveRequest", leaveRequestSchema);

export default leaveRequestModel;
