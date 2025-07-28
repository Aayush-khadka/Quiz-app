import mongoose from "mongoose";
import { Questions } from "../models/quizQuestion.model.js";
import { Players } from "../models/players.model.js";

const MONGO_URI =
  "mongodb+srv://khadkaaayush90:Aayushpass123@quiz-question.dhkmsek.mongodb.net/?retryWrites=true&w=majority&appName=Quiz-Question"; // Replace with your actual MongoDB URI

async function deleteAllArticles() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log("Connected successfully!");

    const result = await Questions.deleteMany({});
    const resultPlayers = await Players.deleteMany({});
    console.log(`Deleted ${result.deletedCount} Questions.`);
    console.log(`Deleted ${resultPlayers.deletedCount} Players`);

    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
  } catch (error) {
    console.error("Error deleting articles:", error);
  }
}

deleteAllArticles();
