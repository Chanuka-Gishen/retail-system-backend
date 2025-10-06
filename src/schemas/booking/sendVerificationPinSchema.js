import Joi from "joi";

export const SendVerificationPinSchema = Joi.object({
  customerMobile: Joi.string()
    .pattern(/^(\+?\d{1,3}[- ]?)?\d{10}$/)
    .required()
    .length(10)
    .messages({
      "string.pattern.base": "Invalid mobile number (10 digits required)",
      "any.required": "Mobile number is required",
      "string.empty": "Mobile number is required",
    }),
});
