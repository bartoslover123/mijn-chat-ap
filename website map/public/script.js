const socket = io();
const urlParams = new URLSearchParams(window.location.search);
const myData = { age: urlParams.get('age'), gender: urlParams.get('gender') };

// Taal instellingen
const userLang = navigator.language || navigator.userLanguage;
const targetLang = userLang.split('-')[0]; 

let localStream = null;
let peer = new Peer(undefined, {
    config: { 'iceServers': [{ 'urls': 'stun:stun.l.google.com:19302' }] }
});
let currentPeerId = null;

// UI Elementen
const chatBox = document.getElementById('chat-box');
const msgInput = document.getElementById('msgInput');
const infoBar = document.getElementById('infoBar');
const loadingOverlay = document.getElementById('loading-overlay');

peer.on('open', id => {
    currentPeerId = id;
    startNewMatch();
});

// Update online teller
socket.on('user-count', (count) => {
    const countEl = document.getElementById('count');
    if(countEl) countEl.innerText = count;
});

// ESC toets om te skippen
document.addEventListener('keydown', (e) => {
    if (e.key === "Escape") nextMatch();
});

async function translateText(text, toLang) {
    try {
        const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=autodetect|${toLang}`);
        const data = await response.json();
        return data.responseData.translatedText;
    } catch (e) {
        return text;
    }
}

function setChatState(active) {
    msgInput.disabled = !active;
    document.getElementById('sendBtn').disabled = !active;
    document.getElementById('photoBtn').disabled = !active;
    loadingOverlay.style.display = active ? "none" : "flex";
    msgInput.placeholder = active ? "Typ een bericht..." : "Zoeken naar match...";
}

function startNewMatch() {
    setChatState(false);
    infoBar.innerHTML = "Zoeken naar een nieuwe match...";
    infoBar.style.color = "#888";
    chatBox.innerHTML = "";
    document.getElementById('remoteBox').classList.add('hidden');
    document.getElementById('remoteVideo').srcObject = null;
    socket.emit('join-queue', { ...myData, peerId: currentPeerId });
}

socket.on('match-found', (data) => {
    setChatState(true);
    infoBar.innerHTML = `Verbonden met: ${data.info.gender} (${data.info.age}) <br> <small style="color:var(--primary)">✨ Vertalen naar: ${targetLang.toUpperCase()}</small>`;
    infoBar.style.color = "#4CAF50";
    if (localStream) {
        const call = peer.call(data.partnerId, localStream);
        handleCall(call);
    }
});

function handleCall(call) {
    call.on('stream', remoteStream => {
        const rv = document.getElementById('remoteVideo');
        rv.srcObject = remoteStream;
        document.getElementById('remoteBox').classList.remove('hidden');
        rv.play().catch(e => {});
    });
}

peer.on('call', call => {
    call.answer(localStream);
    handleCall(call);
});

async function toggleCamera() {
    const btn = document.getElementById('camBtn');
    if (!localStream) {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            document.getElementById('localVideo').srcObject = localStream;
            document.getElementById('localBox').classList.remove('hidden');
            btn.innerText = "CAMERA UIT";
            btn.classList.add('active-cam');
        } catch (e) { alert("Camera geweigerd!"); }
    } else {
        localStream.getTracks().forEach(t => t.stop());
        localStream = null;
        document.getElementById('localVideo').srcObject = null;
        document.getElementById('localBox').classList.add('hidden');
        btn.innerText = "CAMERA AAN";
        btn.classList.remove('active-cam');
    }
}

function sendMessage() {
    const msg = msgInput.value.trim();
    if (msg) {
        socket.emit('send-message', msg);
        chatBox.innerHTML += `<div class='msg self'><b>Jij:</b> ${msg}</div>`;
        msgInput.value = "";
        chatBox.scrollTop = chatBox.scrollHeight;
    }
}

function sendPhoto(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        chatBox.innerHTML += `<div class="msg self"><b>Jij:</b><br><img src="${e.target.result}" style="max-width:100%; border-radius:10px;"></div>`;
        socket.emit('send-message', { type: 'image', data: e.target.result });
        chatBox.scrollTop = chatBox.scrollHeight;
    };
    reader.readAsDataURL(file);
}

socket.on('receive-message', async (msg) => {
    if (typeof msg === 'object' && msg.type === 'image') {
        chatBox.innerHTML += `<div class="msg other"><b>Vreemde:</b><br><img src="${msg.data}" style="max-width:100%; border-radius:10px;"></div>`;
    } else {
        const translated = await translateText(msg, targetLang);
        let html = `<div class='msg other'><b>Vreemde:</b> ${translated}`;
        if (translated.toLowerCase() !== msg.toLowerCase()) {
            html += `<br><small style="opacity:0.5; font-size:10px;">(Origineel: ${msg})</small>`;
        }
        html += `</div>`;
        chatBox.innerHTML += html;
    }
    chatBox.scrollTop = chatBox.scrollHeight;
});

function handleKey(e) { if (e.key === 'Enter') sendMessage(); }

function nextMatch() {
    socket.emit('disconnect-partner');
    startNewMatch();
}

socket.on('partner-disconnected', () => {
    setChatState(false);
    infoBar.innerText = "Vreemde is weggegaan.";
    document.getElementById('remoteBox').classList.add('hidden');
});