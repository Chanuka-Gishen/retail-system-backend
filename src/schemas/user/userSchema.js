import Joi from "joi";
import { ADMIN_ROLE, STAFF_ROLE, SUPER_ADMIN_ROLE } from "../../constants/role.js";

export const userSchema = Joi.object({
  userFirstName: Joi.string().required().messages({
    "string.base": "First name should be a type of text.",
    "any.required": "First name is required.",
  }),
  userLastName: Joi.string().required().messages({
    "string.base": "Last name should be a type of text.",
    "any.required": "Last name is required.",
  }),
  userRole: Joi.string()
      .valid(SUPER_ADMIN_ROLE, ADMIN_ROLE, STAFF_ROLE)
      .required()
      .messages({
        "any.required": "User role is required",
        "any.only":
          "User role must be one of Super Admin, Admin or Staff",
      }),
  userEmail: Joi.string().required().messages({
    "string.base": "Email should be a type of text.",
    "string.email": "Please enter a valid email address.",
    "any.required": "Email is required.",
  }),
  userPassword: Joi.string().required().messages({
    "any.required": "Password is required.",
  }),
});
