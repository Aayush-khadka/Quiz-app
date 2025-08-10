import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asynchandler } from "../utils/asyncHandler.js";
import groq from "groq-sdk";
import { Questions } from "../models/quizQuestion.model.js";
import dotenv from "dotenv";
dotenv.config();
const groqClient = new groq({
  apiKey: process.env.GROQ_API_KEY,
});

export const getQuestion = asynchandler(async (req, res) => {
  const { roomcode } = req.params;
  console.log(roomcode);

  if (!roomcode) {
    throw ApiError(400, "Missing RoomCode");
  }

  try {
    const result = await Questions.findOne(
      { room_code: roomcode },
      { questions: 1 }
    );

    if (!result) {
      throw new ApiError(404, "No questions found for this room");
    }

    const safeQuestions = result.questions.map(
      ({ _id, question, options }) => ({
        _id,
        question,
        options,
      })
    );

    res
      .status(200)
      .json(new ApiResponse(200, safeQuestions, "Successfully got questions!"));
  } catch (error) {
    console.error(error);
    throw new ApiError(500, "Could not fetch questions from database!");
  }
});

export const getCorrectAnswer = asynchandler(async (req, res) => {
  const { questionId, selectedOption } = req.body;

  if (!questionId || !selectedOption) {
    throw new ApiError(400, "Missing question ID or selected option.");
  }

  const quizDoc = await Questions.findOne({
    "questions._id": questionId,
  }).select("questions");

  if (!quizDoc) {
    throw new ApiError(404, "Question not found in any quiz.");
  }

  const targetQuestion = quizDoc.questions.find((q) =>
    q._id.equals(questionId)
  );

  if (!targetQuestion) {
    throw new ApiError(404, "Question not found.");
  }

  const isCorrect = targetQuestion.correct_option === selectedOption;

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { correct: isCorrect, correctAnswer: targetQuestion.correct_option },
        "Answer checked."
      )
    );
});
export const updateQuestion = asynchandler(async (req, res) => {
  const { question, options, correct_option } = req.body;
  const { id } = req.params;

  if (!id) {
    throw new ApiError(400, "Id of the Question is required!!");
  }

  try {
    const updated = await Questions.findOneAndUpdate(
      { "questions._id": id },
      {
        $set: {
          "questions.$.question": question,
          "questions.$.options": options,
          "questions.$.correct_option": correct_option,
        },
      },
      { new: true }
    );

    if (!updated) {
      throw new ApiError(404, "Question not found!");
    }

    const updatedQuestion = updated.questions.find(
      (q) => q._id.toString() === id
    );

    res
      .status(200)
      .json(new ApiResponse(200, updatedQuestion, "Updated the Question!!"));
  } catch (error) {
    console.error(error);
    throw new ApiError(500, "Failed to update the Question!!!");
  }
});

export const deleteQuestion = asynchandler(async (req, res) => {
  const { id } = req.params;
  if (!id) {
    throw new ApiError(400, "Id of the Question is required!!");
  }

  try {
    const updated = await Questions.findOneAndUpdate(
      { "questions._id": id },
      {
        $pull: { questions: { _id: id } },
        $inc: { number_of_questions: -1 },
      },
      { new: true }
    );

    if (!updated) {
      throw new ApiError(404, "Question not found!");
    }

    res
      .status(200)
      .json(new ApiResponse(200, updated, "Deleted the Question!"));
  } catch (error) {
    console.error(error);
    throw new ApiError(500, "Failed to delete the Question!");
  }
});

export const generateMoreQuestions = asynchandler(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    throw new ApiError(400, "Room ID is required!");
  }

  const questionSet = await Questions.findOne({ _id: id });

  if (!questionSet) {
    throw new ApiError(404, "Quiz room not found!");
  }

  const currentQuestionCount = questionSet.questions.length;
  const maxQuestions = questionSet.no_questions;
  const questionsNeeded = maxQuestions - currentQuestionCount;

  if (questionsNeeded <= 0) {
    throw new ApiError(
      400,
      `Maximum questions limit reached! Current: ${currentQuestionCount}/${maxQuestions}`
    );
  }

  const topic = questionSet.topic;
  const difficulty = questionSet.difficulty;

  const existingQuestions = questionSet.questions.map((q) => q.question);
  const existingQuestionsText =
    existingQuestions.length > 0
      ? `\n\nExisting questions to avoid duplicating:\n${existingQuestions
          .map((q, i) => `${i + 1}. ${q}`)
          .join("\n")}`
      : "";

  const prompt = `Generate exactly ${questionsNeeded} quiz questions about "${topic}" with ${difficulty} difficulty level.
Return ONLY a JSON array in this exact format (no extra text):
[
  {
    "question": "What is 2+2?",
    "options": ["3", "4", "5", "6"],
    "correct_answer": "4"
  }
]

Requirements:
- Exactly ${questionsNeeded} questions
- Each question has exactly 4 options
- correct_answer must match one of the options exactly
- Make sure the correct answer is randomized (not always A, B, C, or D)
- Questions should be unique and different from existing ones
- Match the ${difficulty} difficulty level
- Stay focused on the topic: ${topic}${existingQuestionsText}`;

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
      console.error("JSON Parse Error:", parseError);
      console.error("AI Response:", aiResponse);
      throw new ApiError(500, "AI returned invalid JSON format");
    }

    if (!Array.isArray(quizQuestions)) {
      throw new ApiError(500, "AI didn't return a question array");
    }

    const requestedCount = parseInt(questionsNeeded);
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

    // Format questions to match the database schema
    const newQuestions = quizQuestions.map((element, index) => ({
      question: element.question,
      options: element.options,
      correct_option: element.correct_answer,
      question_number: currentQuestionCount + index + 1, // Continue numbering from existing questions
    }));

    // Update the database with new questions
    const updatedQuestionSet = await Questions.findOneAndUpdate(
      { _id: id },
      { $push: { questions: { $each: newQuestions } } },
      { new: true, runValidators: true }
    );

    if (!updatedQuestionSet) {
      throw new ApiError(500, "Failed to update questions in database");
    }

    console.log(
      `Successfully added ${newQuestions.length} more questions to quiz room ${id}`
    );

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          room_code: updatedQuestionSet.room_code,
          questions_added: newQuestions.length,
          total_questions: updatedQuestionSet.questions.length,
          max_questions: updatedQuestionSet.no_questions,
          topic: updatedQuestionSet.topic,
          difficulty: updatedQuestionSet.difficulty,
        },
        `Successfully generated ${newQuestions.length} additional questions!`
      )
    );
  } catch (error) {
    if (error instanceof ApiError) {
      throw error; // Re-throw our custom errors
    }

    // Handle unexpected errors
    console.error("Generate more questions error:", {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });

    throw new ApiError(
      500,
      "Failed to generate additional questions: " + error.message
    );
  }
});
