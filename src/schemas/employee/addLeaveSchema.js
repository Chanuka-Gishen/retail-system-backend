import Joi from "joi";
import mongoose from "mongoose";
import {
  LEAVE_CAT,
  LEAVE_PERIODS,
  LEAVE_TYP_FULL,
  LEAVE_TYP_HALF,
  LEAVE_TYPES,
} from "../../constants/leaveConstants.js";

export const addLeaveRequestSchema = Joi.object({
  leaveRequestEmp: Joi.string()
    .required()
    .custom((value, helpers) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.error("any.invalid");
      }
      return value;
    }, "ObjectId validation")
    .messages({
      "any.required": "Employee reference is required",
      "any.invalid": "Invalid Employee ID",
    }),

  leaveRequestCategory: Joi.string()
    .required()
    .valid(...LEAVE_CAT)
    .messages({
      "any.required": "Leave category is required",
      "any.only": "Leave category must be either vacation, sick or personal",
    }),

  leaveRequestStartDate: Joi.date().required().min("now").messages({
    "date.base": "Invalid date format",
    "date.min": "Start date cannot be in the past",
    "any.required": "Start date is required",
  }),

  leaveRequestEndDate: Joi.alternatives().conditional("leaveRequestType", {
    is: LEAVE_TYP_FULL,
    then: Joi.date().required().min(Joi.ref("leaveRequestStartDate")).messages({
      "date.base": "Invalid date format",
      "date.min": "End date must be after start date",
      "any.required": "End date is required for full-day leave",
    }),
    otherwise: Joi.date().allow(null),
  }),

  leaveRequestType: Joi.string()
    .required()
    .valid(...LEAVE_TYPES)
    .messages({
      "any.required": "Leave type is required",
      "any.only": "Leave type must be either full or half",
    }),

  leaveRequestHalfDayPeriod: Joi.alternatives().conditional(
    "leaveRequestType",
    {
      is: LEAVE_TYP_HALF,
      then: Joi.string()
        .required()
        .valid(...LEAVE_PERIODS)
        .messages({
          "any.required": "Half-day period is required",
          "any.only": "Half-day period must be morning or afternoon",
        }),
      otherwise: Joi.string().allow(null, ""),
    }
  ),

  leaveRequestReason: Joi.string()
    .when("leaveRequestType", {
      is: "half",
      then: Joi.string().required().messages({
        "any.required": "Reason is required for half-day leave",
      }),
      otherwise: Joi.string().allow(null),
    })
    .max(500)
    .messages({
      "string.max": "Reason cannot exceed 500 characters",
    }),
});
