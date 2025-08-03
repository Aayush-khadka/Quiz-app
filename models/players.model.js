import { getRequiredHeader } from "groq-sdk/core.mjs";
import mongoose, { Schema } from "mongoose";

const playerSchema = new Schema({
  room_code: {
    type: String,
    required: true,
  },
  playerName: {
    type: String,
    required: true,
  },
  userId: {
    type: String,
    required: true,
  },
  Score: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    default: "online",
  },
  isHost: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 86400,
  },
});

export const Players = new mongoose.model("Players", playerSchema);
