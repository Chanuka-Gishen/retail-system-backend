import Joi from "joi";
import mongoose from "mongoose";
import {
  INV_CUS_TYP_REGISTERED,
  INV_CUSTOMER_TYPES,
} from "../../constants/invoiceConstants.js";

export const createInvoiceSchema = Joi.object({
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

  invoiceCustomerType: Joi.string()
    .required()
    .valid(...INV_CUSTOMER_TYPES)
    .messages({
      "any.required": "Invoice customer type is required",
      "any.only": "Invoice customer type must be one of: {{#valids}}",
    }),
});
