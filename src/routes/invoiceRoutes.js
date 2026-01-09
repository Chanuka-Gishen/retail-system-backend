import express from "express";
import {
  addInvoiceItemController,
  closeInvoiceController,
  completeInvoiceController,
  createInvoiceController,
  deleteInvoiceItemController,
  getInvoiceInfoController,
  getInvoiceItemsController,
  getInvoicesController,
  getNotClosedInvoicesController,
  getReturnInvoiceItemsController,
  pastInvoiceSalesController,
  pastInvoicesCountController,
  returnInvoiceItemController,
  todayGrossProfitController,
  todayInvoiceSalesController,
  todayInvoicesCountController,
  updateInvoiceController,
  updateInvoiceItemController,
} from "../controllers/invoiceController.js";

const invoiceRoutes = express.Router();

invoiceRoutes.get("/auth/all", getInvoicesController);
invoiceRoutes.get("/auth/open-invoices", getNotClosedInvoicesController);
invoiceRoutes.get("/auth/invoice-info", getInvoiceInfoController);
invoiceRoutes.get("/auth/invoice-items", getInvoiceItemsController);
invoiceRoutes.post("/auth/create", createInvoiceController);
invoiceRoutes.put("/auth/update", updateInvoiceController);
invoiceRoutes.post("/auth/add-item", addInvoiceItemController);
invoiceRoutes.put("/auth/update-item", updateInvoiceItemController);
invoiceRoutes.delete("/auth/delete-item", deleteInvoiceItemController);
invoiceRoutes.put("/auth/complete", completeInvoiceController);
invoiceRoutes.put("/auth/close", closeInvoiceController);
invoiceRoutes.post("/auth/return", returnInvoiceItemController);
invoiceRoutes.get("/auth/invoice-returns", getReturnInvoiceItemsController);
invoiceRoutes.get("/auth/stat-sales", todayInvoiceSalesController);
invoiceRoutes.get("/auth/stat-gross-profit", todayGrossProfitController);
invoiceRoutes.get("/auth/stat-invoices-count", todayInvoicesCountController);
invoiceRoutes.get("/auth/stat-past-sales", pastInvoiceSalesController);
invoiceRoutes.get(
  "/auth/stat-past-invoices-count",
  pastInvoicesCountController
);

export default invoiceRoutes;
