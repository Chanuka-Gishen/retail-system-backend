import express from "express";

import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import mongoose from "mongoose";

import router from "./src/routes/index.js";
import { authMiddleware } from "./src/middlewares/auth.js";
import {
  addSequencesController,
  generateAccountTypes,
} from "./src/controllers/defaultController.js";

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;

// Enable CORS for all origins
app.use(cors({ origin: "*" }));

// Middleware for parsing JSON request bodies
app.use(express.json());

// Helmet middleware for setting various HTTP headers for security
app.use(helmet());

// Additional helmet middleware for Cross-Origin Resource Policy
app.use(helmet.crossOriginResourcePolicy({ policy: "cross-origin" }));

// Morgan middleware for logging
app.use(morgan("common"));

app.use(authMiddleware);

app.get("/", (req, res) => res.send("BACKEND"));
app.use("/server", router);

mongoose.connect(process.env.MONGODB_URL);

const db = mongoose.connection;

db.on("error", (error) => {
  console.error("MongoDB connection error:", error);
});

db.once("connected", () => {
  console.log("Connected to MongoDB");

  app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
    //generateAccountTypes()
    //addSequencesController();
  });
});
