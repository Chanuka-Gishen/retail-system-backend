import Joi from "joi";
import { CUSTOMER_PREFIX } from "../../constants/customerPrefix.js";
import { CUSTOMER_TYPES } from "../../constants/customerType.js";
import { VEHICLE_TYPES } from "../../constants/vehicleType.js";
import { TIME_SLOTS } from "../../constants/constants.js";

export const addBookingSchema = Joi.object({
  customerPrefix: Joi.string()
    .valid(...CUSTOMER_PREFIX)
    .required()
    .messages({
      "any.only": "Invalid prefix",
      "any.required": "Prefix is required",
      "string.empty": "Prefix is required",
    }),

  customerName: Joi.string().required().messages({
    "any.required": "Full Name is required",
    "string.empty": "Full Name is required",
  }),

  customerType: Joi.string()
    .valid(...CUSTOMER_TYPES)
    .required()
    .messages({
      "any.only": "Invalid type",
      "any.required": "Customer type is required",
      "string.empty": "Customer type is required",
    }),

  customerMobile: Joi.string()
    .pattern(/^(\+?\d{1,3}[- ]?)?\d{10}$/)
    .required()
    .length(10)
    .messages({
      "string.pattern.base": "Invalid mobile number (10 digits required)",
      "any.required": "Mobile number is required",
      "string.empty": "Mobile number is required",
    }),

  customerEmail: Joi.string()
    .email({ tlds: { allow: false } })
    .allow("", null)
    .optional()
    .messages({
      "string.email": "Invalid email format",
    }),

  vehicleNumber: Joi.string().required().messages({
    "any.required": "Vehicle number is required",
    "string.empty": "Vehicle number is required",
  }),

  vehicleManufacturer: Joi.string().required().messages({
    "any.required": "Vehicle manufacturer is required",
    "string.empty": "Vehicle manufacturer is required",
  }),

  vehicleModel: Joi.string().required().messages({
    "any.required": "Vehicle model is required",
    "string.empty": "Vehicle model is required",
  }),

  vehicleType: Joi.string()
    .valid(...VEHICLE_TYPES)
    .required()
    .messages({
      "any.only": "Invalid type",
      "any.required": "Vehicle type is required",
      "string.empty": "Vehicle type is required",
    }),

  date: Joi.date()
    .required("Date required")
    .min(new Date(new Date().setHours(0, 0, 0, 0))),

  timeSlot: Joi.string()
    .valid(...TIME_SLOTS)
    .required()
    .messages({
      "any.only": "Invalid time slot",
      "any.required": "Time slot is required",
      "string.empty": "Time slot is required",
    }),

  issue: Joi.string().allow(null, ""),
});
