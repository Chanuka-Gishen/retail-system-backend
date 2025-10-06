import Joi from "joi";
import mongoose from "mongoose";
import { WO_TYPES } from "../../constants/workorderTypes.js";

export const workOrderUpdateSchema = Joi.object({
  _id: Joi.string()
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
  workOrderMileage: Joi.number().min(0).required().messages({
    "number.base": "Mileage must be a number",
    "number.min": "Mileage cannot be negative",
    "any.required": "Mileage is required",
  }),
  workOrderType: Joi.string()
    .valid(...WO_TYPES)
    .required()
    .messages({
      "string.base": "Workorder type should be a type of text.",
      "any.required": "Workorder type is required.",
    }),
  workOrderServiceItems: Joi.array()
    .items(
      Joi.object({
        inventoryItem: Joi.string()
          .custom((value, helpers) => {
            if (!mongoose.Types.ObjectId.isValid(value)) {
              return helpers.error("any.invalid");
            }
            return value;
          })
          .required()
          .messages({
            "any.required": "Inventory item ID is required",
            "any.invalid": "Inventory item ID must be a valid MongoDB ObjectId",
          }),
        inventoryItemName: Joi.string().required().messages({
          "string.empty": "Custom item name cannot be empty",
          "any.required": "Custom item name is required",
        }),
        quantity: Joi.number().min(0).required().messages({
          "number.base": "Quantity must be a number",
          "number.min": "Quantity must be at least 0.1",
          "any.required": "Quantity is required",
        }),
        exQuantity: Joi.number().min(0).default(0).messages({
          "number.base": "Ex Quantity must be a number",
          "number.min": "Ex Quantity must be at least 0",
        }),
        unitPrice: Joi.number().min(0).required().messages({
          "number.base": "Unit price must be a number",
          "number.min": "Unit price cannot be negative",
          "any.required": "Unit price is required",
        }),
        cashDiscount: Joi.number().min(0).required().messages({
          "number.base": "Cash discount must be a number",
          "number.min": "Cash discount cannot be negative",
          "any.required": "Cash discount is required",
        }),
        totalPrice: Joi.number().min(0).required().messages({
          "number.base": "Total price must be a number",
          "number.min": "Total price cannot be negative",
          "any.required": "Total price is required",
        }),
      })
    )
    .messages({
      "array.base": "Service items must be an array",
    }),

  workOrderCustomItems: Joi.array()
    .items(
      Joi.object({
        inventoryItemName: Joi.string().required().messages({
          "string.empty": "Custom item name cannot be empty",
          "any.required": "Custom item name is required",
        }),
        quantity: Joi.number().min(0.1).required().messages({
          "number.base": "Quantity must be a number",
          "number.min": "Quantity must be at least 0.1",
          "any.required": "Quantity is required",
        }),
        unitPrice: Joi.number().min(0).required().messages({
          "number.base": "Unit price must be a number",
          "number.min": "Unit price cannot be negative",
          "any.required": "Unit price is required",
        }),
        cashDiscount: Joi.number().min(0).required().messages({
          "number.base": "Cash discount must be a number",
          "number.min": "Cash discount cannot be negative",
          "any.required": "Cash discount is required",
        }),
        totalPrice: Joi.number().min(0).required().messages({
          "number.base": "Total price must be a number",
          "number.min": "Total price cannot be negative",
          "any.required": "Total price is required",
        }),
      })
    )
    .messages({
      "array.base": "Custom items must be an array",
    }),

  workOrderCustomChargers: Joi.array()
    .items(
      Joi.object({
        chargeName: Joi.string().required().messages({
          "string.empty": "Charge name cannot be empty",
          "any.required": "Charge name is required",
        }),
        chargeAmount: Joi.number().min(0).required().messages({
          "number.base": "Charge amount must be a number",
          "number.min": "Charge amount cannot be negative",
          "any.required": "Charge amount is required",
        }),
      })
    )
    .messages({
      "array.base": "Custom chargers must be an array",
    }),

  workOrderServiceCharge: Joi.number().min(0).required().messages({
    "number.base": "Service charge must be a number",
    "number.min": "Service charge cannot be negative",
    "any.required": "Service charge is required",
  }),

  workOrderOtherChargers: Joi.number().min(0).required().messages({
    "number.base": "Other charges must be a number",
    "number.min": "Other charges cannot be negative",
    "any.required": "Other charges are required",
  }),

  workOrderNotes: Joi.string().allow("").default("").messages({
    "string.base": "Notes must be a string",
  }),

  workOrderDiscountPercentage: Joi.number()
    .min(0)
    .max(100)
    .required()
    .messages({
      "number.base": "Discount percentage must be a number",
      "number.min": "Discount percentage cannot be negative",
      "number.max": "Discount percentage cannot exceed 100",
      "any.required": "Discount percentage is required",
    }),

  workOrderDiscountCash: Joi.number().min(0).required().messages({
    "number.base": "Cash discount must be a number",
    "number.min": "Cash discount cannot be negative",
    "any.required": "Cash discount is required",
  }),
});
