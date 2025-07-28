import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const MONGO_URL = process.env.MONGODB_URI;

const Connect_db = async () => {
  try {
    await mongoose.connect(MONGO_URL);
    console.log("Database is Connected!!");
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

export default Connect_db;
