import express from "express";

import authRoutes from "./authRoutes.js";
import userRoutes from "./userRoutes.js";
import customerRoutes from "./customerRoutes.js";
import inventoryRoutes from "./inventoryRoutes.js";
import paymentRoutes from "./paymentRoutes.js";
import empRoutes from "./employeeRoutes.js";
import supplierRoutes from "./supplierRoutes.js";
import payrollRoutes from "./payrollRoutes.js";
import invoiceRoutes from "./invoiceRoutes.js";

const router = express.Router();

router.use("/authentication", authRoutes);
router.use("/user", userRoutes);
router.use("/employee", empRoutes);
router.use("/customer", customerRoutes);
router.use("/inventory", inventoryRoutes);
router.use("/invoice", invoiceRoutes);
router.use("/supplier", supplierRoutes);
router.use("/payment", paymentRoutes);
router.use("/payroll", payrollRoutes);

export default router;
