import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const rooms = {}; // Para mantener el estado de los turnos y movimientos

app.use(express.static("public"));

io.on("connection", (socket) => {
  console.log("Un usuario se ha conectado");

  socket.on("joinRoom", (room) => {
    socket.join(room);
    const clients = io.sockets.adapter.rooms.get(room);

    if (!rooms[room]) {
      rooms[room] = { currentTurn: socket.id, moves: {}, ready: {} };
    }

    if (clients.size === 1) {
      socket.emit("message", "Esperando a un oponente...");
    } else if (clients.size === 2) {
      io.to(room).emit("message", "¡Oponente encontrado! Empiecen a jugar.");
      io.to(rooms[room].currentTurn).emit("yourTurn");
    } else {
      socket.emit("message", "La sala está llena.");
      socket.leave(room);
    }
  });

  socket.on("move", ({ room, move }) => {
    const roomState = rooms[room];

    if (roomState.currentTurn === socket.id) {
      roomState.moves[socket.id] = move;

      const clients = Array.from(io.sockets.adapter.rooms.get(room));
      const nextPlayer = clients.find((client) => client !== socket.id);

      if (roomState.moves[nextPlayer]) {
        // Ambos jugadores han hecho su movimiento, determinar ganador
        const opponentMove = roomState.moves[nextPlayer];
        const result = determineWinner(move, opponentMove);

        io.to(socket.id).emit("result", { myMove: move, opponentMove, result });
        io.to(nextPlayer).emit("result", {
          myMove: opponentMove,
          opponentMove: move,
          result: result === "win" ? "lose" : result === "lose" ? "win" : "tie",
        });

        // Resetear el estado para la siguiente ronda
        roomState.moves = {};
        roomState.currentTurn = null; // Detener el ciclo de turnos hasta que se reinicie
      } else {
        roomState.currentTurn = nextPlayer;
        io.to(nextPlayer).emit("yourTurn");
      }
    } else {
      socket.emit("message", "¡No es tu turno!");
    }
  });

  socket.on("restartGame", (room) => {
    const roomState = rooms[room];
    roomState.ready[socket.id] = true;

    const clients = Array.from(io.sockets.adapter.rooms.get(room));

    if (
      clients.length === 2 &&
      roomState.ready[clients[0]] &&
      roomState.ready[clients[1]]
    ) {
      // Ambos jugadores están listos para reiniciar
      roomState.ready = {};
      roomState.currentTurn = clients[0]; // Reiniciar el turno al primer jugador
      io.to(clients[0]).emit("yourTurn");
      io.to(clients[1]).emit("message", "Esperando tu turno...");
    } else {
      // Notificar al otro jugador que el oponente está listo
      const waitingPlayer = clients.find((client) => client !== socket.id);
      io.to(waitingPlayer).emit(
        "message",
        "El oponente está listo. Esperando que empieces la siguiente ronda.",
      );
    }
  });

  socket.on("disconnect", () => {
    console.log("Un usuario se ha desconectado");
  });
});

function determineWinner(move1, move2) {
  if (move1 === move2) return "tie";
  if (
    (move1 === "rock" && move2 === "scissors") ||
    (move1 === "paper" && move2 === "rock") ||
    (move1 === "scissors" && move2 === "paper")
  ) {
    return "win";
  } else {
    return "lose";
  }
}

server.listen(3000, () => {
  console.log("El servidor está corriendo en el puerto 3000");
});
