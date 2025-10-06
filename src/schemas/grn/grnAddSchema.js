import Joi from "joi";

const stockItemSchema = Joi.object({
  _id: Joi.string().required().messages({
    "string.empty": "Item ID is required",
    "any.required": "Item ID is required",
  }),
  itemName: Joi.string().required().messages({
    "string.empty": "Item name is required",
    "any.required": "Item name is required",
  }),
  stockQuantity: Joi.number().min(1).required().messages({
    "number.base": "Quantity must be a number",
    "number.min": "Quantity must be valid",
    "any.required": "Quantity is required",
  }),
  stockUnitPrice: Joi.number().min(0.1).required().messages({
    "number.base": "Unit price must be a number",
    "number.min": "Unit price must be valid",
    "any.required": "Unit price is required",
  }),
});

export const grnAddSchema = Joi.object({
  grnReceivedDate: Joi.date()
    .required("Received date required")
    .max(new Date(new Date().setHours(23, 59, 59, 999))),
  grnDiscountAmount: Joi.number().min(0).required().messages({
    "number.base": "Discount must be a number",
    "number.min": "Discount must be valid",
    "any.required": "Discount is required",
  }),
  grnItems: Joi.array().items(stockItemSchema).min(1).required().messages({
    "array.base": "Stock items must be an array",
    "array.min": "At least one stock item is required",
    "any.required": "Stock items are required",
  }),
});
