import Joi from "joi";
import mongoose from "mongoose";

import { TIME_SLOTS } from "../../constants/constants.js";

export const updateBookingSchema = Joi.object({
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
  date: Joi.date()
    .required("Date required")
    .min(new Date(new Date().setHours(0, 0, 0, 0))),

  timeSlot: Joi.string()
    .valid(...TIME_SLOTS)
    .required()
    .messages({
      "any.only": "Invalid time slot",
      "any.required": "Time slot is required",
      "string.empty": "Time slot is required",
    }),

  issue: Joi.string().allow(null, ""),
});
