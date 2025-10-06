import express from "express";
import {
  cancelReturnStockController,
  createSupplierPaymentsController,
  getAllSuppliersController,
  getSupplierGrnRecordInfoController,
  getSupplierGrnRecordsController,
  getSupplierInfoController,
  getSupplierMovementsController,
  getSupplierRecentPaymentsController,
  getSupplierReturnItemsController,
  getSuppliersForSelectionController,
  processReturnStockController,
  registerSupplierController,
  returnSupplierStockController,
  updateReturnStockController,
  updateSupplierController,
} from "../controllers/supplierController.js";

const supplierRoutes = express.Router();

supplierRoutes.post("/auth/register", registerSupplierController);
supplierRoutes.put("/supAuth/update", updateSupplierController);
supplierRoutes.post("/auth/add-payment", createSupplierPaymentsController);
supplierRoutes.get("/auth/suppliers", getAllSuppliersController);
supplierRoutes.get(
  "/auth/select-suppliers",
  getSuppliersForSelectionController
);
supplierRoutes.get("/auth/info", getSupplierInfoController);
supplierRoutes.get("/auth/supplier-purchases", getSupplierMovementsController);
supplierRoutes.get("/auth/grn", getSupplierGrnRecordsController);
supplierRoutes.get(
  "/auth/supplier-payments",
  getSupplierRecentPaymentsController
);
supplierRoutes.get("/auth/grn-info", getSupplierGrnRecordInfoController);
supplierRoutes.get("/auth/return-records", getSupplierReturnItemsController);
supplierRoutes.post("/auth/return-item", returnSupplierStockController);
supplierRoutes.put("/supAuth/return-update", updateReturnStockController);
supplierRoutes.put("/auth/process-return", processReturnStockController);
supplierRoutes.put("/auth/cancel-return", cancelReturnStockController);

export default supplierRoutes;
