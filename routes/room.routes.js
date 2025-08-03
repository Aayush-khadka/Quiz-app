import express from "express";
import {
  createRoom,
  isQuizStarted,
  roomLobby,
} from "../controllers/room.controller.js";

const router = express.Router();

router.route("/room/create").post(createRoom);

router.route("/room/lobby/:roomcode").get(roomLobby);

router.route("/room/status/:roomcode").get(isQuizStarted);

export default router;
