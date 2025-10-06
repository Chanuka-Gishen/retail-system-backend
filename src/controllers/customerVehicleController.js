import httpStatus from "http-status";
import { ObjectId } from "mongodb";

import ApiResponse from "../services/ApiResponse.js";
import {
  error_code,
  info_code,
  success_code,
} from "../constants/statusCodes.js";
import customerVehicleModel from "../models/customerVehicleModel.js";
import {
  customer_not_found,
  existing_customer,
  existing_vehicle,
  vehicle_added_success,
  vehicle_not_found,
  vehicle_updated_success,
} from "../constants/messageConstants.js";
import customerModel from "../models/customerModel.js";
import { customerVehicleSchema } from "../schemas/customer/customerVehicleSchema.js";
import { customerVehicleEditSchema } from "../schemas/customer/customerVehicleEditSchema.js";
import { formatText } from "../services/commonServices.js";

// Customer add controller
export const addCustomerVehicleController = async (req, res) => {
  const id = req.query.id;
  try {
    const { error, value } = customerVehicleSchema.validate(req.body);

    if (error) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, error.message));
    }
    const { vehicleNumber, vehicleType, vehicleManufacturer, vehicleModel } =
      value;

    const isExistingCustomer = await customerModel.findById(new ObjectId(id));

    if (!isExistingCustomer) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, customer_not_found));
    }

    const formattedVehicleNumber = formatText(vehicleNumber);

    const isExistingVehicle = await customerVehicleModel
      .findOne({ formattedVehicleNumber })
      .populate("vehicleOwner");

    if (isExistingVehicle) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(
          ApiResponse.error(
            info_code,
            existing_vehicle + isExistingVehicle.vehicleOwner.customerName
          )
        );
    }

    const newVehicle = new customerVehicleModel({
      vehicleOwner: new ObjectId(isExistingCustomer._id),
      vehicleNumber: formattedVehicleNumber,
      vehicleType,
      vehicleManufacturer,
      vehicleModel,
    });

    await newVehicle.save();

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, vehicle_added_success));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Update customer vehicle controller
export const updateCustomerVehicleController = async (req, res) => {
  const id = req.query.id;
  try {
    const { error, value } = customerVehicleEditSchema.validate(req.body);

    if (error) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, error.message));
    }

    const vehicle = await customerVehicleModel.findById(new ObjectId(id));

    if (!vehicle) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, vehicle_not_found));
    }

    const formattedVehicleNumber = formatText(value.vehicleNumber);

    if (vehicle.vehicleNumber != formattedVehicleNumber) {
      const isExistingVehicle = await customerVehicleModel
        .findOne({ vehicleNumber: formattedVehicleNumber })
        .populate("vehicleOwner");

      if (isExistingVehicle) {
        return res
          .status(httpStatus.BAD_REQUEST)
          .json(
            ApiResponse.error(
              info_code,
              existing_vehicle + isExistingVehicle.vehicleOwner.customerName
            )
          );
      }

      value.vehicleNumber = formattedVehicleNumber;
    }

    Object.assign(vehicle, value);

    await vehicle.save();

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, vehicle_updated_success));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};
