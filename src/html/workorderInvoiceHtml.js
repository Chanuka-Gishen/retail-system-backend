import { formatCurrency } from "../services/commonServices.js";

export const workorderInvoiceHtml = (data) => {
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; background-color: #f8f8f9; padding: 20px;">
      <!-- Main container with white background -->
      <div style="max-width: 800px; margin: 0 auto; background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
        
        <!-- Header with company info -->
        <div style="padding: 30px; text-align: center; background-color: #f5f7fa;">
          <div>
            <img src="cid:logoImage" alt="Company Logo" style="max-width: 200px;" />
          </div>
          <h1 style="color: #333; margin: 20px 0 10px 0; font-weight: bold;">INVOICE</h1>
          <p style="color: #666; margin: 0; font-size: 15px;">
            ${
              data.workOrderInvoiceNumber
                ? `#${data.workOrderInvoiceNumber}`
                : "Work Order"
            }
          </p>
        </div>

        <!-- Customer and vehicle info -->
        <div style="padding: 25px 30px; display: flex; justify-content: space-between; flex-wrap: wrap;">
          <div>
            <h3 style="color: #333; margin: 0 0 10px 0;">${
              data.workOrderCustomer.customerName
            }</h3>
            <p style="color: #666; margin: 0 0 5px 0;">
              <strong>Vehicle:</strong> ${
                data.workOrderVehicle.vehicleNumber
              } - 
              ${data.workOrderVehicle.vehicleManufacturer} - 
              ${data.workOrderVehicle.vehicleModel}
            </p>
            <p style="color: #666; margin: 0;">
              <strong>Mileage:</strong> ${data.workOrderMileage} KM
            </p>
          </div>
          <div style="text-align: right;">
            <p style="color: #666; margin: 0 0 5px 0;">
              <strong>Created:</strong> ${new Date(
                data.createdAt
              ).toLocaleDateString()}
            </p>
            <p style="color: #666; margin: 0 0 5px 0;">
              <strong>Updated:</strong> ${new Date(
                data.updatedAt
              ).toLocaleDateString()}
            </p>
            <p style="color: #666; margin: 0;">
              <strong>Status:</strong> ${data.workOrderStatus}
            </p>
          </div>
        </div>

        <!-- Assignees section -->
        ${
          data.workOrderAssignees?.length > 0
            ? `
          <div style="padding: 15px 30px; background-color: #f5f7fa;">
            <h4 style="color: #333; margin: 0 0 10px 0;">Workorder Assignees</h4>
            <p style="color: #666; margin: 0;">
              ${data.workOrderAssignees
                .map((emp) => emp.empFullName)
                .join(", ")}
            </p>
          </div>
        `
            : ""
        }

        <!-- Items table -->
        <div style="overflow-x: auto; padding: 0 30px;">
          <table style="border-collapse: collapse; width: 100%; margin: 20px 0;">
            <thead>
              <tr style="background-color: #f5f7fa;">
                <th style="padding: 12px 15px; text-align: left; color: #666; font-weight: bold;">Item</th>
                <th style="padding: 12px 15px; text-align: left; color: #666; font-weight: bold;">Quantity</th>
                <th style="padding: 12px 15px; text-align: right; color: #666; font-weight: bold;">Unit Price</th>
                <th style="padding: 12px 15px; text-align: right; color: #666; font-weight: bold;">Discount</th>
                <th style="padding: 12px 15px; text-align: right; color: #666; font-weight: bold;">Total</th>
              </tr>
            </thead>
            <tbody>
              <!-- Service Items -->
              ${data.workOrderServiceItems
                .map(
                  (item) => `
                <tr>
                  <td style="padding: 12px 15px; border-bottom: 1px solid #eee; color: #333;">${
                    item.inventoryItemName
                  }</td>
                  <td style="padding: 12px 15px; border-bottom: 1px solid #eee; color: #666;">${
                    item.quantity
                  }${item.exQuantity > 0 ? ` + ${item.exQuantity}` : ""}</td>
                  <td style="padding: 12px 15px; border-bottom: 1px solid #eee; text-align: right; color: #666;">${formatCurrency(
                    item.unitPrice
                  )}</td>
                  <td style="padding: 12px 15px; border-bottom: 1px solid #eee; text-align: right; color: #666;">${formatCurrency(
                    item.cashDiscount
                  )}</td>
                  <td style="padding: 12px 15px; border-bottom: 1px solid #eee; text-align: right; color: #333; font-weight: bold;">${formatCurrency(
                    item.totalPrice
                  )}</td>
                </tr>
              `
                )
                .join("")}

              <!-- Custom Items -->
              ${data.workOrderCustomItems
                .map(
                  (item) => `
                <tr>
                  <td style="padding: 12px 15px; border-bottom: 1px solid #eee; color: #333;">${
                    item.inventoryItemName
                  }</td>
                  <td style="padding: 12px 15px; border-bottom: 1px solid #eee; color: #666;">${
                    item.quantity
                  }</td>
                  <td style="padding: 12px 15px; border-bottom: 1px solid #eee; text-align: right; color: #666;">${formatCurrency(
                    item.unitPrice
                  )}</td>
                  <td style="padding: 12px 15px; border-bottom: 1px solid #eee; text-align: right; color: #666;">${formatCurrency(
                    item.cashDiscount
                  )}</td>
                  <td style="padding: 12px 15px; border-bottom: 1px solid #eee; text-align: right; color: #333; font-weight: bold;">${formatCurrency(
                    item.totalPrice
                  )}</td>
                </tr>
              `
                )
                .join("")}

              <!-- Custom Charges -->
              ${data.workOrderCustomChargers
                .map(
                  (charge) => `
                <tr>
                  <td colspan="4" style="padding: 12px 15px; border-bottom: 1px solid #eee; text-align: right; color: #666;">${
                    charge.chargeName
                  }</td>
                  <td style="padding: 12px 15px; border-bottom: 1px solid #eee; text-align: right; color: #333; font-weight: bold;">${formatCurrency(
                    charge.chargeAmount
                  )}</td>
                </tr>
              `
                )
                .join("")}

              <!-- Additional Charges -->
              ${
                data.workOrderServiceCharge > 0
                  ? `
                <tr>
                  <td colspan="4" style="padding: 12px 15px; border-bottom: 1px solid #eee; text-align: right; color: #666;">Service Charge</td>
                  <td style="padding: 12px 15px; border-bottom: 1px solid #eee; text-align: right; color: #333; font-weight: bold;">${formatCurrency(
                    data.workOrderServiceCharge
                  )}</td>
                </tr>
              `
                  : ""
              }

              ${
                data.workOrderOtherChargers > 0
                  ? `
                <tr>
                  <td colspan="4" style="padding: 12px 15px; border-bottom: 1px solid #eee; text-align: right; color: #666;">Other Charges</td>
                  <td style="padding: 12px 15px; border-bottom: 1px solid #eee; text-align: right; color: #333; font-weight: bold;">${formatCurrency(
                    data.workOrderOtherChargers
                  )}</td>
                </tr>
              `
                  : ""
              }

              <!-- Discounts -->
              ${
                data.workOrderDiscountPercentage > 0
                  ? `
                <tr>
                  <td colspan="4" style="padding: 12px 15px; border-bottom: 1px solid #eee; text-align: right; color: #666;">Discount Percentage</td>
                  <td style="padding: 12px 15px; border-bottom: 1px solid #eee; text-align: right; color: #333; font-weight: bold;">${data.workOrderDiscountPercentage}%</td>
                </tr>
              `
                  : ""
              }

              ${
                data.workOrderDiscountCash > 0
                  ? `
                <tr>
                  <td colspan="4" style="padding: 12px 15px; border-bottom: 1px solid #eee; text-align: right; color: #666;">Cash Discount</td>
                  <td style="padding: 12px 15px; border-bottom: 1px solid #eee; text-align: right; color: #333; font-weight: bold;">${formatCurrency(
                    data.workOrderDiscountCash
                  )}</td>
                </tr>
              `
                  : ""
              }
            </tbody>
          </table>
        </div>

        <!-- Totals section -->
        <div style="padding: 0 30px 20px; text-align: right;">
          <table style="border-collapse: collapse; width: 100%; max-width: 300px; margin-left: auto;">
            <tr>
              <td style="padding: 8px 0; color: #666; text-align: right;">Total Amount:</td>
              <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #333;">${formatCurrency(
                data.workOrderTotalAmount
              )}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; text-align: right;">Paid Amount:</td>
              <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #333;">${formatCurrency(
                data.workOrderPaidAmount
              )}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; text-align: right;">Balance Amount:</td>
              <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #333;">${formatCurrency(
                data.workOrderBalanceAmount
              )}</td>
            </tr>
          </table>
        </div>

        <!-- Notes section -->
        ${
          data.workOrderNotes
            ? `
          <div style="padding: 20px 30px; background-color: #f5f7fa;">
            <h4 style="color: #333; margin: 0 0 10px 0;">Notes</h4>
            <p style="color: #666; margin: 0;">${data.workOrderNotes}</p>
          </div>
        `
            : ""
        }

        <!-- Footer -->
        <div style="padding: 25px 30px; text-align: center; background-color: #f5f7fa;">
          <p style="color: #666; margin: 0;">Thank you for your business!</p>
          <p style="color: #666; margin: 10px 0 0 0;">Please contact us if you have any questions about this invoice.</p>
        </div>
      </div>
    </div>
  `;
};
