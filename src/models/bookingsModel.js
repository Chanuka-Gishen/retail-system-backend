import mongoose from "mongoose";
import {
  STATUS_BOOKINGS,
  STATUS_CREATED,
  TIME_SLOTS,
} from "../constants/constants.js";

const Schema = mongoose.Schema;

const bookingsModelSchema = new Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "customer",
      required: true,
    },
    vehicle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "vehicle",
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    timeSlot: {
      type: String,
      required: true,
      enum: TIME_SLOTS,
    },
    issue: {
      type: String,
    },
    bookingStatus: {
      type: String,
      enum: STATUS_BOOKINGS,
      default: STATUS_CREATED,
    },
    bookingProcessedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const bookingsModel = mongoose.model("bookings", bookingsModelSchema);

export default bookingsModel;
