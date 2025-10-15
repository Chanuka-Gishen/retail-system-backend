import httpStatus from "http-status";
import { ObjectId } from "mongodb";
import ApiResponse from "../services/ApiResponse.js";
import {
  error_code,
  info_code,
  success_code,
} from "../constants/statusCodes.js";
import { addBookingSchema } from "../schemas/booking/addBookingSchema.js";
import customerVehicleModel from "../models/customerVehicleModel.js";
import {
  formatDateToStart,
  formatText,
  generatePinNumber,
  isValidString,
} from "../services/commonServices.js";
import customerModel from "../models/customerModel.js";
import bookingsModel from "../models/bookingsModel.js";
import {
  booking_active_pin_not_found,
  booking_already_made,
  booking_already_processed,
  booking_limit_exceeded,
  booking_not_found,
  booking_pin_not_matching,
  booking_pin_try_attempts_exceeded,
  booking_pin_verified,
  booking_successfull,
  success_message,
  wo_exists,
} from "../constants/messageConstants.js";
import {
  STATUS_CANCELED,
  STATUS_COMPLETED,
  STATUS_CREATED,
  STATUS_EXPIRED,
  STATUS_FAILED,
  STATUS_PENDING,
  STATUS_VERIFIED,
} from "../constants/constants.js";
import { updateBookingSchema } from "../schemas/booking/updateBookingSchema.js";
import workOrderModel from "../models/workorderModel.js";
import { WO_STATUS_CLOSED } from "../constants/workorderStatus.js";
import { WO_TYPE_REPAIR } from "../constants/workorderTypes.js";
import bookingVerificationModel from "../models/bookingVerificationModel.js";
import { SendVerificationPinSchema } from "../schemas/booking/sendVerificationPinSchema.js";
import { VerifyBookingPinSchema } from "../schemas/booking/verifyBookingPinSchema.js";

