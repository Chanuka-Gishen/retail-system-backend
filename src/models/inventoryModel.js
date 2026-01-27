import mongoose from "mongoose";
import crypto from "crypto";

import {
  ITEM_STATUS,
  ITEM_STS_INSTOCK,
  ITEM_STS_LOW_STOCK,
  ITEM_STS_OUTOFSTOCK,
} from "../constants/itemStatus.js";

const Schema = mongoose.Schema;

const inventorySchema = new Schema(
  {
    itemCode: { type: String, required: true, unique: true },
    itemBarCode: {
      type: String,
      index: true,
      required: true,
      default: () => crypto.randomBytes(16).toString("hex"),
      validate: {
        validator: function (v) {
          return /^[A-Za-z0-9_-]{16,64}$/.test(v); // Secure token format
        },
        message: "Invalid barcode token format",
      },
    },
    itemName: { type: String, required: true },
    itemCategory: {
      type: Schema.Types.ObjectId,
      ref: "inventoryCategory",
      required: true,
    },
    itemBrand: {
      type: Schema.Types.ObjectId,
      ref: "brand",
      default: null,
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

inventorySchema.pre("save", function (next) {
  this.updateStatusBasedOnQuantity();
  next();
});

inventorySchema.pre("findOneAndUpdate", function (next) {
  this.updateStatusBasedOnQuantity();
  next();
});

inventorySchema.pre("findByIdAndUpdate", function (next) {
  this.updateStatusBasedOnQuantity();
  next();
});

// Method to update status based on quantity
inventorySchema.methods.updateStatusBasedOnQuantity = function () {
  const quantity = this.itemQuantity || 0;
  const threshold = this.itemThreshold || 0;

  switch (quantity) {
    case quantity === 0:
      this.itemStatus = ITEM_STS_OUTOFSTOCK;
      break;
    case quantity <= threshold:
      this.itemStatus = ITEM_STS_LOW_STOCK;
      break;
    default:
      this.itemStatus = ITEM_STS_INSTOCK;
      break;
  }
};

const inventoryModel = mongoose.model("inventory", inventorySchema);

export default inventoryModel;
