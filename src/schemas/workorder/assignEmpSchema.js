import Joi from "joi";

const assigneeSchema = Joi.object({
  _id: Joi.string().hex().length(24).required(),
  empFullName: Joi.string().required(),
});

export const workOrderAssigneesSchema = Joi.array()
  .items(assigneeSchema)
  .optional()
  .default([]);
