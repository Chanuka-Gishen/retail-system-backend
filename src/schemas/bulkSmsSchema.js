import Joi from "joi";

import {
  NOTIFICATION_TITLE_GREETINGS,
  NOTIFICATION_TITLE_OFFERS,
} from "../constants/constants.js";

export const bulkSmsSchema = Joi.object({
  messageType: Joi.string()
    .valid(NOTIFICATION_TITLE_GREETINGS, NOTIFICATION_TITLE_OFFERS)
    .required()
    .messages({
      "any.required": "Message type is required",
      "any.only": "Invalid message type",
    }),
  messageContent: Joi.string().max(1600).required().messages({
    "string.max": "Message content cannot exceed 1600 characters",
    "any.required": "Message content is required",
  }),
});
