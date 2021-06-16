const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const session = require("express-session")({
    secret: "my-secret",
    resave: true,
    saveUninitialized: true
  });


const kafkaInit = require('./kafka');

const people = {};
const sockmap = {};
const messageque = {};

// Attach session
app.use(session);

kafkaInit().then( kafka => {
	io.on('connection', (socket) => {
		kafka.subscribeChangeStatus((nick, room, value) => {

			console.log({nick, room, value})

			if (value == 'LOGIN') {
				if(!people.hasOwnProperty(room)){
					people[room]={};
				}
	
				people[room][socket.id] = {
					nick : nick,
					id : socket.id
				};
				sockmap[socket.id] = {
					nick : nick,
					room : room
				}
				if(messageque.hasOwnProperty(room)){
					for(i=0;i<messageque[room].length;i++){
						io.to(room).emit('message que', messageque[room][i].nick,messageque[room][i].msg);
					}
				}
				if(room=='')
					socket.emit("update", "You have connected to the default room.");
				else
				socket.emit("update", `You have connected to room ${room}.`);
				socket.emit("people-list", people[room]);
				socket.to(room).broadcast.emit("add-person",nick,socket.id);
				console.log(nick);
				socket.to(room).broadcast.emit("update", `${nick} has come online. `);
			}
			if (value == 'LOGOUT') {
				if(sockmap[socket.id]){
					const room=sockmap[socket.id].room;
					socket.to(room).broadcast.emit("update", `${sockmap[socket.id].nick} has disconnected. `);
					io.emit("remove-person",socket.id);
					delete people[room][socket.id];
					delete sockmap[socket.id];
				}
			}

		})

		kafka.subscribeMessages((nick, room, message) => {

			console.log({nick, room, message})

			io.to(room).emit('chat message', nick, room, message);
			if(!messageque.hasOwnProperty(room)){
				messageque[room]=[]
			}
			messageque[room].push({ nick, message })
			if(messageque[room].length>50)
				messageque[room].shift()
		})

		socket.on("join", (nick,room) => {
			socket.join(room);
			kafka.login(nick, room)
		});

		socket.on('chat message', (nick, room, msg) => {
			kafka.sendMessage(nick, room, msg)
		});

		socket.on('disconnect', () => {
			if(sockmap[socket.id]){
				const room=sockmap[socket.id].room;
				const nick = sockmap[socket.id].nick;
				kafka.logout(nick, room)
			}
		});
	});
});

const port = process.env.PORT || 8081;

http.listen(port, () => {
	console.log(`http://localhost:${port}`);
});
