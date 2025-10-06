import mongoose from "mongoose";

const Schema = mongoose.Schema;

const loginActivitySchema = new Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    deviceModel: {
      type: String,
      required: true,
    },
    deviceType: {
      type: String,
      enum: ["desktop", "mobile", "tablet", "bot", "unknown"],
      default: "unknown",
    },
    action: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["Success", "Failed", "Blocked"],
      required: true,
    },
    failureReason: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for faster queries
loginActivitySchema.index({ user: 1 });
loginActivitySchema.index({ createdAt: -1 });

const adminActivityModel = mongoose.model("adminActivity", loginActivitySchema);

export default adminActivityModel;
