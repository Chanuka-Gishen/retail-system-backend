import jwt from "jsonwebtoken";
import http from "http-status";

import { auth_error_code, error_code } from "../constants/statusCodes.js";
import {
  access_denied,
  token_not_found,
} from "../constants/messageConstants.js";

import ApiResponse from "../services/ApiResponse.js";
import userModel from "../models/userModel.js";
import { SUPER_ADMIN_ROLE } from "../constants/role.js";

export const authMiddleware = async (req, res, next) => {
  const isAuthRequired = req.path.includes("/auth/");
  const isSuperAuthRequired = req.path.includes("/supAuth/")

  if (!isAuthRequired && !isSuperAuthRequired) {
    return next();
  }

  try {
    let token = req.header("Authorization");

    if (!token) {
      return res
        .status(http.UNAUTHORIZED)
        .json(ApiResponse.error(auth_error_code, access_denied));
    }

    if (token.startsWith("Bearer ")) {
      token = token.slice(7, token.length).trimLeft();
    }

    const userToken = await userModel.findOne({ userAccessToken: token });

    if (!userToken) {
      return res
        .status(http.UNAUTHORIZED)
        .json(ApiResponse.error(auth_error_code, token_not_found));
    }

    if (!userToken.userIsActive) {
      return res
        .status(http.SERVICE_UNAVAILABLE)
        .json(ApiResponse.error(auth_error_code, access_denied));
    }

    if(isSuperAuthRequired && userToken.userRole != SUPER_ADMIN_ROLE){
      return res
        .status(http.SERVICE_UNAVAILABLE)
        .json(ApiResponse.error(error_code, access_denied));
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);

    req.user = payload;
    next();
  } catch (err) {
    return res
      .status(http.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(auth_error_code, err.message));
  }
};
