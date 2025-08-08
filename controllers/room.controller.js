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
You are a strict quiz question generator API.

**Your ONLY allowed output is a valid JSON array.**

Do NOT output anything other than this JSON array — no explanations, no comments, no greetings, no thoughts, no <think> tags, no markdown formatting, no backticks, no text before or after the JSON array.

If you output anything other than a pure JSON array exactly matching the format, your response will be rejected and considered invalid.

Each quiz object must have:
- "question": a string
- "options": an array of exactly 4 strings
- "correct_answer": a string that matches exactly one of the options

Example valid output:

[
  {
    "question": "What is the capital of France?",
    "options": ["Paris", "Berlin", "Madrid", "Rome"],
    "correct_answer": "Paris"
  }
]

No other content or formatting is allowed.
Failure to comply will result in your response being rejected.
`;

  const userPrompt = `Generate ${no_question} ${difficulty} quiz questions about ${topic} in the EXACT raw JSON array format ONLY, no extra text.`;

  // Extracts the first valid JSON array found in the text
  function extractJSONArray(text) {
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start === -1 || end === -1 || end <= start) {
      return null;
    }
    return text.slice(start, end + 1).trim();
  }

  // Validate that each question object has the correct structure and valid data
  function validateQuizQuestions(questions) {
    if (!Array.isArray(questions)) return false;
    if (questions.length !== Number(no_question)) return false;
    for (const q of questions) {
      if (
        typeof q !== "object" ||
        typeof q.question !== "string" ||
        !Array.isArray(q.options) ||
        q.options.length !== 4 ||
        !q.options.every((opt) => typeof opt === "string") ||
        typeof q.correct_answer !== "string" ||
        !q.options.includes(q.correct_answer)
      ) {
        return false;
      }
    }
    return true;
  }

  let quizQuestions = null;
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const completion = await groqClient.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt.trim() },
        { role: "user", content: userPrompt.trim() },
      ],
      model: "deepseek-r1-distill-llama-70b",
      temperature: 0.0, // lower for consistent output
      max_tokens: 3000,
      top_p: 1,
    });

    if (!completion) {
      if (attempt === maxRetries) {
        throw new ApiError(
          500,
          "Failed to generate questions after multiple attempts."
        );
      }
      continue;
    }

    const aiResponse = completion.choices[0]?.message?.content || "";
    console.log(`AI Response attempt ${attempt}:`, aiResponse);

    const jsonString = extractJSONArray(aiResponse);
    if (!jsonString) {
      if (attempt === maxRetries) {
        throw new ApiError(500, "No valid JSON array found in AI response.", [
          aiResponse,
        ]);
      }
      continue;
    }

    try {
      const parsed = JSON.parse(jsonString);
      if (validateQuizQuestions(parsed)) {
        quizQuestions = parsed;
        break; // Valid output, stop retrying
      } else {
        if (attempt === maxRetries) {
          throw new ApiError(
            500,
            "Parsed JSON array is invalid or length mismatch.",
            [jsonString]
          );
        }
      }
    } catch (err) {
      if (attempt === maxRetries) {
        throw new ApiError(500, "Failed to parse AI JSON output.", [
          jsonString,
        ]);
      }
    }
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
