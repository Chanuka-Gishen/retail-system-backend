import httpStatus from "http-status";
import { ObjectId } from "mongodb";
import fs from "fs";
import csv from "csv-parser";

import ApiResponse from "../services/ApiResponse.js";
import {
  error_code,
  info_code,
  success_code,
  warning_code,
} from "../constants/statusCodes.js";
import { inventorySchema } from "../schemas/inventory/inventorySchema.js";
import inventoryModel from "../models/inventoryModel.js";
import {
  invalid_item_movement_type,
  item_category_exists,
  item_category_not_found,
  item_code_exists,
  item_exists,
  item_not_found,
  success_message,
  supplier_not_found,
} from "../constants/messageConstants.js";
import {
  generateGrnNumber,
  isValidString,
} from "../services/commonServices.js";

import { STOCK_IN, STOCK_OUT } from "../constants/stockMovementTypes.js";
import {
  ITEM_STS_INACTIVE,
  ITEM_STS_INSTOCK,
  ITEM_STS_LOW_STOCK,
  ITEM_STS_OUTOFSTOCK,
} from "../constants/itemStatus.js";

import {
  PAYMENT_TYPE_IN,
  PAYMENT_TYPE_OUT,
} from "../constants/paymentTypes.js";

import {
  ACC_TYP_INV_GROSS,
  ACC_TYP_INV_NET,
  ACC_TYP_PAYABLES,
} from "../constants/accountTypes.js";

import accountBalanceModel from "../models/accountBalancemodel.js";
import supplierModel from "../models/supplierModel.js";
import grnModel from "../models/grnModel.js";
import itemBpHistoryModel from "../models/itemBpHistoryModel.js.js";
import itemSpHistoryModel from "../models/itemSpHistoryModel.js";
import stockMovementModel from "../models/stockMovementModel.js";

import { stockUpdateSchema } from "../schemas/grn/stockUpdateSchema.js";
import { inventoryUpdateSchema } from "../schemas/inventory/inventoryUpdateSchema.js";
import { grnAddSchema } from "../schemas/grn/grnAddSchema.js";
import { categorySchema } from "../schemas/inventory/categorySchema.js";
import mongoose from "mongoose";
import { getSequenceValue, updateSequenceValue } from "./sequenceController.js";
import { SEQ_GRN } from "../constants/sequenceConstants.js";

import {
  PRICE_CHANGE_ACTIVE,
  PRICE_CHANGE_COMPLETED,
  PRICE_CHANGE_CREATED,
} from "../constants/priceChangeStatus.js";
import inventoryCategoryModel from "../models/inventoryCategoryModel.js";
import { updateCategorySchema } from "../schemas/inventory/updateCategorySchema.js";

