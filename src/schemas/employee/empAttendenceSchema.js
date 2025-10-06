import Joi from "joi";
import mongoose from "mongoose";

const empIndividualAttSchema = Joi.object({
  id: Joi.string()
    .custom((value, helpers) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.error("any.invalid");
      }
      return value;
    }, "ObjectId validation")
    .message('"id" must be a valid MongoDB ObjectId'),

  empId: Joi.string().required().messages({
    "string.empty": "Employee id is required",
    "any.required": "Employee id is required",
  }),

  empFullName: Joi.string().required().messages({
    "string.empty": "Employee name is required",
    "any.required": "Employee name is required",
  }),

  checkIn: Joi.date().required().messages({
    "date.base": '"checkIn" must be a valid date/time',
    "any.required": '"checkIn" time is required',
  }),

  checkOut: Joi.date()
    .required()
    .custom((value, helpers) => {
      const { checkIn } = helpers.state.ancestors[0];

      // Allow both to be 0:00 (midnight)
      const isBothMidnight =
        checkIn.getHours() === 0 &&
        checkIn.getMinutes() === 0 &&
        value.getHours() === 0 &&
        value.getMinutes() === 0;

      if (isBothMidnight) {
        return value; // Valid case (absent)
      }

      // Otherwise, checkOut must be after checkIn
      if (value <= checkIn) {
        return helpers.error("date.min", { limit: "checkIn" });
      }

      return value;
    })
    .messages({
      "date.base": '"checkOut" must be a valid date/time',
      "any.required": '"checkOut" time is required',
      "date.min": '"checkOut" must be after "checkIn" unless both are 00:00',
    }),
});

export const empAttendenceSchema = Joi.object({
  date: Joi.date().required().messages({
    "date.base": '"date" must be a valid date',
    "any.required": '"date" is required',
  }),
  records: Joi.array()
    .items(empIndividualAttSchema)
    .min(1)
    .required()
    .messages({
      "array.base": "Attendences must be an array",
      "array.min": "At least one record is required",
      "any.required": "Attendence records are required",
    }),
});
