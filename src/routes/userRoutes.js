import express from "express";
import {
  adminForcePasswordResetController,
  changePasswordController,
  checkUserEmailController,
  createUserController,
  getAdminActivitiesController,
  getAllAdminController,
  updateUserController,
} from "../controllers/userController.js";

const userRoutes = express.Router();

userRoutes.post("/supAuth/create", createUserController);
userRoutes.get("/auth/all", getAllAdminController);
userRoutes.post("/noAuth/verify-email", checkUserEmailController);
userRoutes.put("/noAuth/reset-pwd", adminForcePasswordResetController);
userRoutes.put("/auth/change-pwd", changePasswordController);
userRoutes.put("/supAuth/update", updateUserController);
userRoutes.get("/supAuth/get-activities", getAdminActivitiesController);

export default userRoutes;
