import express from "express";
import {
  createWorkOrderController,
  downloadWorkOrderController,
  getActiveWorkOrdersController,
  getAllWorkordersController,
  getCustomerPaymentStatsController,
  getCustomerWorkordersController,
  getEmployeeWorkordersController,
  getTodayTotalRevenueController,
  getTotalActiveJobsCountController,
  getTotalReceivablesController,
  getWorkOrderController,
  totalJobsChartController,
  totalRevenueChartController,
  updateToCloseController,
  updateToCompleteController,
  updateWorkOrderController,
  workOrderAssigneesController,
  workorderInvoiceEmailController,
} from "../controllers/workorderController.js";

const workOrderRoutes = express.Router();

workOrderRoutes.get("/auth/list", getAllWorkordersController);
workOrderRoutes.get("/auth/info", getWorkOrderController);
workOrderRoutes.post("/auth/create", createWorkOrderController);
workOrderRoutes.put("/auth/update", updateWorkOrderController);
workOrderRoutes.put("/auth/assign-emp", workOrderAssigneesController);
workOrderRoutes.get("/auth/active-orders", getActiveWorkOrdersController);
workOrderRoutes.get("/auth/download-invoice", downloadWorkOrderController);
workOrderRoutes.put("/auth/update-complete", updateToCompleteController);
workOrderRoutes.put("/auth/update-closed", updateToCloseController);
workOrderRoutes.get("/auth/emp-jobs", getEmployeeWorkordersController);
workOrderRoutes.get("/auth/customer-jobs", getCustomerWorkordersController);
workOrderRoutes.get("/auth/invoice-email", workorderInvoiceEmailController);
workOrderRoutes.get(
  "/auth/customer-payment-stats",
  getCustomerPaymentStatsController
);
workOrderRoutes.get("/auth/stat-revenue-chart", totalRevenueChartController);
workOrderRoutes.get("/auth/stat-total-jobs-chart", totalJobsChartController);
workOrderRoutes.get("/auth/today-revenue", getTodayTotalRevenueController);
workOrderRoutes.get("/auth/total-receivables", getTotalReceivablesController);
workOrderRoutes.get(
  "/auth/total-active-jobs",
  getTotalActiveJobsCountController
);

export default workOrderRoutes;
