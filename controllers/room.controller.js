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
You are a strict quiz question generator API that MUST generate EXACTLY ${no_question} questions.

**Your ONLY allowed output is a valid JSON array.**
ABSOLUTELY NO:
- <think> tags or any XML tags
- Explanations before or after JSON
- Comments or markdown
- Greetings or thoughts
- Backticks or code blocks
- Any text outside the JSON array

CRITICAL: Generate EXACTLY ${no_question} questions, no more, no less.

Your output must begin with "[" and end with "]" and contain ONLY valid JSON in this exact structure:

[
  {
    "question": "string",
    "options": ["string", "string", "string", "string"],
    "correct_answer": "string"
  }
]

Requirements:
- Generate EXACTLY ${no_question} questions
- Each question must have exactly 4 options
- The correct_answer must be one of the 4 options
- All fields must be non-empty strings
- No duplicate questions
- Topic: ${topic}
- Difficulty: ${difficulty}

If you output anything other than valid JSON with exactly ${no_question} questions, your response will be rejected.
  `.trim();

  const userPrompt = `Generate EXACTLY ${no_question} ${difficulty} level quiz questions about ${topic}. Output ONLY the raw JSON array with no extra text, tags, or explanations. Must be exactly ${no_question} questions.`;

  function extractJSONArray(text) {
    // Remove any XML tags including <think> tags
    let cleaned = text.replace(/<[^>]*>/g, "").trim();

    // Remove any markdown code blocks
    cleaned = cleaned
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();

    // Find the JSON array boundaries
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");

    if (start === -1 || end === -1 || end <= start) {
      console.log("No valid JSON array found in response");
      return null;
    }

    const jsonString = cleaned.slice(start, end + 1).trim();
    console.log("Extracted JSON string:", jsonString.substring(0, 200) + "...");

    return jsonString;
  }

  function validateQuizQuestions(questions) {
    if (!Array.isArray(questions)) {
      console.log("Validation failed: Not an array");
      return false;
    }

    if (questions.length !== Number(no_question)) {
      console.log(
        `Validation failed: Expected ${no_question} questions, got ${questions.length}`
      );
      return false;
    }

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];

      // Check if object has all required fields and they're not empty
      if (typeof q !== "object" || !q) {
        console.log(
          `Validation failed: Question ${i + 1} is not a valid object`
        );
        return false;
      }

      if (typeof q.question !== "string" || q.question.trim() === "") {
        console.log(
          `Validation failed: Question ${i + 1} has invalid question field`
        );
        return false;
      }

      if (!Array.isArray(q.options) || q.options.length !== 4) {
        console.log(
          `Validation failed: Question ${i + 1} doesn't have exactly 4 options`
        );
        return false;
      }

      if (
        !q.options.every((opt) => typeof opt === "string" && opt.trim() !== "")
      ) {
        console.log(`Validation failed: Question ${i + 1} has invalid options`);
        return false;
      }

      if (
        typeof q.correct_answer !== "string" ||
        q.correct_answer.trim() === ""
      ) {
        console.log(
          `Validation failed: Question ${i + 1} has invalid correct_answer`
        );
        return false;
      }

      if (!q.options.includes(q.correct_answer)) {
        console.log(
          `Validation failed: Question ${i + 1} correct_answer not in options`
        );
        console.log(`Correct answer: "${q.correct_answer}"`);
        console.log(`Options:`, q.options);
        return false;
      }
    }

    return true;
  }

  let attempts = 0;
  const maxAttempts = 5; // Increased attempts
  let quizQuestions = null;

  while (attempts < maxAttempts && !quizQuestions) {
    attempts++;
    console.log(`Attempt ${attempts} to generate ${no_question} questions...`);

    try {
      const completion = await groqClient.chat.completions.create({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        model: "deepseek-r1-distill-llama-70b",
        temperature: 0.1, // Slightly increased for variety but still low
        max_tokens: 4000, // Increased token limit
        top_p: 0.9,
        stop: ["\n\n", "```"], // Stop sequences to prevent extra content
      });

      if (!completion || !completion.choices || !completion.choices[0]) {
        console.log(`Attempt ${attempts}: No completion received`);
        continue;
      }

      const aiResponse = completion.choices[0]?.message?.content || "";

      console.log("=".repeat(50));
      console.log(`Attempt ${attempts} AI Response Length:`, aiResponse.length);
      console.log("First 300 chars:", aiResponse.substring(0, 300));
      console.log(
        "Last 100 chars:",
        aiResponse.substring(aiResponse.length - 100)
      );
      console.log("=".repeat(50));

      const jsonString = extractJSONArray(aiResponse);
      if (!jsonString) {
        console.log(`Attempt ${attempts}: No valid JSON array found`);
        continue;
      }

      try {
        const parsed = JSON.parse(jsonString);
        console.log(`Parsed ${parsed.length} questions`);

        if (validateQuizQuestions(parsed)) {
          quizQuestions = parsed;
          console.log(
            `✅ Success on attempt ${attempts}! Generated ${parsed.length} questions.`
          );
          break;
        } else {
          console.log(`Attempt ${attempts}: Validation failed`);
        }
      } catch (parseErr) {
        console.log(`Attempt ${attempts}: JSON parse error:`, parseErr.message);
        console.log(
          "JSON string that failed to parse:",
          jsonString.substring(0, 500)
        );
      }
    } catch (error) {
      console.log(`Attempt ${attempts}: Request error:`, error.message);

      // Add exponential backoff for rate limiting
      if (
        error.message.includes("rate limit") ||
        error.message.includes("429")
      ) {
        const delay = Math.pow(2, attempts) * 1000; // Exponential backoff
        console.log(`Rate limited. Waiting ${delay}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  if (!quizQuestions) {
    console.error(
      `Failed to generate valid questions after ${maxAttempts} attempts`
    );
    throw new ApiError(
      500,
      `Failed to generate valid questions after ${maxAttempts} attempts. Please try again with different parameters.`
    );
  }

  const room_code = generateRoomCode();
  const allQuestions = quizQuestions.map((element, index) => ({
    question: element.question,
    options: element.options,
    correct_option: element.correct_answer,
    question_number: index + 1, // Adding question number for better tracking
  }));

  try {
    const savedRoom = await Questions.create({
      topic,
      difficulty,
      no_questions: no_question,
      room_code,
      host_name,
      questions: allQuestions,
    });

    console.log(
      `Successfully created room ${room_code} with ${allQuestions.length} questions`
    );
    return res.status(201).json(
      new ApiResponse(
        201, // Changed from 200 to 201 for created resource
        {
          room_code,
          questions_count: allQuestions.length,
          topic,
          difficulty,
        },
        "Quiz successfully generated based on the requirements!"
      )
    );
  } catch (error) {
    console.error("Failed to save questions to database:", error);
    throw new ApiError(500, "Database insertion failed: " + error.message);
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
