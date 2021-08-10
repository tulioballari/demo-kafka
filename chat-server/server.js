const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const session = require("express-session")({
    secret: "my-secret",
    resave: true,
    saveUninitialized: true
  });


const kafkaInit = require('./kafka');


// Attach session
app.use(session);

let kafka = null;

const people = {};
const sockmap = {};
const messageque = {};

function addPeople(room, nick, id) {
	if (!people.hasOwnProperty(room)) {
		people[room] = {};
	}
	if (! people[room][nick]) {
		people[room][nick] = { nick, id };
		sockmap[id] = { nick, room };
		return true;
	}
	return false;
}


function onChangeStatus(id, nick, room, status){

	console.log('subscribeChangeStatus', {id, nick, room, status})

	if (status == 'LOGIN' && addPeople(room, nick)) {

		io.to(room).emit("add-person",nick,id);
		io.to(room).emit("update", `${nick} has come online. `);
	}
	if (status == 'LOGOUT' && people[room] ) {

		if (people[room][nick]) {
			delete people[room][nick];
			delete sockmap[id];
		}

		io.to(room).emit("update", `${nick} has disconnected. `);
		io.emit("remove-person",id);
	}

}

function onMessage(nick, room, message) {
	console.log('onMessage', {nick, room, message})

	io.to(room).emit('chat message', nick, room, message);

	if(!messageque.hasOwnProperty(room)){
		messageque[room]=[]
	}
	messageque[room].push({ nick, message })
	if(messageque[room].length>50)
		messageque[room].shift()
}

kafkaInit().then( _kafka => {
	kafka = _kafka
	kafka.subscribeChangeStatus(onChangeStatus)
	kafka.subscribeMessages(onMessage);
})


io.on('connection', async (socket) => {

	socket.on("join", async (nick,room) => {
		socket.join(room)

		console.log('join', socket.id, nick)

		socket.emit("people-list", people[room] || []);

		const id = socket.id;
		addPeople(room, nick, id);

		if(room=='')
			socket.emit("update", "You have connected to the default room.");
		else
			socket.emit("update", `You have connected to room ${room}.`);


		socket.to(room).broadcast.emit("add-person",nick,id);
		socket.to(room).broadcast.emit("update", `${nick} has come online. `);


		if(messageque.hasOwnProperty(room)){
			const msgs = messageque[room]
			for(i=0;i<msgs.length;i++){
				const msgObj = msgs[i]
				socket.emit('message que', msgObj.nick,msgObj.message);
			}
		}

		await kafka.login(id, nick, room)
	});

	socket.on('chat message', async (nick, room, msg) => {
		await kafka.sendMessage(nick, room, msg)
	});

	socket.on('disconnect', async () => {
		const id = socket.id;
		if(sockmap[id]){

			const { room, nick } = sockmap[id]
			delete people[room][nick];
			delete sockmap[id];

			await kafka.logout(id, nick, room)
		}
	});
});

const port = process.env.PORT || 8081;

http.listen(port, () => {
	console.log(`http://localhost:${port}`);
});


