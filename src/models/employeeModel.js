import mongoose from "mongoose";
import crypto from "crypto";
import dotenv from "dotenv";

import {
  GENDER_FEMALE,
  GENDER_MALE,
  GENDER_OTHER,
} from "../constants/gender.js";
import {
  MARTIAL_STS_DIVORCED,
  MARTIAL_STS_MARRIED,
  MARTIAL_STS_SEPERATED,
  MARTIAL_STS_SINGLE,
  MARTIAL_STS_WIDOWED,
} from "../constants/martialStatus.js";
import { isValidString } from "../services/commonServices.js";
import {
  EMP_RELATION_CHILDREN,
  EMP_RELATION_FAMILY,
  EMP_RELATION_OTHER,
  EMP_RELATION_RELATIVE,
  EMP_RELATION_SPOUSE,
} from "../constants/empRelationshipConstants.js";
import { EMP_ROLES } from "../constants/empRole.js";

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

const employeeSchema = new Schema(
  {
    empFullName: {
      type: String,
      required: true,
      maxlength: 100,
    },
    empDob: {
      type: Date,
      required: true,
    },
    empGender: {
      type: String,
      enum: [GENDER_MALE, GENDER_FEMALE, GENDER_OTHER],
      required: true,
    },
    empMaritalStatus: {
      type: String,
      enum: [
        MARTIAL_STS_SINGLE,
        MARTIAL_STS_MARRIED,
        MARTIAL_STS_DIVORCED,
        MARTIAL_STS_SEPERATED,
        MARTIAL_STS_WIDOWED,
      ],
      default: MARTIAL_STS_SINGLE,
    },
    empEmail: {
      type: String,
      lowercase: true,
      unique: false,
      required: false,
    },
    empNic: {
      type: String,
      required: true,
      unique: true,
      select: false,
      set: (value) => encrypt(value),
      get: (value) => (value ? decrypt(value) : value),
    },
    empPhone: {
      type: String,
      required: true,
    },
    empEmergencyContact: {
      name: {
        type: String,
      },
      relationship: {
        type: String,
        enum: [
          "",
          EMP_RELATION_CHILDREN,
          EMP_RELATION_FAMILY,
          EMP_RELATION_OTHER,
          EMP_RELATION_RELATIVE,
          EMP_RELATION_SPOUSE,
        ],
        default: "",
      },
      phone: {
        type: String,
      },
    },
    empAddress: {
      street: { type: String, required: [true, "Street address is required"] },
      city: { type: String, required: [true, "City is required"] },
      province: { type: String, required: false },
      postalCode: { type: String, required: false },
      country: {
        type: String,
        required: [true, "Country is required"],
        default: "Sri Lanka",
      },
    },
    empId: {
      type: String,
      unique: true,
      required: true,
    },
    empJobTitle: {
      type: String,
      required: [true, "Job title is required"],
    },
    empRole: {
      type: String,
      required: [true, "Employee role is required"],
      enum: EMP_ROLES,
    },
    empEmploymentType: {
      type: String,
      required: [true, "Employment type is required"],
      enum: ["Full-time", "Part-time", "Contract", "Temporary", "Intern"],
    },
    empHireDate: {
      type: Date,
      required: [true, "Hire date is required"],
      default: Date.now,
    },
    empTerminationDate: {
      type: Date,
    },
    empIsActive: {
      type: Boolean,
      default: true,
    },
    empBankDetails: {
      accountNumber: {
        type: String,
        set: (value) => (isValidString(value) ? encrypt(value) : value),
        get: (value) => (isValidString(value) ? decrypt(value) : value),
      },
      bankName: {
        type: String,
      },
      branch: {
        type: String,
      },
      accountType: {
        type: String,
        enum: ["", "current", "Savings"],
        default: "",
      },
    },
    empLeaveBalance: {
      vacation: { type: Number, default: 0, min: 0 },
      sick: { type: Number, default: 0, min: 0 },
      personal: { type: Number, default: 0, min: 0 },
    },
  },
  {
    toJSON: {
      virtuals: true,
      getters: true,
    },
    toObject: {
      virtuals: true,
      getters: true,
    },
    timestamps: true,
  }
);

const employeeModel = mongoose.model("employee", employeeSchema);

export default employeeModel;
