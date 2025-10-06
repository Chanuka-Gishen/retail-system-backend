import Joi from "joi";
import mongoose from "mongoose";
import {
  PAY_METHOD_BACK_TRN,
  PAY_METHOD_CARD,
  PAY_METHOD_CASH,
  PAY_METHOD_CHEQUE,
} from "../../constants/paymentMethods.js";

export const empAdvancePaymentSchema = Joi.object({
  empId: Joi.string()
    .required()
    .custom((value, helpers) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.error("any.invalid");
      }
      return value;
    }, "ObjectId validation")
    .messages({
      "any.required": "Employee reference is required",
      "any.invalid": "Invalid Employee ID",
    }),
  paymentAmount: Joi.number().min(0).required().messages({
    "number.base": "Total price must be a number",
    "number.min": "Total price cannot be negative",
    "any.required": "Total price is required",
  }),
  paymentMethod: Joi.string()
    .valid(
      PAY_METHOD_CASH,
      PAY_METHOD_CARD,
      PAY_METHOD_BACK_TRN,
      PAY_METHOD_CHEQUE
    )
    .required("Payment method required"),
  paymentTransactionId: Joi.string().allow(null, ""),
  paymentDate: Joi.date()
    .required("Payment date required")
    .max(new Date(new Date().setHours(23, 59, 59, 999))),
});
