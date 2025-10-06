import express from "express";
import {
  addBulkStockController,
  addStockController,
  createInventoryCategoryController,
  createItemController,
  getAllInventoryCategoriesController,
  getAllInventoryItemsController,
  getInventoryCategoriesForSelectionController,
  getInventoryItemController,
  getInventoryItemSelectController,
  getItemsForSelectionController,
  lowStockItemsController,
  stockUpdateLogsController,
  updateInventoryCategoryController,
  updateItemController,
} from "../controllers/inventoryController.js";

const inventoryRoutes = express.Router();

inventoryRoutes.post("/auth/create", createItemController);
inventoryRoutes.put("/supAuth/update", updateItemController);
inventoryRoutes.post(
  "/auth/create-category",
  createInventoryCategoryController
);
inventoryRoutes.put(
  "/supAuth/update-category",
  updateInventoryCategoryController
);
inventoryRoutes.get("/auth/categories", getAllInventoryCategoriesController);
inventoryRoutes.get(
  "/auth/categories-selection",
  getInventoryCategoriesForSelectionController
);
inventoryRoutes.get("/auth/items", getAllInventoryItemsController);
inventoryRoutes.get("/auth/item", getInventoryItemController);
inventoryRoutes.get("/auth/items-select", getInventoryItemSelectController);
inventoryRoutes.get("/auth/select-products", getItemsForSelectionController);
inventoryRoutes.put("/auth/update-stocks", addStockController);
inventoryRoutes.put("/auth/bulk-stock-update", addBulkStockController);
inventoryRoutes.get("/auth/stock-logs", stockUpdateLogsController);
inventoryRoutes.get("/auth/inv-stocks-status", lowStockItemsController);

export default inventoryRoutes;
