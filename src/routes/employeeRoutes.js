import express from "express";
import {
  addEmployeeAttendenceDailyController,
  createEmpLeaveRequestController,
  createEmployeeController,
  getAllAttendencesController,
  getEmpAttendenceController,
  getEmpLeaveRequestsController,
  getEmployeeController,
  getEmployeesController,
  getEmployeesForSelectionController,
  processEmpLeaveRequestController,
  updateEmployeeDetailsController,
} from "../controllers/employeeController.js";

const empRoutes = express.Router();

empRoutes.post("/auth/register", createEmployeeController);
empRoutes.put("/supAuth/update", updateEmployeeDetailsController);
empRoutes.get("/auth/employees", getEmployeesController);
empRoutes.get("/auth/employee", getEmployeeController);
empRoutes.get("/auth/selection", getEmployeesForSelectionController);
empRoutes.get("/auth/attendence", getAllAttendencesController);
empRoutes.get("/auth/emp-attendence", getEmpAttendenceController);
empRoutes.post(
  "/auth/add-emp-attendence",
  addEmployeeAttendenceDailyController
);
empRoutes.get("/auth/leave-requests", getEmpLeaveRequestsController);
empRoutes.post("/auth/leave-request", createEmpLeaveRequestController);
empRoutes.put(
  "/supAuth/process-leave-request",
  processEmpLeaveRequestController
);

export default empRoutes;
