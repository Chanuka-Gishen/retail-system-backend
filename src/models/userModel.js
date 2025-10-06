import mongoose from "mongoose";
import bcrypt from "bcrypt";
import { excludeuserFieldsPlugin } from "../plugins/userModelPlugin.js";
import { ADMIN_ROLE, STAFF_ROLE, SUPER_ADMIN_ROLE } from "../constants/role.js";

const Schema = mongoose.Schema;

const userSchema = new Schema({
  userFirstName: {
    type: String,
    required: true,
  },
  userLastName: {
    type: String,
    required: true,
  },
  userEmail: {
    type: String,
    required: true,
    lowercase: true,
  },
  userPassword: {
    type: String,
    required: true,
  },
  userRole: {
    type: String,
    enum: [SUPER_ADMIN_ROLE, ADMIN_ROLE, STAFF_ROLE],
    required: true,
  },
  userAccessToken: {
    type: String,
    default: null,
  },
  userIsActive: {
    type: Boolean,
    required: true,
    default: true,
  },
  isUserFirstLogin: {
    type: Boolean,
    required: true,
    default: true,
  },
});

userSchema.pre("save", async function (next) {
  const user = this;

  if (!user.isModified("userPassword")) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(user.userPassword, salt);
    user.userPassword = hashedPassword;
    next();
  } catch (error) {
    return next(error);
  }
});

userSchema.plugin(excludeuserFieldsPlugin);

const userModel = mongoose.model("user", userSchema);

export default userModel;
