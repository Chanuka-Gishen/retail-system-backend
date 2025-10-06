import Joi from "joi";

export const categorySchema = Joi.object({
  categoryTitle: Joi.string()
    .trim()
    .min(2)
    .max(50)
    .required()
    .messages({
      'string.empty': 'Category title is required',
      'string.min': 'Category title must be at least 2 characters long',
      'string.max': 'Category title cannot exceed 50 characters',
      'any.required': 'Category title is required'
    })
});