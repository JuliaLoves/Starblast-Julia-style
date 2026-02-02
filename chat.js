(function () {
  'use strict';

  const CHAT_SERVER_URL = 'wss://chat-server-df5x.onrender.com';

  const playerInfo = {};
  let ownId = null;
  let wsRef = null;
  let isInputOpen = false;
  let chatWs = null;
  let chatConnected = false;
  let currentGameKey = null;
  let chatReconnectTimer = null;
  let hasJoinedChat = false;
  let isAuthOpen = false;

  function isAuthVisible() {
    return authModal && authModal.style.display !== 'none';
  }

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
  hint.textContent = 'Alt+C — open/close • Enter — send';
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
  const applyInputStyle = (el) => {
    Object.assign(el.style, {
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
  };

  applyInputStyle(input);
  input.style.width = '360px';
  input.style.maxWidth = '64vw';

  const sendBtn = document.createElement('button');
  sendBtn.textContent = 'Send';

  const applyButtonStyle = (el, primary = true) => {
    Object.assign(el.style, {
      border: 'none',
      padding: '8px 12px',
      borderRadius: '6px',
      color: 'white',
      cursor: 'pointer',
      fontSize: '12pt',
      fontFamily: 'Play, system-ui, sans-serif',
      boxShadow: '0 2px 6px rgba(0,0,0,.45)',
      fontWeight: 'normal'
    });
    if (primary) {
      el.style.background = 'linear-gradient(135deg, hsl(310,80%,55%), hsl(280,80%,50%))';
    } else {
      el.style.background = 'transparent';
      el.style.border = '1px solid rgba(255,255,255,.2)';
      el.style.color = '#ccc';
      el.style.boxShadow = 'none';
    }
  };

  applyButtonStyle(sendBtn);

  inputWrap.appendChild(hint);
  inputWrap.appendChild(input);
  inputWrap.appendChild(sendBtn);

  const authModal = document.createElement('div');
  Object.assign(authModal.style, {
    position: 'fixed',
    top: '0', left: '0', width: '100%', height: '100%',
    zIndex: '2147483648',
    background: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(2px)',
    display: 'none',
    justifyContent: 'center',
    alignItems: 'center'
  });

  const authBox = document.createElement('div');
  Object.assign(authBox.style, {
    background: 'rgba(0,0,0,.65)',
    border: '1px solid rgba(255,255,255,.15)',
    borderRadius: '10px',
    backdropFilter: 'blur(5px)',
    padding: '20px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
    width: '280px'
  });

  const authTitle = document.createElement('h3');
  authTitle.textContent = 'Authorization';
  Object.assign(authTitle.style, {
    margin: '0 0 4px 0',
    color: '#ddd',
    fontFamily: 'Play, sans-serif',
    fontSize: '13pt',
    textAlign: 'center',
    fontWeight: 'normal'
  });

  const authInput = document.createElement('input');
  authInput.type = 'password';
  authInput.placeholder = 'PIN code';
  applyInputStyle(authInput);
  authInput.style.textAlign = 'center';
  authInput.style.letterSpacing = '2px';

  const btnRow = document.createElement('div');
  btnRow.style.display = 'flex';
  btnRow.style.gap = '8px';
  btnRow.style.marginTop = '4px';

  const authBtn = document.createElement('button');
  authBtn.textContent = 'Login';
  applyButtonStyle(authBtn, true);
  authBtn.style.flex = '1';

  const authCancel = document.createElement('button');
  authCancel.textContent = 'Cancel';
  applyButtonStyle(authCancel, false);
  authCancel.style.flex = '1';
  authCancel.style.fontSize = '11pt';

  authBox.appendChild(authTitle);
  authBox.appendChild(authInput);
  btnRow.appendChild(authBtn);
  btnRow.appendChild(authCancel);
  authBox.appendChild(btnRow);
  authModal.appendChild(authBox);

  let authResolve = null;

  function showAuthModal() {
    return new Promise((resolve) => {
      if (document.body && !document.getElementById('juliaAuthModal')) {
        authModal.id = 'juliaAuthModal';
        document.body.appendChild(authModal);
      }
      isAuthOpen = true;
      closeChatInput();
      authModal.style.display = 'flex';
      authInput.value = '';
      authInput.focus();
      authResolve = resolve;
    });
  }

  function hideAuthModal() {
    authModal.style.display = 'none';
    isAuthOpen = false;
    authResolve = null;
  }

  function authKeyShield(e) {
    if (!isAuthOpen || !isAuthVisible()) return;

    e.stopImmediatePropagation();
  }

  window.addEventListener('keydown', authKeyShield, true);
  window.addEventListener('keypress', authKeyShield, true);
  window.addEventListener('keyup', authKeyShield, true);

  authBtn.onclick = () => {
    const val = authInput.value.trim();
    if (val && authResolve) {
      authResolve(val);
      hideAuthModal();
    }
  };

  authCancel.onclick = () => {
    if (authResolve) authResolve(null);
    hideAuthModal();
  };

  authInput.onkeydown = (e) => {
    if (e.key === 'Enter') authBtn.click();
    if (e.key === 'Escape') authCancel.click();
  };

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
    if (!document.getElementById('juliaAuthModal')) {
      authModal.id = 'juliaAuthModal';
      document.body.appendChild(authModal);
    }
  }

  const uiInterval = setInterval(() => {
    mountUI();
    if (overlay.parentNode) clearInterval(uiInterval);
  }, 50);

  function openChatInput() {
    if (!chatConnected) {
      ensureChatClient();
      return;
    }
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
    if (isAuthOpen) return;
    const target = e.target;
    const ourInput = target === input;
    if (e.altKey && (e.code === 'KeyC' || (e.key && e.key.toLowerCase() === 'c'))) {
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

  function setAuthCookie(pin) {
    const d = new Date();
    d.setTime(d.getTime() + (30 * 24 * 60 * 60 * 1000));
    document.cookie = "chat_pin=" + encodeURIComponent(pin) + ";expires=" + d.toUTCString() + ";path=/";
  }

  function getAuthCookie() {
    const name = "chat_pin=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i];
      while (c.charAt(0) === ' ') c = c.substring(1);
      if (c.indexOf(name) === 0) return decodeURIComponent(c.substring(name.length, c.length));
    }
    return "";
  }

  async function getOrAskPin() {
    let savedPin = getAuthCookie();
    if (savedPin && savedPin.length > 0) return savedPin;

    const userPin = await showAuthModal();
    if (userPin && userPin.length > 0) return userPin;
    return null;
  }

  async function ensureChatClient() {
    if (chatWs && (chatWs.readyState === WebSocket.OPEN || chatWs.readyState === WebSocket.CONNECTING)) return;

    const pin = await getOrAskPin();
    if (!pin) {
      console.log('[JuliaChat] Access denied: No PIN entered');
      return;
    }

    chatWs = new WebSocket(CHAT_SERVER_URL);
    chatWs._tempPin = pin;

    chatWs.onopen = () => {
      console.log('[JuliaChat] Connecting...');
      chatWs.send(JSON.stringify({ type: 'auth', pin: pin }));
    };

    chatWs.onmessage = (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch (e) { return; }

      if (data.type === 'auth_success') {
        chatConnected = true;
        console.log('[JuliaChat] Auth success!');
        if (chatWs._tempPin) {
          setAuthCookie(chatWs._tempPin);
          chatWs._tempPin = null;
        }
        trySendJoinPresence();
      }
      else if (data.type === 'error') {
        console.error('[JuliaChat] Error:', data.message);
        if (data.message === 'Invalid PIN') {
          document.cookie = "chat_pin=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
          chatWs.close();
          alert("Invalid PIN. Please try again.");
        }
      }
      else if (data.type === 'chat') {
        const senderId = data.id != null ? (data.id >>> 0) : 0;
        chatParticipants.add(senderId);

        const info = playerInfo[senderId] || {};
        const isSelf = ownId != null && senderId === ownId;
        const who = isSelf ? 'You' : (info.name || data.name || ('ID' + senderId));
        const hue = isSelf ? 310 : (info.hue != null ? info.hue : data.hue);

        if (data.text) pushOverlayLine(who, data.text, hue, 'chat');
      }
      else if (data.type === 'presence') {
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
            pushOverlayLine(whoL, 'left chat', null, 'presence');
          }
        }
      }
    };

    chatWs.onclose = () => {
      chatConnected = false;
      hasJoinedChat = false;
      chatWs = null;

      if (getAuthCookie().length > 0) {
        if (!chatReconnectTimer) {
          chatReconnectTimer = setTimeout(() => {
            chatReconnectTimer = null;
            ensureChatClient();
          }, 5000);
        }
      }
    };
  }

  function trySendJoinPresence() {
    if (!chatWs || !chatConnected) return;
    if (!currentGameKey || ownId == null) return;
    if (hasJoinedChat) return;

    const info = playerInfo[ownId] || {};
    chatWs.send(JSON.stringify({
      type: 'join',
      game: currentGameKey,
      id: ownId,
      name: info.name || 'Unknown',
      hue: info.hue || 0
    }));
    hasJoinedChat = true;
    chatParticipants.add(ownId);
  }

  function sendChatText(text) {
    if (!text) return;
    if (!chatConnected) {
      ensureChatClient();
      return;
    }
    chatWs.send(JSON.stringify({
      type: 'chat',
      text: String(text)
    }));
  }

  function trySendFromInput() {
    if (!chatConnected) {
      ensureChatClient();
      return;
    }
    const text = input.value;
    if (!text) return;
    sendChatText(text);
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

    if (typeof url === 'string' && url.includes('onrender.com')) {
      return ws;
    }

    initGameSocketHook(ws);
    wsRef = ws;
    return ws;
  };
  window.WebSocket.prototype = OrigWS.prototype;
  Object.setPrototypeOf(window.WebSocket, OrigWS);

  function initGameSocketHook(ws) {
    ws.addEventListener('message', (ev) => {
      if (typeof ev.data !== 'string') return;
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }

      if (msg && msg.name === 'welcome' && msg.data) {
        ensureChatClient();

        const d = msg.data;
        const gName = String(d.name ?? 'unknown');
        const gId = d.systemid != null ? String(d.systemid) : '0';
        currentGameKey = gName + ':' + gId;

        hasJoinedChat = false;
        setTimeout(trySendJoinPresence, 1000);
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
          hasJoinedChat = false;
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
