import Joi from "joi";
import mongoose from "mongoose";
import { REFUND_REASONS } from "../../constants/invoiceConstants.js";

// Custom Joi extensions
const JoiValidation = Joi.extend((joi) => ({
  type: "objectId",
  base: joi.string(),
  messages: {
    "objectId.invalid": "{{#label}} must be a valid MongoDB ObjectId",
  },
  validate(value, helpers) {
    if (!mongoose.Types.ObjectId.isValid(value)) {
      return { value, errors: helpers.error("objectId.invalid") };
    }
    return { value };
  },
}));

const invoiceItemReturnJoiSchema = Joi.object({
  returnInvoiceItem: JoiValidation.objectId().required().messages({
    "any.required": "Item ID is required",
  }),

  returnItemName: JoiValidation.string().required().messages({
    "any.required": "Item name is required",
  }),

  returnQuantity: Joi.number()
    .required()
    .positive()
    .min(1)
    .integer()
    .strict()
    .messages({
      "any.required": "Return quantity is required",
      "number.base": "Return quantity must be a number",
      "number.positive": "Return quantity must be positive",
      "number.min": "Return quantity must be at least 1",
      "number.max": "Return quantity cannot exceed original quantity",
      "number.integer": "Return quantity must be an integer",
    }),

  returnReason: Joi.string()
    .required()
    .valid(...REFUND_REASONS)
    .messages({
      "any.required": "Return reason is required",
      "any.only": `Return reason must be one of: ${REFUND_REASONS.join(", ")}`,
    }),
});

export const returnItemSchema = Joi.object({
  returnInvoice: JoiValidation.objectId().required().messages({
    "any.required": "Invoice ID is required",
  }),

  returnItems: Joi.array()
    .items(invoiceItemReturnJoiSchema)
    .min(1)
    .max(10)
    .required()
    .unique("returnInvoiceItem")
    .messages({
      "any.required": "Return items array is required",
      "array.base": "Return items must be an array",
      "array.min": "At least one return item is required",
      "array.max": "Cannot process more than 10 return items at once",
      "array.unique": "Duplicate return items are not allowed",
    }),
});
