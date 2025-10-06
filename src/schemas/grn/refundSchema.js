import Joi from "joi";
import mongoose from "mongoose";

import {
  PAY_METHOD_BACK_TRN,
  PAY_METHOD_CARD,
  PAY_METHOD_CASH,
  PAY_METHOD_CHEQUE,
  PAY_METHOD_MOBILE,
  PAY_METHOD_OTHER,
} from "../../constants/paymentMethods.js";

export const refundSchema = Joi.object({
  _id: Joi.string()
    .custom((value, helpers) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.error("any.invalid");
      }
      return value;
    })
    .required()
    .messages({
      "any.required": "ID is required",
      "any.invalid": "ID must be a valid MongoDB ObjectId",
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
  paymentDate: Joi.date().required("Payment date required").max(new Date()),
});
