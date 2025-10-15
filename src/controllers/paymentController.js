import { ObjectId } from "mongodb";
import httpStatus from "http-status";
import PDFDocument from "pdfkit";

import workOrderModel from "../models/workorderModel.js";
import ApiResponse from "../services/ApiResponse.js";
import {
  customer_not_found,
  emp_not_found,
  grn_not_found,
  invoice_not_found,
  payment_already_completed,
  payment_already_processed,
  payment_cannot_delete_generated,
  payment_deleted_successfull,
  payment_exceeded_balance,
  payment_record_notfound,
  success_message,
  supplier_not_found,
  wo_not_found,
} from "../constants/messageConstants.js";
import {
  error_code,
  info_code,
  success_code,
} from "../constants/statusCodes.js";
import {
  PAY_STATUS_COMPLETED,
  PAY_STATUS_PAID,
  PAY_STATUS_PARTIALLY_PAID,
  PAY_STATUS_PENDING,
  PAY_STATUS_REFUNDED,
} from "../constants/paymentStatus.js";
import customerModel from "../models/customerModel.js";
import paymentModel from "../models/paymentModel.js";
import { paymentSchema } from "../schemas/payments/paymentSchema.js";
import {
  PAYMENT_TYPE_IN,
  PAYMENT_TYPE_OUT,
  PAYMENT_TYPES,
} from "../constants/paymentTypes.js";
import accountBalanceModel from "../models/accountBalancemodel.js";
import { isValidString } from "../services/commonServices.js";
import {
  PAY_SC_ADVANCE_PAYMENTS,
  PAY_SC_COMBINED,
  PAY_SC_CUS_REFUNDS,
  PAY_SC_SALES_RETAIL,
  PAY_SC_INVENTORY,
} from "../constants/paymentSource.js";
import { updateAccountData } from "./inventoryController.js";
import { expensePaymentSchema } from "../schemas/payments/expensePaymentSchema.js";
import {
  PAY_METHOD_BACK_TRN,
  PAY_METHOD_CARD,
  PAY_METHOD_CASH,
  PAY_METHOD_CHEQUE,
  PAY_METHOD_MOBILE,
  PAY_METHOD_OTHER,
} from "../constants/paymentMethods.js";
import {
  ACC_TYP_BANK,
  ACC_TYP_CASH,
  ACC_TYP_PAYABLES,
  ACC_TYP_RECEIVABLES,
} from "../constants/accountTypes.js";
import { generateAccountsSummaryReport } from "../services/pdfServices.js";
import { incomePaymentSchema } from "../schemas/payments/incomePaymentSchema.js";
import { refundSchema } from "../schemas/grn/refundSchema.js";
import { WO_STATUS_CLOSED } from "../constants/workorderStatus.js";
import mongoose from "mongoose";
import { PAY_INPUT_MANUALLY } from "../constants/paymentInputType.js";
import { grnPaymentSchema } from "../schemas/payments/grnPaymentSchema.js";
import grnModel from "../models/grnModel.js";
import supplierModel from "../models/supplierModel.js";
import { empAdvancePaymentSchema } from "../schemas/payments/empAdvancePaymentSchema.js";
import employeeModel from "../models/employeeModel.js";
import invoiceModel from "../models/invoiceModel.js";
import { INV_CUS_TYP_REGISTERED } from "../constants/invoiceConstants.js";

