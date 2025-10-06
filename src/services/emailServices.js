import nodemailer from "nodemailer";

import { workorderInvoiceHtml } from "../html/workorderInvoiceHtml.js";

export const sendWorkorderInvoiceEmail = async (to, data) => {
  try {
    // Create a transporter object using SMTP configuration
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_SERVER,
      port: process.env.SMTP_PORT,
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USR_NAME,
        pass: process.env.SMTP_PWD,
      },
    });

    // Define the email options
    const mailOptions = {
      from: '"WijayaAuto" <no-reply@wijayaauto.com>', // Sender's email address and name
      to, // Recipient's email address
      subject: "Invoice", // Subject line
      html: workorderInvoiceHtml(data),
      attachments: [
        {
          filename: "main-logo.png",
          path: process.env.RELATIVE_PATH + "/assets/main-logo.png",
          cid: "logoImage",
        },
      ],
    };

    // Send the email
    const info = await transporter.sendMail(mailOptions);

    return info;
  } catch (error) {
    throw error;
  }
};
