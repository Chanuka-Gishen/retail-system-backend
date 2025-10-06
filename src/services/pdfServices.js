import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { fDate, formatCurrency } from "./commonServices.js";

export const generateInvoice = async (doc, data, itemList) => {
  let yPosition = 30;
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const logoPath = join(__dirname, "../assets/main-logo.png");

  const maxNameWidth = 120;

  const incrementYAndCheck = (incrementBy) => {
    yPosition += incrementBy ? incrementBy : 20;
    if (yPosition >= 550) {
      doc.addPage();
      yPosition = 40; // Reset y for the new page
    }
    return yPosition;
  };

  doc.image(logoPath, 30, 20, {
    width: 100,
    height: 100,
  });

  doc.fontSize(20).text("WIJAYA Auto Electrical", 170, yPosition);
  doc
    .fontSize(10)
    .text(
      "143/4, Bandaragama Rd, Makandana, Sri Lanka",
      170,
      incrementYAndCheck(25)
    );
  doc
    .fontSize(10)
    .text("Phone: 077 9396 397 | 011 2703 031", 170, incrementYAndCheck());
  doc
    .fontSize(10)
    .text("Email: wijayaautoelectricals@gmail.com", 170, incrementYAndCheck());

  doc.moveTo(40, incrementYAndCheck()).lineTo(385, yPosition).stroke();

  // Invoice Info Section
  incrementYAndCheck(15);
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .text(`Payment Status# ${data.workOrderPaymentStatus}`, 40, yPosition);
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .text(`Invoice# ${data.workOrderInvoiceNumber}`, 300, yPosition);
  incrementYAndCheck(15);

  // Customer Details Section
  doc.fontSize(10).text("Bill To :", 40, yPosition);
  doc.fontSize(10).text(data.workOrderCustomer.customerName, 130, yPosition);
  doc
    .font("Helvetica")
    .fontSize(10)
    .text(`Date: ${fDate(data.createdAt)}`, 300, yPosition);
  incrementYAndCheck(15);
  doc.fontSize(10).text("Mobile :", 40, yPosition);
  doc.fontSize(10).text(data.workOrderCustomer.customerMobile, 130, yPosition);
  incrementYAndCheck(15);
  doc.fontSize(10).text("Vehicle Number :", 40, yPosition);
  doc.fontSize(10).text(data.workOrderVehicle.vehicleNumber, 130, yPosition);

  doc.moveTo(40, incrementYAndCheck()).lineTo(385, yPosition).stroke();

  if (
    data.workOrderServiceItems.length > 0 ||
    data.workOrderCustomItems.length > 0
  ) {
    // Items Table Header
    incrementYAndCheck();
    doc.fontSize(10).text("Items", 40, yPosition);
    doc.fontSize(10).text("Qty", 200, yPosition);
    doc.fontSize(10).text("Unit Price", 250, yPosition);
    doc.fontSize(10).text("Total", 365, yPosition);

    incrementYAndCheck();

    if (itemList.length > 0) {
      itemList.forEach((item) => {
        const textHeight = doc
          .fontSize(10)
          .heightOfString(item.inventoryItemName, {
            width: maxNameWidth,
            lineGap: 5,
          });

        doc.fontSize(10).text(item.inventoryItemName, 40, yPosition, {
          width: maxNameWidth,
          lineGap: 5,
        });

        //const increamentBy = item.inventoryItemName.length > 30 ? 35 : 20;

        doc
          .fontSize(10)
          .text(
            (item.quantity + (item.exQuantity || 0)).toString(),
            170,
            yPosition,
            {
              width: 40,
              align: "right",
            }
          );
        doc.fontSize(10).text(formatCurrency(item.unitPrice), 195, yPosition, {
          width: 100,
          align: "right",
        });
        doc.fontSize(10).text(formatCurrency(item.totalPrice), 288, yPosition, {
          width: 100,
          align: "right",
        });
        incrementYAndCheck(textHeight);
      });
    }
  }

  // Custom chargers
  if ((data.workOrderCustomChargers || []).length > 0) {
    if (itemList.length === 0) {
      incrementYAndCheck();
    }
    (data.workOrderCustomChargers || []).forEach((item) => {
      const textHeight = doc.fontSize(10).heightOfString(item.chargeName, {
        width: maxNameWidth,
        lineGap: 5,
      });
      doc.fontSize(10).text(item.chargeName, 40, yPosition);
      doc.fontSize(10).text(formatCurrency(item.chargeAmount), 288, yPosition, {
        width: 100,
        align: "right",
      });
      incrementYAndCheck(textHeight);
    });
  }

  // Summary Section
  if (data.workOrderServiceCharge > 0) {
    if ((data.workOrderCustomChargers || []).length === 0) {
      incrementYAndCheck();
    }

    doc.fontSize(10).text("Service Charges:", 40, yPosition);
    doc
      .fontSize(10)
      .text(formatCurrency(data.workOrderServiceCharge), 288, yPosition, {
        width: 100,
        align: "right",
      });
  }

  if (data.workOrderOtherChargers > 0) {
    incrementYAndCheck();
    doc.fontSize(10).text("Other Charges:", 40, yPosition);
    doc
      .fontSize(10)
      .text(formatCurrency(data.workOrderOtherChargers), 288, yPosition, {
        width: 100,
        align: "right",
      });
  }

  incrementYAndCheck();

  doc
    .fontSize(10)
    .font("Helvetica-Bold")
    .text("Gross Amount:", 130, yPosition, {
      width: 80,
      align: "right",
    });
  doc
    .fontSize(10)
    .font("Helvetica-Bold")
    .text(formatCurrency(data.workOrderGrossAmount), 288, yPosition, {
      width: 100,
      align: "right",
    });

  if (data.workOrderDiscountPercentage != 0) {
    doc
      .fontSize(10)
      .font("Helvetica")
      .text("Discount Percentage:", 130, yPosition, {
        width: 80,
        align: "right",
      });
    doc
      .fontSize(10)
      .text(
        data.workOrderDiscountPercentage.toLocaleString() + " %",
        288,
        yPosition,
        { width: 100, align: "right" }
      );
  }

  if (data.workOrderDiscountCash != 0) {
    incrementYAndCheck();
    doc.fontSize(10).font("Helvetica").text("Discount Cash:", 130, yPosition, {
      width: 80,
      align: "right",
    });
    doc
      .fontSize(10)
      .text(formatCurrency(data.workOrderDiscountCash), 288, yPosition, {
        width: 100,
        align: "right",
      });
  }

  incrementYAndCheck();

  doc.fontSize(10).font("Helvetica-Bold").text("Net Amount:", 120, yPosition, {
    width: 90,
    align: "right",
  });
  doc
    .fontSize(10)
    .font("Helvetica-Bold")
    .text(formatCurrency(data.workOrderTotalAmount), 288, yPosition, {
      width: 100,
      align: "right",
    });

  incrementYAndCheck();
  doc.font("Helvetica").text("Received Amount:", 110, yPosition, {
    width: 100,
    align: "right",
  });
  doc.text(formatCurrency(data.workOrderPaidAmount), 288, yPosition, {
    width: 100,
    align: "right",
  });

  incrementYAndCheck();
  doc.font("Helvetica-Bold").text("Balance Amount:", 110, yPosition, {
    width: 100,
    align: "right",
  });
  doc
    .font("Helvetica-Bold")
    .text(formatCurrency(data.workOrderBalanceAmount), 288, yPosition, {
      width: 100,
      align: "right",
    });

  // Footer
  incrementYAndCheck(40);
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor("black")
    .text("Thank you for Choosing Us!", 40, yPosition, { align: "center" });

  return doc;
};

