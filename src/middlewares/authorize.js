import httpStatus from "http-status";

import ApiResponse from "../services/ApiResponse.js";
import { permission_error_code } from "../constants/statusCodes.js";
import { forbidden } from "../constants/messageConstants.js";

export const authorize = (roles) => {
  return (req, res, next) => {
    const userRole = req.user.role;
    if (!roles.includes(userRole)) {
      return res
        .status(httpStatus.FORBIDDEN)
        .json(ApiResponse.error(permission_error_code, forbidden));
    }
    next();
  };
};
