import Joi from "joi";
import mongoose from "mongoose";

export const inventoryUpdateSchema = Joi.object({
  itemCode: Joi.string().required(),
  itemName: Joi.string().required(),
  itemCategory: Joi.string()
    .custom((value, helpers) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.error("any.invalid");
      }
      return value;
    })
    .message({
      "any.invalid": "Category must be a valid MongoDB ObjectId",
    })
    .required(),
  itemDescription: Joi.string().allow(""),
  itemUnit: Joi.string().default("Pieces"),
  itemBuyingPrice: Joi.number().min(0).required(),
  itemSellingPrice: Joi.number().min(0).required(),
  itemWholesalePrice: Joi.number().min(0).required(),
  itemWholesaleThreshold: Joi.number().min(0).required(),
  itemSupplier: Joi.string().allow(""),
  itemThreshold: Joi.number().min(0).required(),
});
