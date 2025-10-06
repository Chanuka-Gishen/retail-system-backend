import Joi from "joi";
import {
  GENDER_FEMALE,
  GENDER_MALE,
  GENDER_OTHER,
} from "../../constants/gender.js";
import {
  MARTIAL_STS_DIVORCED,
  MARTIAL_STS_MARRIED,
  MARTIAL_STS_SEPERATED,
  MARTIAL_STS_SINGLE,
  MARTIAL_STS_WIDOWED,
} from "../../constants/martialStatus.js";
import {
  EMP_RELATION_CHILDREN,
  EMP_RELATION_FAMILY,
  EMP_RELATION_OTHER,
  EMP_RELATION_RELATIVE,
  EMP_RELATION_SPOUSE,
} from "../../constants/empRelationshipConstants.js";
import { EMP_ROLES } from "../../constants/empRole.js";

export const employeeSchema = Joi.object({
  empFullName: Joi.string().required().max(100).messages({
    "string.empty": "Full name is required",
    "string.max": "Full name cannot exceed 100 characters",
  }),

  empDob: Joi.date().required().max("now").messages({
    "date.base": "Date of birth must be a valid date",
    "date.max": "Date of birth cannot be in the future",
  }),

  empGender: Joi.string()
    .valid(GENDER_MALE, GENDER_FEMALE, GENDER_OTHER)
    .required()
    .messages({
      "any.only": "Gender must be one of Male, Female, or Other",
      "string.empty": "Gender is required",
    }),

  empMaritalStatus: Joi.string()
    .valid(
      MARTIAL_STS_SINGLE,
      MARTIAL_STS_MARRIED,
      MARTIAL_STS_DIVORCED,
      MARTIAL_STS_SEPERATED,
      MARTIAL_STS_WIDOWED
    )
    .default(MARTIAL_STS_SINGLE)
    .messages({
      "any.only": "Invalid marital status",
    }),

  empEmail: Joi.string()
    .email({ tlds: { allow: false } })
    .allow("", null)
    .lowercase()
    .default("")
    .messages({
      "string.email": "Please provide a valid email address",
    }),

  empNic: Joi.string().required().messages({
    "string.empty": "NIC is required",
  }),

  empPhone: Joi.string()
    .required()
    .pattern(/^[0-9]{10}$/)
    .messages({
      "string.pattern.base": "Phone number must be 10 digits",
      "string.empty": "Phone number is required",
    }),

  empEmergencyContact: Joi.object({
    name: Joi.string().allow("", null).default("").messages({
      "string.base": "Emergency contact name must be a string",
    }),
    relationship: Joi.string()
      .valid(
        EMP_RELATION_CHILDREN,
        EMP_RELATION_FAMILY,
        EMP_RELATION_OTHER,
        EMP_RELATION_RELATIVE,
        EMP_RELATION_SPOUSE
      )
      .allow("", null)
      .default("")
      .messages({
        "string.base": "Emergency contact relationship must be a string",
      }),
    phone: Joi.string()
      .allow("", null)
      .pattern(/^[0-9]{10}$/)
      .default("")
      .messages({
        "string.pattern.base": "Emergency phone must be 10 digits if provided",
        "string.base": "Emergency contact phone must be a string",
      }),
  }),

  empAddress: Joi.object({
    street: Joi.string().required().messages({
      "string.empty": "Street address is required",
    }),
    city: Joi.string().required().messages({
      "string.empty": "City is required",
    }),
    province: Joi.string().allow("", null).default("").messages({
      "string.base": "Province must be a string",
    }),
    postalCode: Joi.string().allow("", null).default("").messages({
      "string.base": "Postal code must be a string",
    }),
    country: Joi.string().default("Sri Lanka").messages({
      "string.empty": "Country is required",
    }),
  }).required(),

  empId: Joi.string().required().messages({
    "string.base": "Employee Id must be a string",
    "string.empty": "Employee Id is required",
  }),

  empJobTitle: Joi.string().required().messages({
    "string.empty": "Job title is required",
  }),

  empRole: Joi.string()
    .valid(...EMP_ROLES)
    .required()
    .messages({
      "any.only": "Invalid employee role",
      "string.empty": "Employee role is required",
    }),

  empEmploymentType: Joi.string()
    .valid("Full-time", "Part-time", "Contract", "Temporary", "Intern")
    .required()
    .messages({
      "any.only": "Invalid employment type",
      "string.empty": "Employment type is required",
    }),

  empHireDate: Joi.date().default(Date.now).max("now").messages({
    "date.max": "Hire date cannot be in the future",
  }),

  empTerminationDate: Joi.date().greater(Joi.ref("empHireDate")).messages({
    "date.greater": "Termination date must be after hire date",
  }),

  empIsActive: Joi.boolean().default(true),

  empBankDetails: Joi.object({
    accountNumber: Joi.string().allow("", null).default("").messages({
      "string.base": "Account number should be a string",
    }),
    bankName: Joi.string().allow("", null).default("").messages({
      "string.base": "Bank name should be a string",
    }),
    branch: Joi.string().allow("", null).default("").messages({
      "string.base": "Branch should be a string",
    }),
    accountType: Joi.string()
      .valid("current", "Savings")
      .allow("", null)
      .default("Savings")
      .messages({
        "any.only": "Account type must be either current or Savings",
      }),
  }).required(),

  empLeaveBalance: Joi.object({
    vacation: Joi.number().min(0).default(0),
    sick: Joi.number().min(0).default(0),
    personal: Joi.number().min(0).default(0),
  }),
});
