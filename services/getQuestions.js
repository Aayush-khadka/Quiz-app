import { Questions } from "../models/quizQuestion.model.js";

export const getQuestionsFromDB = async (roomCode) => {
  try {
    console.log("Connected successfully!");

    const result = await Questions.findOne(
      { room_code: roomCode },
      {
        questions: 1,
      }
    );
  } catch (error) {
    console.error("Error deleting articles:", error);
  }
};
