import mongoose from "mongoose";
import { CUSTOMER_PREFIX } from "../constants/customerPrefix.js";
import {
  CUS_TYPE_INDIVIDUAL,
  CUSTOMER_TYPES,
} from "../constants/customerType.js";

const Schema = mongoose.Schema;

const customerSchema = new Schema(
  {
    customerPrefix: {
      type: String,
      enum: CUSTOMER_PREFIX,
      default: CUSTOMER_PREFIX[0],
      required: true,
    },
    customerName: {
      type: String,
      required: true,
    },
    customerType: {
      type: String,
      enum: CUSTOMER_TYPES,
      default: CUS_TYPE_INDIVIDUAL,
    },
    customerMobile: {
      type: String,
      required: true,
    },
    customerSecondaryMobile: {
      type: String,
      default: "",
    },
    customerEmail: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

const customerModel = mongoose.model("customer", customerSchema);

export default customerModel;
