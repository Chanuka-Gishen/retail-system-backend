import Joi from "joi";
import { STOCK_IN, STOCK_OUT } from "../../constants/stockMovementTypes.js";

export const stockUpdateSchema = Joi.object({
  _id: Joi.string().required().messages({
    "any.required": "Item ID is required",
  }),
  stockMovementType: Joi.string()
    .valid(STOCK_IN, STOCK_OUT)
    .required()
    .messages({
      "any.required": "Movement type is required",
      "any.only": "Movement type must be one of IN, OUT or ADJUSTMENT",
    }),
  stockQuantity: Joi.number().min(0).required().messages({
    "number.base": "Quantity must be a number",
    "number.min": "Quantity cannot be negative",
    "any.required": "Quantity is required",
  }),
  stockNotes: Joi.string().allow("").default("").messages({
    "string.base": "Notes must be a string",
  }),
});
