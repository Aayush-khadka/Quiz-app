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
- Explanations
- Comments
- Greetings
- Thoughts
- <think> tags
- Markdown
- Backticks
- Text before or after the JSON

Your output must begin with "[" and end with "]" and contain ONLY valid JSON in this structure:

[
  {
    "question": "string",
    "options": ["string", "string", "string", "string"],
    "correct_answer": "string" // must exactly match one of the options
  }
]

The JSON array must contain exactly ${no_question} questions.
If you output anything other than valid JSON, your response will be rejected.
  `.trim();

  const userPrompt = `Generate ${no_question} ${difficulty} quiz questions about ${topic} in EXACT raw JSON array format ONLY, no extra text, no tags, no explanations.`;

  function extractJSONArray(text) {
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start === -1 || end === -1 || end <= start) return null;
    return text.slice(start, end + 1).trim();
  }

  function validateQuizQuestions(questions) {
    if (!Array.isArray(questions)) return false;
    if (questions.length !== Number(no_question)) return false;
    return questions.every(
      (q) =>
        typeof q === "object" &&
        typeof q.question === "string" &&
        Array.isArray(q.options) &&
        q.options.length === 4 &&
        q.options.every((opt) => typeof opt === "string") &&
        typeof q.correct_answer === "string" &&
        q.options.includes(q.correct_answer)
    );
  }

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
    throw new ApiError(500, "Failed to generate questions from AI.");
  }

  const aiResponse = completion.choices[0]?.message?.content || "";

  // console.log(
  //   "=========================================================================="
  // );

  // console.log("AI Response:", aiResponse);

  // console.log(
  //   "=========================================================================="
  // );

  const jsonString = extractJSONArray(aiResponse);
  if (!jsonString) {
    throw new ApiError(500, "No valid JSON array found in AI response.", [
      aiResponse,
    ]);
  }

  let quizQuestions;
  try {
    const parsed = JSON.parse(jsonString);
    if (!validateQuizQuestions(parsed)) {
      throw new Error("JSON structure or length is invalid.");
    }
    quizQuestions = parsed;
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
