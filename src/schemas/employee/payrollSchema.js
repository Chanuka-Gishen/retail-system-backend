import Joi from "joi";

export const payrollSchema = Joi.object({
  selectedEmployees: Joi.array().min(1).required().messages({
    "array.min": "Please select at least one employee",
    "any.required": "Employee selection is required",
  }),
  selectAll: Joi.boolean(),
  fromDate: Joi.date().required().messages({
    "any.required": "From date is required",
  }),
  toDate: Joi.date().required().min(Joi.ref("fromDate")).messages({
    "date.min": "To date must be after or equal to From date",
    "any.required": "To date is required",
  }),
}).custom((value, helpers) => {
  // Custom validation for the date range
  if (value.fromDate && value.toDate) {
    if (value.fromDate > value.toDate) {
      return helpers.message("From date must be before or equal to To date");
    }

    // Optional: Add 1-month range validation
    const monthDiff =
      value.toDate.getMonth() -
      value.fromDate.getMonth() +
      12 * (value.toDate.getFullYear() - value.fromDate.getFullYear());
    if (monthDiff > 1) {
      return helpers.message("Date range must be within 1 month");
    }
  }
  return value;
});
