import Joi from "joi";

export const verifyEmailSchema = Joi.object({
  email: Joi.string().required().messages({
    "string.base": "Email should be a type of text.",
    "string.email": "Please enter a valid email address.",
    "any.required": "Email is required.",
  }),
});
