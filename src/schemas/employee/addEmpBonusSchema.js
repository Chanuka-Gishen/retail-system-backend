import Joi from "joi";
import mongoose from "mongoose";

const addEmpBonusSchema = Joi.object({
  bonusEmp: Joi.string()
    .required()
    .custom((value, helpers) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.error("any.invalid");
      }
      return value;
    }, "ObjectId validation")
    .messages({
      "any.required": "Employee ID is required",
      "any.invalid": "Invalid Employee ID",
    }),

  bonusDescription: Joi.string().required().messages({
    "any.required": "Bonus description is required",
  }),

  bonusAmount: Joi.number().min(0).required().messages({
    "number.min": "Bonus amount cannot be negative",
    "any.required": "Bonus amount is required",
  }),

  bonusMonth: Joi.date().required().max("now").messages({
    "date.base": "Invalid date format",
    "date.max": "Month cannot be in the future",
    "any.required": "Month is required",
  }),
});

export default addEmpBonusSchema;
