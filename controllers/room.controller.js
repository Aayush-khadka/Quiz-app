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
  const prompt = `Generate exactly ${no_question} quiz questions about "${topic}" with ${difficulty} difficulty level.
Return ONLY a JSON array in this exact format (no extra text):
[
  {
    "question": "What is 2+2?",
    "options": ["3", "4", "5", "6"],
    "correct_answer": "4"
  }
]
Requirements:
- Exactly ${no_question} questions
- Each question has exactly 4 options
- correct_answer must match one of the options exactly
- make sure the correct answer is randomized is not alaways a single option like not always A OR B OR C OR D make sure it's randomized`;
  try {
    const completion = await groqClient.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "deepseek-r1-distill-llama-70b",
      temperature: 0.3,
      max_tokens: 3000,
    });
    const aiResponse = completion.choices[0]?.message?.content || "";
    let jsonString = aiResponse.trim();
    if (jsonString.includes("```json")) {
      const start = jsonString.indexOf("[");
      const end = jsonString.lastIndexOf("]");
      if (start !== -1 && end !== -1) {
        jsonString = jsonString.substring(start, end + 1);
      }
    } else if (!jsonString.startsWith("[")) {
      const start = jsonString.indexOf("[");
      const end = jsonString.lastIndexOf("]");
      if (start !== -1 && end !== -1) {
        jsonString = jsonString.substring(start, end + 1);
      }
    }
    let quizQuestions;
    try {
      quizQuestions = JSON.parse(jsonString);
    } catch (parseError) {
      throw new ApiError(500, "AI returned invalid JSON format");
    }

    if (!Array.isArray(quizQuestions)) {
      throw new ApiError(500, "AI didn't return a question array");
    }

    // Take only the requested number of questions (slice the array)
    const requestedCount = parseInt(no_question);
    if (quizQuestions.length > requestedCount) {
      console.log(
        `AI returned ${quizQuestions.length} questions, taking first ${requestedCount}`
      );
      quizQuestions = quizQuestions.slice(0, requestedCount);
    } else if (quizQuestions.length < requestedCount) {
      throw new ApiError(
        500,
        `AI returned insufficient questions: expected ${requestedCount} but got ${quizQuestions.length}`
      );
    }

    // Validate each question
    for (let i = 0; i < quizQuestions.length; i++) {
      const q = quizQuestions[i];
      if (!q.question || !q.options || !q.correct_answer) {
        throw new ApiError(500, `Question ${i + 1} is missing required fields`);
      }
      if (!Array.isArray(q.options) || q.options.length !== 4) {
        throw new ApiError(
          500,
          `Question ${i + 1} must have exactly 4 options`
        );
      }
      if (!q.options.includes(q.correct_answer)) {
        throw new ApiError(
          500,
          `Question ${i + 1} correct answer doesn't match any option`
        );
      }
    }

    const room_code = generateRoomCode();
    const allQuestions = quizQuestions.map((element, index) => ({
      question: element.question,
      options: element.options,
      correct_option: element.correct_answer,
      question_number: index + 1,
    }));
    const savedRoom = await Questions.create({
      topic,
      difficulty,
      no_questions: no_question,
      room_code,
      host_name,
      questions: allQuestions,
    });
    return res.status(201).json(
      new ApiResponse(
        201,
        {
          room_code,
          questions_count: allQuestions.length,
          topic,
          difficulty,
        },
        "Quiz successfully generated!"
      )
    );
  } catch (error) {
    if (error instanceof ApiError) {
      throw error; // Re-throw our custom errors
    }
    // Handle unexpected errors
    console.error("Full error details:", {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });
    throw new ApiError(500, "Failed to create quiz room: " + error.message);
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
