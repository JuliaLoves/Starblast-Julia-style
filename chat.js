(function () {
  'use strict';

  const playerInfo = {};
  let ownId = null;
  let wsRef = null;
  let isInputOpen = false;

  const chatParticipants = new Set();

  const now = () => Date.now();

  const overlay = document.createElement('div');
  overlay.id = 'juliaChatOverlay';
  const list = document.createElement('div');
  overlay.appendChild(list);
  const MAX_LINES = 10;
  const MESSAGE_LIFETIME = 10000;
  list.style.whiteSpace = 'pre-wrap';

  function pushOverlayLine(who, text, hue, kind) {
    const row = document.createElement('div');
    row.style.margin = '2px 0';
    row.style.opacity = '1';
    row.style.transition = 'opacity .4s ease';
    row.style.padding = '3px 6px';
    row.style.borderRadius = '6px';
    row.style.background = 'rgba(0,0,0,.35)';
    const nameSpan = document.createElement('span');
    nameSpan.textContent = who + ': ';
    nameSpan.style.fontWeight = '600';
    const msgSpan = document.createElement('span');
    msgSpan.textContent = text;
    if (kind === 'presence') {
      nameSpan.style.color = '#d8c455';
      msgSpan.style.color = '#d8c455';
      nameSpan.style.fontStyle = 'italic';
      msgSpan.style.fontStyle = 'italic';
    } else {
      nameSpan.style.color = typeof hue === 'number' ? `hsl(${hue},80%,60%)` : 'hsl(0,0%,85%)';
      msgSpan.style.color = 'hsl(0,0%,95%)';
    }
    row.appendChild(nameSpan);
    row.appendChild(msgSpan);
    list.appendChild(row);
    while (list.childElementCount > MAX_LINES) list.firstElementChild?.remove();
    const born = now();
    setTimeout(() => {
      if (now() - born >= MESSAGE_LIFETIME) {
        row.style.opacity = '0';
        setTimeout(() => row.remove(), 400);
      }
    }, MESSAGE_LIFETIME);
  }

  const inputWrap = document.createElement('div');
  Object.assign(inputWrap.style, {
    position: 'fixed',
    bottom: '16px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: '2147483647',
    display: 'none',
    gap: '8px',
    alignItems: 'center',
    background: 'rgba(0,0,0,.65)',
    padding: '8px 10px',
    borderRadius: '10px',
    backdropFilter: 'blur(5px)',
    boxShadow: '0 3px 10px rgba(0,0,0,.45)',
    border: '1px solid rgba(255,255,255,.15)'
  });
  const hint = document.createElement('span');
  hint.textContent = 'Shift+C — open/close • Enter — send';
  Object.assign(hint.style, {
    color: '#ddd',
    fontFamily: 'Play, system-ui, sans-serif',
    fontSize: '11pt',
    userSelect: 'none'
  });
  const input = document.createElement('input');
  Object.assign(input, {
    type: 'text',
    placeholder: 'Enter your message...',
    spellcheck: false,
    autocomplete: 'off'
  });
  Object.assign(input.style, {
    width: '360px',
    maxWidth: '64vw',
    outline: 'none',
    border: '1px solid rgba(255,255,255,.28)',
    background: 'rgba(0,0,0,.5)',
    color: 'white',
    padding: '8px 10px',
    borderRadius: '6px',
    fontSize: '12pt',
    fontFamily: 'Play, system-ui, sans-serif',
    boxShadow: '0 1px 3px rgba(0,0,0,.4)'
  });
  const sendBtn = document.createElement('button');
  sendBtn.textContent = 'Send';
  Object.assign(sendBtn.style, {
    border: 'none',
    padding: '8px 12px',
    borderRadius: '6px',
    color: 'white',
    background: 'linear-gradient(135deg, hsl(310,80%,55%), hsl(280,80%,50%))',
    cursor: 'pointer',
    fontSize: '12pt',
    fontFamily: 'Play, system-ui, sans-serif',
    boxShadow: '0 2px 6px rgba(0,0,0,.45)'
  });
  inputWrap.appendChild(hint);
  inputWrap.appendChild(input);
  inputWrap.appendChild(sendBtn);

  function anchorOverlayToCanvas() {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    let wrap = document.querySelector('.julia-canvas-wrap');
    const updateSize = () => {
      const cs = getComputedStyle(canvas);
      if (!wrap) return;
      wrap.style.width = cs.width;
      wrap.style.height = cs.height;
    };
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'julia-canvas-wrap';
      Object.assign(wrap.style, {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        zIndex: '9'
      });
      document.body.appendChild(wrap);
      updateSize();
      const ro = new ResizeObserver(updateSize);
      ro.observe(canvas);
      wrap.__resizeObs = ro;
    } else {
      updateSize();
    }
    if (overlay.parentNode !== wrap) wrap.appendChild(overlay);
    Object.assign(overlay.style, {
      position: 'absolute',
      top: '10px',
      left: '25%',
      maxWidth: '40vw',
      zIndex: '10',
      pointerEvents: 'none',
      fontFamily: 'Play, system-ui, sans-serif',
      fontSize: '12pt',
      lineHeight: '1.25',
      color: 'white',
      textShadow: '0 1px 2px rgba(0,0,0,.6)',
      filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.35))'
    });
  }

  function mountUI() {
    if (!document.body) return;
    anchorOverlayToCanvas();
    if (!document.getElementById('juliaChatInput')) {
      inputWrap.id = 'juliaChatInput';
      document.body.appendChild(inputWrap);
    }
  }

  const uiInterval = setInterval(() => {
    mountUI();
    if (overlay.parentNode) clearInterval(uiInterval);
  }, 50);

  let mqttReady = false;

  function openChatInput() {
    if (!mqttReady) return;
    mountUI();
    inputWrap.style.display = 'flex';
    isInputOpen = true;
    setTimeout(() => {
      input.focus({ preventScroll: true });
      input.select();
    }, 0);
  }

  function closeChatInput() {
    inputWrap.style.display = 'none';
    isInputOpen = false;
  }

  function toggleChatInput() {
    isInputOpen ? closeChatInput() : openChatInput();
  }

  document.addEventListener('keydown', (e) => {
    const target = e.target;
    const ourInput = target === input;
    if (e.shiftKey && (e.code === 'KeyC' || (e.key && e.key.toLowerCase() === 'c'))) {
      e.preventDefault();
      e.stopPropagation();
      toggleChatInput();
      return;
    }
    if (ourInput) {
      if (e.key === 'Enter' || e.code === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        trySendFromInput();
        return;
      }
      if (e.key === 'Escape' || e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeChatInput();
        return;
      }
      e.stopPropagation();
    } else if (isInputOpen) {
      e.stopPropagation();
    }
  }, true);

  // --- CHANGED CONFIGURATION HERE ---
  // Using WSS (WebSocket TLS) port 19392 for browser compatibility
  const MQTT_URL = 'wss://m2.wqtt.ru:19392'; 
  const MQTT_USER_ID = 'u_B8JXZU';
  const MQTT_USERNAME = 'u_B8JXZU';
  const MQTT_PASSWORD = 'UTk4FWqg';
  // ----------------------------------

  const MQTT_MIN_INTERVAL_MS = 1000;
  let mqttClient = null;
  let mqttCurrentTopic = null;
  let currentGameKey = null;
  let lastMqttSend = 0;
  let presenceJoined = false;

  function ensureMqttClient() {
    if (mqttClient) return;
    const clientId = 'jchat_' + Math.random().toString(16).slice(2);
    mqttClient = globalThis.mqtt.connect(MQTT_URL, {
      clientId: clientId,
      username: MQTT_USERNAME,
      password: MQTT_PASSWORD,
      clean: true,
      reconnectPeriod: 1000,
      connectTimeout: 5000
    });
    mqttClient.on('error', (err) => {
      console.error('[MQTT] error', err && err.message, err);
    });
    mqttClient.on('connect', () => {
      mqttReady = true;
      updateMqttSubscription();
      trySendJoinPresence();
    });
    mqttClient.on('message', (topic, payload) => {
      let text = '';
      try { text = payload.toString(); } catch { return; }
      let data = null;
      try { data = JSON.parse(text); } catch { return; }
      if (!data || typeof data.type !== 'string') return;
      if (data.game && currentGameKey && data.game !== currentGameKey) return;
      if (data.type === 'chat') {
        if (typeof data.text !== 'string') return;
        const senderId = data.id != null ? (data.id >>> 0) : 0;
        chatParticipants.add(senderId);
        const info = playerInfo[senderId] || {};
        const isSelf = ownId != null && senderId === ownId;
        const who = isSelf ? 'You' : (info.name || data.name || ('ID' + senderId));
        const hue = isSelf ? 310 : (info.hue != null ? info.hue : data.hue);
        if (data.text.trim().length > 0) pushOverlayLine(who, data.text, hue, 'chat');
      } else if (data.type === 'presence') {
        const senderId = data.id != null ? (data.id >>> 0) : 0;
        const info = playerInfo[senderId] || {};
        const isSelf = ownId != null && senderId === ownId;
        if (data.state === 'join') {
          chatParticipants.add(senderId);
          if (!isSelf) {
            const whoJ = info.name || data.name || ('ID' + senderId);
            const hueJ = info.hue != null ? info.hue : data.hue;
            pushOverlayLine(whoJ, 'joined chat', hueJ, 'presence');
          }
        } else if (data.state === 'leave') {
          chatParticipants.delete(senderId);
          if (!isSelf) {
            const whoL = info.name || data.name || ('ID' + senderId);
            const hueL = info.hue != null ? info.hue : data.hue;
            pushOverlayLine(whoL, 'left chat', hueL, 'presence');
          }
        }
      }
    });
  }

  function updateMqttSubscription() {
    if (!mqttClient || !mqttClient.connected) return;
    if (!currentGameKey) return;
    const topic = MQTT_USER_ID + '/julia_chat/' + currentGameKey;
    if (topic === mqttCurrentTopic) return;
    if (mqttCurrentTopic) mqttClient.unsubscribe(mqttCurrentTopic);
    mqttCurrentTopic = topic;
    mqttClient.subscribe(mqttCurrentTopic);
  }

  function publishMqttPayload(obj) {
    if (!obj) return;
    ensureMqttClient();
    if (!mqttClient || !mqttClient.connected) return;
    if (!currentGameKey) return;
    if (!mqttCurrentTopic) updateMqttSubscription();
    if (!mqttCurrentTopic) return;
    const t = now();
    if (t - lastMqttSend < MQTT_MIN_INTERVAL_MS) return;
    lastMqttSend = t;
    mqttClient.publish(mqttCurrentTopic, JSON.stringify(obj));
  }

  function trySendJoinPresence() {
    if (presenceJoined) return;
    if (!mqttClient || !mqttClient.connected) return;
    if (!currentGameKey) return;
    if (ownId == null) return;
    const info = playerInfo[ownId] || {};
    const payload = {
      type: 'presence',
      state: 'join',
      id: ownId,
      name: info.name || null,
      hue: info.hue != null ? info.hue : null,
      game: currentGameKey
    };
    publishMqttPayload(payload);
    chatParticipants.add(ownId);
    presenceJoined = true;
  }

  function sendMqttChat(text) {
    if (!text) return;
    if (!mqttReady) return;
    const info = ownId != null ? (playerInfo[ownId] || {}) : {};
    const payload = {
      type: 'chat',
      id: ownId,
      name: info.name || null,
      hue: info.hue != null ? info.hue : null,
      text: String(text),
      game: currentGameKey
    };
    publishMqttPayload(payload);
  }

  function trySendFromInput() {
    if (!mqttReady) return;
    const text = input.value;
    if (!text) return;
    sendMqttChat(text);
    input.value = '';
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.code === 'Enter') {
      e.preventDefault();
      trySendFromInput();
    } else if (e.key === 'Escape' || e.code === 'Escape') {
      e.preventDefault();
      closeChatInput();
    }
  });

  sendBtn.addEventListener('click', trySendFromInput);

  const OrigWS = window.WebSocket;
  window.WebSocket = function (...args) {
    const url = args[0];
    const ws = new OrigWS(...args);
    // Modified check to include the new domain if necessary, or simply allow the original behavior
    if (typeof url === 'string' && (url.indexOf('srv2.clusterfly.ru') !== -1 || url.indexOf('m2.wqtt.ru') !== -1)) {
      return ws;
    }
    initSocket(ws);
    wsRef = ws;
    return ws;
  };
  window.WebSocket.prototype = OrigWS.prototype;
  Object.setPrototypeOf(window.WebSocket, OrigWS);

  function initSocket(ws) {
    ws.addEventListener('message', (ev) => {
      if (typeof ev.data !== 'string') return;
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg && msg.name === 'welcome' && msg.data) {
        ensureMqttClient();
        const d = msg.data;
        const gName = String(d.name ?? 'unknown');
        const gId = d.systemid != null ? String(d.systemid) : '0';
        currentGameKey = gName + ':' + gId;
        updateMqttSubscription();
        trySendJoinPresence();
        setTimeout(anchorOverlayToCanvas, 500);
      }
      if (msg?.name === 'entered' && msg.data?.shipid != null) {
        ownId = msg.data.shipid >>> 0;
        trySendJoinPresence();
      }
      if (msg?.name === 'player_name' && msg.data) {
        const d = msg.data;
        playerInfo[d.id] = { name: d.player_name, hue: d.hue, custom: d.custom || {} };
      }
      if (msg?.name === 'shipgone' && msg.data != null) {
        const goneId = msg.data >>> 0;
        if (!chatParticipants.has(goneId)) return;
        const info = playerInfo[goneId] || {};
        const isSelf = ownId != null && goneId === ownId;
        if (isSelf) {
          chatParticipants.delete(goneId);
          closeChatInput();
          return;
        }
        const who = info.name || ('ID' + goneId);
        const hue = info.hue != null ? info.hue : null;
        pushOverlayLine(who, 'left game', hue, 'presence');
        chatParticipants.delete(goneId);
      }
    });
  }
})();
