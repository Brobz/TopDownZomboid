console.log("Starting Server...");

var express = require("express");
var app = express();
var server = require("http").Server(app);

app.get("/", function(req, res){
    res.sendFile(__dirname + "/client/index.html");
});

app.use("/client", express.static(__dirname + "/client"));

server.listen(process.env.PORT || 2000);

console.log("Server Ready!");

var colors = [ "#FA1010", "#1085FA", "#42FA10", "#B5B735", "#A135B7", "#3E5252"]

var Room = require('./server/room.js').Room;
var Player = require('./server/player.js').Player;
var Bullet = require('./server/bullet.js').Bullet;

var SOCKET_LIST = {};
var PLAYER_LIST = {};
var ROOM_LIST = [Room(2, 4, 1, false), Room(4, 4, 2, true), Room(6, 6, 3, true)];

var io = require("socket.io")(server, {});
io.sockets.on("connection", function(socket){

    socket.id = Math.random();
    SOCKET_LIST[socket.id] = socket;

    var p = Player(socket.id, colors[Object.keys(SOCKET_LIST).length - 1]);
    PLAYER_LIST[socket.id] = p;



    socket.emit("roomUpdate", {
      rooms : ROOM_LIST,
    });

    socket.emit("connected", {
      msg: "Connected to Server",
      id: socket.id
    });

    socket.on("setName", function(data){p.name = data.name;});

    socket.on("joinRoom", function(data){
      if(ROOM_LIST[data.room].players.length >= ROOM_LIST[data.room].maxSize || ROOM_LIST[data.room].inGame)
        return;

      for(var i in ROOM_LIST){

        if(ROOM_LIST[i].players.indexOf(p) >= 0){
          ROOM_LIST[i].removePlayer(p);
        }

      }
      ROOM_LIST[data.room].addPlayer(p);

      for(var i in SOCKET_LIST){
        var s = SOCKET_LIST[i];
        s.emit("roomUpdate", {
          rooms : ROOM_LIST,
        });
      }


    });

    socket.on("leaveRoom", function(data){
      for(var i in ROOM_LIST){
        if(ROOM_LIST[i].players.indexOf(p) >= 0){
          ROOM_LIST[i].removePlayer(p);
        }
      }
      for(var i in SOCKET_LIST){
        var s = SOCKET_LIST[i];
        s.emit("roomUpdate", {
          rooms : ROOM_LIST,
        });
      }
    });

    socket.on("callForGameStart", function(data){
      if(ROOM_LIST[data.room].players.length < ROOM_LIST[data.room].minSize)
        return;


      ROOM_LIST[data.room].inGame = true;
      for(var i in ROOM_LIST[data.room].players){
        var s = SOCKET_LIST[ROOM_LIST[data.room].players[i].id];
        s.emit("startGame", {room: data.room});
      }
      for(var i in SOCKET_LIST){
        var s = SOCKET_LIST[i];
        s.emit("roomUpdate", {
          rooms : ROOM_LIST,
        });
      }
    });

    socket.on("keyPress", function(data){getKeyInput(socket.id, data);});

    socket.on("disconnect", function(){Disconnected(socket.id)});

});

function Disconnected(id) {
  for(var i in ROOM_LIST){
    if(ROOM_LIST[i].players.indexOf(PLAYER_LIST[id]) >= 0){
      ROOM_LIST[i].removePlayer(PLAYER_LIST[id]);
    }
  }
  delete SOCKET_LIST[id];
  delete PLAYER_LIST[id];

}

function getKeyInput(id, data){
  if(data.input == "d"){
    PLAYER_LIST[id].isMovingRight = data.state;
  }
  if(data.input == "s"){
    PLAYER_LIST[id].isMovingDown = data.state;
  }
  if(data.input == "a"){
    PLAYER_LIST[id].isMovingLeft = data.state;
  }
  if(data.input == "w"){
    PLAYER_LIST[id].isMovingUp = data.state;
  }

  if(data.input == "shoot0"){
    PLAYER_LIST[id].isShootingLeft = data.state;
  }
  if(data.input == "shoot1"){
    PLAYER_LIST[id].isShootingUp = data.state;
  }
  if(data.input == "shoot2"){
    PLAYER_LIST[id].isShootingRight = data.state;
  }
  if(data.input == "shoot3"){
    PLAYER_LIST[id].isShootingDown = data.state;
  }

}

function checkForGameEnd(){
  for(var i in ROOM_LIST){
    if(!ROOM_LIST[i].inGame) continue;
    if(ROOM_LIST[i].checkForWin()){
      ROOM_LIST[i].inGame = false;
      for(var k in ROOM_LIST[i].players){
          s = SOCKET_LIST[ROOM_LIST[i].players[k].id];
          s.emit("endGame", {room: i});
      }
      for(var i in SOCKET_LIST){
        var s = SOCKET_LIST[i];
        s.emit("roomUpdate", {
          rooms : ROOM_LIST,
        });
      }
    }
  }
}

function shoot(player, room){
  if(p.isShootingUp){
    pos = [p.x + 7, p.y + 7];
    ROOM_LIST[room].bullets.push(new Bullet(0, pos, p.team, p.color));
  }
  else if(p.isShootingDown){
    pos = [p.x + 7, p.y  + 7];
    ROOM_LIST[room].bullets.push(new Bullet(1, pos, p.team, p.color));
  }
  else if(p.isShootingLeft){
    pos = [p.x + 7, p.y + 7];
    ROOM_LIST[room].bullets.push(new Bullet(2, pos, p.team, p.color));
  }
  else if(p.isShootingRight){
    pos = [p.x + 7, p.y + 7];
    ROOM_LIST[room].bullets.push(new Bullet(3, pos, p.team, p.color));
  }

}

function Update(){
  checkForGameEnd();
  var infoPack = [];
  for(var i in ROOM_LIST){
    if(ROOM_LIST[i].inGame){
      for(var j in ROOM_LIST[i].bullets){
        ROOM_LIST[i].bullets[j].updatePosition();
      }
      for(var k in ROOM_LIST[i].players){
        p = ROOM_LIST[i].players[k];
        p.updatePosition();
        if(p.updateShooting()){
          shoot(p, i);
        }
        infoPack.push(
          {
            name : p.name,
            x : p.x,
            y : p.y,
            bullets : ROOM_LIST[i].bullets,
            color : p.color,
            room : i

          });
      }
    }
  }

  for(var i in ROOM_LIST){
    if(ROOM_LIST[i].inGame){
      for(var k in ROOM_LIST[i].players){
        var s = SOCKET_LIST[ROOM_LIST[i].players[k].id];
        s.emit("update", infoPack);
      }
    }
  }


}

setInterval(Update, 1000/45);
