import { Players } from "../models/players.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asynchandler } from "../utils/asyncHandler.js";
import { v4 as uuidv4 } from "uuid";
import { Questions } from "../models/quizQuestion.model.js";

export const joinLobby = asynchandler(async (req, res) => {
  const { roomcode } = req.params;
  const { name } = req.body;

  if (!roomcode || !name) {
    throw new ApiError(400, "Room code or the player's name is missing!!!");
  }

  const doesRoomExist = await Questions.findOne({ room_code: roomcode });
  if (!doesRoomExist) {
    throw new ApiError(404, "Room with that code not found!!");
  }

  if (doesRoomExist.quizStarted == true) {
    throw new ApiError(
      409,
      "The quiz already started wait for host to start a new game"
    );
  }

  const samePlayerName = await Players.findOne({
    playerName: name,
    room_code: roomcode,
  });
  if (samePlayerName) {
    throw new ApiError(400, "Player with this name is already in lobby!!!");
  }

  const uniqueId = uuidv4();
  const insertPlayer = await Players.create({
    room_code: roomcode,
    playerName: name,
    userId: uniqueId,
  });

  if (!insertPlayer) {
    throw new ApiError(500, "Failed to join the lobby!!");
  }

  res.status(200).json(
    new ApiResponse(
      200,
      {
        room_code: roomcode,
        userId: uniqueId,
        playerName: name,
      },
      "Successfully joined the room"
    )
  );
});
export const host = asynchandler(async (req, res) => {
  const { roomcode } = req.params;
  console.log(roomcode);

  if (!roomcode) {
    throw new ApiError(400, "Missing Roomcode");
  }

  const hostName = await Questions.findOne(
    { room_code: roomcode },
    {
      host_name: 1,
    }
  );
  if (!hostName) {
    throw new ApiError(500, "failed to fetch Host name!!");
  }

  console.log("=========================");
  console.log(hostName);
  console.log("=========================");

  res.status(200).json(new ApiResponse(200, hostName, "Got Hostname"));
});
