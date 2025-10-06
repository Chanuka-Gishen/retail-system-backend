import Joi from "joi";
import mongoose from "mongoose";

import { RETURN_REASONS } from "../../constants/returnReasons.js";

export const UpdateReturnStockSchema = Joi.object({
  id: Joi.string()
    .custom((value, helpers) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.error("any.invalid");
      }
      return value;
    })
    .required()
    .messages({
      "any.required": "ID is required",
      "any.invalid": "ID must be a valid MongoDB ObjectId",
    }),
  returnQty: Joi.number().min(1).required().messages({
    "number.base": "Return amount must be a number",
    "number.min": "Return amount cannot be negative",
    "any.required": "Return amount is required",
  }),
  returnReason: Joi.string()
    .valid(...RETURN_REASONS)
    .required("Return reason required"),
  returnNote: Joi.string().allow(null, ""),
});
