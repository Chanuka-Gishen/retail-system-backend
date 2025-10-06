import mongoose from "mongoose";

const Schema = mongoose.Schema;

const inventoryCategorySchema = new Schema(
  {
    categoryTitle: { type: String, required: true, unique: true },
  },
  { timestamps: true }
);

const inventoryCategoryModel = mongoose.model(
  "inventoryCategory",
  inventoryCategorySchema
);

export default inventoryCategoryModel;
