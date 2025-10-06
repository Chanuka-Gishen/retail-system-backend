import mongoose from "mongoose";

const Schema = mongoose.Schema;

const invoiceItemSchema = new Schema(
  {
    invoice: {
      type: Schema.Types.ObjectId,
      ref: "invoice",
      required: true,
    },
    item: {
      type: Schema.Types.ObjectId,
      ref: "inventory",
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0.1,
    },
    exQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    unitBuyingPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    cashDiscount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    totalGrossPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    totalNetPrice: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { timestamps: true }
);

const invoiceItemModel = mongoose.model("invoiceItem", invoiceItemSchema);

export default invoiceItemModel;
