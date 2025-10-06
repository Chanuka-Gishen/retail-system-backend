import Joi from "joi";
import { SAL_CHANGE_TYPES } from "../../constants/payrollConstants.js";

export const salaryChangeSchema = Joi.object({
  employee: Joi.string().hex().length(24).required().messages({
    "string.hex": "Employee ID must be a valid hexadecimal",
    "string.length": "Employee ID must be 24 characters long",
  }),
  newSalary: Joi.number().min(0).required().messages({
    "number.min": "New salary cannot be negative",
  }),
  changeType: Joi.string().valid(...SAL_CHANGE_TYPES),
  reason: Joi.string().allow("").default(""),
});
