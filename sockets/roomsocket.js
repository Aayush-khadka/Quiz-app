// import { getQuestionsFromDB } from "../services/getQuestions.js";
// import { Players } from "../models/players.model.js";
// import { Questions } from "../models/quizQuestion.model.js";
// import { v4 as uuidv4 } from "uuid";

// export default function roomSocketHandler(io) {
//   const disconnectTimers = {};
//   let roomScores = {};
//   io.on("connection", (socket) => {
//     console.log("🔌 Socket connected:", socket.id);

//     socket.on("create-room", async ({ roomCode, hostName }) => {
//       try {
//         socket.join(roomCode);
//         socket.playerName = hostName;
//         socket.roomCode = roomCode;

//         console.log(`🟢 Room ${roomCode} created by ${hostName}`);

//         const hostUserId = uuidv4();

//         const existing = await Players.findOne({
//           room_code: roomCode,
//           playerName: hostName,
//         });

//         if (!existing) {
//           await Players.create({
//             playerName: hostName,
//             room_code: roomCode,
//             userId: hostUserId,
//             Score: 0,
//             status: "online",
//             isHost: true,
//             socketId: socket.id,
//           });
//         } else {
//           await Players.updateOne(
//             { _id: existing._id },
//             {
//               status: "online",
//               socketId: socket.id,
//               isHost: true,
//             }
//           );
//         }

//         const players = await Players.find({
//           room_code: roomCode,
//           status: "online",
//         });

//         io.to(roomCode).emit(
//           "room-players-updated",
//           players.map((p) => p.playerName)
//         );

//         socket.emit("room-created", { roomCode, hostName });
//       } catch (error) {
//         console.error("Error creating room:", error);
//         socket.emit("room-creation-failed", error.message);
//       }
//     });

//     socket.on("get-lobby-players", async ({ roomCode }) => {
//       try {
//         if (!roomCode) {
//           return socket.emit("lobby-players-failed", "Missing room code");
//         }

//         const players = await Players.find({
//           room_code: roomCode,
//           status: "online",
//         });

//         socket.emit(
//           "lobby-players-success",
//           players.map((p) => ({
//             name: p.playerName,
//             isHost: p.isHost,
//             status: p.status,
//           }))
//         );
//       } catch (error) {
//         console.error("Error fetching lobby players:", error);
//         socket.emit("lobby-players-failed", "Failed to fetch players");
//       }
//     });

//     socket.on("join-room", async ({ roomCode, playerName, userId }) => {
//       try {
//         socket.join(roomCode);
//         socket.playerName = playerName;
//         socket.roomCode = roomCode;
//         socket.userId = userId;

//         const roomExists = await Questions.findOne({ room_code: roomCode });
//         if (!roomExists) {
//           socket.emit("join-failed", "Room not found");
//           return;
//         }

//         // Check if player already exists
//         let player = await Players.findOne({
//           room_code: roomCode,
//           playerName: playerName,
//         });

//         if (!player && userId) {
//           // Try to find by userId
//           player = await Players.findOne({ userId });
//         }

//         if (player) {
//           await Players.updateOne(
//             { _id: player._id },
//             { status: "online", socketId: socket.id }
//           );
//         } else {
//           // Create new player
//           const newUserId = userId || uuidv4();
//           await Players.create({
//             playerName,
//             room_code: roomCode,
//             userId: newUserId,
//             Score: 0,
//             status: "online",
//             isHost: false,
//             socketId: socket.id,
//           });
//           socket.userId = newUserId;
//         }

//         const players = await Players.find({
//           room_code: roomCode,
//           status: "online",
//         });

//         io.to(roomCode).emit(
//           "room-players-updated",
//           players.map((p) => p.playerName)
//         );

//         socket.emit("joined-successfully", { roomCode, playerName });

//         console.log(`👤 Player ${playerName} joined room ${roomCode}`);
//       } catch (error) {
//         console.error("Error joining room:", error);
//         socket.emit("join-failed", error.message);
//       }
//     });

//     socket.on("delete-room", async ({ roomCode }) => {
//       try {
//         const player = await Players.findOne({
//           room_code: roomCode,
//         });

