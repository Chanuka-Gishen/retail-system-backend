import Joi from "joi";

export const supplierValidationSchema = Joi.object({
  supplierName: Joi.string().required().trim().messages({
    "string.empty": "Supplier name is required",
    "any.required": "Supplier name is required",
  }),
  supplierContactPerson: Joi.string().trim().allow("").optional(),
  supplierPhone: Joi.string().trim().allow("").optional(),
  // supplierProducts: Joi.array()
  //   .items(
  //     Joi.object({
  //       _id: Joi.string().hex().length(24).required(),
  //       itemName: Joi.string().required().messages({
  //         "string.empty": "Product name is required",
  //         "any.required": "Product name is required",
  //       }),
  //     })
  //   )
  //   .optional(),
  supplierNotes: Joi.string().trim().allow("").optional(),
  supplierIsActive: Joi.boolean().default(true),
});
