import { ACC_TYPES } from "../constants/accountTypes.js";
import {
  SEQ_GRN,
  SEQ_INVOICE,
  SEQ_PAYMENT,
} from "../constants/sequenceConstants.js";
import accountBalanceModel from "../models/accountBalancemodel.js";
import sequenceModel from "../models/sequenceModel.js";

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
