import Joi from "joi";
import {
  PAY_METHOD_BACK_TRN,
  PAY_METHOD_CARD,
  PAY_METHOD_CASH,
  PAY_METHOD_CHEQUE,
} from "../../constants/paymentMethods.js";
import { PAY_SC_EXPENSES } from "../../constants/paymentSource.js";

export const expensePaymentSchema = Joi.object({
  paymentAmount: Joi.number().min(0).required().messages({
    "number.base": "Total price must be a number",
    "number.min": "Total price cannot be negative",
    "any.required": "Total price is required",
  }),
  paymentSource: Joi.string()
    .valid(...PAY_SC_EXPENSES)
    .required("Payment source required"),
  paymentMethod: Joi.string()
    .valid(
      PAY_METHOD_CASH,
      PAY_METHOD_CARD,
      PAY_METHOD_BACK_TRN,
      PAY_METHOD_CHEQUE
    )
    .required("Payment method required"),
  paymentTransactionId: Joi.string().allow(null, ""),
  paymentNotes: Joi.string().allow(null, ""),
  paymentDate: Joi.date()
    .required("Payment date required")
    .max(new Date(new Date().setHours(23, 59, 59, 999))),
});
