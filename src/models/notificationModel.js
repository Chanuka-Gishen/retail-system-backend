import mongoose from "mongoose";
import {
  NOTIFICATION_TITLES,
  NOTIFICATION_TYPES,
} from "../constants/constants.js";

const Schema = mongoose.Schema;

const notificationSchema = new Schema(
  {
    notificationWorkorder: {
      type: Schema.Types.ObjectId,
      ref: "workorder",
      default: null,
    },
    notificationCustomer: {
      type: Schema.Types.ObjectId,
      ref: "customer",
      default: null,
    },
    notificationSupplier: {
      type: Schema.Types.ObjectId,
      ref: "supplier",
      default: null,
    },
    notificationEmployee: {
      type: Schema.Types.ObjectId,
      ref: "employee",
      default: null,
    },
    notificationType: {
      type: String,
      enum: NOTIFICATION_TYPES,
    },
    notificationTitle: {
      type: String,
      enum: NOTIFICATION_TITLES,
    },
    notificationContent: {
      type: String,
      default: "",
    },
    notificationRecipientCount: {
      type: Number,
      default: 1,
    },
    notificationSuccessCount: {
      type: Number,
      default: 1,
    },
    notificationFailCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

const notificationModel = mongoose.model("notification", notificationSchema);

export default notificationModel;
