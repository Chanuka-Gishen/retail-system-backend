import Joi from "joi";
import mongoose from "mongoose";

export const updateInvoiceItemSchema = Joi.object({
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

  quantity: Joi.number().required().min(0.1).messages({
    "number.base": "Quantity must be a number",
    "number.min": "Quantity must be at least 0.1",
    "any.required": "Quantity is required",
  }),
});
