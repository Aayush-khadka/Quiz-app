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
      "Enter Topic, Difficulty , Host_name and Number of Questions!"
    );
  }

  const systemPrompt = `
You are a quiz generator bot.
ONLY return a JSON array of ${no_question} quiz questions about "${topic}" at "${difficulty}" difficulty.
Strictly avoid explanations, markdown, or any text outside JSON.
Each question should have:
- question (string)
- options (array of 4 strings)
- correct_answer (string matching one option)
`;

  const userPrompt = `Generate ${no_question} ${difficulty} quiz questions about ${topic} in JSON array format ONLY.`;

  const completion = await groqClient.chat.completions.create({
    messages: [
      { role: "system", content: systemPrompt.trim() },
      { role: "user", content: userPrompt.trim() },
    ],
    model: "mistral-saba-24b",
    temperature: 0.7,
    max_tokens: 1500,
    top_p: 1,
  });

  if (!completion) {
    throw ApiError(
      500,
      "Failed To Generate Questions, Click Create Room Again!!"
    );
  }

  let aiResponse = completion.choices[0]?.message?.content || "";

  const jsonStart = aiResponse.indexOf("[");
  if (jsonStart === -1) {
    throw new ApiError(500, "No JSON array found in AI response.", [
      aiResponse,
    ]);
  }

  const jsonString = aiResponse
    .slice(jsonStart)
    .trim()
    .replace(/^```json/, "")
    .replace(/```$/, "");

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
    const roomInfoAndData = await Questions.create({
      topic: topic,
      difficulty: difficulty,
      no_questions: no_question,
      room_code: room_code,
      host_name: host_name,
      questions: allQuestions,
    });
    console.log("Sucessfully Entered question in Database!!");
    return res
      .status(201)
      .json(
        new ApiResponse(
          200,
          room_code,
          "Quiz Successfully Generated Based On the Requirements!"
        )
      );
  } catch (error) {
    console.error("Failed to Enter Questions to Database!!", error);
    throw new ApiError(500, error);
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
