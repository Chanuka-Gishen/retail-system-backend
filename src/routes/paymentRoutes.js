import express from "express";
import {
  createEmpAdvancePaymentsController,
  createExpensesPaymentController,
  createGrnPaymentRecordController,
  createIncomePaymentController,
  createInvoicePaymentController,
  deletePaymentRecordController,
  deleteInvoicePaymentController,
  generateReportSummaryController,
  getAccountSummaryController,
  getAllPaymentsController,
  getAllPendingPaymentRecordsController,
  getExpensesSummaryController,
  getGrnPaymentRecordsController,
  getIncomeExpenseSummaryContorller,
  updatePaymentRecordStatusController,
  invoicePaymentsController,
} from "../controllers/paymentController.js";

const paymentRoutes = express.Router();

paymentRoutes.get("/auth/invoice-payments", invoicePaymentsController);
paymentRoutes.put(
  "/auth/complete-payment",
  updatePaymentRecordStatusController
);
paymentRoutes.get("/auth/payments", getAllPaymentsController);
paymentRoutes.get(
  "/auth/pending-payments",
  getAllPendingPaymentRecordsController
);
paymentRoutes.post("/auth/add", createInvoicePaymentController);
paymentRoutes.delete(
  "/supAuth/delete-invoice-payment",
  deleteInvoicePaymentController
);
paymentRoutes.post("/auth/add-expenses", createExpensesPaymentController);
paymentRoutes.delete("/supAuth/delete-payment", deletePaymentRecordController);
paymentRoutes.post("/auth/add-income", createIncomePaymentController);
paymentRoutes.post("/auth/grn-payment", createGrnPaymentRecordController);
paymentRoutes.post("/auth/add-emp-payment", createEmpAdvancePaymentsController);
paymentRoutes.get("/auth/grn-payments", getGrnPaymentRecordsController);
paymentRoutes.get("/auth/summary", getAccountSummaryController);
paymentRoutes.get("/auth/financial-summary", getIncomeExpenseSummaryContorller);
paymentRoutes.get("/auth/expense-summary", getExpensesSummaryController);
paymentRoutes.get("/auth/generate-report", generateReportSummaryController);

export default paymentRoutes;
