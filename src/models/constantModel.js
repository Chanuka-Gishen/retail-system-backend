import mongoose from "mongoose";
import { CONSTANT_VALUES } from "../constants/constants.js";

const Schema = mongoose.Schema;

const constantSchema = new Schema(
  {
    constantName: {
      type: String,
      required: true,
      unique: true,
      enum: CONSTANT_VALUES,
    },
    constantIsAvailable: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const constantModel = mongoose.model("constant", constantSchema);

export default constantModel;
