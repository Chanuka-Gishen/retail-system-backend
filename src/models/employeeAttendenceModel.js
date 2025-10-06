import mongoose from "mongoose";
import { ATT_ENUMS } from "../constants/attendenceStatus.js";

const Schema = mongoose.Schema;

const attendanceSchema = new Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "employee",
      required: true,
    },
    date: { type: Date, required: true },
    status: {
      type: String,
      enum: ATT_ENUMS,
      required: true,
    },
    leaveRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "leaveRequest",
      default: null,
    },
    checkIn: { type: Date, required: true },
    checkOut: { type: Date, required: true },
    totalHours: { type: Number, required: true },
    workHours: { type: Number, required: true },
    overTimeHours: { type: Number, required: true },
  },
  { timestamps: true }
);

const employeeAttendenceModel = mongoose.model(
  "employeeAttendence",
  attendanceSchema
);

export default employeeAttendenceModel;
