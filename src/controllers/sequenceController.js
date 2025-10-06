import { SEQUENCE_VALUES } from "../constants/sequenceConstants.js";
import sequenceModel from "../models/sequenceModel.js";


export const addSequence = async () => {
  const existingSequences = await sequenceModel.find();

  for (const type of SEQUENCE_VALUES) {
    const existingSequence = existingSequences.find(
      (sequence) => sequence.sequenceType === type
    );

    if (!existingSequence) {
      await sequenceModel.create({ sequenceType: type });
    }
  }

  return;
};

export const getSequenceValue = async (type) => {
  const result = await sequenceModel.findOne({ sequenceType: type });
  return result.sequenceValue;
};

export const updateSequenceValue = async (type) => {
  const sequence = await sequenceModel.findOne({ sequenceType: type });
  sequence.sequenceValue += 1;

  return await sequence.save();
};
