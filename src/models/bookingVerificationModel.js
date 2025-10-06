import mongoose from "mongoose";
import crypto from "crypto";
import dotenv from "dotenv";

import { STATUS_PENDING, STATUS_VERIFICATION } from "../constants/constants.js";

dotenv.config();

// Encryption configuration
const encryptionAlgorithm = "aes-256-cbc";
const encryptionKey = process.env.ENCRYPTION_KEY;
const ivLength = 16;

// Helper functions for encryption/decryption
const encrypt = (text) => {
  const iv = crypto.randomBytes(ivLength);
  const cipher = crypto.createCipheriv(
    encryptionAlgorithm,
    Buffer.from(encryptionKey),
    iv
  );
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
};

const decrypt = (text) => {
  const [ivPart, encryptedPart] = text.split(":");
  if (!ivPart || !encryptedPart) throw new Error("Invalid encrypted text");
  const iv = Buffer.from(ivPart, "hex");
  const encryptedText = Buffer.from(encryptedPart, "hex");
  const decipher = crypto.createDecipheriv(
    encryptionAlgorithm,
    Buffer.from(encryptionKey),
    iv
  );
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
};

const Schema = mongoose.Schema;

const bookingVerificationSchema = new Schema(
  {
    mobileNumber: {
      type: String,
      required: true,
      index: true,
    },

    pin: {
      type: String,
      required: true,
      set: (value) => encrypt(value),
      get: (value) => (value ? decrypt(value) : value),
    },

    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 }, // TTL index for auto-deletion
    },
    attemptCount: {
      type: Number,
      default: 0,
      max: 3,
    },
    status: {
      type: String,
      enum: STATUS_VERIFICATION,
      default: STATUS_PENDING,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// TTL index for automatic cleanup of expired documents
bookingVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Index for mobile number and status for efficient queries
bookingVerificationSchema.index({ mobileNumber: 1, status: 1 });

// Prevent multiple active PINs for the same mobile number
bookingVerificationSchema.index({
  mobileNumber: 1,
  status: 1,
  expiresAt: 1,
});

const bookingVerificationModel = mongoose.model(
  "bookingVerification",
  bookingVerificationSchema
);

export default bookingVerificationModel;