export const generateAccountsSummaryReport = async (doc, data, period) => {
  let yPosition = 30;
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const logoPath = join(__dirname, "../assets/main-logo.png");

  const incrementYAndCheck = (incrementBy) => {
    yPosition += incrementBy ? incrementBy : 20;
    if (yPosition >= 750) {
      doc.addPage();
      yPosition = 40; // Reset y for the new page
    }
    return yPosition;
  };

  doc.image(logoPath, 30, 20, {
    width: 100,
    height: 100,
  });

  doc.fontSize(20).text("WIJAYA Auto Electrical", 300, yPosition);
  doc
    .fontSize(11)
    .text(
      "143/4, Bandaragama Rd, Makandana, Sri Lanka",
      300,
      incrementYAndCheck(25)
    );
  doc
    .fontSize(11)
    .text("Phone: 077 9396 397 | 011 2703 031", 300, incrementYAndCheck());
  doc
    .fontSize(11)
    .text("Email: wijayaautoelectricals@gmail.com", 300, incrementYAndCheck());

  doc.moveTo(40, incrementYAndCheck()).lineTo(560, yPosition).stroke();

  // Summary
  incrementYAndCheck(15);
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .text(`From Date : ${fDate(period.startDate)}`, 40, yPosition);
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .text(`To Date : ${fDate(period.endDate)}`, 300, yPosition);
  if (data.totals.Income) {
    doc
      .font("Helvetica")
      .fontSize(11)
      .text(
        `Total Income : ${formatCurrency(data.totals.Income.totalAmount)}`,
        40,
        incrementYAndCheck(15)
      );
  }

  if (data.totals.Expenses) {
    doc
      .font("Helvetica")
      .fontSize(11)
      .text(
        `Total Expenses : ${formatCurrency(data.totals.Expenses.totalAmount)}`,
        40,
        incrementYAndCheck(15)
      );
  }

  doc.moveTo(40, incrementYAndCheck()).lineTo(550, yPosition).stroke();

  if (data.incomeMethods.length > 0) {
    incrementYAndCheck(15);
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .text("Income Accounts Breakdown", 40, yPosition);

    incrementYAndCheck(20);

    // Headers
    doc.fontSize(11).text("Payment Method", 40, yPosition);
    doc.fontSize(11).text("Payment Amount", 250, yPosition);
    doc.fontSize(11).text("Records Count", 450, yPosition, { align: "right" });

    incrementYAndCheck();
    data.incomeMethods.forEach((item) => {
      doc.fontSize(11).font("Helvetica").text(item._id, 40, yPosition);
      doc
        .fontSize(11)
        .font("Helvetica")
        .text(formatCurrency(item.totalAmount), 250, yPosition);
      doc
        .fontSize(11)
        .font("Helvetica")
        .text(item.count.toString(), 450, yPosition, {
          align: "right",
        });
      incrementYAndCheck();
    });

    doc.moveTo(40, incrementYAndCheck()).lineTo(550, yPosition).stroke();
  }

  if (data.expenseMethods.length > 0) {
    incrementYAndCheck(15);
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .text("Expenses Accounts Breakdown", 40, yPosition);

    incrementYAndCheck(20);

    // Headers
    doc.fontSize(11).text("Payment Method", 40, yPosition);
    doc.fontSize(11).text("Payment Amount", 250, yPosition);
    doc.fontSize(11).text("Records Count", 450, yPosition, { align: "right" });

    incrementYAndCheck();
    data.expenseMethods.forEach((item) => {
      doc.fontSize(11).font("Helvetica").text(item._id, 40, yPosition);
      doc
        .fontSize(11)
        .font("Helvetica")
        .text(formatCurrency(item.totalAmount), 250, yPosition);
      doc
        .fontSize(11)
        .font("Helvetica")
        .text(item.count.toString(), 450, yPosition, {
          align: "right",
        });
      incrementYAndCheck();
    });

    doc.moveTo(40, incrementYAndCheck()).lineTo(550, yPosition).stroke();
  }

  if (data.expenseCategories.length > 0) {
    incrementYAndCheck(15);
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .text("Expenses Breakdown", 40, yPosition);

    incrementYAndCheck(20);

    // Headers
    doc.fontSize(11).text("Payment Method", 40, yPosition);
    doc.fontSize(11).text("Payment Amount", 250, yPosition);
    doc.fontSize(11).text("Records Count", 450, yPosition, { align: "right" });

    incrementYAndCheck();
    data.expenseCategories.forEach((item) => {
      doc.fontSize(11).font("Helvetica").text(item._id, 40, yPosition);
      doc
        .fontSize(11)
        .font("Helvetica")
        .text(formatCurrency(item.totalAmount), 250, yPosition);
      doc
        .fontSize(11)
        .font("Helvetica")
        .text(item.count.toString(), 450, yPosition, {
          align: "right",
        });
      incrementYAndCheck();
    });

    doc.moveTo(40, incrementYAndCheck()).lineTo(550, yPosition).stroke();
  }

  if (data.paymentRecords.length > 0) {
    incrementYAndCheck(15);
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .text("Payment Records", 40, yPosition);

    incrementYAndCheck(20);

    // Headers
    doc.fontSize(11).text("Type", 40, yPosition);
    doc.fontSize(11).text("Payment Source", 120, yPosition);
    doc.fontSize(11).text("Method", 270, yPosition);
    doc.fontSize(11).text("Amount", 370, yPosition);
    doc.fontSize(11).text("Date", 450, yPosition, { align: "right" });

    incrementYAndCheck();
    data.paymentRecords.forEach((item) => {
      doc.fontSize(11).font("Helvetica").text(item.paymentType, 40, yPosition);
      doc
        .fontSize(11)
        .font("Helvetica")
        .text(item.paymentSource, 120, yPosition);
      doc
        .fontSize(11)
        .font("Helvetica")
        .text(item.paymentMethod, 270, yPosition);
      doc
        .fontSize(11)
        .font("Helvetica")
        .text(formatCurrency(item.paymentAmount), 370, yPosition);
      doc
        .fontSize(11)
        .font("Helvetica")
        .text(fDate(item.createdAt), 450, yPosition, {
          align: "right",
        });
      incrementYAndCheck();
    });
  }

  return doc;
};
