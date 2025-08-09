import express from "express";
import {
  createRoom,
  isQuizStarted,
  roomLobby,
  roomInfo,
} from "../controllers/room.controller.js";

const router = express.Router();

router.route("/room/create").post(createRoom);

router.route("/room/lobby/:roomcode").get(roomLobby);

router.route("/room/status/:roomcode").get(isQuizStarted);

router.route("/room/info/:roomcode").get(roomInfo);

export default router;
