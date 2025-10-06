import mongoose from "mongoose";

import { ITEM_STATUS } from "../constants/itemStatus.js";

const Schema = mongoose.Schema;

const inventorySchema = new Schema(
  {
    itemCode: { type: String, required: true, unique: true },
    itemName: { type: String, required: true },
    itemCategory: {
      type: Schema.Types.ObjectId,
      ref: "inventoryCategory",
      required: true,
    },
    itemDescription: { type: String, default: "" },
    itemBpChangeMargin: { type: Number, default: 0 },
    itemQuantity: { type: Number, required: true, min: 0 },
    itemUnit: { type: String, required: true, default: "Pieces" },
    itemBuyingPrice: { type: Number, required: true, min: 0 },
    itemWholesalePrice: { type: Number, required: true, min: 0 },
    itemSellingPrice: { type: Number, required: true, min: 0 },
    itemSupplier: { type: String, default: "" },
    itemWholesaleThreshold: { type: Number, required: true, min: 0 },
    itemThreshold: { type: Number, required: true, min: 0 },
    itemStatus: {
      type: String,
      enum: ITEM_STATUS,
      default: ITEM_STATUS[0],
    },
  },
  { timestamps: true }
);

const inventoryModel = mongoose.model("inventory", inventorySchema);

export default inventoryModel;
