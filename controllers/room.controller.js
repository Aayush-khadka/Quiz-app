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
ABSOLUTELY NO:
- <think> tags
- Explanations
- Comments
- Greetings
- Thoughts
- Markdown
- Backticks
- Text before or after the JSON

Your output must begin with "[" and end with "]" and contain ONLY valid JSON in this structure:

[
  {
    "question": "string",
    "options": ["string", "string", "string", "string"],
    "correct_answer": "string"
  }
]

The JSON array must contain exactly ${no_question} questions.
Each question must be complete with all required fields.
If you output anything other than valid JSON, your response will be rejected.
  `.trim();

  const userPrompt = `Generate ${no_question} ${difficulty} quiz questions about ${topic} in EXACT raw JSON array format ONLY, no extra text, no tags, no explanations.`;

  function extractJSONArray(text) {
    // Remove <think> tags first
    let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start === -1 || end === -1 || end <= start) return null;

    return cleaned.slice(start, end + 1).trim();
  }

  function validateQuizQuestions(questions) {
    if (!Array.isArray(questions)) return false;
    if (questions.length !== Number(no_question)) return false;

    return questions.every((q) => {
      // Check if object has all required fields and they're not empty
      if (typeof q !== "object" || !q) return false;
      if (typeof q.question !== "string" || q.question.trim() === "")
        return false;
      if (!Array.isArray(q.options) || q.options.length !== 4) return false;
      if (
        !q.options.every((opt) => typeof opt === "string" && opt.trim() !== "")
      )
        return false;
      if (
        typeof q.correct_answer !== "string" ||
        q.correct_answer.trim() === ""
      )
        return false;
      if (!q.options.includes(q.correct_answer)) return false;

      return true;
    });
  }

  let attempts = 0;
  const maxAttempts = 3;
  let quizQuestions = null;

  while (attempts < maxAttempts && !quizQuestions) {
    attempts++;
    console.log(`Attempt ${attempts} to generate questions...`);

    try {
      const completion = await groqClient.chat.completions.create({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        model: "deepseek-r1-distill-llama-70b",
        temperature: 0.0,
        max_tokens: 3500,
        top_p: 1,
      });

      if (!completion) {
        console.log(`Attempt ${attempts}: No completion received`);
        continue;
      }

      const aiResponse = completion.choices[0]?.message?.content || "";

      console.log("=".repeat(80));
      console.log(`Attempt ${attempts} AI Response:`, aiResponse);
      console.log("=".repeat(80));

      const jsonString = extractJSONArray(aiResponse);
      if (!jsonString) {
        console.log(`Attempt ${attempts}: No valid JSON array found`);
        continue;
      }

      try {
        const parsed = JSON.parse(jsonString);
        if (validateQuizQuestions(parsed)) {
          quizQuestions = parsed;
          console.log(`✅ Success on attempt ${attempts}!`);
          break;
        } else {
          console.log(`Attempt ${attempts}: Validation failed`);
        }
      } catch (parseErr) {
        console.log(`Attempt ${attempts}: JSON parse error:`, parseErr.message);
      }
    } catch (error) {
      console.log(`Attempt ${attempts}: Request error:`, error.message);
    }
  }

  if (!quizQuestions) {
    throw new ApiError(
      500,
      `Failed to generate valid questions after ${maxAttempts} attempts`
    );
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

export const roomInfo = asynchandler(async (req, res) => {
  const { roomcode } = req.params;

  const info = await Questions.findOne(
    { room_code: roomcode },
    { difficulty: 1, no_questions: 1, topic: 1 }
  );

  if (!info) {
    throw new ApiError(404, "Room with that code not found!!");
  }

  res.status(200).json(new ApiResponse(200, info, "Got Room info"));
});

export const quizStarted = asynchandler(async (req, res) => {
  const { roomcode } = req.params;

  const updatedQuiz = await Questions.findOneAndUpdate(
    { room_code: roomcode },
    { $set: { quizStarted: true } },
    { new: true }
  );

  if (!updatedQuiz) {
    return res.status(404).json(new ApiResponse(404, null, "Room not found"));
  }

  res
    .status(200)
    .json(
      new ApiResponse(200, updatedQuiz, "Updated quiz status successfully!")
    );
});
