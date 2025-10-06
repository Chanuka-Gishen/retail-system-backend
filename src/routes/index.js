import express from "express";

import authRoutes from "./authRoutes.js";
import userRoutes from "./userRoutes.js";
import customerRoutes from "./customerRoutes.js";
import vehicleRoutes from "./vehicleRoutes.js";
import inventoryRoutes from "./inventoryRoutes.js";
import workOrderRoutes from "./workorderRoutes.js";
import paymentRoutes from "./paymentRoutes.js";
import empRoutes from "./employeeRoutes.js";
import supplierRoutes from "./supplierRoutes.js";
import payrollRoutes from "./payrollRoutes.js";
import bookingRoutes from "./bookingRoutes.js";

const router = express.Router();

router.use("/authentication", authRoutes);
router.use("/user", userRoutes);
router.use("/employee", empRoutes);
router.use("/customer", customerRoutes);
router.use("/vehicle", vehicleRoutes);
router.use("/inventory", inventoryRoutes);
router.use("/workorder", workOrderRoutes);
router.use("/supplier", supplierRoutes);
router.use("/payment", paymentRoutes);
router.use("/payroll", payrollRoutes);
router.use("/bookings", bookingRoutes);

export default router;
