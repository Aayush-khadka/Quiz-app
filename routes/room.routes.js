import express from "express";
import {
  createRoom,
  roomLobby,
  updateQuestion,
  deleteQuestion,
  generateMoreQuestions,
  getQuestion,
  getCorrectAnswer,
} from "../controllers/room.controller.js";

const router = express.Router();

router.route("/room/create").post(createRoom);

router.route("/quiz/questions/:roomcode").get(getQuestion);
router.route("/quiz/submit").post(getCorrectAnswer);

router.route("/room/lobby/:roomcode").get(roomLobby);

router.route("/question/update/:id").patch(updateQuestion);
router.route("/question/delete/:id").delete(deleteQuestion);
router.route("/question/generatemorequestions/:id").post(generateMoreQuestions);

export default router;
