import mongoose from "mongoose";
import { Questions } from "../models/quizQuestion.model.js";
import { Players } from "../models/players.model.js";

const MONGO_URI =
  "mongodb+srv://khadkaaayush90:Aayushpass123@quiz-question.dhkmsek.mongodb.net/?retryWrites=true&w=majority&appName=Quiz-Question";

async function deleteAllArticles() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log("Connected successfully!");

    // Drop TTL index on createdAt if it exists
    const db = mongoose.connection.db;
    const collection = db.collection("questionsets"); // Mongoose model "Questions" -> MongoDB collection "questionsets"

    const indexes = await collection.indexes();
    const ttlIndex = indexes.find(
      (idx) => idx.key?.createdAt === 1 && idx.expireAfterSeconds !== undefined
    );

    if (ttlIndex) {
      await collection.dropIndex(ttlIndex.name);
      console.log(`Dropped TTL index: ${ttlIndex.name}`);
    } else {
      console.log("No TTL index on 'createdAt' found.");
    }

    // Delete documents
    const result = await Questions.deleteMany({});
    const resultPlayers = await Players.deleteMany({});
    console.log(`Deleted ${result.deletedCount} Questions.`);
    console.log(`Deleted ${resultPlayers.deletedCount} Players`);

    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
  } catch (error) {
    console.error("Error deleting articles or dropping TTL index:", error);
  }
}

deleteAllArticles();