// Create booking for service/repair
export const createBookingController = async (req, res) => {
  const { error, value } = addBookingSchema.validate(req.body);

  if (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json(ApiResponse.error(error_code, error.message));
  }

  const {
    customerPrefix,
    customerName,
    customerType,
    customerMobile,
    customerEmail,
    vehicleNumber,
    vehicleManufacturer,
    vehicleModel,
    vehicleType,
    date,
    timeSlot,
    issue,
  } = value;

  try {
    const formattedVehicleNumber = formatText(vehicleNumber);

    const vehicle = await customerVehicleModel.findOne({
      vehicleNumber: formattedVehicleNumber,
    });

    const customer = await customerModel.findOne({ customerMobile });

    if (customer && vehicle) {
      const existingBookings = await bookingsModel.findOne({
        customer: new ObjectId(customer._id),
        vehicle: new ObjectId(vehicle._id),
        bookingStatus: STATUS_CREATED,
      });

      if (existingBookings) {
        return res
          .status(httpStatus.PRECONDITION_FAILED)
          .json(ApiResponse.error(info_code, booking_already_made));
      }
    }

    if (!customer) {
      customer = await customerModel.create({
        customerPrefix,
        customerName,
        customerType,
        customerMobile,
        customerEmail,
      });
    }

    if (!vehicle) {
      vehicle = await customerVehicleModel.create({
        vehicleOwner: new ObjectId(customer._id),
        vehicleNumber: formattedVehicleNumber,
        vehicleManufacturer,
        vehicleModel,
        vehicleType,
      });
    }

    const formattedDate = formatDateToStart(date);

    const bookingsCount = await bookingsModel.countDocuments({
      date: formattedDate,
      timeSlot,
    });

    if (bookingsCount > 2) {
      return res
        .status(httpStatus.PRECONDITION_FAILED)
        .json(ApiResponse.error(info_code, booking_limit_exceeded));
    }

    await bookingsModel.create({
      customer: new ObjectId(customer._id),
      vehicle: new ObjectId(vehicle._id),
      timeSlot,
      date: formattedDate,
      issue,
    });

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, booking_successfull));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Update customer booking
export const updateBookingController = async (req, res) => {
  const { error, value } = updateBookingSchema.validate(req.body);

  if (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json(ApiResponse.error(error_code, error.message));
  }

  const { id, date, timeSlot, issue } = value;
  try {
    const booking = await bookingsModel.findById(new ObjectId(id));

    if (!booking) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, booking_not_found));
    }

    booking.date = formatDateToStart(date);
    booking.timeSlot = timeSlot;
    booking.issue = issue;

    await booking.save();

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Complete booking
export const completeBookingController = async (req, res) => {
  const id = req.query.id;
  try {
    const booking = await bookingsModel
      .findById(new ObjectId(id))
      .populate("vehicle");

    if (!booking) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, booking_not_found));
    }

    if (booking.bookingStatus != STATUS_CREATED) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, booking_already_processed));
    }

    const isOpenOrderExists = await workOrderModel.findOne({
      workOrderVehicle: new ObjectId(booking.vehicle),
      workOrderStatus: { $ne: WO_STATUS_CLOSED },
    });

    if (isOpenOrderExists) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(
          ApiResponse.error(
            info_code,
            wo_exists + booking.vehicle.vehicleNumber
          )
        );
    }

    const newWorkorder = new workOrderModel({
      workOrderCustomer: booking.customer,
      workOrderVehicle: booking.vehicle._id,
      workOrderMileage: 0,
      workOrderType: WO_TYPE_REPAIR,
    });

    await newWorkorder.save();

    booking.bookingStatus = STATUS_COMPLETED;
    booking.bookingProcessedAt = new Date();

    await booking.save();

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Cancel booking
export const cancelBookingController = async (req, res) => {
  const id = req.query.id;
  try {
    const booking = await bookingsModel
      .findById(new ObjectId(id))
      .populate("vehicle");

    if (!booking) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, booking_not_found));
    }

    if (booking.bookingStatus != STATUS_CREATED) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, booking_already_processed));
    }

    booking.bookingStatus = STATUS_CANCELED;
    booking.bookingProcessedAt = new Date();

    await booking.save();

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Get all bookings
export const getAllBookingsController = async (req, res) => {
  const page = parseInt(req.query.page);
  const limit = parseInt(req.query.limit);

  const skip = page * limit;

  const customerName = req.query.name;
  const customerMobile = req.query.mobile;
  const filteredVehicleNumber = req.query.vehicleNumber;
  const bookingStatus = req.query.status;

  const query = {};
  if (bookingStatus === STATUS_CREATED) {
    query.bookingStatus = STATUS_CREATED;
  } else {
    query.bookingStatus = { $in: [STATUS_COMPLETED, STATUS_CANCELED] };
  }
  try {
    const data = await bookingsModel.aggregate([
      {
        $match: query,
      },
      {
        $lookup: {
          from: "customers",
          as: "customer",
          let: { customerId: "$customer" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$_id", "$$customerId"] },
                ...(isValidString(customerName) && {
                  customerName: {
                    $regex: `^${customerName}`,
                    $options: "i",
                  },
                }),
                ...(isValidString(customerMobile) && {
                  customerMobile: {
                    $regex: `${customerMobile}`,
                    $options: "i",
                  },
                }),
              },
            },
          ],
        },
      },
      {
        $unwind: {
          path: "$customer",
        },
      },
      {
        $lookup: {
          from: "vehicles",
          as: "vehicle",
          let: { vehicleId: "$vehicle" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$_id", "$$vehicleId"] },
                ...(isValidString(filteredVehicleNumber) && {
                  vehicleNumber: {
                    $regex: `${filteredVehicleNumber}`,
                    $options: "i",
                  },
                }),
              },
            },
          ],
        },
      },
      {
        $unwind: {
          path: "$vehicle",
        },
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $skip: skip,
      },
      {
        $limit: limit,
      },
    ]);

    const documentCount = await bookingsModel.aggregate([
      {
        $match: query,
      },
      {
        $lookup: {
          from: "customers",
          as: "customer",
          let: { customerId: "$customer" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$_id", "$$customerId"] },
                ...(isValidString(customerName) && {
                  customerName: {
                    $regex: `^${customerName}`,
                    $options: "i",
                  },
                }),
                ...(isValidString(customerMobile) && {
                  customerMobile: {
                    $regex: `${customerMobile}`,
                    $options: "i",
                  },
                }),
              },
            },
          ],
        },
      },
      {
        $unwind: {
          path: "$customer",
        },
      },
      {
        $lookup: {
          from: "vehicles",
          as: "vehicle",
          let: { vehicleId: "$vehicle" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$_id", "$$vehicleId"] },
                ...(isValidString(filteredVehicleNumber) && {
                  vehicleNumber: {
                    $regex: `${filteredVehicleNumber}`,
                    $options: "i",
                  },
                }),
              },
            },
          ],
        },
      },
      {
        $unwind: {
          path: "$vehicle",
        },
      },
      {
        $count: "totalCount",
      },
    ]);

    const count = documentCount.length > 0 ? documentCount[0].totalCount : 0;

    return res.status(httpStatus.OK).json(
      ApiResponse.response(success_code, success_message, {
        data,
        count,
      })
    );
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Send verification PIN to the customer
export const sendVerificationPinController = async (req, res) => {
  const { error, value } = SendVerificationPinSchema.validate(req.body);

  if (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json(ApiResponse.error(error_code, error.message));
  }

  const { customerMobile } = value;

  //const pin = generatePinNumber()
  const pin = "123456";

  const formattedMobileNo = customerMobile.replace(/\s/g, "");

  const now = new Date();
  const fifteenMinutesLater = new Date(now);
  fifteenMinutesLater.setMinutes(fifteenMinutesLater.getMinutes() + 15);

  try {
    await bookingVerificationModel.create({
      mobileNumber: formattedMobileNo,
      pin,
    });

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, booking_successfull));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Resend verification PIN to the customer
export const resendVerificationPinController = async (req, res) => {
  const { error, value } = SendVerificationPinSchema.validate(req.body);

  if (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json(ApiResponse.error(error_code, error.message));
  }

  const { customerMobile } = value;

  const formattedMobileNo = customerMobile.replace(/\s/g, "");

  //const pin = generatePinNumber()
  const pin = "123456";

  const now = new Date();
  const fifteenMinutesLater = new Date(now);
  fifteenMinutesLater.setMinutes(fifteenMinutesLater.getMinutes() + 15);

  try {
    await bookingVerificationModel.updateMany(
      { mobileNumber: formattedMobileNo, status: STATUS_PENDING },
      { status: STATUS_EXPIRED }
    );

    const newPinRecord = new bookingVerificationModel({
      mobileNumber: formattedMobileNo,
      pin,
      status: STATUS_PENDING,
    });
    await newPinRecord.save();

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Verify PIN
export const verifyBookingPinController = async (req, res) => {
  const { error, value } = VerifyBookingPinSchema.validate(req.body);

  if (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json(ApiResponse.error(error_code, error.message));
  }

  const { customerMobile, pin } = value;

  const formattedMobileNo = customerMobile.replace(/\s/g, "");

  try {
    const activePin = await bookingVerificationModel
      .findOne({
        mobileNumber: formattedMobileNo,
        status: STATUS_PENDING,
      })
      .sort({ createdAt: -1 });

    if (!activePin) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, booking_active_pin_not_found));
    }

    const attemps = activePin.attemptCount;

    if (attemps > 3) {
      await bookingVerificationModel.updateOne(
        { _id: new ObjectId(activePin._id) },
        { status: STATUS_FAILED }
      );
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, booking_pin_try_attempts_exceeded));
    }

    if (pin != activePin.pin) {
      await bookingVerificationModel.updateOne(
        { _id: new ObjectId(activePin._id) },
        { $inc: { attemptCount: 1 } }
      );

      return res
        .status(httpStatus.BAD_REQUEST)
        .json(
          ApiResponse.error(error_code, booking_pin_not_matching + 3 - attemps)
        );
    }

    activePin.status = STATUS_VERIFIED;
    activePin.verifiedAt = new Date();

    await activePin.save();

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, booking_pin_verified));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Booking Statistics ------------------------------------------

// Total Booking Count
export const getTotalBookingCountController = async (req, res) => {
  try {
    const count = await bookingsModel.countDocuments();
    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message, count));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Total Pending Booking Count
export const getTotalPendingBookingsController = async (req, res) => {
  try {
    const count = await bookingsModel.countDocuments({
      bookingStatus: STATUS_CREATED,
    });
    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message, count));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Total new booking count today
export const getTotalTodayNewBookingsCountController = async (req, res) => {
  try {
    const count = await bookingsModel.countDocuments({
      createdAt: {
        $gt: formatDateToStart(new Date()),
        $lt: formatDateToStart(new Date(), false),
      },
    });
    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message, count));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};
