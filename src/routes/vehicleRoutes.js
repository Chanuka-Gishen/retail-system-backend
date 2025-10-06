import express from "express";
import {
  addCustomerVehicleController,
  updateCustomerVehicleController,
} from "../controllers/customerVehicleController.js";

const vehicleRoutes = express.Router();

vehicleRoutes.post("/auth/register", addCustomerVehicleController);
vehicleRoutes.put("/supAuth/update", updateCustomerVehicleController);

export default vehicleRoutes;