// Create inventory item
export const createItemController = async (req, res) => {
  try {
    const { error, value } = inventorySchema.validate(req.body);

    if (error) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, error.message));
    }

    const isExistItem = await inventoryModel.findOne({
      $or: [
        { itemName: value.itemName.toUpperCase() },
        { itemCode: value.itemCode.toUpperCase() },
      ],
    });

    if (isExistItem) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(
          ApiResponse.error(info_code, item_exists + isExistItem.itemCategory)
        );
    }

    value.itemStatus =
      value.itemQuantity < value.itemThreshold
        ? ITEM_STS_LOW_STOCK
        : ITEM_STS_INSTOCK;

    const newItem = new inventoryModel({
      itemName: value.itemName.toUpperCase(),
      itemCode: value.itemCode.trim().toUpperCase(),
      ...value,
    });

    const savedNewItem = await newItem.save();

    const stockGrossValue =
      savedNewItem.itemQuantity * savedNewItem.itemBuyingPrice;
    const stockNetValue =
      savedNewItem.itemQuantity * savedNewItem.itemSellingPrice;

    await updateAccountData(
      ACC_TYP_INV_GROSS,
      PAYMENT_TYPE_IN,
      stockGrossValue
    );

    await updateAccountData(ACC_TYP_INV_NET, PAYMENT_TYPE_IN, stockNetValue);

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Update inventory item
export const updateItemController = async (req, res) => {
  const id = req.query.id;
  const userId = req.user.id;

  const { error, value } = inventoryUpdateSchema.validate(req.body);

  if (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json(ApiResponse.error(error_code, error.message));
  }

  try {
    const item = await inventoryModel.findById(new ObjectId(id));

    if (!item) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, item_not_found));
    }

    if (item.itemSellingPrice != value.itemSellingPrice) {
      const newPrice = new itemSpHistoryModel({
        item: new ObjectId(item._id),
        itemOldPrice: item.itemSellingPrice,
        itemNewPrice: value.itemSellingPrice,
        itemChangedBy: new ObjectId(userId),
      });

      await newPrice.save();
    }

    if (item.itemCode != value.itemCode) {
      const isExistCode = await inventoryModel.findOne({
        itemCode: value.itemCode.toUpperCase(),
      });

      if (isExistCode) {
        return res
          .status(httpStatus.BAD_REQUEST)
          .json(ApiResponse.error(info_code, item_code_exists));
      }
    }

    value.itemName = value.itemName.toUpperCase();

    Object.assign(item, value);

    await item.save();

    if (item.itemSellingPrice != value.itemSellingPrice) {
      const stockNetValueChange =
        (item.itemSellingPrice - value.itemSellingPrice) * item.itemQuantity;

      const payType =
        item.itemSellingPrice > value.itemSellingPrice
          ? PAYMENT_TYPE_OUT
          : PAYMENT_TYPE_IN;

      await updateAccountData(ACC_TYP_INV_NET, payType, stockNetValueChange);
    }

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Create inventory category
export const createInventoryCategoryController = async (req, res) => {
  const { error, value } = categorySchema.validate(req.body);

  if (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json(ApiResponse.error(error_code, error.message));
  }

  const { categoryTitle } = value;

  try {
    const existingCategory = await inventoryCategoryModel.findOne({
      categoryTitle: categoryTitle.toUpperCase(),
    });

    if (existingCategory) {
      return res
        .status(httpStatus.PRECONDITION_FAILED)
        .json(
          ApiResponse.error(info_code, categoryTitle + item_category_exists)
        );
    }

    await inventoryCategoryModel.create({
      categoryTitle: categoryTitle.toUpperCase(),
    });

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Update inventory category
export const updateInventoryCategoryController = async (req, res) => {
  const { error, value } = updateCategorySchema.validate(req.body);

  if (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json(ApiResponse.error(error_code, error.message));
  }

  const { _id, categoryTitle } = value;

  try {
    const category = await inventoryCategoryModel.findById(new ObjectId(_id));

    if (!category) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json(ApiResponse.error(error_code, item_category_not_found));
    }

    if (categoryTitle.toUpperCase() != category.categoryTitle) {
      const existingCategory = await inventoryCategoryModel.findOne({
        categoryTitle: categoryTitle.toUpperCase(),
      });

      if (existingCategory) {
        return res
          .status(httpStatus.PRECONDITION_FAILED)
          .json(
            ApiResponse.error(info_code, categoryTitle + item_category_exists)
          );
      }

      category.categoryTitle = categoryTitle.toUpperCase();
      await category.save();
    }

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Update stock quantity
export const addStockController = async (req, res) => {
  try {
    const { error, value } = stockUpdateSchema.validate(req.body);
    const userId = req.user.id;

    if (error) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, error.message));
    }

    const { _id, stockMovementType, stockQuantity, stockNotes } = value;

    const item = await inventoryModel.findById(new ObjectId(_id));

    if (!item) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, item_not_found));
    }

    let newQuantity = item.itemQuantity;
    switch (stockMovementType) {
      case STOCK_IN:
        newQuantity += stockQuantity;
        break;
      case STOCK_OUT:
        newQuantity -= stockQuantity;
        break;
      default:
        return res
          .status(httpStatus.BAD_REQUEST)
          .json(ApiResponse.error(error_code, invalid_item_movement_type));
    }

    const newStock = new stockMovementModel({
      stockItem: new ObjectId(item._id),
      stockMovementType: stockMovementType,
      stockQuantity: stockQuantity,
      stockPreviousQuantity: item.itemQuantity,
      stockNewQuantity: newQuantity,
      stockUnit: item.itemUnit,
      stockPricePerUnit: item.itemBuyingPrice,
      stockTotalValue: item.itemBuyingPrice * stockQuantity,
      stockNotes: stockNotes || `${stockMovementType} movement (Manual)`,
      stockPerformedBy: new ObjectId(userId),
    });

    await newStock.save();

    switch (stockMovementType) {
      case STOCK_IN:
        await updateAccountData(
          ACC_TYP_INV_GROSS,
          PAYMENT_TYPE_IN,
          item.itemBuyingPrice * stockQuantity
        );
        await updateAccountData(
          ACC_TYP_INV_NET,
          PAYMENT_TYPE_IN,
          item.itemSellingPrice * stockQuantity
        );
        break;
      case STOCK_OUT:
        await updateAccountData(
          ACC_TYP_INV_GROSS,
          PAYMENT_TYPE_OUT,
          item.itemBuyingPrice * stockQuantity
        );
        await updateAccountData(
          ACC_TYP_INV_NET,
          PAYMENT_TYPE_OUT,
          item.itemSellingPrice * stockQuantity
        );
        break;
      default:
        return res
          .status(httpStatus.BAD_REQUEST)
          .json(ApiResponse.error(error_code, invalid_item_movement_type));
    }

    item.itemQuantity = newQuantity;

    // Update status if below threshold
    if (newQuantity < item.itemThreshold) {
      item.itemStatus = ITEM_STS_LOW_STOCK;
    } else if (newQuantity === 0) {
      item.itemStatus = ITEM_STS_OUTOFSTOCK;
    } else {
      item.itemStatus = ITEM_STS_INSTOCK;
    }

    await item.save();

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Get all inventory categories
export const getAllInventoryCategoriesController = async (req, res) => {
  try {
    const result = await inventoryCategoryModel.aggregate([
      {
        $lookup: {
          from: "inventories",
          localField: "_id",
          foreignField: "itemCategory",
          as: "items",
        },
      },
      {
        $project: {
          _id: 1,
          categoryTitle: 1,
          itemsCount: { $size: "$items" },
        },
      },
      {
        $sort: { itemsCount: -1 },
      },
    ]);
    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message, result));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Get all inventory categories for selection
