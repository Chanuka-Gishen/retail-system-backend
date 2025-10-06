import Joi from "joi";
import mongoose from "mongoose";
import { WO_TYPES } from "../../constants/workorderTypes.js";

export const workOrderSchema = Joi.object({
  workOrderCustomer: Joi.string()
    .custom((value, helpers) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.error("any.invalid");
      }
      return value;
    })
    .required()
    .messages({
      "any.required": "Customer ID is required",
      "any.invalid": "Customer ID must be a valid MongoDB ObjectId",
    }),

  workOrderVehicle: Joi.string()
    .custom((value, helpers) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.error("any.invalid");
      }
      return value;
    })
    .required()
    .messages({
      "any.required": "Vehicle ID is required",
      "any.invalid": "Vehicle ID must be a valid MongoDB ObjectId",
    }),
  workOrderMileage: Joi.number().min(0).required().messages({
    "number.base": "Mileage must be a number",
    "number.min": "Mileage cannot be negative",
    "any.required": "Mileage is required",
  }),
  workOrderType: Joi.string()
    .valid(...WO_TYPES)
    .required()
    .messages({
      "string.base": "Workorder type should be a type of text.",
      "any.required": "Workorder type is required.",
    }),
});
