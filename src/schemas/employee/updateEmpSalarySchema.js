import Joi from "joi";
import mongoose from "mongoose";
import { PAY_FREQUENCE } from "../../constants/payrollConstants.js";

export const updateEmpSalarySchema = Joi.object({
  _id: Joi.string()
    .custom((value, helpers) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.error("any.invalid");
      }
      return value;
    })
    .required()
    .messages({
      "any.required": "Schema ID is required",
      "any.invalid": "Schema ID must be a valid MongoDB ObjectId",
    }),

  payFrequency: Joi.string()
    .valid(...PAY_FREQUENCE)
    .required()
    .messages({
      "any.only": "Invalid pay frequency",
      "string.empty": "Pay frequency is required",
    }),

  epfEligible: Joi.boolean().optional(),
  etfEligible: Joi.boolean().optional(),

  recurringAllowances: Joi.array()
    .items(
      Joi.object({
        type: Joi.string().required(),
        amount: Joi.number().positive().required(),
        enteredBy: Joi.string().optional(),
      })
    )
    .optional(),

  otherRecurringEarnings: Joi.array()
    .items(
      Joi.object({
        description: Joi.string().allow("").optional(),
        amount: Joi.number().positive().required(),
        enteredBy: Joi.string().optional(),
      })
    )
    .optional(),
});
