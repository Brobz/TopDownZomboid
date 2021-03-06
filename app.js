console.log("Starting Server...");


var mongojs = require("mongojs");
var db = mongojs("mongodb://brobz:astecas2012@ds047146.mlab.com:47146/afi", ["accounts", "progress"]);

var express = require("express");
var app = express();
var server = require("http").Server(app);

app.get("/", function(req, res){
    res.sendFile(__dirname + "/client/index.html");
});

app.use("/client", express.static(__dirname + "/client"));


server.listen(process.env.PORT || 2000);



console.log("Server Ready!");

var POWERUP_COLORS = ["Green", "Red", "DarkSlateGrey", "GoldenRod", "CornflowerBlue", "DeepPink", "DarkMagenta"];
var POWERUP_DELAY = 60 * 5;
var TIME_UNTILL_NEXT_POWERUP = POWERUP_DELAY;
var Room = require('./server/room.js').Room;
var Player = require('./server/player.js').Player;
var Bullet = require('./server/bullet.js').Bullet;
var Block = require('./server/block.js').Block;
var Powerup = require('./server/powerup.js').Powerup;

MAP = function(){
  var blocks = []
  for(var x = 0; x < 20; x++){
    for(var y = 0; y < 20; y++){
      if(!x || !y || x == 19 || y == 19){
        blocks.push(Block([x * 20, y * 20], [20, 20], "#100074"));
      }
    }
  }

  for(var i = 0; i < 10; i++){
    var x = Math.floor(Math.random() * (300 - 100 + 1)) + 100;
    var y = Math.floor(Math.random() * (300 - 100 + 1)) + 100;

    blocks.push(Block([x, y], [20, 20], "#100074"));
  }


  return blocks;
}

var SOCKET_LIST = {};
var PLAYER_LIST = {};
var ROOM_LIST = [Room(2, 6, 1, false, [[20,20], [360,360], [20, 360], [360, 20], [20, 180], [360, 180]], ["#FA1010", "#1085FA", "#42FA10", "#B5B735", "DarkOrchid", "DarkSalmon"]),
                 Room(4, 4, 2, true, [[20,20], [360,360], [20, 360], [360, 20]], ["#FA1010", "#FA1010", "#1085FA", "#1085FA"]),
                 Room(6, 6, 3, true, [[20,20], [20, 360], [20, 180], [360,360], [360, 20], [360, 180]], ["#FA1010", "#FA1010", "#FA1010", "#1085FA", "#1085FA", "#1085FA"])];

