
//Requires

var Peer = require('simple-peer')
var wrtc = require('wrtc')
var WebSocket = require('ws');
const myRL = require('serverline')
var colors = require('colors');

//Clear console
process.stdout.write('\x1Bc')


//Allow input of text to be evaluated into code
myRL.init({
	prompt : '<'.green,
	colorMode : true,
	
})
myRL.setCompletion(['activeClients','message_send',])
 
myRL.on('line', function(line) {
	try {
		var result = eval(line);
		if(result!=null){
			console.log(result.toString().bold.brightRed);
		}
	} catch(e){
		//Only display the first line of the error
		console.log((e.toString().split('\n')[0]).red);
	}	
});


//List of users
var clients = [];
//List of active users
var activeClients = [];

//Start the websocket server
/*
	This is the TCP connection we use to start the webRTC UDP connection
*/
const wss = new WebSocket.Server({
  port: 8080,
});


//Sets a clients state to disconnected and removes from active client list
function disconnectClient(clientID){
	clients[clientID].connected=0;
	clients[clientID].elevation=0;
	//Remove from our active clients list if it is present in it
	var clientIndex = activeClients.indexOf(clientID);
	if(clientIndex!=-1){
		activeClients.splice(clientIndex,1);
	}
	console.log(('Disconnected: '+clientID).brightRed);	
}

//Reacts to certain packet types
function message_receive(data,connectID){
	
	//Check if it is an array, if so set first index to switch input, if not, set the whole value to switch value
	if(Array.isArray(data)==true){
		var switchValue = data[0];
	}else{
		var switchValue = data;
	}

	switch(switchValue){
		case "peer_responded":
			message_send_tcp(['peer_final',data[1]],clients[connectID].peerConnected)
		break;
		case "peer_created":
			clients[clients[connectID].peerConnected].peerConnected=connectID;
			message_send_tcp(['peer_respond',data[1]],clients[connectID].peerConnected);
		break;
		case "connect_signal":
			clients[connectID].UDP.signal(JSON.parse(data[1]));			
		break;
		case "connect_latency_udp":
			message_send_udp('connect_latency_udp',connectID);
		break;
		case "connect_latency_tcp":
			message_send_tcp('connect_latency_tcp',connectID);
		break;
	}
}



function message_send(data,connectID){
	
	if(clients[connectID].connected==1){
		
		switch(clients[connectID].elevation){
			//TCP
			case 1:
				clients[connectID].TCP.send(JSON.stringify(data));
			break;
			//UDP
			case 2:
				clients[connectID].UDP.send(JSON.stringify(data));
			break;
		}
		
	}
}

function message_send_tcp(data,connectID){
	
	if(clients[connectID].connected==1){
		clients[connectID].TCP.send(JSON.stringify(data));			
	}
}

function message_send_udp(data,connectID){
	
	if(clients[connectID].connected==1 && clients[connectID].elevation==2){
		clients[connectID].UDP.send(JSON.stringify(data));			
	}
}

function peer_connect(clientOne,clientTwo){
	clients[clientOne].peerConnected=clientTwo;
	message_send_tcp(['peer_create'],clientOne);
}

//When we get a connection our webSocket connection
wss.on('connection', function connection(ws) {
		
	//Get our connection ID
	var connectID = clients.length;
	clients.push({
		clientID : connectID,
		UDP : 0,
		TCP : ws,
		connected : 1,
		elevation : 1,
		peerConnected : null,
	});
	
	ws.onclose = function(){
		disconnectClient(connectID);
	}
	
	ws.onerror = function(err){
		disconnectClient(connectID);
		console.log(('error', err.toString().split('\n')[0]).red)
	}
	

	//When we receive a websocket message
	ws.on('message', function incoming(message) {
		//React to message 
		message=JSON.parse(message);
		console.log(('TCP data from '+connectID+': '+message).magenta);
		message_receive(message,connectID);

	});
	
	console.log(('Connected TCP: '+connectID).brightGreen);

	
	//Create new peer for webRTC
	clients[connectID].UDP = new Peer({
	  initiator: false,
	  channelConfig: {
		  ordered : false,
		  maxRetransmits :0,
		  
	  },
	  channelName: Math.random().toString(),
	  config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478?transport=udp' }] },
	  offerOptions: {},
	  answerOptions: {},
	  sdpTransform: function (sdp) { return sdp },
	  stream: false,
	  streams: [],
	  trickle: true,
	  allowHalfTrickle: false,
	  wrtc: wrtc,
	  objectMode: false
		
	}) 

	clients[connectID].UDP.on('signal', data => {
		message_send(['connect_signal',JSON.stringify(data)],connectID)
	})
	
	clients[connectID].UDP.on('connect', () => {
		console.log(('Connected UPD: '+connectID).brightGreen);
		clients[connectID].elevation=2;
		activeClients.push(connectID);
		message_send('UDP connected',connectID)
	})
	
	//Only log the first line of the error 
    clients[connectID].UDP.on('error', err => {
		if(clients[connectID].connected==1){
			disconnectClient(connectID);
			console.log(('error', err.toString().split('\n')[0]).red)
		}
	})
	
	
	clients[connectID].UDP.on('data', data => {
		data = JSON.parse(data);
		console.log(('UDP data from '+connectID+': '+data).magenta);
		message_receive(data,connectID);
	})
		


});
