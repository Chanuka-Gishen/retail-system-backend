import Joi from "joi";
import mongoose from "mongoose";

export const updateUserSchema = Joi.object({
  id: Joi.string()
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
  userFirstName: Joi.string().required().messages({
    "string.base": "First name should be a type of text.",
    "any.required": "First name is required.",
  }),
  userLastName: Joi.string().required().messages({
    "string.base": "Last name should be a type of text.",
    "any.required": "Last name is required.",
  }),
  userEmail: Joi.string().required().messages({
    "string.base": "Email should be a type of text.",
    "string.email": "Please enter a valid email address.",
    "any.required": "Email is required.",
  }),
  userIsActive: Joi.boolean().default(true).messages({
    "boolean.base": "Active status must be true or false",
  }),
  isUserFirstLogin: Joi.boolean().messages({
    "boolean.base": "Reset Password approval must be true or false",
  }),
});
