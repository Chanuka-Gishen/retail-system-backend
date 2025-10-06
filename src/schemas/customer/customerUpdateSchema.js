import Joi from "joi";
import { CUSTOMER_PREFIX } from "../../constants/customerPrefix.js";
import { CUSTOMER_TYPES } from "../../constants/customerType.js";

export const customerUpdateSchema = Joi.object({
  customerPrefix: Joi.string()
    .valid(...CUSTOMER_PREFIX)
    .required()
    .messages({
      "string.base": "Customer prefix should be a type of text.",
      "any.required": "Customer prefix is required.",
    }),
  customerType: Joi.string()
    .valid(...CUSTOMER_TYPES)
    .required()
    .messages({
      "string.base": "Customer type should be a type of text.",
      "any.required": "Customer type is required.",
    }),
  customerName: Joi.string().required().messages({
    "string.base": "Customer name should be a type of text.",
    "any.required": "Customer name is required.",
  }),
  customerMobile: Joi.string().required().messages({
    "string.base": "Customer mobile should be a type of text.",
    "any.required": "Customer mobile is required.",
  }),
  customerSecondaryMobile: Joi.string()
    .messages({
      "string.base": "Secondary mobile should be a type of text.",
    })
    .allow(null, ""),
  customerEmail: Joi.string()
    .messages({
      "string.base": "Email should be a type of text.",
      "string.email": "Please enter a valid email address.",
    })
    .allow(null, ""),
});
