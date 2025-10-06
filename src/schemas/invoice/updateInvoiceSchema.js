import Joi from "joi";
import mongoose from "mongoose";

export const updateInvoiceSchema = Joi.object({
  _id: Joi.string()
    .custom((value, helpers) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.error("any.invalid");
      }
      return value;
    })
    .message({
      "any.invalid": "Invoice id must be a valid MongoDB ObjectId",
    })
    .required(),

  invoiceDiscountPercentage: Joi.number()
    .precision(2)
    .min(0)
    .max(100)
    .required()
    .default(0)
    .messages({
      "number.base": "Discount percentage must be a number",
      "number.min": "Discount percentage cannot be negative",
      "number.max": "Discount percentage cannot exceed 100%",
      "number.precision": "Discount percentage can have up to 2 decimal places",
      "any.required": "Discount percentage is required",
    }),

  invoiceDiscountCash: Joi.number()
    .precision(2)
    .min(0)
    .required()
    .default(0)
    .messages({
      "number.base": "Discount cash must be a number",
      "number.min": "Discount cash cannot be negative",
      "number.precision": "Discount cash can have up to 2 decimal places",
      "any.required": "Discount cash is required",
    }),
});
