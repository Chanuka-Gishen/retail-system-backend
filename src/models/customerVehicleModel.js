import mongoose from "mongoose";
import { VEHICLE_TYPES } from "../constants/vehicleType.js";

const Schema = mongoose.Schema;

const vehicleSchema = new Schema(
  {
    vehicleOwner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "customer",
      required: true,
    },
    vehicleNumber: {
      type: String,
      required: true,
    },
    vehicleType: {
      type: String,
      enum: VEHICLE_TYPES,
      required: true,
    },
    vehicleManufacturer: {
      type: String,
      required: true,
    },
    vehicleModel: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

const customerVehicleModel = mongoose.model("vehicle", vehicleSchema);

export default customerVehicleModel;
