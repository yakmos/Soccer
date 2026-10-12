// reg-ring.js — טבעת צבעונית שמתמלאת לאט לפי מספר הנרשמים. משותפת לדף הקבוצה ולדף ההרשמה.
// RegRing.set(el, confirmed, max) בונה את הטבעת בתוך el בפעם הראשונה, ומעדכן אותה בכל שינוי.
// בפעם הראשונה שהטבעת מופיעה על המסך היא מתמלאת מאפס והמספר באמצע עולה איתה; אחר כך כל שינוי זז בהדרגה.
(function () {
    'use strict';

    let seq = 0;
    const INTRO_MS = 1600, INTRO_DELAY = 150;

    function injectCSS() {
        if (document.getElementById('regRingStyle')) return;
        const st = document.createElement('style');
        st.id = 'regRingStyle';
        st.textContent = `
            .rr { --rr-size: 88px; position: relative; flex: none; width: var(--rr-size); height: var(--rr-size); }
            .rr svg { display: block; width: 100%; height: 100%; overflow: visible; filter: drop-shadow(0 0 6px rgba(34,211,238,0.28)); }
            .rr-track { fill: none; stroke: rgba(148,163,184,0.16); stroke-width: 10; }
            .rr-fill { fill: none; stroke-width: 10; stroke-linecap: round; stroke-dasharray: 100 100; stroke-dashoffset: 100;
                transition: stroke-dashoffset 0.9s cubic-bezier(.22,1,.36,1), opacity 0.3s; }
            .rr.rr-intro .rr-fill { animation: rrFill ${INTRO_MS}ms cubic-bezier(.22,1,.36,1) ${INTRO_DELAY}ms both; }
            @keyframes rrFill { from { stroke-dashoffset: 100; } }
            .rr-mid { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1; pointer-events: none; }
            .rr-num { font-size: calc(var(--rr-size) * 0.32); font-weight: 900; color: #F8FAFC; font-variant-numeric: tabular-nums; }
            .rr-of { margin-top: calc(var(--rr-size) * 0.045); font-size: max(10px, calc(var(--rr-size) * 0.125)); font-weight: 800; color: #94A3B8; white-space: nowrap; }
            .rr.full .rr-of { color: #FBBF24; }
            @media (prefers-reduced-motion: reduce) { .rr-fill { transition: none; } .rr.rr-intro .rr-fill { animation: none; } }`;
        document.head.appendChild(st);
    }

    // המספר באמצע עולה יחד עם המילוי (animationstart מגיע אחרי ההשהיה). אם בינתיים נרשמו עוד, הוא נעצר על המספר העדכני
    function countUp(el) {
        const num = el.querySelector('.rr-num');
        const t0 = performance.now();
        el.__counting = true;
        const step = now => {
            const target = +el.dataset.n || 0;
            const k = Math.min(1, Math.max(0, (now - t0) / INTRO_MS));
            num.textContent = String(Math.round(target * (1 - Math.pow(1 - k, 3))));
            if (k < 1) requestAnimationFrame(step);
            else { el.__counting = false; num.textContent = String(target); }
        };
        requestAnimationFrame(step);
    }

    function endIntro(el) {
        el.classList.remove('rr-intro');
        if (el.__counting === 'pending') { el.__counting = false; el.querySelector('.rr-num').textContent = el.dataset.n || '0'; }
    }

    function mount(el) {
        injectCSS();
        const gid = 'rrGrad' + (++seq);
        const calm = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
        el.classList.add('rr');
        // עד שהמילוי מתחיל (הטבעת עוד מוסתרת, או בהשהיה הקצרה) המספר נשאר 0, כדי שלא יקפוץ לסוף ואז יחזור לאפס
        if (!calm) { el.classList.add('rr-intro'); el.__counting = 'pending'; }
        el.setAttribute('role', 'img');
        // הקשת מתחילה למעלה ומתמלאת עם כיוון השעון: ירוק, תכלת, ובסוף סגול
        el.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
            <defs><linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="50" y1="5" x2="50" y2="95">
                <stop offset="0" stop-color="#34D399"/><stop offset="0.5" stop-color="#22D3EE"/><stop offset="1" stop-color="#A78BFA"/>
            </linearGradient></defs>
            <circle class="rr-track" cx="50" cy="50" r="45"/>
            <path class="rr-fill" d="M50 5 A45 45 0 1 1 49.99 5" pathLength="100" stroke="url(#${gid})"/>
        </svg><div class="rr-mid" aria-hidden="true"><span class="rr-num">0</span><span class="rr-of"></span></div>`;
        el.addEventListener('animationstart', () => countUp(el), { once: true });
        el.addEventListener('animationend', () => endIntro(el), { once: true });
        el.addEventListener('animationcancel', () => endIntro(el), { once: true });
        el.__rr = true;
    }

    function set(el, confirmed, max) {
        if (!el) return;
        if (!el.__rr) mount(el);
        const n = Math.max(0, Math.floor(+confirmed || 0));
        const m = Math.max(0, Math.floor(+max || 0));
        const pct = m > 0 ? Math.min(100, n / m * 100) : 0;
        const full = m > 0 && n >= m;
        const fill = el.querySelector('.rr-fill');
        fill.style.strokeDashoffset = String(100 - pct);
        fill.style.opacity = pct > 0 ? '1' : '0';
        el.dataset.n = String(n);
        if (!el.__counting) el.querySelector('.rr-num').textContent = String(n);
        el.querySelector('.rr-of').textContent = full ? 'מלא' : 'מתוך ' + m;
        el.classList.toggle('full', full);
        el.setAttribute('aria-label', `${n} מתוך ${m} נרשמו${full ? ', ההרשמה מלאה' : ''}`);
    }

    window.RegRing = { set, injectCSS };
})();
