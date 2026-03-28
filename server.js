import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const rooms = new Map();

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      members: [],
      alice: null,
      bob: null,
      bb84: null
    });
  }
  return rooms.get(roomId);
}

function recomputeRoles(room) {
  room.alice = room.members[0]?.socketId || null;
  room.bob = room.members[1]?.socketId || null;
}

io.on("connection", (socket) => {
  socket.on("join-room", ({ roomId, name }) => {
    const room = getRoom(roomId);
    socket.join(roomId);

    if (!room.members.find((m) => m.socketId === socket.id)) {
      room.members.push({ socketId: socket.id, name: name || "Anonymous" });
    }

    recomputeRoles(room);

    io.to(roomId).emit("room-state", {
      members: room.members,
      alice: room.alice,
      bob: room.bob
    });
  });

  socket.on("start-bb84", ({ roomId, payload }) => {
    const room = getRoom(roomId);
    if (socket.id !== room.alice) return;
    if (!room.bob) return;

    room.bb84 = {
      aliceBits: payload.aliceBits,
      aliceBases: payload.aliceBases,
      eveEnabled: !!payload.eveEnabled,
      bobBases: null,
      bobResults: null,
      eveBases: null,
      eveResults: null
    };

    io.to(roomId).emit("bb84-from-alice", {
      aliceBits: payload.aliceBits,
      aliceBases: payload.aliceBases,
      eveEnabled: !!payload.eveEnabled
    });
  });

  socket.on("bb84-from-bob", ({ roomId, payload }) => {
    const room = getRoom(roomId);
    if (!room.bb84) return;
    if (socket.id !== room.bob) return;

    room.bb84.bobBases = payload.bobBases;
    room.bb84.bobResults = payload.bobResults;
    room.bb84.eveBases = payload.eveBases || null;
    room.bb84.eveResults = payload.eveResults || null;

    io.to(roomId).emit("bb84-finalize", {
      aliceBits: room.bb84.aliceBits,
      aliceBases: room.bb84.aliceBases,
      eveEnabled: room.bb84.eveEnabled,
      eveBases: room.bb84.eveBases,
      eveResults: room.bb84.eveResults,
      bobBases: room.bb84.bobBases,
      bobResults: room.bb84.bobResults
    });
  });

  socket.on("send-message", ({ roomId, message }) => {
    socket.to(roomId).emit("receive-message", message);
  });

  socket.on("disconnect", () => {
    for (const [roomId, room] of rooms.entries()) {
      room.members = room.members.filter((m) => m.socketId !== socket.id);
      recomputeRoles(room);

      io.to(roomId).emit("room-state", {
        members: room.members,
        alice: room.alice,
        bob: room.bob
      });

      if (room.members.length === 0) {
        rooms.delete(roomId);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
