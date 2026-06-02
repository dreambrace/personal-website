(function () {
  let activeFloor = '0';
  let selectedRoomId = null;
  let searchResults = [];
  let highlightIdx = 0;
  let wasDrag = false;

  const mapContainer  = document.getElementById('map-container');
  const viewport      = document.getElementById('map-viewport');
  const sidebar       = document.getElementById('room-sidebar');
  const searchInput   = document.querySelector('.search-input');
  const searchClear   = document.querySelector('.search-clear');
  const searchDropdown = document.getElementById('search-dropdown');
  const anatomyCard   = document.getElementById('anatomy-card');

  function closeAnatomyCard() {
    if (anatomyCard.classList.contains('expanded')) {
      anatomyCard.classList.remove('expanded');
      anatomyCard.querySelector('.chev i').className = 'ti ti-plus';
    }
  }

  /* ── zoom / pan ── */

  let scale = 1, panX = 0, panY = 0;
  const SCALE_MIN = 0.8, SCALE_MAX = 5;

  function applyTransform() {
    viewport.style.transform = `translate(${panX}px,${panY}px) scale(${scale})`;
  }

  function centerOnRoom(id) {
    const room  = KOMPAS_ROOMS.find(r => r.id === id);
    const hid   = room?.tractId || id;
    const ids   = (room && room.group) ? room.group : [hid];
    const el    = findRoomEl(ids[0]);
    if (!el) return;
    const cw = mapContainer.offsetWidth, ch = mapContainer.offsetHeight;
    const pad = 24;
    const fit = Math.min((cw - pad * 2) / cw, (ch - pad * 2) / ch, 1);
    const r = el.getBoundingClientRect();
    const c = mapContainer.getBoundingClientRect();
    /* convert current screen centre → SVG root coords, then re-pan at fit scale */
    const svgX = (r.left + r.width  / 2 - c.left - panX) / scale;
    const svgY = (r.top  + r.height / 2 - c.top  - panY) / scale;
    scale = fit;
    panX  = cw / 2 - fit * svgX;
    panY  = ch / 2 - fit * svgY;
    applyTransform();
  }

  function resetTransform() {
    const cw = mapContainer.offsetWidth;
    const ch = mapContainer.offsetHeight;
    const pad = 24;
    const fit = Math.min((cw - pad * 2) / cw, (ch - pad * 2) / ch, 1);

    /* centre on the #image-anchor dot baked into each floor plan */
    const anchor = viewport.querySelector('#image-anchor');
    if (anchor) {
      scale = 1; panX = 0; panY = 0; applyTransform();   /* measure at identity */
      const a = anchor.getBoundingClientRect();
      const c = mapContainer.getBoundingClientRect();
      const lx = a.left + a.width  / 2 - c.left;
      const ly = a.top  + a.height / 2 - c.top;
      scale = fit;
      panX = cw / 2 - fit * lx;
      panY = ch / 2 - fit * ly;
    } else {
      scale = fit;
      panX = (cw * (1 - fit)) / 2;
      panY = (ch * (1 - fit)) / 2;
    }
    applyTransform();
  }

  function zoomTo(cx, cy, factor) {
    const next = Math.min(SCALE_MAX, Math.max(SCALE_MIN, scale * factor));
    const r = next / scale;
    panX = cx - r * (cx - panX);
    panY = cy - r * (cy - panY);
    scale = next;
    applyTransform();
  }

  function initZoomPan() {
    /* ── desktop: wheel + mouse drag ── */
    mapContainer.addEventListener('wheel', e => {
      e.preventDefault();
      const rect = mapContainer.getBoundingClientRect();
      zoomTo(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.12 : 1 / 1.12);
    }, { passive: false });

    let mousePrev = null;
    mapContainer.addEventListener('mousedown', e => {
      mousePrev = { x: e.clientX, y: e.clientY };
      wasDrag = false;
      e.preventDefault();
    });
    window.addEventListener('mousemove', e => {
      if (!mousePrev) return;
      const dx = e.clientX - mousePrev.x, dy = e.clientY - mousePrev.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) wasDrag = true;
      panX += dx; panY += dy;
      mousePrev = { x: e.clientX, y: e.clientY };
      applyTransform();
    });
    window.addEventListener('mouseup', () => {
      mousePrev = null;
      setTimeout(() => { wasDrag = false; }, 0);
    });

    /* ── mobile: touch drag + pinch + tap ── */
    const snap = touches => Array.from(touches).map(t => ({ x: t.clientX, y: t.clientY }));
    let t0 = null, tapEl = null;

    mapContainer.addEventListener('touchstart', e => {
      /* always preventDefault so the browser never intercepts as page zoom */
      e.preventDefault();
      if (e.touches.length === 1) {
        wasDrag = false;
        tapEl = e.target; /* remember what was touched for tap detection */
      } else {
        tapEl = null;     /* multi-touch can't be a tap */
      }
      t0 = snap(e.touches);
    }, { passive: false });

    mapContainer.addEventListener('touchmove', e => {
      e.preventDefault();
      if (!t0) return;
      const t1 = snap(e.touches);
      const rect = mapContainer.getBoundingClientRect();

      if (t1.length === 1 && t0.length >= 1) {
        const dx = t1[0].x - t0[0].x, dy = t1[0].y - t0[0].y;
        if (Math.abs(dx) + Math.abs(dy) > 3) { wasDrag = true; tapEl = null; }
        panX += dx; panY += dy;
        applyTransform();
      } else if (t1.length >= 2 && t0.length >= 2) {
        wasDrag = true; tapEl = null;
        const oldDist = Math.hypot(t0[1].x - t0[0].x, t0[1].y - t0[0].y);
        const newDist = Math.hypot(t1[1].x - t1[0].x, t1[1].y - t1[0].y);
        const oldMx = (t0[0].x + t0[1].x) / 2 - rect.left;
        const oldMy = (t0[0].y + t0[1].y) / 2 - rect.top;
        const newMx = (t1[0].x + t1[1].x) / 2 - rect.left;
        const newMy = (t1[0].y + t1[1].y) / 2 - rect.top;
        const next  = Math.min(SCALE_MAX, Math.max(SCALE_MIN, scale * (newDist / oldDist)));
        const r = next / scale;
        panX = newMx - r * (oldMx - panX);
        panY = newMy - r * (oldMy - panY);
        scale = next;
        applyTransform();
      }
      t0 = t1;
    }, { passive: false });

    mapContainer.addEventListener('touchend', e => {
      if (e.touches.length === 0) {
        /* tap: finger lifted without dragging */
        if (tapEl && !wasDrag) {
          const roomEl = tapEl.closest('.map-room');
          if (roomEl) {
            const id = roomId(roomEl);
            if (selectedRoomId === id) deselectRoom();
            else selectRoom(id);
          } else {
            deselectRoom(); /* tapped empty map area → close panel */
            closeAnatomyCard();
          }
        }
        tapEl = null;
        setTimeout(() => { wasDrag = false; }, 0);
      }
      t0 = snap(e.touches);
    }, { passive: false });
  }

  /* ── floor loading ── */

  async function loadFloor(floor) {
    activeFloor = floor;
    document.querySelectorAll('.floor-btn').forEach(btn =>
      btn.classList.toggle('active', btn.dataset.floor === floor));

    try {
      const res  = await fetch(`maps/floor-${floor}.svg`);
      const text = await res.text();
      viewport.innerHTML = text;
    } catch (e) {
      viewport.innerHTML = '<p class="map-error">Could not load floor plan.</p>';
      return;
    }
    /* Inkscape exports don't carry our class — add it so the theme CSS applies */
    viewport.querySelector('svg')?.classList.add('floor-svg');

    bindRoomEvents();
    resetTransform();

    if (selectedRoomId) {
      const room = KOMPAS_ROOMS.find(r => r.id === selectedRoomId);
      if (room && room.floor === floor) {
        const el = findRoomEl(selectedRoomId);
        if (el) el.classList.add('selected');
      }
    }
  }

  function roomId(el) {
    /* normalise: old format has "room-" prefix, new format uses the id directly */
    return el.id.startsWith('room-') ? el.id.slice(5) : el.id;
  }

  function findRoomEl(id) {
    return viewport.querySelector('#' + CSS.escape('room-' + id))
        || viewport.querySelector('#' + CSS.escape(id));
  }

  /* classify a room id into a colour group by its tract letter / kind */
  function tractClass(rawId) {
    const k = rawId.replace(/^\d+-/, '');           /* drop floor prefix */
    if (/mystery/i.test(k))            return 'mystery';
    if (/^D01$/i.test(k))               return 'service';    /* D-01 = offices, not a lecture hall */
    if (/^[ADEF]([-_]|\d|$)/.test(k))  return 'tract-a';   /* A + D halls + floor-3 wings E/F */
    if (/^B([-_]|\d|$)/.test(k))       return 'tract-b';
    if (/^C([-_]|\d|$)/.test(k))       return 'tract-c';
    if (/elevator|lift|toilet|^wc/i.test(k)) return 'util';
    return 'service';                                /* named offices/services + D halls */
  }

  function bindRoomEvents() {
    /* build reverse map: svgElementId → groupRoomId for all group entries */
    const groupMemberOf = {};
    KOMPAS_ROOMS.forEach(r => {
      if (r.group) r.group.forEach(gid => { groupMemberOf[gid] = r.id; });
    });

    viewport.querySelectorAll('[id]').forEach(el => {
      if (!/^\d+-/.test(el.id)) return;               /* skip structural elements */
      const cls = tractClass(el.id);
      if (cls === 'mystery') { el.classList.add('room-mystery'); return; }
      el.classList.add(cls);                          /* colour every room by tract */
      const targetId = groupMemberOf[el.id]
        || (KOMPAS_ROOMS.some(r => r.id === el.id) ? el.id : null);
      if (!targetId) return;                          /* no data → not interactive */
      el.classList.add('map-room');
      el.addEventListener('click', () => {
        if (wasDrag) return;
        if (selectedRoomId === targetId) deselectRoom(); else selectRoom(targetId);
      });
    });
  }

  /* ── room selection ── */

  function selectRoom(id) {
    viewport.querySelectorAll('.map-room.selected')
      .forEach(el => el.classList.remove('selected'));
    selectedRoomId = id;
    const room = KOMPAS_ROOMS.find(r => r.id === id);
    const highlightId = room?.tractId || id;
    const ids  = (room && room.group) ? room.group : [highlightId];
    ids.forEach(rid => {
      const el = findRoomEl(rid);
      if (el) { el.classList.add('selected'); el.parentNode.appendChild(el); }
    });
    if (room) openSidebar(room);
  }

  function deselectRoom() {
    viewport.querySelectorAll('.map-room.selected')
      .forEach(el => el.classList.remove('selected'));
    selectedRoomId = null;
    closeSidebar();
  }

  /* ── sidebar ── */

  const TRACT_COLOR = {
    'tract-a': 'var(--red)',
    'tract-b': 'var(--blue)',
    'tract-c': 'var(--green)',
    'util':    'var(--cat-sustavi)',
    'service': 'var(--teal)',
  };

  function openSidebar(room) {
    const lang  = KompasApp.getLang();
    const cat   = KOMPAS_ROOM_CATS[room.cat];
    const data  = room[lang];
    const color = TRACT_COLOR[tractClass(room.tractId || room.id)] || cat.color;

    document.getElementById('sb-name').textContent  = data.name;
    document.getElementById('sb-floor').textContent =
      room.floor === '0'
        ? (lang === 'hr' ? 'Prizemlje' : 'Ground floor')
        : (lang === 'hr' ? `${room.floor}. kat` : `${room.floor}${['st','nd','rd'][room.floor-1]||'th'} floor`);

    const icon = document.getElementById('sb-cat-icon');
    icon.className = `ti ${cat.icon}`;
    icon.style.color = color;
    document.getElementById('sb-cat-label').textContent = cat[lang];
    document.getElementById('sb-cat-label').style.color = color;

    document.getElementById('sb-desc').textContent = data.desc;

    const linkEl   = document.getElementById('sb-link');
    const linkText = document.getElementById('sb-link-text');
    if (data.link) {
      linkEl.href = data.link;
      linkText.textContent = lang === 'hr' ? 'Otvori web' : 'Open website';
      linkEl.style.display = '';
    } else {
      linkEl.style.display = 'none';
    }

    sidebar.classList.add('open');
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
  }

  /* ── search ── */

  function renderSearch(query) {
    if (!query.trim()) {
      hideDropdown();
      return;
    }
    const lang = KompasApp.getLang();
    const norm = s => s.toLowerCase().replace(/[-\s]/g, '');
    const qn   = norm(query);
    searchResults = KOMPAS_ROOMS.filter(r => {
      const d = r[lang];
      return norm(d.name).includes(qn)
        || norm(d.desc).includes(qn)
        || norm(r.id).includes(qn)
        || (r.aliases && r.aliases.some(a => {
        const na = norm(a);
        return na.includes(qn) || (qn.startsWith(na) && /^[a-c]+$/.test(qn.slice(na.length)));
      }));
    });
    /* if department entries matched, hide their parent tracts unless the
       query also directly matches the tract by name / id / alias */
    const matchedTractIds = new Set(searchResults.filter(r => r.tractId).map(r => r.tractId));
    if (matchedTractIds.size) {
      const aliasMatch = (r) => r.aliases && r.aliases.some(a => {
        const na = norm(a);
        return na.includes(qn) || (qn.startsWith(na) && /^[a-c]+$/.test(qn.slice(na.length)));
      });
      searchResults = searchResults.filter(r => {
        if (!matchedTractIds.has(r.id)) return true;
        const d = r[lang];
        return norm(d.name).includes(qn) || norm(r.id).includes(qn) || aliasMatch(r);
      });
    }
    if (!searchResults.length) { hideDropdown(); return; }
    highlightIdx = 0;
    renderDropdown(lang);
  }

  function renderDropdown(lang) {
    searchDropdown.innerHTML = searchResults.map((r, i) => {
      const cat   = KOMPAS_ROOM_CATS[r.cat];
      const floor = r.floor === '0' ? (lang === 'hr' ? 'P' : 'G') : r.floor;
      return `<li class="sr-item${i === 0 ? ' pre-selected' : ''}" data-index="${i}">
        <i class="ti ${cat.icon} sr-icon" style="color:${cat.color}"></i>
        <span class="sr-name">${r[lang].name}</span>
        <span class="sr-floor">${floor}</span>
      </li>`;
    }).join('');
    searchDropdown.style.display = 'block';

    searchDropdown.querySelectorAll('.sr-item').forEach(li => {
      li.addEventListener('mouseenter', () => {
        highlightIdx = +li.dataset.index;
        updateHighlight();
      });
      li.addEventListener('click', () => commitSearch(+li.dataset.index));
    });
  }

  function updateHighlight() {
    searchDropdown.querySelectorAll('.sr-item').forEach((li, i) =>
      li.classList.toggle('pre-selected', i === highlightIdx));
  }

  function hideDropdown() {
    searchDropdown.style.display = 'none';
    searchDropdown.innerHTML = '';
    searchResults = [];
    highlightIdx  = 0;
  }

  function commitSearch(index) {
    const room = searchResults[index];
    if (!room) return;
    searchInput.value = '';
    searchClear.style.display = 'none';
    hideDropdown();
    if (room.floor !== activeFloor) {
      loadFloor(room.floor).then(() => { selectRoom(room.id); centerOnRoom(room.id); });
    } else {
      selectRoom(room.id);
      centerOnRoom(room.id);
    }
  }

  /* ── language hook ── */

  window.applyLang = function (lang) {
    document.documentElement.dataset.lang = lang;

    searchInput.placeholder = lang === 'hr' ? 'Pretraži prostorije…' : 'Search rooms…';

    if (selectedRoomId) {
      const room = KOMPAS_ROOMS.find(r => r.id === selectedRoomId);
      if (room) openSidebar(room);
    }
    if (searchResults.length) renderDropdown(lang);
  };

  /* ── init ── */

  document.addEventListener('DOMContentLoaded', () => {
    const deepLink = location.hash.slice(1);
    const deepRoom = deepLink && KOMPAS_ROOMS.find(r => r.id === deepLink);
    const initFloor = deepRoom ? deepRoom.floor : '0';
    loadFloor(initFloor).then(() => { if (deepRoom) selectRoom(deepLink); });
    initZoomPan();

    document.querySelectorAll('.floor-btn').forEach(btn =>
      btn.addEventListener('click', () => {
        deselectRoom();
        loadFloor(btn.dataset.floor);
      }));

    document.getElementById('sb-close')
      .addEventListener('click', deselectRoom);

    searchInput.addEventListener('input', () => {
      const q = searchInput.value;
      searchClear.style.display = q ? 'block' : 'none';
      renderSearch(q);
    });

    searchInput.addEventListener('keydown', e => {
      if (!searchResults.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        highlightIdx = Math.min(highlightIdx + 1, searchResults.length - 1);
        updateHighlight();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        highlightIdx = Math.max(highlightIdx - 1, 0);
        updateHighlight();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        commitSearch(highlightIdx);
        searchInput.blur();
      } else if (e.key === 'Escape') {
        hideDropdown();
        searchInput.blur();
      }
    });

    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      searchClear.style.display = 'none';
      hideDropdown();
    });

    document.addEventListener('click', e => {
      if (!e.target.closest('.search-wrap')) hideDropdown();
      if (!e.target.closest('#anatomy-card')) closeAnatomyCard();
    });

    mapContainer.addEventListener('click', e => {
      if (wasDrag) return;
      if (!e.target.closest('.map-room')) deselectRoom();
    });

    /* keep panel anchored to visible area on mobile when user zooms */
    function pinToVisualViewport() {
      if (!window.visualViewport || window.innerWidth > 560) return;
      const offset = Math.max(0, Math.round(
        window.innerHeight - window.visualViewport.offsetTop - window.visualViewport.height
      ));
      sidebar.style.bottom = offset + 'px';
    }
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', pinToVisualViewport);
      window.visualViewport.addEventListener('scroll', pinToVisualViewport);
    }
  });
})();
