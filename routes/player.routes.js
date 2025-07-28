import express from "express";
import { joinLobby, host } from "../controllers/players.controller.js";
const router = express.Router();

router.route("/room/join/:roomcode").post(joinLobby);
router.route("/room/host/:roomcode").get(host);

export default router;
