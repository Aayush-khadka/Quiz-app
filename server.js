import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import { createServer } from "http";
import dotenv from "dotenv";
import Connect_db from "./config/connectdb.js";

import roomRoutes from "./routes/room.routes.js";
import playerRoutes from "./routes/player.routes.js";

import roomSocketHandler from "./sockets/roomsocket.js";
dotenv.config();

const Port = process.env.PORT;

const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: true,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

app.use("/api/v1", roomRoutes);
app.use("/api/v1", playerRoutes);

app.get("/", (req, res) => {
  res.send("HOME PAGE OF THE QUIZ APP!!!");
});

Connect_db();

roomSocketHandler(io);

server.listen(Port, () => {
  console.log(`Server listining at Port At http://localhost:${Port}`);
});
