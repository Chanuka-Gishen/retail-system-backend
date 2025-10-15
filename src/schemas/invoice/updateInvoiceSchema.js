import Joi from "joi";
import mongoose from "mongoose";
import {
  INV_CUS_TYP_REGISTERED,
  INV_CUSTOMER_TYPES,
} from "../../constants/invoiceConstants.js";

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

  invoiceCustomerType: Joi.string()
    .required()
    .valid(...INV_CUSTOMER_TYPES)
    .messages({
      "any.required": "Invoice customer type is required",
      "any.only": "Invoice customer type must be one of: {{#valids}}",
    }),

  invoiceCustomer: Joi.string()
    .custom((value, helpers) => {
      if (value && !mongoose.Types.ObjectId.isValid(value)) {
        return helpers.error("any.invalid");
      }
      return value;
    })
    .message({
      "any.invalid": "Customer id must be a valid MongoDB ObjectId",
    })
    .when("invoiceCustomerType", {
      is: INV_CUS_TYP_REGISTERED,
      then: Joi.required().messages({
        "any.required": "Customer ID is required for registered customers",
      }),
      otherwise: Joi.allow(null).default(null),
    }),

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
