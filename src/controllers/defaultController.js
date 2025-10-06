import { ACC_TYPES } from "../constants/accountTypes.js";
import { CONSTANT_SMS } from "../constants/constants.js";
import {
  PAY_INPUT_GENERATED,
  PAY_INPUT_MANUALLY,
} from "../constants/paymentInputType.js";
import { PAY_SC_SERVICE } from "../constants/paymentSource.js";
import { PAY_STATUS_COMPLETED } from "../constants/paymentStatus.js";
import { PAYMENT_TYPE_IN } from "../constants/paymentTypes.js";
import {
  SEQ_GRN,
  SEQ_INVOICE,
  SEQ_PAYMENT,
} from "../constants/sequenceConstants.js";
import { WO_TYPE_REPAIR } from "../constants/workorderTypes.js";
import accountBalanceModel from "../models/accountBalancemodel.js";
import constantModel from "../models/constantModel.js";
import customerModel from "../models/customerModel.js";
import inventoryModel from "../models/inventoryModel.js";
import paymentModel from "../models/paymentModel.js";
import sequenceModel from "../models/sequenceModel.js";
import stockMovementModel from "../models/stockMovementModel.js";
import workOrderModel from "../models/workorderModel.js";
import { calculateItemTotal } from "./workorderController.js";

export const generateAccountTypes = async () => {
  for (const type of ACC_TYPES) {
    const newAcc = new accountBalanceModel({
      accountType: type,
    });
    await newAcc.save();
  }

  console.log("Account Types Generated");
};

// added
export const addSequencesController = async () => {
  await sequenceModel.insertMany([
    { sequenceType: SEQ_GRN },
    { sequenceType: SEQ_INVOICE },
    { sequenceType: SEQ_PAYMENT },
  ]);

  console.log("Sequences Created");
};
