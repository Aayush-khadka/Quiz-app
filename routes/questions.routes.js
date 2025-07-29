import express from "express";

import {
  getQuestion,
  getCorrectAnswer,
  generateMoreQuestions,
  updateQuestion,
  deleteQuestion,
} from "../controllers/question.controller.js";
const router = express.Router();

router.route("/quiz/questions/:roomcode").get(getQuestion);
router.route("/quiz/submit").post(getCorrectAnswer);

router.route("/question/update/:id").patch(updateQuestion);
router.route("/question/delete/:id").delete(deleteQuestion);
router.route("/question/generatemorequestions/:id").post(generateMoreQuestions);

export default router;
