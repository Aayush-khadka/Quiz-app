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
    throw new ApiError(400, "Room Code or the player's Name is Missing!!!");
  }
  const DoesRoomExist = await Questions.findOne({ room_code: roomcode });

  if (!DoesRoomExist) {
    throw new ApiError(404, "Room with that Code Not Found!!");
  }

  const samePlayerName = await Players.findOne({ playerName: name });

  if (samePlayerName) {
    throw new ApiError(400, "Player with this name is Already in Lobby!!!");
  }

  const uniqueId = uuidv4();

  const insertPlayer = await Players.create({
    room_code: roomcode,
    playerName: name,
    userId: uniqueId,
  });
  if (!insertPlayer) {
    throw new ApiError(500, "Failed To join the Lobby!!");
  }

  res.status(200).json(new ApiResponse(200, insertPlayer, "Room exists"));
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

  res.status(200).json(new ApiResponse(200, hostName, "Got Hostname"));
});
