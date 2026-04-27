const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

let waitingQueue = [];

function updateUserCount() {
    io.emit('user-count', io.engine.clientsCount);
}

io.on('connection', (socket) => {
    updateUserCount();

    socket.on('join-queue', (userData) => {
        waitingQueue = waitingQueue.filter(s => s.id !== socket.id);
        socket.userData = userData;

        if (waitingQueue.length > 0) {
            let partner = waitingQueue.shift();
            socket.partner = partner;
            partner.partner = socket;

            socket.emit('match-found', { 
                partnerId: partner.userData.peerId, 
                info: { age: partner.userData.age, gender: partner.userData.gender } 
            });
            partner.emit('match-found', { 
                partnerId: socket.userData.peerId, 
                info: { age: socket.userData.age, gender: socket.userData.gender } 
            });
        } else {
            socket.peerId = userData.peerId;
            waitingQueue.push(socket);
        }
    });

    socket.on('send-message', (msg) => {
        if (socket.partner) socket.partner.emit('receive-message', msg);
    });

    socket.on('disconnect-partner', () => {
        if (socket.partner) {
            socket.partner.emit('partner-disconnected');
            socket.partner.partner = null;
            socket.partner = null;
        }
    });

    socket.on('disconnect', () => {
        if (socket.partner) {
            socket.partner.emit('partner-disconnected');
            socket.partner.partner = null;
        }
        waitingQueue = waitingQueue.filter(s => s.id !== socket.id);
        updateUserCount();
    });
});

http.listen(3000, () => console.log('Server online op http://localhost:3000'));