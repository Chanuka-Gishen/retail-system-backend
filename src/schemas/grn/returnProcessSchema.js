import Joi from "joi";
import mongoose from "mongoose";

import { RETURN_TYP_CASH, RETURN_TYPS } from "../../constants/returnTypes.js";
import {
  PAY_METHOD_BACK_TRN,
  PAY_METHOD_CARD,
  PAY_METHOD_CASH,
  PAY_METHOD_CHEQUE,
  PAY_METHOD_MOBILE,
  PAY_METHOD_OTHER,
} from "../../constants/paymentMethods.js";

export const returnProcessSchema = Joi.object({
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
  returnType: Joi.string()
    .valid(...RETURN_TYPS)
    .required("Return type required"),
  paymentMethod: Joi.string()
    .valid(
      PAY_METHOD_CASH,
      PAY_METHOD_CARD,
      PAY_METHOD_BACK_TRN,
      PAY_METHOD_CHEQUE,
      PAY_METHOD_MOBILE,
      PAY_METHOD_OTHER
    )
    .when("returnType", {
      is: RETURN_TYP_CASH,
      then: Joi.required().messages({
        "any.required": "Payment method is required for cash returns",
      }),
      otherwise: Joi.optional().allow(null, ""),
    }),
  paymentTransactionId: Joi.string().allow(null, ""),
});