//         if (!player || !player.isHost) {
//           socket.emit(
//             "delete-room-failed",
//             "Only the host can delete the room"
//           );
//           return;
//         }

//         console.log(`🗑️ Host manually deleting room ${roomCode}`);

//         const players = await Players.find({ room_code: roomCode });

//         for (const roomPlayer of players) {
//           if (roomPlayer.socketId && roomPlayer.socketId !== socket.id) {
//             const playerSocket = io.sockets.sockets.get(roomPlayer.socketId);
//             if (playerSocket) {
//               playerSocket.emit(
//                 "room-closed",
//                 "Room has been deleted by the host."
//               );
//               playerSocket.disconnect(true);
//             }
//           }
//         }

//         await Questions.deleteOne({ room_code: roomCode });
//         await Players.deleteMany({ room_code: roomCode });

//         for (const roomPlayer of players) {
//           if (disconnectTimers[roomPlayer.userId]) {
//             clearTimeout(disconnectTimers[roomPlayer.userId]);
//             delete disconnectTimers[roomPlayer.userId];
//           }
//         }

//         socket.emit("room-deleted-successfully");
//         console.log(`✅ Room ${roomCode} deleted successfully`);
//       } catch (error) {
//         console.error("Error deleting room:", error);
//         socket.emit("delete-room-failed", error.message);
//       }
//     });
//     socket.on("rejoin-room", async ({ userId }) => {
//       try {
//         const player = await Players.findOne({ userId });
//         if (!player) {
//           socket.emit("rejoin-failed", "Session expired or player not found");
//           return;
//         }

//         socket.userId = userId;
//         socket.playerName = player.playerName;
//         socket.roomCode = player.room_code;
//         socket.join(player.room_code);

//         await Players.updateOne(
//           { userId },
//           { status: "online", socketId: socket.id }
//         );

//         const players = await Players.find({
//           room_code: player.room_code,
//           status: "online",
//         });

//         io.to(player.room_code).emit(
//           "room-players-updated",
//           players.map((p) => p.playerName)
//         );

//         socket.emit("rejoin-success", {
//           playerName: player.playerName,
//           roomCode: player.room_code,
//           players: players.map((p) => p.playerName),
//         });
//       } catch (error) {
//         console.error("Error rejoining room:", error);
//         socket.emit("rejoin-failed", error.message);
//       }
//     });

//     socket.on("disconnect", async () => {
//       const { userId, roomCode, playerName } = socket;
//       if (!userId || !roomCode) return;

//       try {
//         await Players.updateOne(
//           { userId },
//           { status: "offline", socketId: null }
//         );

//         // Clear any existing timer for this user
//         if (disconnectTimers[userId]) {
//           clearTimeout(disconnectTimers[userId]);
//           delete disconnectTimers[userId];
//         }

//         // Notify other players about updated list (optional: show online only)
//         const remainingPlayers = await Players.find({
//           room_code: roomCode,
//           status: "online",
//         });

//         io.to(roomCode).emit(
//           "room-players-updated",
//           remainingPlayers.map((p) => p.playerName)
//         );

//         console.log(`🔌 Player ${playerName} disconnected (marked offline)`);
//       } catch (error) {
//         console.error("Error handling disconnect:", error);
//       }
//     });

//     socket.on("start-quiz", async ({ roomCode }) => {
//       try {
//         const questions = await getQuestionsFromDB(roomCode);
//         io.to(roomCode).emit("quiz-started", questions);
//         console.log(`🎯 Quiz started for room ${roomCode}`);
//       } catch (error) {
//         console.error("Error starting quiz:", error);
//         socket.emit("quiz-start-failed", error.message);
//       }
//     });
//     socket.on("submit-score", ({ roomCode, playerName, score }) => {
//       if (!roomScores[roomCode]) return;

//       roomScores[roomCode][playerName] = score;

//       const leaderboard = Object.entries(roomScores[roomCode])
//         .map(([name, score]) => ({ name, score }))
//         .sort((a, b) => b.score - a.score); // descending

