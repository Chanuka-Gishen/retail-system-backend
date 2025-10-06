import Joi from "joi";
import { VEHICLE_TYPES } from "../../constants/vehicleType.js";

export const customerVehicleEditSchema = Joi.object({
  vehicleNumber: Joi.string().required().messages({
    "string.base": "Vehicle number should be a type of text.",
    "any.required": "Vehicle number is required.",
  }),
  vehicleType: Joi.string()
    .valid(...VEHICLE_TYPES)
    .messages({
      "any.only": "Invalid vehicle type",
      "string.empty": "Vehicle type is required",
    }),
  vehicleManufacturer: Joi.string().messages({
    "string.base": "Manufaturere be a type of text.",
    "any.required": "Manufaturere is required.",
  }),
  vehicleModel: Joi.string().required().messages({
    "string.base": "Vehicle model should be a type of text.",
    "any.required": "Vehicle model is required.",
  }),
});
