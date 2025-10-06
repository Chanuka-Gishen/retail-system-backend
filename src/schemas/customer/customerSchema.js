import Joi from "joi";
import { CUSTOMER_PREFIX } from "../../constants/customerPrefix.js";
import { CUSTOMER_TYPES } from "../../constants/customerType.js";
import { VEHICLE_TYPES } from "../../constants/vehicleType.js";

export const customerSchema = Joi.object({
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
  vehicleNumber: Joi.string().required().messages({
    "string.base": "Vehicle number should be a type of text.",
    "any.required": "Vehicle number is required.",
  }),
  vehicleManufacturer: Joi.string().required().messages({
    "string.base": "Vehicle manufacturer should be a type of text.",
    "any.required": "Vehicle manufacturer is required.",
  }),
  vehicleModel: Joi.string().required().messages({
    "string.base": "Vehicle model should be a type of text.",
    "any.required": "Vehicle model is required.",
  }),
  vehicleType: Joi.string()
    .valid(...VEHICLE_TYPES)
    .required()
    .messages({
      "string.base": "Vehicle type should be a type of text.",
      "any.required": "Vehicle type is required.",
    }),
});
