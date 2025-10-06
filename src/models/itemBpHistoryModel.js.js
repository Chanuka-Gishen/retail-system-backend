import mongoose from "mongoose";
import {
  PRICE_CHANGE_CREATED,
  PRICE_CHANGE_STS,
} from "../constants/priceChangeStatus.js";

const Schema = mongoose.Schema;

const itemBpHistroySchema = new Schema(
  {
    item: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "inventory",
      required: true,
    },
    itemNewPrice: { type: Number, required: true },
    effectiveFrom: { type: Date, default: null },
    effectiveTo: { type: Date, default: null },
    stockMargin: { type: Number, min: 1, required: true },
    changeStatus: {
      type: String,
      enum: PRICE_CHANGE_STS,
      default: PRICE_CHANGE_CREATED,
      required: true,
    },
    stockMovement: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "stockmovement",
      required: true,
    },
    grnRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "goodsReceivedNote",
      required: true,
    },
  },
  { timestamps: true }
);

const itemBpHistoryModel = mongoose.model("itemBpHistory", itemBpHistroySchema);

export default itemBpHistoryModel;