// Add payment controller - invoice
export const createInvoicePaymentController = async (req, res) => {
  const { error, value } = paymentSchema.validate(req.body);

  if (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json(ApiResponse.error(error_code, error.message));
  }

  const {
    paymentInvoice,
    paymentAmount,
    paymentMethod,
    paymentTransactionId,
    paymentNotes,
  } = value;

  try {
    const invoice = await invoiceModel.findById(new ObjectId(paymentInvoice));

    if (!invoice) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json(ApiResponse.error(error_code, invoice_not_found));
    }

    let customer = null;

    if (
      invoice.invoiceCustomerType === INV_CUS_TYP_REGISTERED &&
      invoice.invoiceCustomer
    ) {
      customer = await customerModel.findById(
        new ObjectId(invoice.invoiceCustomer)
      );

      if (!customer) {
        return res
          .status(httpStatus.BAD_REQUEST)
          .json(ApiResponse.error(error_code, customer_not_found));
      }
    }

    if (invoice.invoicePaymentStatus === PAY_STATUS_PAID) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(info_code, payment_already_completed));
    }

    const balanceAmount = invoice.invoiceBalanceAmount - paymentAmount;

    if (balanceAmount < 0) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(info_code, payment_exceeded_balance));
    }

    const newPayment = new paymentModel({
      paymentInvoice: new ObjectId(invoice._id),
      paymentCustomer: customer ? new ObjectId(customer._id) : null,
      paymentCollectedBy: new ObjectId(req.user.id),
      paymentType: PAYMENT_TYPE_IN,
      paymentSource: PAY_SC_SALES_RETAIL,
      paymentStatus:
        paymentMethod === PAY_METHOD_CHEQUE
          ? PAY_STATUS_PENDING
          : PAY_STATUS_COMPLETED,
      paymentNotes: isValidString(paymentNotes)
        ? paymentNotes
        : "Customer invoice payments " + invoice.invoiceNumber,
      paymentMethod,
      paymentAmount,
      paymentTransactionId,
    });

    const savedPayment = await newPayment.save();

    if (savedPayment.paymentMethod != PAY_METHOD_CHEQUE) {
      const paidAmount = invoice.invoicePaidAmount + savedPayment.paymentAmount;

      invoice.invoiceBalanceAmount = balanceAmount;
      invoice.invoicePaidAmount = paidAmount;
      invoice.invoicePaymentStatus =
        balanceAmount <= 0 ? PAY_STATUS_PAID : PAY_STATUS_PARTIALLY_PAID;

      await invoice.save();
    }

    if (
      [PAY_METHOD_CASH, PAY_METHOD_MOBILE, PAY_METHOD_OTHER].includes(
        savedPayment.paymentMethod
      )
    ) {
      await updateAccountData(
        ACC_TYP_CASH,
        PAYMENT_TYPE_IN,
        savedPayment.paymentAmount
      );
    }

    if (
      [PAY_METHOD_BACK_TRN, PAY_METHOD_CARD].includes(
        savedPayment.paymentMethod
      )
    ) {
      await updateAccountData(
        ACC_TYP_BANK,
        PAYMENT_TYPE_IN,
        savedPayment.paymentAmount
      );
    }

    await updateAccountData(
      ACC_TYP_RECEIVABLES,
      PAYMENT_TYPE_OUT,
      savedPayment.paymentAmount
    );

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_code));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Delete payment record - invoice
export const deleteInvoicePaymentController = async (req, res) => {
  const id = req.query.id;

  try {
    const record = await paymentModel.findById(new ObjectId(id));

    if (!record) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, payment_record_notfound));
    }

    const invoice = await invoiceModel.findById(
      new ObjectId(record.paymentInvoice)
    );

    if (!invoice) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, invoice_not_found));
    }

    if (
      [PAY_METHOD_CASH, PAY_METHOD_MOBILE, PAY_METHOD_OTHER].includes(
        record.paymentMethod
      )
    ) {
      await updateAccountData(
        ACC_TYP_CASH,
        PAYMENT_TYPE_OUT,
        record.paymentAmount
      );
    }

    if ([PAY_METHOD_BACK_TRN, PAY_METHOD_CARD].includes(record.paymentMethod)) {
      await updateAccountData(
        ACC_TYP_BANK,
        PAYMENT_TYPE_OUT,
        record.paymentAmount
      );
    }

    await updateAccountData(
      ACC_TYP_RECEIVABLES,
      PAYMENT_TYPE_IN,
      record.paymentAmount
    );

    const newPaidAmount = invoice.invoicePaidAmount - record.paymentAmount;
    const newBalanceAmount =
      invoice.invoiceBalanceAmount + record.paymentAmount;

    invoice.invoicePaidAmount = newPaidAmount;
    invoice.invoiceBalanceAmount = newBalanceAmount;
    invoice.invoicePaymentStatus = PAY_STATUS_PARTIALLY_PAID;

    await invoice.save();

    await paymentModel.deleteOne(record);

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_code));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Update payment record to completed
export const updatePaymentRecordStatusController = async (req, res) => {
  const id = req.query.id;

  try {
    const result = await paymentModel.findById(new ObjectId(id));

    if (!result) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, payment_record_notfound));
    }

    if (
      result.paymentStatus === PAY_STATUS_COMPLETED ||
      result.paymentMethod != PAY_METHOD_CHEQUE
    ) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, payment_already_processed));
    }

    result.paymentStatus = PAY_STATUS_COMPLETED;

    await updateAccountData(
      ACC_TYP_BANK,
      PAYMENT_TYPE_IN,
      result.paymentAmount
    );

    await result.save();

    const invoice = await invoiceModel.findById(
      new ObjectId(result.paymentInvoice)
    );

    const balanceAmount = invoice.invoiceBalanceAmount - result.paymentAmount;

    const paidAmount = invoice.invoicePaidAmount + result.paymentAmount;

    invoice.invoiceBalanceAmount = balanceAmount;
    invoice.invoicePaidAmount = paidAmount;
    invoice.invoicePaymentStatus =
      balanceAmount <= 0 ? PAY_STATUS_PAID : PAY_STATUS_PARTIALLY_PAID;

    await invoice.save();

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_code));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Create expenses records
export const createExpensesPaymentController = async (req, res) => {
  const { error, value } = expensePaymentSchema.validate(req.body);

  if (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json(ApiResponse.error(error_code, error.message));
  }
  try {
    const newPayment = new paymentModel({
      paymentCollectedBy: new ObjectId(req.user.id),
      paymentType: PAYMENT_TYPE_OUT,
      paymentAmount: value.paymentAmount,
      paymentSource: value.paymentSource,
      paymentMethod: value.paymentMethod,
      paymentTransactionId: value.paymentTransactionId,
      paymentNotes: value.paymentNotes,
      paymentInputType: PAY_INPUT_MANUALLY,
      createdAt: value.paymentDate,
    });

    const savedPayment = await newPayment.save();

    if ([PAY_METHOD_CASH].includes(savedPayment.paymentMethod)) {
      await updateAccountData(
        ACC_TYP_CASH,
        PAYMENT_TYPE_OUT,
        savedPayment.paymentAmount
      );
    }

    if (
      [PAY_METHOD_BACK_TRN, PAY_METHOD_CARD, PAY_METHOD_CHEQUE].includes(
        savedPayment.paymentMethod
      )
    ) {
      await updateAccountData(
        ACC_TYP_BANK,
        PAYMENT_TYPE_OUT,
        savedPayment.paymentAmount
      );
    }

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Delete manual entered payment records
export const deletePaymentRecordController = async (req, res) => {
  const id = req.query.id;
  const userId = req.user.id;

  try {
    const record = await paymentModel.findById(new mongoose.Types.ObjectId(id));

    if (!record) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, payment_record_notfound));
    }

    if (record.paymentInputType != PAY_INPUT_MANUALLY) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, payment_cannot_delete_generated));
    }

    if ([PAY_METHOD_CASH].includes(record.paymentMethod)) {
      await updateAccountData(
        ACC_TYP_CASH,
        record.paymentType === PAYMENT_TYPE_OUT
          ? PAYMENT_TYPE_IN
          : PAYMENT_TYPE_OUT,
        record.paymentAmount
      );
    }

    if (
      [PAY_METHOD_BACK_TRN, PAY_METHOD_CARD, PAY_METHOD_CHEQUE].includes(
        record.paymentMethod
      )
    ) {
      await updateAccountData(
        ACC_TYP_BANK,
        record.paymentType === PAYMENT_TYPE_OUT
          ? PAYMENT_TYPE_IN
          : PAYMENT_TYPE_OUT,
        record.paymentAmount
      );
    }

    record.paymentIsDeleted = true;
    record.paymentDeletedAt = new Date();
    record.paymentDeletedBy = new mongoose.Types.ObjectId(userId);

    await record.save();

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, payment_deleted_successfull));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Create income records
export const createIncomePaymentController = async (req, res) => {
  const { error, value } = incomePaymentSchema.validate(req.body);

  if (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json(ApiResponse.error(error_code, error.message));
  }
  try {
    const newPayment = new paymentModel({
      paymentCollectedBy: new ObjectId(req.user.id),
      paymentType: PAYMENT_TYPE_IN,
      paymentAmount: value.paymentAmount,
      paymentSource: value.paymentSource,
      paymentMethod: value.paymentMethod,
      paymentTransactionId: value.paymentTransactionId,
      paymentNotes: value.paymentNotes,
      paymentInputType: PAY_INPUT_MANUALLY,
      createdAt: value.paymentDate,
    });

    const savedPayment = await newPayment.save();

    if ([PAY_METHOD_CASH].includes(savedPayment.paymentMethod)) {
      await updateAccountData(
        ACC_TYP_CASH,
        PAYMENT_TYPE_IN,
        savedPayment.paymentAmount
      );
    }

    if (
      [PAY_METHOD_BACK_TRN, PAY_METHOD_CARD, PAY_METHOD_CHEQUE].includes(
        savedPayment.paymentMethod
      )
    ) {
      await updateAccountData(
        ACC_TYP_BANK,
        PAYMENT_TYPE_IN,
        savedPayment.paymentAmount
      );
    }

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// TODO Create refund record -- REFACTOR
export const createRefundPaymentController = async (req, res) => {
  const { error, value } = refundSchema.validate(req.body);

  if (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json(ApiResponse.error(error_code, error.message));
  }
  try {
    const workorder = await workOrderModel.findById(new ObjectId(value._id));

    if (!workorder) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, wo_not_found));
    }

    if (workorder.workOrderPaidAmount > 0) {
      const newPayment = new paymentModel({
        paymentworkOrder: new ObjectId(value._id),
        paymentCustomer: new ObjectId(workorder.workOrderCustomer),
        paymentCollectedBy: new ObjectId(req.user.id),
        paymentType: PAYMENT_TYPE_OUT,
        paymentAmount: workorder.workOrderPaidAmount,
        paymentSource: PAY_SC_CUS_REFUNDS,
        paymentMethod: value.paymentMethod,
        paymentTransactionId: value.paymentTransactionId,
        paymentNotes: value.paymentNotes,
        createdAt: value.paymentDate,
      });

      await newPayment.save();
    }

    workorder.workOrderPaymentStatus = PAY_STATUS_REFUNDED;
    workorder.workOrderStatus = WO_STATUS_CLOSED;

    const savedWorkorder = await workorder.save();

    if ([PAY_METHOD_CASH].includes(value.paymentMethod)) {
      await updateAccountData(
        ACC_TYP_CASH,
        PAYMENT_TYPE_OUT,
        workorder.workOrderPaidAmount
      );
    }

    if (
      [PAY_METHOD_BACK_TRN, PAY_METHOD_CARD, PAY_METHOD_CHEQUE].includes(
        value.paymentMethod
      )
    ) {
      await updateAccountData(
        ACC_TYP_BANK,
        PAYMENT_TYPE_OUT,
        workorder.workOrderPaidAmount
      );
    }

    await updateAccountData(
      ACC_TYP_PAYABLES,
      PAYMENT_TYPE_OUT,
      savedWorkorder.workOrderBalanceAmount
    );

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_code));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Create GRN payment record
export const createGrnPaymentRecordController = async (req, res) => {
  const { error, value } = grnPaymentSchema.validate(req.body);

  if (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json(ApiResponse.error(error_code, error.message));
  }
  const { paymentGrnId, ...otherValues } = value;
  try {
    const record = await grnModel.findById(
      new mongoose.Types.ObjectId(paymentGrnId)
    );

    if (!record) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, grn_not_found));
    }

    const supplier = await supplierModel.findById(
      new ObjectId(record.grnSupplier)
    );

    if (!supplier) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, supplier_not_found));
    }

    if (record.grnPaymentStatus === PAY_STATUS_COMPLETED) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(info_code, payment_already_completed));
    }

    const balanceAmount = record.grnDueAmount - value.paymentAmount;

    if (balanceAmount < 0) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(info_code, payment_exceeded_balance));
    }

    const newPayment = new paymentModel({
      paymentGrnRef: new ObjectId(record._id),
      paymentSupplier: new ObjectId(record.grnSupplier),
      paymentCollectedBy: new ObjectId(req.user.id),
      paymentType: PAYMENT_TYPE_OUT,
      paymentSource: PAY_SC_INVENTORY,
      paymentStatus: PAY_STATUS_COMPLETED,
      paymentNotes: isValidString(otherValues.paymentNotes)
        ? otherValues.paymentNotes
        : "Supplier payments - " + record.grnCode,
      ...otherValues,
    });

    const savedPayment = await newPayment.save();

    const totalPaidAmount = record.grnPaidAmount + savedPayment.paymentAmount;

    record.grnPaidAmount = totalPaidAmount;
    record.grnDueAmount = balanceAmount;
    record.grnPaymentStatus =
      balanceAmount <= 0 ? PAY_STATUS_COMPLETED : PAY_STATUS_PARTIALLY_PAID;

    await record.save();

    supplier.supplierDueAmount =
      supplier.supplierDueAmount - savedPayment.paymentAmount;

    await supplier.save();

    if (
      [PAY_METHOD_CASH, PAY_METHOD_MOBILE, PAY_METHOD_OTHER].includes(
        savedPayment.paymentMethod
      )
    ) {
      await updateAccountData(
        ACC_TYP_CASH,
        PAYMENT_TYPE_OUT,
        savedPayment.paymentAmount
      );
    }

    if (
      [PAY_METHOD_BACK_TRN, PAY_METHOD_CARD].includes(
        savedPayment.paymentMethod
      )
    ) {
      await updateAccountData(
        ACC_TYP_BANK,
        PAYMENT_TYPE_OUT,
        savedPayment.paymentAmount
      );
    }

    await updateAccountData(
      ACC_TYP_PAYABLES,
      PAYMENT_TYPE_OUT,
      savedPayment.paymentAmount
    );

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_code));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Create employee advance payments / off cycle payments
export const createEmpAdvancePaymentsController = async (req, res) => {
  const { error, value } = empAdvancePaymentSchema.validate(req.body);

  if (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json(ApiResponse.error(error_code, error.message));
  }
  try {
    const emp = await employeeModel.findById(new ObjectId(value.empId));

    if (!emp) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json(ApiResponse.error(error_code, emp_not_found));
    }

    const newPayment = new paymentModel({
      paymentCollectedBy: new ObjectId(req.user.id),
      paymentEmployee: new ObjectId(emp._id),
      paymentType: PAYMENT_TYPE_OUT,
      paymentAmount: value.paymentAmount,
      paymentSource: PAY_SC_ADVANCE_PAYMENTS,
      paymentMethod: value.paymentMethod,
      paymentTransactionId: value.paymentTransactionId,
      paymentNotes: `Off-Cycle Payment - ${emp.empFullName}`,
      paymentInputType: PAY_INPUT_MANUALLY,
      createdAt: value.paymentDate,
    });

    const savedPayment = await newPayment.save();

    if ([PAY_METHOD_CASH].includes(savedPayment.paymentMethod)) {
      await updateAccountData(
        ACC_TYP_CASH,
        PAYMENT_TYPE_OUT,
        savedPayment.paymentAmount
      );
    }

    if (
      [PAY_METHOD_BACK_TRN, PAY_METHOD_CARD, PAY_METHOD_CHEQUE].includes(
        savedPayment.paymentMethod
      )
    ) {
      await updateAccountData(
        ACC_TYP_BANK,
        PAYMENT_TYPE_OUT,
        savedPayment.paymentAmount
      );
    }

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Get all payments - filter
export const getAllPaymentsController = async (req, res) => {
  const page = parseInt(req.query.page);
  const limit = parseInt(req.query.limit);

  const skip = page * limit;

  const filterPaymentSource = req.query.source;
  const filterPaymentType = req.query.type;
  const filterDate = req.query.date;
  const filterDelete = req.query.isDeleted || false;

  const query = { paymentIsDeleted: filterDelete };

  if (filterDate) {
    // Create dates with proper time handling
    const startDateFilter = new Date(filterDate);
    startDateFilter.setHours(0, 0, 0, 0);

    const endDateFilter = new Date(filterDate);
    endDateFilter.setHours(23, 59, 59, 999);

    query.createdAt = {
      $gte: startDateFilter,
      $lte: endDateFilter,
    };
  }

  if (
    isValidString(filterPaymentSource) &&
    PAY_SC_COMBINED.includes(filterPaymentSource)
  ) {
    query.paymentSource = filterPaymentSource;
  }

  if (
    isValidString(filterPaymentType) &&
    PAYMENT_TYPES.includes(filterPaymentType)
  ) {
    query.paymentType = filterPaymentType;
  }

  try {
    const data = await paymentModel
      .find(query)
      .populate("paymentCollectedBy")
      .populate("paymentDeletedBy")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    const count = await paymentModel.countDocuments(query);

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_code, { data, count }));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Get all pending payments records
export const getAllPendingPaymentRecordsController = async (req, res) => {
  try {
    const data = await paymentModel
      .find({ paymentStatus: PAY_STATUS_PENDING })
      .populate({
        path: "paymentworkOrder",
        select: "workOrderInvoiceNumber workOrderVehicle",
        populate: {
          path: "workOrderVehicle",
          select: "vehicleNumber",
        },
      })
      .populate({
        path: "paymentCustomer",
        select: "customerPrefix customerName",
      });

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_code, data));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Get Customer Invoice Payments Controller
export const invoicePaymentsController = async (req, res) => {
  const id = req.query.id;
  try {
    const invoice = await invoiceModel.findById(new ObjectId(id));

    if (!invoice) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json(ApiResponse.error(error_code, invoice_not_found));
    }

    const payments = await paymentModel
      .find({
        paymentInvoice: new ObjectId(invoice._id),
      })
      .populate({
        path: "paymentCollectedBy",
        select: "userFirstName userLastName",
      });

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message, payments));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Get GRN payment records
export const getGrnPaymentRecordsController = async (req, res) => {
  const id = req.query.id;

  try {
    const grn = await grnModel.findById(new ObjectId(id));

    if (!grn) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, grn_not_found));
    }

    const data = await paymentModel.find({
      paymentGrnRef: new ObjectId(grn._id),
    });

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message, data));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Get Accounts Summary uptodate
export const getAccountSummaryController = async (req, res) => {
  try {
    const data = await accountBalanceModel.find();

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message, data));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Get Income expense data summary
export const getIncomeExpenseSummaryContorller = async (req, res) => {
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 6);

  try {
    const incomeResults = await paymentModel.aggregate([
      {
        $match: {
          paymentType: PAYMENT_TYPE_IN, // From your constants
          paymentIsDeleted: false,
          createdAt: { $gte: sevenDaysAgo, $lte: today },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          totalAmount: { $sum: "$paymentAmount" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const expenseResults = await paymentModel.aggregate([
      {
        $match: {
          paymentType: PAYMENT_TYPE_OUT, // From your constants
          paymentIsDeleted: false,
          createdAt: { $gte: sevenDaysAgo, $lte: today },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          totalAmount: { $sum: "$paymentAmount" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return res.status(httpStatus.OK).json(
      ApiResponse.response(success_code, success_message, {
        incomeData: incomeResults,
        expenseData: expenseResults,
      })
    );
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Get Expenses data summary
export const getExpensesSummaryController = async (req, res) => {
  const { period = "7days" } = req.query;

  const today = new Date();
  const startDate = new Date(today);
  let groupByFormat, bucketSize;

  switch (period) {
    case "month":
      startDate.setMonth(today.getMonth() - 1);
      groupByFormat = "%Y-%U"; // Weekly grouping (Year-WeekNumber)
      bucketSize = "week";
      break;
    case "year":
      startDate.setFullYear(today.getFullYear() - 1);
      groupByFormat = "%Y-%m"; // Monthly grouping
      bucketSize = "month";
      break;
    default: // 7 days
      startDate.setDate(today.getDate() - 6);
      groupByFormat = "%Y-%m-%d"; // Daily grouping
      bucketSize = "day";
  }

  try {
    const results = await paymentModel.aggregate([
      {
        $match: {
          paymentType: PAYMENT_TYPE_OUT,
          paymentIsDeleted: false,
          createdAt: { $gte: startDate, $lte: today },
        },
      },
      {
        $group: {
          _id: "$paymentSource", // Group by expense category
          totalAmount: { $sum: "$paymentAmount" },
          transactionCount: { $sum: 1 },
          // Include average payment per transaction
          averagePayment: { $avg: "$paymentAmount" },
        },
      },
      {
        $project: {
          category: "$_id",
          totalAmount: 1,
          transactionCount: 1,
          averagePayment: { $round: ["$averagePayment", 2] },
          _id: 0, // Exclude the default _id
        },
      },
      { $sort: { totalAmount: -1 } }, // Sort by highest expense first
    ]);

    // Calculate grand total
    const grandTotal = results.reduce((sum, item) => sum + item.totalAmount, 0);

    return res.status(httpStatus.OK).json(
      ApiResponse.response(success_code, success_message, {
        period: {
          start: startDate,
          end: today,
          range: period,
        },
        grandTotal,
        categories: results,
      })
    );
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

export const generateReportSummaryController = async (req, res) => {
  const startDate = req.query.startDate || new Date();
  if (!req.query.startDate) {
    startDate.setDate(startDate.getMonth() - 1);
  }
  const endDate = req.query.endDate || new Date();
  if (!req.query.endDate) {
    endDate.setDate(endDate.getDate() - 1);
  }

  const query = { paymentIsDeleted: false };

  // Create dates with proper time handling
  const startDateFilter = new Date(startDate);
  startDateFilter.setHours(0, 0, 0, 0);

  const endDateFilter = new Date(endDate);
  endDateFilter.setHours(23, 59, 59, 999);

  query.createdAt = {
    $gte: startDateFilter,
    $lte: endDateFilter,
  };

  try {
    const results = await paymentModel.aggregate([
      {
        $match: query,
      },
      {
        $facet: {
          // Total income and expenses
          summary: [
            {
              $group: {
                _id: "$paymentType",
                totalAmount: { $sum: "$paymentAmount" },
                count: { $sum: 1 },
              },
            },
          ],
          // Income by payment method
          incomeMethods: [
            {
              $match: { paymentType: PAYMENT_TYPE_IN },
            },
            {
              $group: {
                _id: "$paymentMethod",
                totalAmount: { $sum: "$paymentAmount" },
                count: { $sum: 1 },
              },
            },
            { $sort: { totalAmount: -1 } },
          ],
          // Expenses by payment method
          expenseMethods: [
            {
              $match: { paymentType: PAYMENT_TYPE_OUT },
            },
            {
              $group: {
                _id: "$paymentMethod",
                totalAmount: { $sum: "$paymentAmount" },
                count: { $sum: 1 },
              },
            },
            { $sort: { totalAmount: -1 } },
          ],
          // Expenses by category (paymentSource)
          expenseCategories: [
            {
              $match: { paymentType: PAYMENT_TYPE_OUT },
            },
            {
              $group: {
                _id: "$paymentSource",
                totalAmount: { $sum: "$paymentAmount" },
                count: { $sum: 1 },
              },
            },
            { $sort: { totalAmount: -1 } },
          ],
          paymentRecords: [
            {
              $sort: { createdAt: -1 }, // Optional: sort by newest first
            },
            {
              $project: {
                paymentType: 1,
                paymentSource: 1,
                paymentMethod: 1,
                paymentAmount: 1,
                createdAt: 1,
                paymentTransactionId: 1,
                paymentNotes: 1,
              },
            },
          ],
        },
      },
      {
        $project: {
          // Transform summary into object
          totals: {
            $arrayToObject: {
              $map: {
                input: "$summary",
                as: "item",
                in: {
                  k: "$$item._id",
                  v: {
                    totalAmount: "$$item.totalAmount",
                    count: "$$item.count",
                  },
                },
              },
            },
          },
          incomeMethods: 1,
          expenseMethods: 1,
          expenseCategories: 1,
          paymentRecords: "$paymentRecords",
        },
      },
    ]);

    // Extract results (aggregation returns array)
    const data =
      results[0].paymentRecords.length > 0
        ? results[0]
        : {
            totals: {
              Income: {
                totalAmount: 0,
                count: 0,
              },
              Expenses: {
                totalAmount: 0,
                count: 0,
              },
            },
            incomeMethods: [],
            expenseMethods: [],
            expenseCategories: [],
            paymentRecords: [],
          };

    // Create a new PDF document
    const doc = new PDFDocument({ bufferPages: true, size: "A4", margin: 50 });

    // Set response headers
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename=wijaya-auto-financial-report.pdf`
    );

    // Stream the PDF buffer to the response
    doc.pipe(res);

    generateAccountsSummaryReport(doc, data, {
      startDate: startDateFilter,
      endDate: endDateFilter,
    });

    doc.end();
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};
