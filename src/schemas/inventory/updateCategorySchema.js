import Joi from "joi";
import mongoose from "mongoose";

export const updateCategorySchema = Joi.object({
  _id: Joi.string()
    .required()
    .custom((value, helpers) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.error("any.invalid");
      }
      return value;
    }, "ObjectId validation")
    .messages({
      "any.required": "Category ID is required",
      "any.invalid": "Invalid Category ID",
    }),
  categoryTitle: Joi.string().trim().min(2).max(50).messages({
    "string.empty": "Category title cannot be empty",
    "string.min": "Category title must be at least 2 characters long",
    "string.max": "Category title cannot exceed 50 characters",
  }),
});
