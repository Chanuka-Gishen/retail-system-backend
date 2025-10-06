import mongoose from "mongoose";

const Schema = mongoose.Schema;

const vehicleDataSchema = new Schema(
  {
    manufactuere: {
      type: String,
      required: true,
    },
    model: {
      type: String,
      required: true,
    },
    manufacturer_lower: {
      type: String,
      required: true,
      index: true,
    },
    model_lower: {
      type: String,
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

const vehicleDataModel = mongoose.model("vehicleData", vehicleDataSchema);

export default vehicleDataModel;
