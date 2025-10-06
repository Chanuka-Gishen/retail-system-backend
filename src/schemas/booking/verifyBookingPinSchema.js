import Joi from "joi";

export const VerifyBookingPinSchema = Joi.object({
  customerMobile: Joi.string()
    .pattern(/^(\+?\d{1,3}[- ]?)?\d{10}$/)
    .required()
    .length(10)
    .messages({
      "string.pattern.base": "Invalid mobile number (10 digits required)",
      "any.required": "Mobile number is required",
      "string.empty": "Mobile number is required",
    }),
  pin: Joi.string().length(6).pattern(/^\d+$/).required().messages({
    "string.length": "PIN must be exactly 6 digits",
    "string.pattern.base": "PIN must contain only numbers",
    "any.required": "PIN is required",
    "string.empty": "PIN is required",
  }),
});
