import { asynchandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import dotenv from "dotenv";
import groq from "groq-sdk";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Questions } from "../models/quizQuestion.model.js";
import { generateRoomCode } from "../services/roomCodeGenerator.js";

dotenv.config();

const groqClient = new groq({
  apiKey: process.env.GROQ_API_KEY,
});

export const createRoom = asynchandler(async (req, res) => {
  const { topic, difficulty, no_question, host_name } = req.body;

  if (!topic || !difficulty || !no_question || !host_name) {
    throw new ApiError(
      400,
      "Enter Topic, Difficulty, Host Name, and Number of Questions!"
    );
  }

  const systemPrompt = `
You are a quiz generator bot.
ONLY return a raw JSON array of ${no_question} quiz questions about "${topic}" at "${difficulty}" difficulty.
Strictly avoid any explanations, markdown, or text outside of the JSON array.
Each question object must contain:
- question (string)
- options (array of 4 strings)
- correct_answer (string that matches one of the options)
`;

  const userPrompt = `Generate ${no_question} ${difficulty} quiz questions about ${topic} in raw JSON array format ONLY.`;

  const completion = await groqClient.chat.completions.create({
    messages: [
      { role: "system", content: systemPrompt.trim() },
      { role: "user", content: userPrompt.trim() },
    ],
    model: "qwen/qwen3-32b",
    temperature: 0.7,
    max_tokens: 1500,
    top_p: 1,
  });

  if (!completion) {
    throw new ApiError(
      500,
      "Failed to generate questions. Please try creating the room again!"
    );
  }

  let aiResponse = completion.choices[0]?.message?.content || "";

  // Extract only the JSON array part
  const jsonStart = aiResponse.indexOf("[");
  const jsonEnd = aiResponse.lastIndexOf("]") + 1;

  if (jsonStart === -1 || jsonEnd === -1) {
    throw new ApiError(500, "No valid JSON array found in AI response.", [
      aiResponse,
    ]);
  }

  const jsonString = aiResponse.slice(jsonStart, jsonEnd).trim();

  let quizQuestions;
  try {
    quizQuestions = JSON.parse(jsonString);
  } catch (err) {
    throw new ApiError(500, "Failed to parse AI JSON output.", [jsonString]);
  }

  const room_code = generateRoomCode();

  const allQuestions = quizQuestions.map((element) => ({
    question: element.question,
    options: element.options,
    correct_option: element.correct_answer,
  }));

  try {
    await Questions.create({
      topic,
      difficulty,
      no_questions: no_question,
      room_code,
      host_name,
      questions: allQuestions,
    });

    console.log("Successfully entered questions in database.");
    return res
      .status(201)
      .json(
        new ApiResponse(
          200,
          room_code,
          "Quiz successfully generated based on the requirements!"
        )
      );
  } catch (error) {
    console.error("Failed to save questions to database:", error);
    throw new ApiError(500, "Database insertion failed");
  }
});

export const roomLobby = asynchandler(async (req, res) => {
  const { roomcode } = req.params;

  if (!roomcode) {
    throw new ApiError(400, "Room Id is Missing!!");
  }

  try {
    const questions = await Questions.find({ room_code: roomcode });

    if (!questions) {
      throw new ApiError(404, `Room with ID:${roomcode} not Found!!!`);
    }

    res
      .status(200)
      .json(
        new ApiResponse(200, questions, "Sucessfully feteched Questions!!")
      );
  } catch (error) {
    console.error("Error in Fetching RoomData from Server:", error);
    throw new ApiError(503, "failed to get request from server!!");
  }
});

export const isQuizStarted = asynchandler(async (req, res) => {
  const { roomcode } = req.params;

  const room = await Questions.findOne({ room_code: roomcode });

  if (room.quizStarted == false) {
    res.status(200).json(new ApiResponse(200, false, "Quiz has not Started!!"));
  } else {
    res.status(200).json(new ApiResponse(200, true, "Quiz Started!!"));
  }
});