export const getInventoryCategoriesForSelectionController = async (
  req,
  res
) => {
  try {
    const result = await inventoryCategoryModel
      .find()
      .select("_id categoryTitle");
    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message, result));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Get inventory filtered by name and code
export const getAllInventoryItemsController = async (req, res) => {
  try {
    const page = parseInt(req.query.page);
    const limit = parseInt(req.query.limit);

    const skip = page * limit;

    const itemName = req.query.name;
    const itemCode = req.query.code;

    const query = { itemStatus: { $ne: ITEM_STS_INACTIVE } };

    if (isValidString(itemName)) {
      query.itemName = {
        $regex: `${itemName}`,
        $options: "i",
      };
    }

    if (isValidString(itemCode)) {
      query.itemCode = {
        $regex: `${itemCode}`,
        $options: "i",
      };
    }

    const items = await inventoryModel.find(query).skip(skip).limit(limit).populate('itemCategory');

    const count = await inventoryModel.countDocuments(query);

    return res.status(httpStatus.OK).json(
      ApiResponse.response(success_code, success_message, {
        data: items,
        count,
      })
    );
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Get item by Id
export const getInventoryItemController = async (req, res) => {
  const _id = req.query.id;

  try {
    const item = await inventoryModel.findById(_id).populate('itemCategory');

    if (!item) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, item_not_found));
    }
    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message, item));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Get items for select
