import Joi from "joi";
import {
  PAY_METHOD_BACK_TRN,
  PAY_METHOD_CARD,
  PAY_METHOD_CASH,
  PAY_METHOD_CHEQUE,
  PAY_METHOD_MOBILE,
  PAY_METHOD_OTHER,
  PAY_METHODS,
} from "../../constants/paymentMethods.js";

export const paymentSchema = Joi.object({
  paymentworkOrder: Joi.string().required().messages({
    "string.base": "Wokr order id should be a type of text.",
    "any.required": "Work order id is required.",
  }),
  paymentCustomer: Joi.string().required().messages({
    "any.required": "Customer id is required.",
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
      PAY_METHOD_CHEQUE,
      PAY_METHOD_MOBILE,
      PAY_METHOD_OTHER
    )
    .required("Payment method required"),
  paymentTransactionId: Joi.string().allow(null, ""),
  paymentNotes: Joi.string().allow(null, ""),
});
