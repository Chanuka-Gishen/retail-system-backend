import express from "express";
import {
  cancelBookingController,
  completeBookingController,
  createBookingController,
  getAllBookingsController,
  getTotalBookingCountController,
  getTotalPendingBookingsController,
  getTotalTodayNewBookingsCountController,
  resendVerificationPinController,
  sendVerificationPinController,
  updateBookingController,
  verifyBookingPinController,
} from "../controllers/bookingController.js";

const bookingRoutes = express.Router();

bookingRoutes.get("/auth/bookings", getAllBookingsController);
bookingRoutes.post("/noAuth/create-booking", createBookingController);
bookingRoutes.put("/auth/update-booking", updateBookingController);
bookingRoutes.put("/auth/cancel-booking", cancelBookingController);
bookingRoutes.put("/auth/complete-booking", completeBookingController);
bookingRoutes.post("/noAuth/send-pin", sendVerificationPinController);
bookingRoutes.post("/noAuth/resend-pin", resendVerificationPinController);
bookingRoutes.post("/noAuth/verify-pin", verifyBookingPinController);

// Stats

bookingRoutes.get("/auth/total-count", getTotalBookingCountController);
bookingRoutes.get("/auth/today-count", getTotalTodayNewBookingsCountController);
bookingRoutes.get("/auth/pending-count", getTotalPendingBookingsController);

export default bookingRoutes;
