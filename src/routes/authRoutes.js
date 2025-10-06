import express from "express";
import {
  loginController,
  logoutController,
} from "../controllers/authController.js";

const authRoutes = express.Router();

authRoutes.post("/noAuth/login", loginController);
authRoutes.get("/auth/logout", logoutController);

export default authRoutes;
