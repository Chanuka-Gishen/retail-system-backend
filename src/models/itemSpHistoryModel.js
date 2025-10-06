import mongoose from "mongoose";

const Schema = mongoose.Schema;

const priceHistorySchema = new Schema(
  {
    item: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "inventory",
      required: true,
    },
    itemOldPrice: { type: Number, required: true },
    itemNewPrice: { type: Number, required: true },
    itemChangedBy: {
      // track who made the change
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
  },
  { timestamps: true }
);

const itemSpHistoryModel = mongoose.model("itemSpHistory", priceHistorySchema);

export default itemSpHistoryModel;
