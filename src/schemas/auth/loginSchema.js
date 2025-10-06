import Joi from "joi";

export const loginSchema = Joi.object({
  userEmail: Joi.string().required().messages({
    "string.base": "Email should be a type of text.",
    "string.email": "Please enter a valid email address.",
    "any.required": "Email is required.",
  }),
  userPassword: Joi.string().required().messages({
    "any.required": "Password is required.",
  }),
});
