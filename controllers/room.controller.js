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
    throw new ApiError(
      400,
      "Enter Topic, Difficulty, similarquestions,  Number of Questions and ID!!"
    );
  }

  const QuestionSet = await Questions.findOne(
    { _id: id },
    {
      topic: 1,
      difficulty: 1,
      questions: 1,
      no_questions: 1,
    }
  );

  const no_question = QuestionSet.no_questions - QuestionSet.questions.length;

  const topic = QuestionSet.topic;
  const difficulty = QuestionSet.difficulty;
  const similarquestions = QuestionSet.questions.map((element) => ({
    question: element.question,
  }));

  if (no_question == 0) {
    throw new ApiError(
      400,
      `According to the previous slections of ${QuestionSet.no_questions} is Already present!!`
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

  const userPrompt = `Generate ${no_question} ${difficulty} quiz questions about ${topic} in JSON array format ONLY. These are already generated Questions so dont repeat this and make sure the question follow similar type and have simialr level of difficulty ${similarquestions}`;

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

  const newQuestions = quizQuestions.map((element) => ({
    question: element.question,
    options: element.options,
    correct_option: element.correct_answer,
  }));

  try {
    const updatedSet = await Questions.findOneAndUpdate(
      { _id: id },
      { $push: { questions: { $each: newQuestions } } },
      { new: true, runValidators: true }
    );

    console.log("Sucessfully Entered More question in Database!!");
    return res
      .status(201)
      .json(
        new ApiResponse(
          200,
          updatedSet,
          "Additional Quiz Questions Successfully Generated Based On the Requirements!"
        )
      );
  } catch (error) {
    console.error("Failed to add new questions:", error);
    throw new ApiError(500, error.message || "Something Went Wrong!!!");
  }
});

export const isHost = asynchandler(async (req, res) => {
  const { host } = req.body;
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
