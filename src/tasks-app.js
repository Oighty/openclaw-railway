// Served at /tasks/app.js
// Keep it maximally compatible (no build step).

(function () {
  var state = null;
  var view = 'week';

  var statusEl = document.getElementById('status');
  var listEl = document.getElementById('list');
  var hintEl = document.getElementById('viewHint');
  var weeklySummaryEl = document.getElementById('weeklySummary');

  var reloadBtn = document.getElementById('reload');
  var addBtn = document.getElementById('add');

  var newTitleEl = document.getElementById('newTitle');
  var newListEl = document.getElementById('newList');
  var newCtxEl = document.getElementById('newCtx');
  var newProjectEl = document.getElementById('newProject');
  var newAreaEl = document.getElementById('newArea');
  var newDueEl = document.getElementById('newDue');

  var weekPrevEl = document.getElementById('weekPrev');
  var weekNextEl = document.getElementById('weekNext');
  var weekTodayEl = document.getElementById('weekToday');

  // Week cursor: Monday-based week.
  var weekCursor = new Date();

  function pad2(n) { return String(n).padStart(2, '0'); }

  function isoDate(d) {
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
  }

  function startOfWeek(d) {
    // Monday-based week start.
    var x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    var day = x.getUTCDay(); // 0=Sun
    var delta = (day === 0) ? -6 : (1 - day);
    x.setUTCDate(x.getUTCDate() + delta);
    return x;
  }

  function addDays(d, n) {
    var x = new Date(d.getTime());
    x.setUTCDate(x.getUTCDate() + n);
    return x;
  }

  function httpJson(url, opts) {
    opts = opts || {};
    opts.credentials = 'same-origin';
    return fetch(url, opts).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (t) {
          throw new Error('HTTP ' + res.status + ': ' + (t || res.statusText));
        });
      }
      return res.json();
    });
  }

  function setStatus(s) {
    if (statusEl) statusEl.textContent = s;
  }

  function fmtMeta(t) {
    var parts = [];
    if (t.ctx) parts.push('ctx:' + t.ctx);
    if (t.project) parts.push('proj:' + t.project);
    if (t.area) parts.push('area:' + t.area);
    if (t.id) parts.push(t.id);
    return parts.join(' · ');
  }

  function isDeleted(t) { return !!(t && t.deletedAt); }

  function isDone(t) { return (t && (t.list === 'done' || t.completedAt)); }

  function dueInWeek(t, weekStart) {
    if (!t || !t.due) return false;
    var ds = String(t.due);
    // Compare as yyyy-mm-dd strings (UTC-ish) for simplicity.
    var start = isoDate(weekStart);
    var end = isoDate(addDays(weekStart, 7)); // exclusive
    return ds >= start && ds < end;
  }

  function renderNav() {
    var buttons = document.querySelectorAll('.nav button[data-view]');
    for (var i = 0; i < buttons.length; i++) {
      (function (btn) {
        btn.onclick = function () {
          view = btn.getAttribute('data-view');
          for (var j = 0; j < buttons.length; j++) buttons[j].classList.remove('active');
          btn.classList.add('active');
          render();
        };
      })(buttons[i]);
    }
  }

  function renderWeeklySummary(tasks, weekStart) {
    if (!weeklySummaryEl) return;
    var start = isoDate(weekStart);
    var end = isoDate(addDays(weekStart, 6));

    var due = [];
    var focus = [];

    for (var i = 0; i < tasks.length; i++) {
      var t = tasks[i];
      if (isDeleted(t)) continue;
      if (isDone(t)) continue;
      if (t.list === 'week') focus.push(t);
      if (dueInWeek(t, weekStart)) due.push(t);
    }

    var html = '';
    html += '<div class="muted">Week ' + start + ' → ' + end + '</div>';
    html += '<div style="margin-top:10px">';

    html += '<div class="pill">Focus items: ' + focus.length + '</div>';
    html += '<div class="pill">Due this week: ' + due.length + '</div>';

    html += '<div style="margin-top:10px" class="muted">Suggested review:</div>';
    html += '<ul class="muted">';
    html += '<li>Clear your Weekly list to only the most important outcomes.</li>';
    html += '<li>Move anything blocked to Waiting For (and write the person/date).</li>';
    html += '<li>Keep Next Actions bite-sized and context-specific.</li>';
    html += '</ul>';

    html += '</div>';
    weeklySummaryEl.innerHTML = html;
  }

  function renderList(tasks) {
    if (!listEl) return;
    listEl.innerHTML = '';

    var weekStart = startOfWeek(weekCursor);

    var filtered = [];
    for (var i = 0; i < tasks.length; i++) {
      var t = tasks[i];
      if (!t || isDeleted(t)) continue;

      if (view === 'week') {
        if (t.list === 'week' || dueInWeek(t, weekStart)) filtered.push(t);
        continue;
      }

      if (view === 'done') {
        if (isDone(t)) filtered.push(t);
        continue;
      }

      if (!isDone(t) && t.list === view) filtered.push(t);
    }

    // Sort: due asc, then updated desc.
    filtered.sort(function (a, b) {
      var ad = a.due || '9999-12-31';
      var bd = b.due || '9999-12-31';
      if (ad < bd) return -1;
      if (ad > bd) return 1;
      var au = a.updatedAt || '';
      var bu = b.updatedAt || '';
      if (au > bu) return -1;
      if (au < bu) return 1;
      return 0;
    });

    if (view === 'week') {
      var ws = isoDate(weekStart);
      hintEl.textContent = 'Weekly view = items you chose for the week + anything due in the current week. (Week starts Monday: ' + ws + ')';
    } else if (view === 'next') {
      hintEl.textContent = 'Next Actions: physical, visible, single-step actions. Keep the list small.';
    } else if (view === 'waiting') {
      hintEl.textContent = 'Waiting For: delegated / blocked items. Include who you are waiting on.';
    } else if (view === 'someday') {
      hintEl.textContent = 'Someday/Maybe: incubate ideas without committing.';
    } else if (view === 'done') {
      hintEl.textContent = 'Done: completed items.';
    }

    if (!filtered.length) {
      listEl.innerHTML = '<div class="muted" style="margin-top:10px">No tasks in this view.</div>';
      renderWeeklySummary(tasks, weekStart);
      return;
    }

    for (var j = 0; j < filtered.length; j++) {
      (function (t) {
        var row = document.createElement('div');
        row.className = 'task';

        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = isDone(t);
        cb.style.marginTop = '4px';

        cb.onchange = function () {
          updateTask(t.id, { complete: cb.checked });
        };

        var body = document.createElement('div');
        body.style.flex = '1';

        var title = document.createElement('div');
        title.className = 'titleText';
        title.textContent = t.title || '(untitled)';

        title.ondblclick = function () {
          var nextTitle = prompt('Edit task title:', t.title || '');
          if (nextTitle == null) return;
          updateTask(t.id, { title: String(nextTitle) });
        };

        var meta = document.createElement('div');
        meta.className = 'meta';
        meta.textContent = fmtMeta(t);

        var pills = document.createElement('div');
        pills.style.marginTop = '6px';

        if (t.due) {
          var p = document.createElement('span');
          p.className = 'pill due';
          p.textContent = 'due ' + t.due;
          pills.appendChild(p);
        }

        var p2 = document.createElement('span');
        p2.className = 'pill';
        p2.textContent = 'list:' + (t.list || '');
        pills.appendChild(p2);

        if (isDone(t)) {
          var p3 = document.createElement('span');
          p3.className = 'pill done';
          p3.textContent = 'done' + (t.completedAt ? (' ' + String(t.completedAt).slice(0, 10)) : '');
          pills.appendChild(p3);
        }

        var actions = document.createElement('div');
        actions.style.display = 'flex';
        actions.style.gap = '8px';

        var moveBtn = document.createElement('button');
        moveBtn.className = 'btn';
        moveBtn.textContent = 'Move';
        moveBtn.onclick = function () {
          var nextList = prompt('Move to list: week | next | waiting | someday | done', t.list || 'next');
          if (!nextList) return;
          updateTask(t.id, { list: String(nextList).trim() });
        };

        var dueBtn = document.createElement('button');
        dueBtn.className = 'btn';
        dueBtn.textContent = 'Due';
        dueBtn.onclick = function () {
          var nextDue = prompt('Due date (YYYY-MM-DD), empty to clear:', t.due || '');
          if (nextDue == null) return;
          updateTask(t.id, { due: String(nextDue).trim() });
        };

        var delBtn = document.createElement('button');
        delBtn.className = 'btn danger';
        delBtn.textContent = 'Delete';
        delBtn.onclick = function () {
          if (!confirm('Delete this task? (soft delete)')) return;
          updateTask(t.id, { delete: true });
        };

        actions.appendChild(moveBtn);
        actions.appendChild(dueBtn);
        actions.appendChild(delBtn);

        body.appendChild(title);
        body.appendChild(meta);
        body.appendChild(pills);

        row.appendChild(cb);
        row.appendChild(body);
        row.appendChild(actions);

        listEl.appendChild(row);
      })(filtered[j]);
    }

    renderWeeklySummary(tasks, weekStart);
  }

  function render() {
    if (!state || !state.tasks) return;
    renderList(state.tasks);
  }

  function refresh() {
    setStatus('Loading…');
    return httpJson('/tasks/api/state').then(function (j) {
      state = (j && j.state) ? j.state : { tasks: [] };
      if (state._error) {
        setStatus('Error: ' + state._error);
      } else {
        setStatus('Loaded ' + (state.tasks ? state.tasks.length : 0) + ' tasks · updated ' + (state.updatedAt || '')); 
      }
      render();
    }).catch(function (e) {
      setStatus('Error: ' + String(e));
    });
  }

  function addTask() {
    var title = newTitleEl ? String(newTitleEl.value || '').trim() : '';
    if (!title) return;

    var payload = {
      title: title,
      list: newListEl ? newListEl.value : 'next',
      ctx: newCtxEl ? newCtxEl.value : '',
      project: newProjectEl ? String(newProjectEl.value || '').trim() : '',
      area: newAreaEl ? String(newAreaEl.value || '').trim() : '',
      due: newDueEl ? String(newDueEl.value || '').trim() : ''
    };

    setStatus('Adding…');
    return httpJson('/tasks/api/task', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function () {
      if (newTitleEl) newTitleEl.value = '';
      return refresh();
    }).catch(function (e) {
      setStatus('Error: ' + String(e));
    });
  }

  function updateTask(id, patch) {
    setStatus('Saving…');
    return httpJson('/tasks/api/task/' + encodeURIComponent(id), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch)
    }).then(function () {
      return refresh();
    }).catch(function (e) {
      setStatus('Error: ' + String(e));
    });
  }

  function moveWeek(deltaWeeks) {
    weekCursor = startOfWeek(weekCursor);
    weekCursor = addDays(weekCursor, deltaWeeks * 7);
    render();
  }

  renderNav();

  if (reloadBtn) reloadBtn.onclick = refresh;
  if (addBtn) addBtn.onclick = addTask;
  if (newTitleEl) {
    newTitleEl.onkeydown = function (e) {
      if (e && e.key === 'Enter') addTask();
    };
  }

  if (weekPrevEl) weekPrevEl.onclick = function () { moveWeek(-1); };
  if (weekNextEl) weekNextEl.onclick = function () { moveWeek(1); };
  if (weekTodayEl) weekTodayEl.onclick = function () { weekCursor = new Date(); render(); };

  refresh();
})();
