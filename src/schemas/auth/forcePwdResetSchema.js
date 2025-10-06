import Joi from "joi";
import mongoose from "mongoose";

export const forcePwdResetSchema = Joi.object({
  id: Joi.string()
    .custom((value, helpers) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.error("any.invalid");
      }
      return value;
    }, "ObjectId validation")
    .message({
      "any.required": "ID is required",
      "any.invalid": "ID must be a valid MongoDB ObjectId",
    }),
  password: Joi.string().required().messages({
    "string.base": "Password should be a type of text.",
    "any.required": "Password is required.",
  }),
  confirmPassword: Joi.string().required().valid(Joi.ref("password")).messages({
    "string.base": "Confirm password should be a type of text.",
    "any.required": "Please confirm your password.",
    "any.only": "Passwords do not match.",
  }),
});
