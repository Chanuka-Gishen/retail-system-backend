import Joi from "joi";
import mongoose from "mongoose";
import {
  LEAVE_STS_APPROVED,
  LEAVE_STS_REJECTED,
} from "../../constants/leaveConstants.js";

export const processLeaveSchema = Joi.object({
  _id: Joi.string()
    .required()
    .custom((value, helpers) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.error("any.invalid");
      }
      return value;
    }, "ObjectId validation")
    .messages({
      "any.required": "Id is required",
      "any.invalid": "Invalid ID",
    }),

  leaveRequestStatus: Joi.string()
    .default("pending")
    .valid(LEAVE_STS_APPROVED, LEAVE_STS_REJECTED)
    .messages({
      "any.only": "Status must be pending, approved, or rejected",
    }),

  leaveRequestRejectionReason: Joi.string().allow(""),
});
