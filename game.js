(function () {
  const { RULES, stats } = window.Riddlelock;
  const $ = (s) => document.querySelector(s);

  const HINT_COST = 75;
  const FAIL_COST = 50;
  const PEEK_COST = 150;
  const TILTS = [-1.4, 0.9, -0.6, 1.3, -1, 0.5, 1.1, -1.2, 0.7, -0.4, 1.4, -0.8];

  const FAIL_LINES = [
    "Nope. Have you tried writing it on a sticky note? Oh wait, you did.",
    "Wrong again. I'm starting to think you never knew it.",
  ];

  const state = {
    revealed: 0,
    passing: new Set(),
    hints: new Set(),
    start: null,
    end: null,
    timer: null,
    secret: "",
    attempts: 3,
    fails: 0,
    peeks: 0,
  };
  const cards = {};

  const els = {
    pw: $("#pw"), rules: $("#rules"), keeper: $("#keeper"), face: $("#keeper-face"),
    progress: $("#stat-progress"), len: $("#stat-len"), time: $("#stat-time"), score: $("#stat-score"),
    lock: $("#lock"), noteStep: $("#note-step"), noteInput: $("#note-input"), noteCount: $("#note-count"),
    seal: $("#seal"), phase1: $("#phase1"), phase2: $("#phase2"), noteShow: $("#note-show"),
    pw2: $("#pw2"), chips: $("#chips"), unlock: $("#unlock"), attempts: $("#attempts"), len2: $("#stat-len2"),
    lockout: $("#lockout"), petForm: $("#pet-form"), pet: $("#pet"), peek: $("#peek"),
    win: $("#win"),
  };

  // ---------- helpers ----------
  function say(html, face) {
    els.keeper.innerHTML = html;
    els.face.textContent = face || "🔒";
    els.face.classList.remove("talk");
    void els.face.offsetWidth;
    els.face.classList.add("talk");
  }

  function elapsed() {
    if (!state.start) return 0;
    return Math.floor(((state.end || Date.now()) - state.start) / 1000);
  }

  function fmt(sec) {
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  }

  function score() {
    const s = 1000 - state.hints.size * HINT_COST - state.fails * FAIL_COST - state.peeks * PEEK_COST - Math.floor(elapsed() / 3);
    return Math.max(0, s);
  }

  function tick() {
    els.time.textContent = fmt(elapsed());
    els.score.textContent = `Score ${score()}`;
  }

  function startTimer() {
    if (state.start) return;
    state.start = Date.now();
    state.timer = setInterval(tick, 1000);
  }

  function restart(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  // ---------- phase 1: rules ----------
  function makeCard(rule) {
    const el = document.createElement("article");
    el.className = "rule enter";
    el.style.setProperty("--tilt", `${TILTS[(rule.id - 1) % TILTS.length]}deg`);
    el.innerHTML = `
      <div class="rule-head"><span>Rule ${rule.id}</span><span class="mark" aria-hidden="true"></span></div>
      <p class="riddle"></p>
      <p class="status"></p>
      <button class="decode" type="button">Decode hint (−${HINT_COST} pts)</button>
      <p class="hint" hidden></p>`;
    el.querySelector(".riddle").textContent = rule.riddle;
    el.querySelector(".hint").textContent = rule.hint;
    el.querySelector(".decode").addEventListener("click", (e) => {
      state.hints.add(rule.id);
      e.currentTarget.remove();
      el.querySelector(".hint").hidden = false;
      tick();
    });
    el.addEventListener("animationend", () => el.classList.remove("enter", "broke"));
    cards[rule.id] = el;
    return el;
  }

  function update() {
    const p = els.pw.value;
    if (p) startTimer();

    let results = RULES.map((r) => r.check(p));
    let newest = null;
    while (state.revealed < RULES.length && results.slice(0, state.revealed).every(Boolean)) {
      newest = RULES[state.revealed];
      makeCard(newest);
      state.revealed++;
    }

    const shown = RULES.slice(0, state.revealed);
    const broken = shown.filter((r) => state.passing.has(r.id) && !results[r.id - 1]);

    shown.forEach((r) => {
      const ok = results[r.id - 1];
      const el = cards[r.id];
      el.classList.toggle("pass", ok);
      el.classList.toggle("fail", !ok);
      el.querySelector(".mark").textContent = ok ? "✓" : "✗";
      el.setAttribute("aria-label", `Rule ${r.id}: ${ok ? "passing" : "failing"}`);
      el.querySelector(".status").textContent = r.status ? r.status(p) : "";
      if (ok) state.passing.add(r.id);
      else state.passing.delete(r.id);
    });
    broken.forEach((r) => restart(cards[r.id], "broke"));

    // Failing notes float to the top, newest first.
    const order = [...shown].sort((a, b) => results[a.id - 1] - results[b.id - 1] || b.id - a.id);
    const current = [...els.rules.children].map((c) => c.dataset.id).join();
    if (current !== order.map((r) => r.id).join()) {
      order.forEach((r) => {
        cards[r.id].dataset.id = r.id;
        els.rules.appendChild(cards[r.id]);
      });
    }

    const passed = shown.filter((r) => results[r.id - 1]).length;
    const allDone = state.revealed === RULES.length && passed === RULES.length;
    els.progress.textContent = `${passed} / ${RULES.length} rules`;
    els.len.textContent = `${p.length} chars`;
    els.lock.disabled = !allDone;
    els.lock.classList.toggle("ready", allDone);

    if (allDone) say("…I hate to admit it, but that's a magnificent password. <b>Lock it in.</b>", "😤");
    else if (newest) say(newest.keeper);
    else if (broken.length) say(`Rule ${broken.map((r) => r.id).join(" & ")} just broke. Rules are fragile. Like me.`, "😬");
  }

  // ---------- phase 2: the forgetting ----------
  function openNoteStep() {
    els.pw.disabled = true;
    els.lock.hidden = true;
    els.lock.nextElementSibling.hidden = true;
    els.noteStep.hidden = false;
    els.noteInput.focus();
    say("Before I seal it, write yourself a note. <b>One note.</b> Twenty characters. Like a real office.", "📝");
  }

  function seal() {
    state.secret = els.pw.value;
    els.noteShow.textContent = els.noteInput.value.trim() || "(you wrote nothing. bold.)";
    els.pw.value = "";
    els.phase1.hidden = true;
    els.rules.hidden = true;
    els.phase2.hidden = false;

    els.chips.innerHTML = RULES.map((r) => `<span class="chip fail" data-id="${r.id}" title="Rule ${r.id}">${r.id}</span>`).join("");
    updateChips();
    els.pw2.focus();
    say("Security policy says I must forget your password now. So must you. Type it back <b>exactly</b>. Three tries.", "🙈");
  }

  function updateChips() {
    const p = els.pw2.value;
    RULES.forEach((r) => {
      const ok = r.check(p);
      const chip = els.chips.querySelector(`[data-id="${r.id}"]`);
      chip.classList.toggle("pass", ok);
      chip.classList.toggle("fail", !ok);
    });
    els.len2.textContent = `${p.length} chars`;
  }

  function tryUnlock() {
    if (state.attempts <= 0) return;
    if (els.pw2.value === state.secret) return win();

    state.fails++;
    state.attempts--;
    els.attempts.textContent = `${state.attempts} attempt${state.attempts === 1 ? "" : "s"} left`;
    restart(els.pw2, "shake");
    tick();

    if (state.attempts === 0) {
      els.pw2.disabled = true;
      els.unlock.disabled = true;
      els.lockout.hidden = false;
      els.peek.hidden = true;
      els.pet.value = "";
      els.pet.focus();
      say("<b>LOCKED OUT.</b> Answer your security question to reset. Very secure. Totally unguessable.", "🚨");
    } else {
      say(state.attempts === 1 ? "Last try. Breathe. Check the little numbers." : FAIL_LINES[state.fails % FAIL_LINES.length], "🙄");
    }
  }

  function securityReset(e) {
    e.preventDefault();
    const pet = els.pet.value.trim();
    state.peeks++;
    tick();
    say(`"${escapeHtml(pet)}"? Correct! (We don't actually check. Nobody does.) Here's your password for <b>4 seconds</b>.`, "🐶");

    let left = 4;
    els.peek.hidden = false;
    const show = () => (els.peek.textContent = `${state.secret}   ·  ${left}s`);
    show();
    const iv = setInterval(() => {
      left--;
      if (left > 0) return show();
      clearInterval(iv);
      els.lockout.hidden = true;
      state.attempts = 3;
      els.attempts.textContent = "3 attempts left";
      els.pw2.disabled = false;
      els.unlock.disabled = false;
      els.pw2.value = "";
      updateChips();
      els.pw2.focus();
      say("Memory refreshed. Three more tries. Don't make me ask about your pet again.", "🔒");
    }, 1000);
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  // ---------- win ----------
  function rank(s) {
    if (s >= 800) return "Vault Whisperer";
    if (s >= 550) return "Lock Picker";
    if (s >= 250) return "Sticky-Note Survivor";
    return "Post-it Person";
  }

  function entropyBits(p) {
    let pool = 0;
    if (/[a-z]/.test(p)) pool += 26;
    if (/[A-Z]/.test(p)) pool += 26;
    if (/\d/.test(p)) pool += 10;
    if (/[^a-z0-9]/i.test(p)) pool += 33;
    return Math.round(p.length * Math.log2(pool || 1));
  }

  function win() {
    state.end = Date.now();
    clearInterval(state.timer);
    tick();
    const s = score();
    $("#win-rank").textContent = rank(s);
    $("#w-score").textContent = s;
    $("#w-time").textContent = fmt(elapsed());
    $("#w-hints").textContent = state.hints.size;
    $("#w-fails").textContent = state.fails;
    $("#w-strength").textContent =
      `Your ${state.secret.length}-character password has roughly ${entropyBits(state.secret)} bits of entropy, ` +
      `12 riddles' worth of meaning and one sticky note. Please never use it anywhere real.`;
    els.win.hidden = false;
    els.pw2.disabled = true;
    say("It's really you! Vault open. I'll miss these rules.", "🥳");
    confetti();
    $("#again").focus();
  }

  function brag() {
    const text = `I cracked Riddlelock in ${fmt(elapsed())} with ${state.hints.size} hint(s) and ${state.fails} wrong tries. Rank: ${rank(score())} 🔐`;
    const btn = $("#brag");
    try {
      navigator.clipboard.writeText(text).then(
        () => (btn.textContent = "Copied!"),
        () => (btn.textContent = "Couldn't copy")
      );
    } catch {
      btn.textContent = "Couldn't copy";
    }
  }

  function confetti() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const cv = $("#confetti");
    const ctx = cv.getContext("2d");
    const W = (cv.width = innerWidth);
    const H = (cv.height = innerHeight);
    const colors = ["#d6a93b", "#1d2657", "#23702f", "#b3261e", "#fff1a8"];
    const bits = Array.from({ length: 160 }, () => ({
      x: Math.random() * W, y: -20 - Math.random() * H * 0.5,
      w: 6 + Math.random() * 6, h: 8 + Math.random() * 8,
      vy: 2 + Math.random() * 3, vx: -1.5 + Math.random() * 3,
      r: Math.random() * Math.PI, vr: -0.2 + Math.random() * 0.4,
      c: colors[(Math.random() * colors.length) | 0],
    }));
    const until = Date.now() + 3500;
    (function frame() {
      ctx.clearRect(0, 0, W, H);
      bits.forEach((b) => {
        b.x += b.vx; b.y += b.vy; b.r += b.vr;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.r);
        ctx.fillStyle = b.c;
        ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
        ctx.restore();
      });
      if (Date.now() < until) requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, W, H);
    })();
  }

  // ---------- wiring ----------
  els.pw.addEventListener("input", update);
  els.lock.addEventListener("click", openNoteStep);
  els.noteInput.addEventListener("input", () => {
    els.noteCount.textContent = `${20 - els.noteInput.value.length} left`;
  });
  els.seal.addEventListener("click", seal);
  els.pw2.addEventListener("input", updateChips);
  els.pw2.addEventListener("keydown", (e) => e.key === "Enter" && tryUnlock());
  ["paste", "drop"].forEach((ev) =>
    els.pw2.addEventListener(ev, (e) => {
      e.preventDefault();
      say("No pasting. I see everything.", "🧐");
    })
  );
  els.unlock.addEventListener("click", tryUnlock);
  els.petForm.addEventListener("submit", securityReset);
  $("#again").addEventListener("click", () => location.reload());
  $("#brag").addEventListener("click", brag);

  update();
  els.pw.focus();
})();
