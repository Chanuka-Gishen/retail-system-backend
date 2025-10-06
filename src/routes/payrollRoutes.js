import express from "express";
import {
  addEmpBonusesController,
  createEmpSalarySchemaController,
  deleteEmpBonusController,
  getEmpBonusHistoryController,
  getEmpSalaryChangeHistoryController,
  getEmpSalarySchemaController,
  undoLastSalaryChangeController,
  updateEmployeeSalaryController,
  updateEmpSalarySchemaController,
} from "../controllers/payrollController.js";

const payrollRoutes = express.Router();

payrollRoutes.post("/auth/add", createEmpSalarySchemaController);
payrollRoutes.put("/auth/update", updateEmpSalarySchemaController);
payrollRoutes.put("/supAuth/update-salary", updateEmployeeSalaryController);
payrollRoutes.get("/auth/emp-salary-schema", getEmpSalarySchemaController);
payrollRoutes.post("/supAuth/add-bonus", addEmpBonusesController);
payrollRoutes.delete("/supAuth/delete-bonus", deleteEmpBonusController);
payrollRoutes.get("/auth/emp-bonuses", getEmpBonusHistoryController);
payrollRoutes.get(
  "/auth/salary-change-history",
  getEmpSalaryChangeHistoryController
);
payrollRoutes.delete(
  "/supAuth/undo-salary-change",
  undoLastSalaryChangeController
);

export default payrollRoutes;
