import Joi from "joi";

export const changePasswordSchema = Joi.object({
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
