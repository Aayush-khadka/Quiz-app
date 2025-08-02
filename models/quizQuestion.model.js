import mongoose, { Schema } from "mongoose";

const questionitemSchema = new Schema({
  question: {
    type: String,
    required: true,
  },
  options: {
    type: [String],
    required: true,
  },
  correct_option: {
    type: String,
    required: true,
  },
});

const questionsSchema = new Schema({
  topic: {
    type: String,
    required: true,
  },
  difficulty: {
    type: String,
    required: true,
  },
  no_questions: {
    type: Number,
    required: true,
  },

  room_code: {
    type: String,
    required: true,
  },
  host_name: {
    type: String,
    required: true,
  },
  questions: {
    type: [questionitemSchema],
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 24 * 60 * 60,
  },
});

export const Questions = new mongoose.model("QuestionSet", questionsSchema);
