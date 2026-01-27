import Joi from "joi";
import {
  PAY_METHOD_BACK_TRN,
  PAY_METHOD_CARD,
  PAY_METHOD_CASH,
  PAY_METHOD_CHEQUE,
  PAY_METHOD_REFUND_TICKET,
  PAY_METHOD_VOUCHER,
} from "../../constants/paymentMethods.js";

export const paymentSchema = Joi.object({
  paymentInvoice: Joi.string().required().messages({
    "string.base": "Invoice id should be a type of text.",
    "any.required": "Invoice id is required.",
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
      //PAY_METHOD_VOUCHER,
      PAY_METHOD_REFUND_TICKET,
      PAY_METHOD_BACK_TRN,
      PAY_METHOD_CHEQUE
    )
    .required("Payment method required"),
  // voucherCode: Joi.when("paymentMethod", {
  //   is: PAY_METHOD_VOUCHER,
  //   then: Joi.string()
  //     .required()
  //     .min(3)
  //     .max(50)
  //     .pattern(/^[A-Z0-9-]+$/)
  //     .messages({
  //       "string.base": "Voucher code must be a string",
  //       "any.required": "Voucher code is required for voucher payments",
  //       "string.min": "Voucher code must be at least 3 characters",
  //       "string.max": "Voucher code cannot exceed 50 characters",
  //       "string.pattern.base":
  //         "Voucher code can only contain uppercase letters, numbers, and hyphens",
  //     }),
  //   otherwise: Joi.string().allow(null, "").optional(),
  // }),

  refundCode: Joi.when("paymentMethod", {
    is: PAY_METHOD_REFUND_TICKET,
    then: Joi.string().required().min(3).max(50).messages({
      "string.base": "Refund ticket code must be a string",
      "any.required":
        "Refund ticket code is required for refund ticket payments",
      "string.min": "Refund ticket code must be at least 3 characters",
      "string.max": "Refund ticket code cannot exceed 50 characters",
    }),
    otherwise: Joi.string().allow(null, "").optional(),
  }),
  paymentTransactionId: Joi.string().allow(null, ""),
  paymentNotes: Joi.string().allow(null, ""),
});
