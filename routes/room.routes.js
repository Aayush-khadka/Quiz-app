import express from "express";
import { createRoom, roomLobby } from "../controllers/room.controller.js";

const router = express.Router();

router.route("/room/create").post(createRoom);

router.route("/room/lobby/:roomcode").get(roomLobby);

export default router;
