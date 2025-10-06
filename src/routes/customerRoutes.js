import express from "express";

import {
  getAllCustomersController,
  getCustomerInfoController,
  getCustomerSmsNotificationsController,
  getNewCustomersCountController,
  getWalkinCustomersCountController,
  getSmsNotitificationsController,
  getRegisteredCustomersCountController,
  registerCustomerController,
  sendBulkSmsController,
  sendInvoiceBalanceRemainder,
  updateCustomerController,
} from "../controllers/customerController.js";

const customerRoutes = express.Router();

customerRoutes.post("/auth/register", registerCustomerController);
customerRoutes.put("/supAuth/update", updateCustomerController);
customerRoutes.get("/auth/customers", getAllCustomersController);
customerRoutes.get("/auth/customer", getCustomerInfoController);
customerRoutes.get("/auth/notification-logs", getSmsNotitificationsController);
customerRoutes.get(
  "/auth/customer-notification-logs",
  getCustomerSmsNotificationsController
);
customerRoutes.post("/supAuth/send-sms-bulk", sendBulkSmsController);
customerRoutes.get("/supAuth/send-pay-remainder", sendInvoiceBalanceRemainder);
customerRoutes.get(
  "/auth/stat-unique-customers",
  getRegisteredCustomersCountController
);
customerRoutes.get(
  "/auth/stat-repeating-customers",
  getWalkinCustomersCountController
);
customerRoutes.get("/auth/stat-new-customers", getNewCustomersCountController);

export default customerRoutes;
