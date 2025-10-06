import mongoose from "mongoose";
import { SEQUENCE_VALUES } from "../constants/sequenceConstants.js";

const Schema = mongoose.Schema;

const sequenceSchema = new Schema({
  sequenceType: {
    type: String,
    required: true,
    enum: SEQUENCE_VALUES,
    unique: true,
  },
  sequenceValue: {
    type: Number,
    default: 0,
  },
});

const sequenceModel = mongoose.model("sequence", sequenceSchema);

export default sequenceModel;
