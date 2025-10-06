import mongoose from "mongoose";

const Schema = mongoose.Schema;

const supplierSchema = new mongoose.Schema(
  {
    supplierName: {
      type: String,
      required: [true, "Supplier name is required"],
      trim: true,
    },
    supplierContactPerson: {
      type: String,
      trim: true,
    },
    supplierPhone: {
      type: String,
      trim: true,
    },
    supplierProducts: [
      {
        _id: {
          type: Schema.Types.ObjectId,
          ref: "inventory",
          required: true,
        },
        itemName: {
          type: String,
          required: true,
        },
      },
    ],
    supplierDueAmount: {
      type: Number,
      default: 0,
    },
    supplierNotes: {
      type: String,
      trim: true,
    },
    supplierIsActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

const supplierModel = mongoose.model("supplier", supplierSchema);

export default supplierModel;
