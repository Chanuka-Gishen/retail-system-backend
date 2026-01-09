import { format } from "date-fns";

import {
  getSequenceValue,
  updateSequenceValue,
} from "../controllers/sequenceController.js";
import { SEQ_INVOICE, SEQ_RETURN } from "../constants/sequenceConstants.js";

export const isValidString = (str) => {
  return (
    typeof str === "string" &&
    str.trim() !== "" &&
    str.trim() != null &&
    str.trim() != undefined
  );
};

export const formatCurrency = (amount) => {
  const formattedAmount = amount
    .toLocaleString("en-IN", {
      style: "currency",
      currency: "LKR",
      minimumFractionDigits: 2,
    })
    .replace("LKR", "Rs.");
  return formattedAmount;
};

export const fDate = (date, newFormat) => {
  const fm = newFormat || "dd MMM yyyy";

  return date ? format(new Date(date), fm) : "-";
};

export const fTime = (date) => {
  return date.toISOString().split("T")[1].substring(0, 5);
};

export const getDaysDifference = (startDate, endDate) => {
  // Convert both dates to milliseconds
  const startTime = startDate.getTime();
  const endTime = endDate.getTime();

  // Calculate difference in milliseconds
  const timeDiff = endTime - startTime;

  // Convert milliseconds to days
  const daysDiff = timeDiff / (1000 * 60 * 60 * 24);

  return Math.max(Math.ceil(daysDiff), 1); // Round down to whole days
};

export const generateInvoiceNumber = async () => {
  await updateSequenceValue(SEQ_INVOICE);
  const sequenceValue = await getSequenceValue(SEQ_INVOICE);

  // Set the desired length of the sequence number (e.g., 5 digits for "INV00001")
  const sequenceLength = 5;

  // Convert the sequenceValue to a string and pad with leading zeros
  const stringValue = sequenceValue.toString();
  const formattedSequence = stringValue.padStart(sequenceLength, "0");

  const invoiceNumber = `INV${formattedSequence}`;

  return invoiceNumber;
};

export const generateReturnCode = async() => {
  await updateSequenceValue(SEQ_RETURN);
  const sequenceValue = await getSequenceValue(SEQ_RETURN);

  const sequenceLength = 5;

  const stringValue = sequenceValue.toString();
  const formattedSequence = stringValue.padStart(sequenceLength, "0");

  const returnCode = `RTN${formattedSequence}`;

  return returnCode;
}

export const generateGrnNumber = (value) => {
  const date = new Date();

  return `GRN-${date.getDate()}${
    date.getMonth() + 1
  }${date.getFullYear()}-${value}`;
};

export const formatText = (input) => {
  return input.replace(/\s/g, "").toUpperCase();
};

export const formatDateToStart = (date, isStart = true) => {
  const newDate = new Date(date);
  if (isStart) {
    newDate.setHours(0, 0, 0, 0);
  } else {
    newDate.setHours(23, 59, 59, 999);
  }

  return newDate;
};

export const formatMobileNumber = (input) => {
  if (!input) return "";

  // Remove all non-digit characters
  const digitsOnly = input.replace(/\D/g, "");

  // Ensure it starts with 0 and has exactly 10 digits
  if (digitsOnly.length === 10) {
    return digitsOnly.startsWith("0") ? digitsOnly : `0${digitsOnly}`;
  }

  // Handle numbers with country code (remove country code and add 0)
  if (digitsOnly.length > 10) {
    const withoutCountryCode = digitsOnly.slice(-10);
    return `0${withoutCountryCode}`;
  }

  // Return partially formatted number (for typing)
  return digitsOnly.startsWith("0") ? digitsOnly : `0${digitsOnly}`;
};

export const generatePinNumber = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};