var io = require("socket.io")(server, {});
io.sockets.on("connection", function(socket){
    var p;
    socket.on("signUpInfo", function(data){
      db.accounts.find({username:data.username}, function(err, res){
        if(res.length > 0){
          socket.emit("signUpFailed", {msg: "Sign Up failed. Username/In Game Name already taken."});
          return;
        }else{
          console.log(data.ign);
          db.accounts.find({ign:data.ign}, function(err, res){
            if(res.length > 0){
              socket.emit("signUpFailed", {msg: "Sign Up failed. Username/In Game Name already taken."});
              return;
            }else{
              db.accounts.save({username: data.username, password: data.password, ign: data.ign});
              socket.emit("signUpSuccessfull", {msg: "Account Created Successfully!"});
              return;
            }
          });
        }
      });
    });
    socket.on("logInInfo", function(data){
        db.accounts.find({username:data.username, password:data.password}, function(err, res){
          if(res.length > 0){
            if(data.username in SOCKET_LIST){
              socket.emit("connectionFailed", {msg:"This account is currently logged in elsewhere!"});
              return;
            }

            socket.id = data.username;
            SOCKET_LIST[socket.id] = socket;

            p = Player(socket.id, res[0].ign, null);
            PLAYER_LIST[socket.id] = p;

            socket.emit("connected", {
              msg: "Logged in as " + p.name,
              id: socket.id
            });

            socket.emit("roomUpdate", {
              rooms : ROOM_LIST,
            });
          }else{
            socket.emit("connectionFailed", {msg:"Invalide Username/Password"});
            return;
          }
        });
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

    if(p === null)
      return;

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

      resetRoom(data.room);
      buildMap(MAP, data.room);

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
  for(var i in SOCKET_LIST){
    var s = SOCKET_LIST[i];
    s.emit("roomUpdate", {
      rooms : ROOM_LIST,
    });
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

    if(data.state){
      PLAYER_LIST[id].isShootingRight = false;
      PLAYER_LIST[id].isShootingDown = false;
      PLAYER_LIST[id].isShootingUp = false;
    }
  }
  if(data.input == "shoot1"){
    PLAYER_LIST[id].isShootingUp = data.state;

    if(data.state){
      PLAYER_LIST[id].isShootingRight = false;
      PLAYER_LIST[id].isShootingDown = false;
      PLAYER_LIST[id].isShootingLeft = false;
    }
  }
  if(data.input == "shoot2"){
    PLAYER_LIST[id].isShootingRight = data.state;

    if(data.state){
      PLAYER_LIST[id].isShootingLeft = false;
      PLAYER_LIST[id].isShootingDown = false;
      PLAYER_LIST[id].isShootingUp = false;
    }
  }
  if(data.input == "shoot3"){
    PLAYER_LIST[id].isShootingDown = data.state;

    if(data.state){
      PLAYER_LIST[id].isShootingRight = false;
      PLAYER_LIST[id].isShootingLeft = false;
      PLAYER_LIST[id].isShootingUp = false;
    }
  }

}

function buildMap(map, room){
  ROOM_LIST[room].blocks = map();
}

function resetRoom(room){
  // here also reset powerups
  ROOM_LIST[room].bullets = [];
  ROOM_LIST[room].blocks = [];
  ROOM_LIST[room].powerups = [];
  for(var i in ROOM_LIST[room].players){
    ROOM_LIST[room].players[i].x = ROOM_LIST[room].player_positions[i][0];
    ROOM_LIST[room].players[i].y = ROOM_LIST[room].player_positions[i][1];
    ROOM_LIST[room].players[i].hp = ROOM_LIST[room].players[i].maxHp;
    ROOM_LIST[room].players[i].alive = true;
    ROOM_LIST[room].players[i].powerUpsTime = [];
    ROOM_LIST[room].players[i].powerUpsActive = [];
    ROOM_LIST[room].players[i].shootingDelay = 8;
    ROOM_LIST[room].players[i].speed = 2;
    ROOM_LIST[room].players[i].hasClusterGun = false;
    ROOM_LIST[room].players[i].bulletSize = 7;
    ROOM_LIST[room].players[i].bulletDmg = 5;
    ROOM_LIST[room].players[i].hasShield = false;
    ROOM_LIST[room].players[i].hasMultigun = false;
  }

}

function checkForGameEnd(){
  for(var i = 0; i < ROOM_LIST.length; i++){
    if(!ROOM_LIST[i].inGame) continue;
    if(ROOM_LIST[i].checkForWin()){
      ROOM_LIST[i].inGame = false;
      for(var k in ROOM_LIST[i].players){
          s = SOCKET_LIST[ROOM_LIST[i].players[k].id];
          s.emit("endGame", {room : ROOM_LIST[i], roomIndex: i});
      }
      resetRoom(i);
      for(var j in SOCKET_LIST){
        var s = SOCKET_LIST[j];
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
    size = [p.bulletSize, p.bulletSize];
    ROOM_LIST[room].bullets.push(Bullet(0, p.bulletDmg, pos, size, p.team, p.color, p.hasClusterGun, false));
  }
  if(p.isShootingDown){
    pos = [p.x + 7, p.y  + 7];
    size = [p.bulletSize, p.bulletSize];
    ROOM_LIST[room].bullets.push(Bullet(1, p.bulletDmg, pos, size, p.team, p.color, p.hasClusterGun, false));
  }
 if(p.isShootingLeft){
    pos = [p.x + 7, p.y + 7];
    size = [p.bulletSize, p.bulletSize];
    ROOM_LIST[room].bullets.push(Bullet(2, p.bulletDmg, pos, size, p.team, p.color, p.hasClusterGun, false));
  }
 if(p.isShootingRight){
    pos = [p.x + 7, p.y + 7];
    size = [p.bulletSize, p.bulletSize];
    ROOM_LIST[room].bullets.push(Bullet(3, p.bulletDmg, pos, size, p.team, p.color, p.hasClusterGun, false));
  }

  if(p.hasMultigun && (p.isShootingUp || p.isShootingLeft)){
    pos = [p.x + 7, p.y + 7];
    size = [p.bulletSize, p.bulletSize];
    ROOM_LIST[room].bullets.push(Bullet(4, p.bulletDmg, pos, size, p.team, p.color, p.hasClusterGun, false));
  }

  if(p.hasMultigun && (p.isShootingDown || p.isShootingRight)){
    pos = [p.x + 7, p.y + 7];
    size = [p.bulletSize, p.bulletSize];
    ROOM_LIST[room].bullets.push(Bullet(5, p.bulletDmg, pos, size, p.team, p.color, p.hasClusterGun, false));
  }

  if(p.hasMultigun && (p.isShootingUp || p.isShootingRight)){
    pos = [p.x + 7, p.y + 7];
    size = [p.bulletSize, p.bulletSize];
    ROOM_LIST[room].bullets.push(Bullet(6, p.bulletDmg, pos, size, p.team, p.color, p.hasClusterGun, false));
  }

  if(p.hasMultigun && (p.isShootingDown || p.isShootingLeft)){
    pos = [p.x + 7, p.y + 7];
    size = [7, 7];
    ROOM_LIST[room].bullets.push(Bullet(7, p.bulletDmg, pos, size, p.team, p.color, p.hasClusterGun, false));
  }

}

function processPowerups(room){
  TIME_UNTILL_NEXT_POWERUP -= 1;
  if(TIME_UNTILL_NEXT_POWERUP <= 0){
    var passed = false
    var pUP;
    while(!passed){
      passed = true;
      var x = Math.floor(Math.random() * (300 - 100 + 1)) + 100;
      var y = Math.floor(Math.random() * (300 - 100 + 1)) + 100;
      var type = Math.floor(Math.random() * (POWERUP_COLORS.length));
      var pUP = Powerup([x, y], [15, 15], POWERUP_COLORS[type], type);
      for(k in ROOM_LIST[room].blocks){
        if(pUP.checkForCollision(ROOM_LIST[room].blocks[k]))
          passed = false;
      }
    }
    ROOM_LIST[room].powerups.push(pUP);
    TIME_UNTILL_NEXT_POWERUP = POWERUP_DELAY;
  }

  for(var i = ROOM_LIST[room].powerups.length - 1; i > -1; i--){
    for(var k in ROOM_LIST[room].players){
      if(!ROOM_LIST[room].powerups[i]) continue;
      if(ROOM_LIST[room].powerups[i].checkForCollision(ROOM_LIST[room].players[k])){
        ROOM_LIST[room].players[k].powerUp(ROOM_LIST[room].powerups[i].type, ROOM_LIST[room].powerups[i].value);
        ROOM_LIST[room].powerups.splice(i, 1);
      }
    }
  }
}

function Update(){
  checkForGameEnd();
  var infoPack = [];
  for(var i in ROOM_LIST){
    if(ROOM_LIST[i].inGame){
      processPowerups(i);
      loop:
      for(var j = ROOM_LIST[i].bullets.length - 1; j > -1; j--){
        ROOM_LIST[i].bullets[j].updatePosition();
        for(var k in ROOM_LIST[i].blocks){
          var collider = ROOM_LIST[i].bullets[j].checkForCollision(ROOM_LIST[i].blocks[k]);
          if(collider == null) continue;
          if(ROOM_LIST[i].bullets[j].isCluster){
            var b = ROOM_LIST[i].bullets[j];
            for(var dir = 0; dir < 8; dir++){
              ROOM_LIST[i].bullets.push(Bullet(dir, b.dmg / 1.5, [b.x, b.y], [b.width, b.height], b.team, b.color, false, true));
            }
          }
          ROOM_LIST[i].bullets.splice(j, 1);
          continue loop;a
        }
        if(ROOM_LIST[i].bullets[j].isChild && !ROOM_LIST[i].bullets[j].hasShrinked)
          ROOM_LIST[i].bullets[j].shrink();
        for(var k  = 0; k < ROOM_LIST[i].players.length; k++){
          if(!ROOM_LIST[i].players[k].alive) continue;
          var collider = ROOM_LIST[i].bullets[j].checkForCollision(ROOM_LIST[i].players[k]);
          if(collider == null) continue;
          if(!collider.hasShield)
            collider.hp -= ROOM_LIST[i].bullets[j].dmg;
            ROOM_LIST[i].bullets.splice(j, 1);
            continue loop;
        }
      }
      for(var k = 0; k < ROOM_LIST[i].players.length; k++){
        p = ROOM_LIST[i].players[k];
        p.updateState();
        p.updatePowerUps();
        if(!p.alive) continue;
        p .updatePosition(ROOM_LIST[i].blocks);
        if(p.updateShooting()){
          shoot(p, i);
        }
        infoPack.push(
          {
            name : p.name,
            x : p.x,
            y : p.y,
            hp : p.hp,
            maxHp : p.maxHp,
            playerPowerups : p.powerUpsActive,
            color : p.color,
            room : i

          });
      }
      infoPack.push({
        bullets : ROOM_LIST[i].bullets,
        blocks : ROOM_LIST[i].blocks,
        powerups : ROOM_LIST[i].powerups,
        room : i
      });
    }
  }

  for(var i in ROOM_LIST){
    if(ROOM_LIST[i].inGame){
      for(var k = 0; k < ROOM_LIST[i].players.length; k++){
        var s = SOCKET_LIST[ROOM_LIST[i].players[k].id];
        s.emit("update", infoPack);
      }
    }
  }


}

setInterval(Update, 1000/60);
