(function () {
  'use strict';

  const CHAT_SERVER_URL = 'wss://chat-server-df5x.onrender.com';

  let ownId = null;
  let selfName = 'Unknown';
  let selfHue = 0;

  let chatWs = null;
  let chatConnected = false;
  let currentGameKey = null;
  let chatReconnectTimer = null;
  let hasJoinedChat = false;
  let isAuthOpen = false;
  let shouldReconnect = true;

  const now = () => Date.now();
  const chatParticipants = new Set();

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

  function isAuthVisible() {
    return authModal && authModal.style.display !== 'none';
  }

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

  let isInputOpen = false;

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
    const savedPin = getAuthCookie();
    if (savedPin && savedPin.length > 0) return savedPin;
    const userPin = await showAuthModal();
    if (userPin && userPin.length > 0) return userPin;
    return null;
  }

  async function ensureChatClient() {
    if (chatWs && (chatWs.readyState === WebSocket.OPEN || chatWs.readyState === WebSocket.CONNECTING)) return;

    const pin = await getOrAskPin();
    if (!pin) return;

    chatWs = new WebSocket(CHAT_SERVER_URL);
    chatWs._tempPin = pin;

    chatWs.onopen = () => {
      chatWs.send(JSON.stringify({ type: 'auth', pin: pin }));
    };

    chatWs.onmessage = (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch (e) { return; }

      if (data.type === 'auth_success') {
        chatConnected = true;
        if (chatWs._tempPin) {
          setAuthCookie(chatWs._tempPin);
          chatWs._tempPin = null;
        }
        trySendJoinPresence();
      } else if (data.type === 'error') {
        if (data.message === 'Invalid PIN') {
          document.cookie = "chat_pin=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
          try { chatWs.close(); } catch { }
          alert("Invalid PIN. Please try again.");
        }
      } else if (data.type === 'chat') {
        const senderId = data.id != null ? (data.id >>> 0) : 0;
        chatParticipants.add(senderId);

        const isSelf = ownId != null && senderId === ownId;
        const who = isSelf ? 'You' : (data.name || ('ID' + senderId));
        const hue = isSelf ? (selfHue ?? 310) : (data.hue != null ? data.hue : 0);

        if (data.text) pushOverlayLine(who, data.text, hue, 'chat');
      } else if (data.type === 'presence') {
        const senderId = data.id != null ? (data.id >>> 0) : 0;
        const isSelf = ownId != null && senderId === ownId;

        if (data.state === 'join') {
          chatParticipants.add(senderId);
          if (!isSelf) pushOverlayLine(data.name || ('ID' + senderId), 'joined chat', data.hue, 'presence');
        } else if (data.state === 'leave') {
          chatParticipants.delete(senderId);
          if (!isSelf) pushOverlayLine(data.name || ('ID' + senderId), 'left chat', null, 'presence');
        }
      }
    };

    chatWs.onclose = () => {
      chatConnected = false;
      hasJoinedChat = false;
      chatParticipants.clear();

      const hadCookie = getAuthCookie().length > 0;
      chatWs = null;

      if (hadCookie && shouldReconnect) {
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

    chatWs.send(JSON.stringify({
      type: 'join',
      game: currentGameKey,
      id: ownId,
      name: selfName || 'Unknown',
      hue: (selfHue ?? 0)
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
    chatWs.send(JSON.stringify({ type: 'chat', text: String(text) }));
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

  function parseStarblastHash() {
    const raw = (location.hash || '');
    const h = raw.charAt(0) === '#' ? raw.slice(1) : raw;
    if (!h) return { room: null, endpoint: null };
    const at = h.indexOf('@');
    if (at === -1) return { room: h || null, endpoint: null };
    const room = h.slice(0, at) || null;
    const endpoint = h.slice(at + 1) || null;
    return { room, endpoint };
  }

  function findSettingsNode() {
    const root = window.module && window.module.exports && window.module.exports.settings;
    if (!root || typeof root !== 'object') return null;

    const candidates = Object.values(root);

    for (const node of candidates) {
      if (!node || typeof node !== 'object') continue;

      const gameName = node?.mode?.game_info?.name;
      const pName = node?.player_name;
      const hue = node?.hue;

      if (!gameName) continue;
      if (pName == null || hue == null) continue;

      const innerObjs = Object.values(node);
      let foundStatus = null;

      for (const inner of innerObjs) {
        if (!inner || typeof inner !== 'object') continue;
        const st = inner.status;
        if (!st || typeof st !== 'object') continue;
        if (st.id == null) continue;
        foundStatus = st;
        break;
      }

      if (foundStatus) return node;
    }

    return null;
  }

  function readSnapshot() {
    const node = findSettingsNode();
    if (!node) return null;

    const raw = (location.hash || '');
    const h = raw.charAt(0) === '#' ? raw.slice(1) : raw;
    if (!h) return null;

    const at = h.indexOf('@');
    const room = at === -1 ? h : h.slice(0, at);
    const endpoint = at === -1 ? null : h.slice(at + 1);

    if (!room) return null;

    const gameName = node?.mode?.game_info?.name;
    if (!gameName) return null;

    let st = null;
    for (const inner of Object.values(node)) {
      if (!inner || typeof inner !== 'object') continue;
      if (inner.status && typeof inner.status === 'object' && inner.status.id != null) {
        st = inner.status;
        break;
      }
    }
    if (!st) return null;

    const id = (st.id >>> 0);
    const alive = (typeof st.alive === 'boolean') ? st.alive : null;
    const left = (typeof st.left === 'boolean') ? st.left : null;

    const pName = node.player_name != null ? String(node.player_name) : null;
    const hue = node.hue != null ? Number(node.hue) : null;

    const gameKey = endpoint ? `${gameName}:${room}@${endpoint}` : `${gameName}:${room}`;
    const inGame = (alive === null ? true : alive === true) && (left === null ? true : left !== true);

    return { inGame, gameKey, id, pName, hue };
  }

  function handleLeaveGame() {
    shouldReconnect = false;
    currentGameKey = null;
    ownId = null;
    hasJoinedChat = false;
    chatParticipants.clear();
    closeChatInput();
    if (chatWs && (chatWs.readyState === WebSocket.OPEN || chatWs.readyState === WebSocket.CONNECTING)) {
      try { chatWs.close(1000, 'left game'); } catch { }
    }
  }

  function handleEnterOrUpdate(snapshot) {
    shouldReconnect = true;

    const newGameKey = snapshot.gameKey;
    const newId = snapshot.id;

    const changed = (currentGameKey !== newGameKey) || (ownId !== newId);
    currentGameKey = newGameKey;
    ownId = newId;
    selfName = snapshot.pName || 'Unknown';
    selfHue = (snapshot.hue ?? 0);

    if (changed) {
      hasJoinedChat = false;
      chatParticipants.clear();
    }

    ensureChatClient();
    trySendJoinPresence();
    mountUI();
    anchorOverlayToCanvas();
  }

  let lastInGame = false;

  setInterval(() => {
    const snap = readSnapshot();
    if (!snap || !snap.inGame) {
      if (lastInGame) handleLeaveGame();
      lastInGame = false;
      return;
    }
    lastInGame = true;
    handleEnterOrUpdate(snap);
  }, 700);
})();