//       io.to(roomCode).emit("update-leaderboard", leaderboard);
//     });
//   });
// }

import { getQuestionsFromDB } from "../services/getQuestions.js";
import { Players } from "../models/players.model.js";
import { Questions } from "../models/quizQuestion.model.js";
import { v4 as uuidv4 } from "uuid";

export default function roomSocketHandler(io) {
  const disconnectTimers = {};
  let roomScores = {}; // Track scores for leaderboard
  const roomPlayers = {}; // Track active players in each room

  io.on("connection", (socket) => {
    console.log("🔌 Socket connected:", socket.id);

    socket.on("create-room", async ({ roomCode, hostName }) => {
      try {
        socket.join(roomCode);
        socket.playerName = hostName;
        socket.roomCode = roomCode;

        console.log(`🟢 Room ${roomCode} created by ${hostName}`);

        // Initialize room data for leaderboard
        if (!roomScores[roomCode]) {
          roomScores[roomCode] = {};
          roomPlayers[roomCode] = {};
        }

        const hostUserId = uuidv4();

        const existing = await Players.findOne({
          room_code: roomCode,
          playerName: hostName,
        });

        if (!existing) {
          await Players.create({
            playerName: hostName,
            room_code: roomCode,
            userId: hostUserId,
            Score: 0,
            status: "online",
            isHost: true,
            socketId: socket.id,
          });
        } else {
          await Players.updateOne(
            { _id: existing._id },
            {
              status: "online",
              socketId: socket.id,
              isHost: true,
            }
          );
        }

        // Initialize leaderboard data
        roomScores[roomCode][hostName] = 0;
        roomPlayers[roomCode][hostName] = {
          socketId: socket.id,
          connected: true,
          userId: hostUserId,
        };

        const players = await Players.find({
          room_code: roomCode,
          status: "online",
        });

        io.to(roomCode).emit(
          "room-players-updated",
          players.map((p) => p.playerName)
        );

        // Send initial leaderboard
        const leaderboard = Object.entries(roomScores[roomCode])
          .map(([name, score]) => ({ name, score }))
          .sort((a, b) => b.score - a.score);
        io.to(roomCode).emit("update-leaderboard", leaderboard);

        socket.emit("room-created", { roomCode, hostName });
      } catch (error) {
        console.error("Error creating room:", error);
        socket.emit("room-creation-failed", error.message);
      }
    });

    socket.on("get-lobby-players", async ({ roomCode }) => {
      try {
        if (!roomCode) {
          return socket.emit("lobby-players-failed", "Missing room code");
        }

        const players = await Players.find({
          room_code: roomCode,
          status: "online",
        });

        socket.emit(
          "lobby-players-success",
          players.map((p) => ({
            name: p.playerName,
            isHost: p.isHost,
            status: p.status,
          }))
        );
      } catch (error) {
        console.error("Error fetching lobby players:", error);
        socket.emit("lobby-players-failed", "Failed to fetch players");
      }
    });

    socket.on("join-room", async ({ roomCode, playerName, userId }) => {
      try {
        socket.join(roomCode);
        socket.playerName = playerName;
        socket.roomCode = roomCode;
        socket.userId = userId;

        console.log(`👤 Player ${playerName} joining room ${roomCode}`);

        // Initialize room data if it doesn't exist
        if (!roomScores[roomCode]) {
          roomScores[roomCode] = {};
          roomPlayers[roomCode] = {};
        }

        const roomExists = await Questions.findOne({ room_code: roomCode });
        if (!roomExists) {
          socket.emit("join-failed", "Room not found");
          return;
        }

        // Check if player already exists
        let player = await Players.findOne({
          room_code: roomCode,
          playerName: playerName,
        });

        if (!player && userId) {
          // Try to find by userId
          player = await Players.findOne({ userId });
        }

        if (player) {
          await Players.updateOne(
            { _id: player._id },
            { status: "online", socketId: socket.id }
          );
          socket.userId = player.userId;
        } else {
          // Create new player
          const newUserId = userId || uuidv4();
          await Players.create({
            playerName,
            room_code: roomCode,
            userId: newUserId,
            Score: 0,
            status: "online",
            isHost: false,
            socketId: socket.id,
          });
          socket.userId = newUserId;
        }

        // Initialize/update leaderboard data
        if (!roomScores[roomCode][playerName]) {
          roomScores[roomCode][playerName] = player ? player.Score : 0;
        }

        roomPlayers[roomCode][playerName] = {
          socketId: socket.id,
          connected: true,
          userId: socket.userId,
        };

        const players = await Players.find({
          room_code: roomCode,
          status: "online",
        });

        io.to(roomCode).emit(
          "room-players-updated",
          players.map((p) => p.playerName)
        );

        // Send current leaderboard to all players in room
        const leaderboard = Object.entries(roomScores[roomCode])
          .map(([name, score]) => ({ name, score }))
          .sort((a, b) => b.score - a.score);
        io.to(roomCode).emit("update-leaderboard", leaderboard);

        socket.emit("joined-successfully", { roomCode, playerName });

        console.log(`✅ Player ${playerName} joined room ${roomCode}`);
      } catch (error) {
        console.error("Error joining room:", error);
        socket.emit("join-failed", error.message);
      }
    });

    socket.on("delete-room", async ({ roomCode }) => {
      try {
        const player = await Players.findOne({
          room_code: roomCode,
        });

        if (!player || !player.isHost) {
          socket.emit(
            "delete-room-failed",
            "Only the host can delete the room"
          );
          return;
        }

        console.log(`🗑️ Host manually deleting room ${roomCode}`);

        const players = await Players.find({ room_code: roomCode });

        for (const roomPlayer of players) {
          if (roomPlayer.socketId && roomPlayer.socketId !== socket.id) {
            const playerSocket = io.sockets.sockets.get(roomPlayer.socketId);
            if (playerSocket) {
              playerSocket.emit(
                "room-closed",
                "Room has been deleted by the host."
              );
              playerSocket.disconnect(true);
            }
          }
        }

        await Questions.deleteOne({ room_code: roomCode });
        await Players.deleteMany({ room_code: roomCode });

        // Clean up leaderboard data
        delete roomScores[roomCode];
        delete roomPlayers[roomCode];

        for (const roomPlayer of players) {
          if (disconnectTimers[roomPlayer.userId]) {
            clearTimeout(disconnectTimers[roomPlayer.userId]);
            delete disconnectTimers[roomPlayer.userId];
          }
        }

        socket.emit("room-deleted-successfully");
        console.log(`✅ Room ${roomCode} deleted successfully`);
      } catch (error) {
        console.error("Error deleting room:", error);
        socket.emit("delete-room-failed", error.message);
      }
    });

    socket.on("rejoin-room", async ({ userId }) => {
      try {
        const player = await Players.findOne({ userId });
        if (!player) {
          socket.emit("rejoin-failed", "Session expired or player not found");
          return;
        }

        socket.userId = userId;
        socket.playerName = player.playerName;
        socket.roomCode = player.room_code;
        socket.join(player.room_code);

        // Initialize room data if it doesn't exist
        if (!roomScores[player.room_code]) {
          roomScores[player.room_code] = {};
          roomPlayers[player.room_code] = {};
        }

        await Players.updateOne(
          { userId },
          { status: "online", socketId: socket.id }
        );

        // Update leaderboard data
        roomScores[player.room_code][player.playerName] = player.Score;
        roomPlayers[player.room_code][player.playerName] = {
          socketId: socket.id,
          connected: true,
          userId: userId,
        };

        const players = await Players.find({
          room_code: player.room_code,
          status: "online",
        });

        io.to(player.room_code).emit(
          "room-players-updated",
          players.map((p) => p.playerName)
        );

        // Send current leaderboard
        const leaderboard = Object.entries(roomScores[player.room_code])
          .map(([name, score]) => ({ name, score }))
          .sort((a, b) => b.score - a.score);
        io.to(player.room_code).emit("update-leaderboard", leaderboard);

        socket.emit("rejoin-success", {
          playerName: player.playerName,
          roomCode: player.room_code,
          players: players.map((p) => p.playerName),
        });
      } catch (error) {
        console.error("Error rejoining room:", error);
        socket.emit("rejoin-failed", error.message);
      }
    });

    socket.on("disconnect", async () => {
      const { userId, roomCode, playerName } = socket;
      if (!userId || !roomCode) return;

      try {
        await Players.updateOne(
          { userId },
          { status: "offline", socketId: null }
        );

        // Mark player as disconnected in leaderboard tracking
        if (roomPlayers[roomCode] && roomPlayers[roomCode][playerName]) {
          roomPlayers[roomCode][playerName].connected = false;
        }

        // Clear any existing timer for this user
        if (disconnectTimers[userId]) {
          clearTimeout(disconnectTimers[userId]);
          delete disconnectTimers[userId];
        }

        // Notify other players about updated list (optional: show online only)
        const remainingPlayers = await Players.find({
          room_code: roomCode,
          status: "online",
        });

        io.to(roomCode).emit(
          "room-players-updated",
          remainingPlayers.map((p) => p.playerName)
        );

        console.log(`🔌 Player ${playerName} disconnected (marked offline)`);
      } catch (error) {
        console.error("Error handling disconnect:", error);
      }
    });

    socket.on("start-quiz", async ({ roomCode }) => {
      try {
        const questions = await getQuestionsFromDB(roomCode);
        io.to(roomCode).emit("quiz-started", questions);
        console.log(`🎯 Quiz started for room ${roomCode}`);
      } catch (error) {
        console.error("Error starting quiz:", error);
        socket.emit("quiz-start-failed", error.message);
      }
    });

    // Enhanced submit-score handler with database sync
    socket.on("submit-score", async ({ roomCode, playerName, score }) => {
      try {
        console.log(
          `📊 Score submitted - Room: ${roomCode}, Player: ${playerName}, Score: ${score}`
        );

        // Initialize room if it doesn't exist
        if (!roomScores[roomCode]) {
          roomScores[roomCode] = {};
        }

        // Update in-memory score
        roomScores[roomCode][playerName] = score;

        // Update database score
        await Players.updateOne(
          { room_code: roomCode, playerName: playerName },
          { Score: score }
        );

        // Create and emit leaderboard
        const leaderboard = Object.entries(roomScores[roomCode])
          .map(([name, score]) => ({ name, score }))
          .sort((a, b) => b.score - a.score);

        console.log(
          `📈 Updated leaderboard for room ${roomCode}:`,
          leaderboard
        );
        io.to(roomCode).emit("update-leaderboard", leaderboard);
      } catch (error) {
        console.error("Error updating score:", error);
      }
    });

    // Get current leaderboard
    socket.on("get-leaderboard", async (roomCode) => {
      try {
        console.log(`📊 Leaderboard requested for room: ${roomCode}`);

        if (roomScores[roomCode]) {
          const leaderboard = Object.entries(roomScores[roomCode])
            .map(([name, score]) => ({ name, score }))
            .sort((a, b) => b.score - a.score);

          socket.emit("update-leaderboard", leaderboard);
        } else {
          // Fallback to database if in-memory data is missing
          const players = await Players.find({
            room_code: roomCode,
            status: "online",
          }).select("playerName Score");

          const leaderboard = players
            .map((p) => ({ name: p.playerName, score: p.Score }))
            .sort((a, b) => b.score - a.score);

          socket.emit("update-leaderboard", leaderboard);
        }
      } catch (error) {
        console.error("Error getting leaderboard:", error);
        socket.emit("update-leaderboard", []);
      }
    });

    // Clean up empty rooms periodically
    setInterval(() => {
      for (const roomCode in roomPlayers) {
        const activePlayers = Object.values(roomPlayers[roomCode]).filter(
          (player) => player.connected
        );

        if (activePlayers.length === 0) {
          console.log(`🧹 Cleaning up empty room: ${roomCode}`);
          delete roomScores[roomCode];
          delete roomPlayers[roomCode];
        }
      }
    }, 300000); // Clean up every 5 minutes
  });
}