export const getInventoryItemSelectController = async (req, res) => {
  const itemName = req.query.name;
  const itemCode = req.query.code;

  const query = {
    itemStatus: { $ne: ITEM_STS_INACTIVE },
  };

  if (isValidString(itemName)) {
    query.itemName = {
      $regex: `${itemName}`,
      $options: "i",
    };
  }

  if (isValidString(itemCode)) {
    query.itemCode = {
      $regex: `${itemCode}`,
      $options: "i",
    };
  }

  try {
    const items = await inventoryModel
      .find(query)
      .select({
        _id: 1,
        itemCode: 1,
        itemName: 1,
        itemQuantity: 1,
        itemBuyingPrice: 1,
        itemSellingPrice: 1,
      })
      .sort({ itemName: 1 })
      .limit(10);

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message, items));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// GRN record add (Bulk stock records by supplier)
export const addBulkStockController = async (req, res) => {
  const id = req.query.id;
  const userId = req.user.id;

  const { error, value } = grnAddSchema.validate(req.body);

  if (error) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json(ApiResponse.error(error_code, error.message));
  }

  try {
    const supplier = await supplierModel.findById(new ObjectId(id));

    if (!supplier) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, supplier_not_found));
    }

    const { grnDiscountAmount, grnReceivedDate, grnItems } = value;

    const validStockItems = grnItems.filter(
      (item) => item.stockQuantity > 0 && item.stockUnitPrice > 0
    );

    // Batch fetch all inventory items at once
    const itemIds = validStockItems.map((item) => new ObjectId(item._id));

    const inventoryItems = await inventoryModel.find({ _id: { $in: itemIds } });

    await updateSequenceValue(SEQ_GRN);

    const seqValue = await getSequenceValue(SEQ_GRN);

    const grnCode = generateGrnNumber(seqValue);

    const grnItemsArray = [];
    const updateItemsArray = [];
    const bpChangeArray = [];
    const logsArray = [];
    const updateBpChangeArray = [];

    let totalStockValue = 0;
    let totalStockNetValue = 0;

    for (const item of validStockItems) {
      if (item.stockQuantity <= 0) continue;

      const invItem = inventoryItems.find(
        (data) => data._id.toString() === item._id
      );

      if (!invItem) continue;

      const stockNewQuantity = item.stockQuantity + invItem.itemQuantity;

      const stockTotalValue = item.stockQuantity * item.stockUnitPrice;
      const stockTotalNet = item.stockQuantity * invItem.itemSellingPrice;

      totalStockValue += stockTotalValue || 0;
      totalStockNetValue += stockTotalNet || 0;

      logsArray.push({
        stockItem: new ObjectId(item._id),
        stockMovementType: STOCK_IN,
        stockQuantity: item.stockQuantity,
        stockPreviousQuantity: invItem.itemQuantity,
        stockNewQuantity,
        stockSupplier: new ObjectId(supplier._id),
        stockUnit: invItem.itemUnit,
        stockPricePerUnit: item.stockUnitPrice,
        stockTotalValue: stockTotalValue,
        stockNotes: `${STOCK_IN} movement`,
        stockPerformedBy: new ObjectId(userId),
      });

      // ------------------------------------------ update inventory record for item

      let itemStatus = ITEM_STS_INSTOCK;

      if (stockNewQuantity < invItem.itemThreshold) {
        itemStatus = ITEM_STS_LOW_STOCK;
      } else if (stockNewQuantity === 0) {
        itemStatus = ITEM_STS_OUTOFSTOCK;
      }

      const setFields = {
        itemStatus: itemStatus,
        itemQuantity: stockNewQuantity,
      };

      let isBpChanged = false;

      if (invItem.itemBpChangeMargin <= 0) {
        isBpChanged = true;
        setFields.itemBpChangeMargin = item.stockQuantity;
        setFields.itemBuyingPrice = item.stockUnitPrice;
      }

      updateItemsArray.push({
        updateOne: {
          filter: { _id: new ObjectId(item._id) },
          update: {
            $set: setFields,
          },
        },
      });

      //-----------------------------------------------------------

      if (invItem.itemBuyingPrice != item.stockUnitPrice) {
        bpChangeArray.push({
          item: new mongoose.Types.ObjectId(invItem._id),
          itemNewPrice: item.stockUnitPrice,
          stockMargin: item.stockQuantity,
          effectiveFrom: isBpChanged ? new Date() : null,
          changeStatus: isBpChanged
            ? PRICE_CHANGE_ACTIVE
            : PRICE_CHANGE_CREATED,
        });
      }

      if (isBpChanged) {
        updateBpChangeArray.push({
          updateOne: {
            filter: { changeStatus: PRICE_CHANGE_ACTIVE },
            update: {
              $set: {
                changeStatus: PRICE_CHANGE_COMPLETED,
                effectiveTo: new Date(),
              },
            },
          },
        });
      }

      grnItemsArray.push({
        ...item,
        _id: new mongoose.Types.ObjectId(item._id),
        stockTotalPrice: stockTotalValue,
      });
    }

    // Create GRN record

    const grnSubTotalValue = totalStockValue - grnDiscountAmount;

    const savedGrn = await grnModel.create({
      grnCode,
      grnSupplier: new mongoose.Types.ObjectId(supplier._id),
      grnTotalValue: totalStockValue,
      grnSubTotalValue,
      grnPaidAmount: 0,
      grnDueAmount: grnSubTotalValue,
      grnDiscountAmount,
      grnReceivedDate: new Date(grnReceivedDate),
      grnItems: grnItemsArray,
    });

    supplier.supplierDueAmount = supplier.supplierDueAmount + grnSubTotalValue;
    await supplier.save();

    // Updated price change records status if have

    if (updateBpChangeArray.length > 0) {
      await itemBpHistoryModel.bulkWrite(updateBpChangeArray);
    }

    // ----------- Save movement logs and price changes

    for (const mv of logsArray) {
      const savedLog = await stockMovementModel.create({
        ...mv,
        stockGrnRef: new mongoose.Types.ObjectId(savedGrn._id),
      });

      const bpIndex = bpChangeArray.findIndex(
        (bp) => bp.item.toString() === savedLog.stockItem.toString()
      );

      if (bpIndex > -1) {
        bpChangeArray[bpIndex] = {
          ...bpChangeArray[bpIndex],
          grnRef: new mongoose.Types.ObjectId(savedGrn._id),
          stockMovement: new mongoose.Types.ObjectId(savedLog._id),
        };
      }
    }

    if (bpChangeArray.length > 0) {
      await itemBpHistoryModel.insertMany(bpChangeArray);
    }

    await inventoryModel.bulkWrite(updateItemsArray);

    await updateAccountData(
      ACC_TYP_INV_GROSS,
      PAYMENT_TYPE_IN,
      totalStockValue
    );

    await updateAccountData(
      ACC_TYP_INV_NET,
      PAYMENT_TYPE_IN,
      totalStockNetValue
    );

    await updateAccountData(
      ACC_TYP_PAYABLES,
      PAYMENT_TYPE_IN,
      savedGrn.grnTotalValue
    );

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Inventory item stock update logs
export const stockUpdateLogsController = async (req, res) => {
  const id = req.query.id;
  const page = parseInt(req.query.page);
  const limit = parseInt(req.query.limit);

  const skip = page * limit;
  try {
    const item = await inventoryModel.findById(new ObjectId(id));

    if (!item) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json(ApiResponse.error(error_code, item_not_found));
    }

    const data = await stockMovementModel
      .find({ stockItem: new ObjectId(id) })
      .limit(limit)
      .skip(skip);
    const count = await stockMovementModel.countDocuments({
      stockItem: new ObjectId(id),
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

// Get low stock items
export const lowStockItemsController = async (req, res) => {
  const status = req.query.status;
  try {
    const data = await inventoryModel
      .find({ itemStatus: status })
      .select("itemCode itemName itemQuantity")
      .limit(10);
    const count = await inventoryModel.countDocuments({ itemStatus: status });

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

// Get inventory items for selection - Supplier
export const getItemsForSelectionController = async (req, res) => {
  const itemName = req.query.name;

  try {
    const query = {
      itemStatus: { $ne: ITEM_STS_INACTIVE },
    };

    if (isValidString(itemName)) {
      query.itemName = {
        $regex: `${itemName}`,
        $options: "i",
      };
    }

    const data = (
      await inventoryModel.find(query).select("_id itemName").limit(10)
    ).map((doc) => ({
      _id: doc._id,
      itemName: doc.itemName,
    }));

    return res
      .status(httpStatus.OK)
      .json(ApiResponse.response(success_code, success_message, data));
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error(error_code, error.message));
  }
};

// Update accounts data
export const updateAccountData = async (accountType, paymentType, amount) => {
  const entryAmount = paymentType === PAYMENT_TYPE_OUT ? -amount : amount;

  await accountBalanceModel.updateOne(
    { accountType: accountType },
    {
      $inc: {
        accountCurrentBalance: entryAmount,
      },
    }
  );
  return;
};

// Manual DB Changes----------------------------------------------------------
const changeInventoryItemsStatus = async () => {
  await inventoryModel.updateMany({}, [
    {
      $set: {
        itemStatus: ITEM_STS_INACTIVE,
      },
    },
  ]);
  console.log("Item status set to inactive");
};

const addExistingInventoryData = async () => {
  return new Promise((resolve, reject) => {
    const items = [];

    fs.createReadStream("./src/assets/items.csv")
      .pipe(csv())
      .on("data", (data) => {
        items.push({
          itemCode: data["Item Code"],
          itemName: data["Item Name"],
          itemCategory: data["Category"],
          itemQuantity: data["Qty"],
        });
      })
      .on("end", async () => {
        try {
          // Now insert to MongoDB
          if (items.length > 0) {
            const insertedItems = [];
            const updatedItems = [];

            for (const item of items) {
              try {
                // const existingCode = await inventoryModel.findOne({
                //   itemCode: item.itemCode.toUpperCase(),
                // });
                // if (existingCode) {
                //   const updatedItem = await inventoryModel.findOneAndUpdate(
                //     { itemCode: item.itemCode.toUpperCase() },
                //     [
                //       {
                //         $set: {
                //           itemName: item.itemName.trim(),
                //           itemCategory: item.itemCategory.trim(),
                //           itemQuantity: parseInt(item.itemQuantity),
                //           itemBuyingPrice: 0,
                //           itemSellingPrice: 0,
                //           itemThreshold: 0,
                //           itemStatus:
                //             parseInt(item.itemQuantity) > 0
                //               ? ITEM_STS_INSTOCK
                //               : ITEM_STS_OUTOFSTOCK,
                //         },
                //       },
                //     ],
                //     { new: true }
                //   );

                //   updatedItems.push(updatedItem);
                // } else {
                //   const newItem = await inventoryModel.create({
                //     itemCode: item.itemCode.trim().toUpperCase(),
                //     itemName: item.itemName.trim(),
                //     itemCategory: item.itemCategory.trim(),
                //     itemQuantity: parseInt(item.itemQuantity),
                //     itemBuyingPrice: 0,
                //     itemSellingPrice: 0,
                //     itemThreshold: 0,
                //     itemStatus:
                //       parseInt(item.itemQuantity) > 0
                //         ? ITEM_STS_INSTOCK
                //         : ITEM_STS_OUTOFSTOCK,
                //   });

                //   insertedItems.push(newItem);
                // }

                const newItem = await inventoryModel.create({
                  itemCode: item.itemCode.trim().toUpperCase(),
                  itemName: item.itemName.trim(),
                  itemCategory: item.itemCategory.trim(),
                  itemQuantity: parseInt(item.itemQuantity),
                  itemBuyingPrice: 0,
                  itemSellingPrice: 0,
                  itemThreshold: 0,
                  itemStatus:
                    parseInt(item.itemQuantity) > 0
                      ? ITEM_STS_INSTOCK
                      : ITEM_STS_OUTOFSTOCK,
                });

                insertedItems.push(newItem);
              } catch (error) {
                console.error(`Failed to save ${item}:`, error.message);
                // Continue to next item even if one fails
              }
            }
            console.log(`Saved: ${insertedItems.length}`);
            console.log(`Updated: ${updatedItems.length}`);
          }
        } catch (error) {
          console.error("Import failed:", error);
          reject(error);
        }
      })
      .on("error", (error) => {
        reject(error);
      });
  });
  // return new Promise((resolve, reject) => {
  //   const items = [];

  //   fs.createReadStream("./src/assets/customers.csv")
  //     .pipe(csv())
  //     .on("data", (data) => {
  //       if (
  //         data["Vehical Model"].trim() !== "-" &&
  //         data["Name"].trim() !== "-" &&
  //         data["Contact No"].trim() !== "-" &&
  //         data["Vehicle No"].trim() !== "-" &&
  //         data["Vehicle Type"].trim() !== "-"
  //       ) {
  //         items.push({
  //           customerPrefix: CUSTOMER_PREFIX[0],
  //           customerName: data["Name"], // Note the space in header
  //           customerMobile: data["Contact No"], // Note the space and hyphen
  //           vehicleNumber: data["Vehicle No"],
  //           vehicleManufacturer: data["Vehicle Type"],
  //           vehicleModel: data["Vehical Model"], // Note the spelling
  //         });
  //       }
  //     })
  //     .on("end", async () => {
  //       try {
  //         // Now insert to MongoDB
  //         if (items.length > 0) {
  //           const insertedItems = [];

  //           for (const item of items) {
  //             try {
  //               const newCustomer = await customerModel.create({
  //                 customerPrefix: item.customerPrefix,
  //                 customerName: item.customerName,
  //                 customerMobile: item.customerMobile,
  //               });
  //               await customerVehicleModel.create({
  //                 vehicleOwner: new ObjectId(newCustomer._id),
  //                 vehicleNumber: item.vehicleNumber,
  //                 vehicleManufacturer: item.vehicleManufacturer,
  //                 vehicleModel: item.vehicleModel,
  //               });

  //               // 3. Only push to array after successful save
  //               insertedItems.push(newCustomer);
  //             } catch (error) {
  //               console.error(`Failed to save ${item}:`, error.message);
  //               // Continue to next item even if one fails
  //             }
  //           }
  //           console.log(`Saved: ${insertedItems.length}`);
  //         }
  //       } catch (error) {
  //         console.error("Import failed:", error);
  //         reject(error);
  //       }
  //     })
  //     .on("error", (error) => {
  //       reject(error);
  //     });
  // });
};

const changeItemPrices = async () => {
  return new Promise((resolve, reject) => {
    const items = [];

    fs.createReadStream("./src/assets/items.csv")
      .pipe(csv())
      .on("data", (data) => {
        items.push({
          itemCode: data["Item Code"],
          itemName: data["Item Name"],
          itemQuantity: data["Qty"],
          itemSellingPrice: data["Selling Price"],
          itemBuyingPrice: data["Buying Price"],
        });
      })
      .on("end", async () => {
        try {
          // Now insert to MongoDB
          if (items.length > 0) {
            const insertedItems = [];
            const updatedItems = [];
            const notFoundItems = [];

            for (const item of items) {
              try {
                const updatedItem = await inventoryModel.findOneAndUpdate(
                  { itemCode: item.itemCode.toUpperCase() },
                  {
                    $set: {
                      itemBuyingPrice: parseInt(item.itemBuyingPrice),
                      itemSellingPrice: parseInt(item.itemSellingPrice),
                    },
                  },
                  {
                    new: true,
                    runValidators: true,
                  }
                );

                if (updatedItem) {
                  updatedItems.push(updatedItem);
                } else {
                  notFoundItems.push(item);
                }
              } catch (error) {
                console.error(`Failed to save ${item}:`, error.message);
                // Continue to next item even if one fails
              }
            }
            console.log(`Saved: ${insertedItems.length}`);
            console.log(`Updated: ${updatedItems.length}`);
            console.log(notFoundItems);
          }
        } catch (error) {
          console.error("Import failed:", error);
          reject(error);
        }
      })
      .on("error", (error) => {
        reject(error);
      });
  });
};

const deleteNewlyAddedItems = async () => {
  await inventoryModel.deleteMany({ itemStatus: { $ne: ITEM_STS_INACTIVE } });

  console.log("deleted");
};
