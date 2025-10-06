import httpStatus from "http-status";
import { ObjectId } from "mongodb";

import { ADMIN_ROLE } from "../constants/role.js";
import userModel from "../models/userModel.js";
import { userSchema } from "../schemas/user/userSchema.js";
import ApiResponse from "../services/ApiResponse.js";
import { error_code, success_code } from "../constants/statusCodes.js";
import {
  cannot_delete_current_user,
  forbidden,
  success_message,
  user_cannot_proceed,
  user_email_registered,
  user_exists,
  user_not_found,
  user_pwd_reset_success,
} from "../constants/messageConstants.js";
import { updateUserSchema } from "../schemas/user/updateUserSchema.js";
import adminActivityModel from "../models/adminActivityModel.js";
import { generateAccessToken } from "../services/jwtServices.js";
import { forcePwdResetSchema } from "../schemas/auth/forcePwdResetSchema.js";
import { verifyEmailSchema } from "../schemas/auth/verifyEmailSchema.js";
import { changePasswordSchema } from "../schemas/auth/changePasswordSchema.js";

export const createDefaultUser = async () => {
  try {
    const userEmail = process.env.DEFAULT_ADMIN_EMAIL.toLowerCase();
    const existingAdmin = await userModel.findOne({ userEmail });

    if (existingAdmin) {
      return;
    }

    const newUser = new userModel({
      userFirstName: process.env.DEFAULT_ADMIN_FNAME,
      userLastName: process.env.DEFAULT_ADMIN_LNAME,
      userEmail: process.env.DEFAULT_ADMIN_EMAIL.toLowerCase(),
      userRole: ADMIN_ROLE,
      userPassword: process.env.DEFAULT_ADMIN_PWD,
    });

    const user = await newUser.save();
    console.log("Admin Created - " + user.userEmail);

    return;
  } catch (error) {
    return;
  }
};

// Check user email present
export const checkUserEmailController = async (req, res) => {
  const { error, value } = verifyEmailSchema.validate(req.body);

  if (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json(ApiResponse.error(error_code, error.message));
  }

  const { email } = value;

  try {
    const admin = await userModel.findOne({
      userEmail: email.trim().toLowerCase(),
    });

    if (!admin) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json(ApiResponse.response(error_code, user_not_found));
    }

    return res.status(httpStatus.OK).json(
      ApiResponse.response(success_code, success_message, {
        _id: admin._id,
        isUserFirstLogin: admin.isUserFirstLogin,
      })
    );
  } catch (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Initial password update or reset password controller
export const adminForcePasswordResetController = async (req, res) => {
  const { error, value } = forcePwdResetSchema.validate(req.body);

  if (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json(ApiResponse.error(error_code, error.message));
  }

  const { id, password } = value;

  try {
    const admin = await userModel.findById(new ObjectId(id));

    if (!admin) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json(ApiResponse.response(error_code, user_not_found));
    }

    if (!admin.userIsActive) {
      return res
        .status(httpStatus.UNAUTHORIZED)
        .json(ApiResponse.response(error_code, forbidden));
    }

    if (!admin.isUserFirstLogin) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json(ApiResponse.response(error_code, user_cannot_proceed));
    }

    admin.userPassword = password;
    admin.isUserFirstLogin = false;

    const token = generateAccessToken(admin._id, admin.userRole);

    admin.userAccessToken = token;

    const updatedUser = await admin.save();

    return res.status(httpStatus.OK).json(
      ApiResponse.response(success_code, user_pwd_reset_success, {
        user: updatedUser,
        token,
      })
    );
  } catch (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Get all admins
export const getAllAdminController = async (req, res) => {
  const page = parseInt(req.query.page);
  const limit = parseInt(req.query.limit);

  const skip = page * limit;
  try {
    const data = await userModel.find().limit(limit).skip(skip);
    const count = await userModel.countDocuments();

    return res
      .status(httpStatus.OK)
      .json(
        ApiResponse.response(success_code, success_message, { data, count })
      );
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Create User
export const createUserController = async (req, res) => {
  try {
    const { error, value } = userSchema.validate(req.body);

    if (error) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, error.message));
    }

    const user = await userModel.findOne({ userEmail: value.userEmail });

    if (user) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, user_exists));
    }

    const newUser = new userModel({
      ...value,
      userEmail: value.userEmail.toLowerCase(),
    });

    await newUser.save();

    return res
      .status(httpStatus.CREATED)
      .json(ApiResponse.response(success_code, success_message));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// update user
export const updateUserController = async (req, res) => {
  const { error, value } = updateUserSchema.validate(req.body);

  if (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json(ApiResponse.error(error_code, error.message));
  }
  try {
    const user = await userModel.findById(new ObjectId(value.id));

    if (!user) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, user_not_found));
    }

    if (user.userEmail.toLowerCase() != value.userEmail.toLowerCase()) {
      const existingUser = await userModel.findOne({
        userEmail: value.userEmail.toLowerCase(),
      });

      if (existingUser) {
        return res
          .status(httpStatus.BAD_REQUEST)
          .json(ApiResponse.error(error_code, user_email_registered));
      }
    }

    value.userEmail = value.userEmail.toLowerCase();

    Object.assign(user, value);

    await user.save();

    return res
      .status(httpStatus.CREATED)
      .json(ApiResponse.response(success_code, success_message));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Update user password
export const changePasswordController = async (req, res) => {
  const id = req.user.id;

  const { error, value } = changePasswordSchema.validate(req.body);

  if (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json(ApiResponse.error(error_code, error.message));
  }

  const { password } = value;
  try {
    const user = await userModel.findById(new ObjectId(id));

    if (!user) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json(ApiResponse.response(error_code, user_not_found));
    }

    if (!user.userIsActive) {
      return res
        .status(httpStatus.UNAUTHORIZED)
        .json(ApiResponse.response(error_code, forbidden));
    }

    user.userPassword = password;

    await user.save();

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, user_pwd_reset_success));
  } catch (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Delete User
export const deleteUserController = async (req, res) => {
  try {
    const { id } = req.params;

    if (id === req.user.id) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, cannot_delete_current_user));
    }

    await userModel.findByIdAndDelete(new ObjectId(id));

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Get admin activities
export const getAdminActivitiesController = async (req, res) => {
  const id = req.query.id;

  const page = parseInt(req.query.page);
  const limit = parseInt(req.query.limit);

  const skip = page * limit;

  try {
    const data = await adminActivityModel
      .find({ user: new ObjectId(id) })
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });
    const count = await adminActivityModel.countDocuments({
      user: new ObjectId(id),
    });

    return res
      .status(httpStatus.OK)
      .json(
        ApiResponse.response(success_code, success_message, { data, count })
      );
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};
