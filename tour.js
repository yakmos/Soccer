// tour.js — סיור קצר של טיפים: מדגיש רכיב במסך עם בועת הסבר, צעד אחרי צעד.
// כל סיור מוצג פעם אחת למכשיר (localStorage: sm_tour_<key>). צעד שהרכיב שלו לא מוצג כרגע — מדלגים עליו.
// Tour.run('home-player', [{ el: '#homeNav [data-tab="find"]', title: 'מצא קבוצה', text: '...' }])
(function () {
    'use strict';

    const storeKey = k => 'sm_tour_' + k;
    let active = null;

    function seen(key) {
        try { return localStorage.getItem(storeKey(key)) === '1'; } catch (e) { return true; }   // בלי אחסון לא מציקים בכל ביקור
    }
    function markSeen(key) { try { localStorage.setItem(storeKey(key), '1'); } catch (e) { /* לא קריטי */ } }
    function reset(key) { try { localStorage.removeItem(storeKey(key)); } catch (e) { /* לא קריטי */ } }

    function injectCSS() {
        if (document.getElementById('tourStyle')) return;
        const st = document.createElement('style');
        st.id = 'tourStyle';
        st.textContent = `
            .tour-ov { position: fixed; inset: 0; z-index: 1300; }
            .tour-spot { position: fixed; z-index: 1301; border-radius: 14px; box-shadow: 0 0 0 9999px rgba(2,6,23,0.72), 0 0 0 3px #10B981; pointer-events: none;
                transition: top .25s ease, left .25s ease, width .25s ease, height .25s ease; }
            .tour-bubble { position: fixed; z-index: 1302; width: min(320px, calc(100vw - 24px)); box-sizing: border-box; background: #1E293B; color: #F1F5F9;
                border: 1px solid #10B981; border-radius: 14px; padding: 14px 16px 12px; font-family: 'Heebo', sans-serif; direction: rtl; text-align: right;
                box-shadow: 0 18px 40px rgba(0,0,0,0.5); transition: top .25s ease, left .25s ease; }
            .tour-bubble::after { content: ''; position: absolute; left: var(--tour-arrow, 50%); width: 12px; height: 12px; background: #1E293B; transform: translateX(-50%) rotate(45deg); }
            .tour-bubble[data-side="below"]::after { top: -7px; border-top: 1px solid #10B981; border-left: 1px solid #10B981; }
            .tour-bubble[data-side="above"]::after { bottom: -7px; border-bottom: 1px solid #10B981; border-right: 1px solid #10B981; }
            .tour-title { font-weight: 900; font-size: 1rem; margin: 0 0 4px; }
            .tour-text { color: #CBD5E1; font-size: 0.9rem; line-height: 1.55; margin: 0; }
            .tour-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 12px; }
            .tour-count { color: #94A3B8; font-size: 0.8rem; font-weight: 700; }
            .tour-acts { display: flex; gap: 8px; }
            .tour-skip { background: none; border: 0; color: #94A3B8; font: 700 0.85rem 'Heebo', sans-serif; cursor: pointer; padding: 6px 4px; }
            .tour-next { background: #10B981; color: #04241A; border: 0; border-radius: 10px; padding: 7px 16px; font: 900 0.9rem 'Heebo', sans-serif; cursor: pointer; }
            .tour-next:focus-visible, .tour-skip:focus-visible { outline: 2px solid #6EE7B7; outline-offset: 2px; }
            @media (prefers-reduced-motion: reduce) { .tour-spot, .tour-bubble { transition: none; } }`;
        document.head.appendChild(st);
    }

    function targetOf(step) {
        const el = typeof step.el === 'string' ? document.querySelector(step.el) : step.el;
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (!r.width || !r.height || cs.visibility === 'hidden' || cs.display === 'none') return null;
        return el;
    }

    // steps: [{ el, title, text }]. מחזיר Promise שמסתיים כשהסיור נגמר (true אם הוצג)
    function run(key, steps, opts) {
        const o = opts || {};
        if (active || (!o.force && seen(key))) return Promise.resolve(false);
        const list = (steps || []).filter(s => targetOf(s));
        if (!list.length) return Promise.resolve(false);
        injectCSS();
        markSeen(key);   // גם אם סוגרים באמצע, לא מציגים שוב
        return new Promise(resolve => {
            let i = 0, raf = 0;
            const prevFocus = document.activeElement;
            const ov = document.createElement('div');
            ov.className = 'tour-ov';
            const spot = document.createElement('div');
            spot.className = 'tour-spot';
            const bubble = document.createElement('div');
            bubble.className = 'tour-bubble';
            bubble.setAttribute('role', 'dialog');
            bubble.setAttribute('aria-modal', 'true');
            bubble.setAttribute('aria-labelledby', 'tourTitle');
            bubble.setAttribute('aria-describedby', 'tourText');
            document.body.append(ov, spot, bubble);

            const place = () => {
                const el = targetOf(list[i]);
                if (!el) return;
                const r = el.getBoundingClientRect();
                const pad = 6, vw = window.innerWidth, vh = window.innerHeight;
                spot.style.top = (r.top - pad) + 'px';
                spot.style.left = (r.left - pad) + 'px';
                spot.style.width = (r.width + pad * 2) + 'px';
                spot.style.height = (r.height + pad * 2) + 'px';
                const bw = bubble.offsetWidth, bh = bubble.offsetHeight;
                const below = r.bottom + pad + 12 + bh <= vh - 8 || r.top - pad - 12 - bh < 8;
                const top = below ? r.bottom + pad + 12 : r.top - pad - 12 - bh;
                const cx = r.left + r.width / 2;
                const left = Math.max(12, Math.min(vw - bw - 12, cx - bw / 2));
                bubble.dataset.side = below ? 'below' : 'above';
                bubble.style.top = Math.max(8, Math.min(vh - bh - 8, top)) + 'px';
                bubble.style.left = left + 'px';
                bubble.style.setProperty('--tour-arrow', Math.max(18, Math.min(bw - 18, cx - left)) + 'px');
            };
            const onMove = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(place); };

            const end = () => {
                cancelAnimationFrame(raf);
                window.removeEventListener('resize', onMove);
                window.removeEventListener('scroll', onMove, true);
                document.removeEventListener('keydown', onKey, true);
                ov.remove(); spot.remove(); bubble.remove();
                active = null;
                if (prevFocus && typeof prevFocus.focus === 'function') { try { prevFocus.focus({ preventScroll: true }); } catch (e) { /* לא קריטי */ } }
                resolve(true);
            };
            const show = n => {
                i = n;
                const s = list[i];
                const last = i === list.length - 1;
                bubble.innerHTML = `<p class="tour-title" id="tourTitle"></p><p class="tour-text" id="tourText"></p>
                    <div class="tour-foot"><span class="tour-count">${list.length > 1 ? `${i + 1} מתוך ${list.length}` : ''}</span>
                    <div class="tour-acts">${last ? '' : '<button type="button" class="tour-skip" data-act="skip">דילוג</button>'}<button type="button" class="tour-next" data-act="next">${last ? 'הבנתי 👍' : 'הבא'}</button></div></div>`;
                bubble.querySelector('.tour-title').textContent = s.title || '';
                bubble.querySelector('.tour-text').textContent = s.text || '';
                const el = targetOf(s);
                const r = el.getBoundingClientRect();
                if (r.top < 0 || r.bottom > window.innerHeight) el.scrollIntoView({ block: 'center' });   // הגלילה מזיזה את הבועה איתה (onMove)
                place();
                bubble.querySelector('[data-act="next"]').focus({ preventScroll: true });
            };
            const next = () => {
                // צעדים שהרכיב שלהם נעלם בינתיים — מדלגים
                let n = i + 1;
                while (n < list.length && !targetOf(list[n])) n++;
                if (n >= list.length) end(); else show(n);
            };
            const onKey = e => {
                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(); }
                else if (e.key === 'Tab') {   // הפוקוס נשאר בתוך הבועה
                    const btns = [...bubble.querySelectorAll('button')];
                    if (!btns.length) return;
                    const at = btns.indexOf(document.activeElement);
                    e.preventDefault();
                    btns[(at + (e.shiftKey ? btns.length - 1 : 1)) % btns.length].focus();
                }
            };
            bubble.addEventListener('click', e => {
                const b = e.target.closest('[data-act]');
                if (!b) return;
                if (b.dataset.act === 'skip') end(); else next();
            });
            ov.addEventListener('click', next);
            window.addEventListener('resize', onMove);
            window.addEventListener('scroll', onMove, true);
            document.addEventListener('keydown', onKey, true);
            active = { key, end };
            show(0);
        });
    }

    function stop() { if (active) active.end(); }
    function isOpen() { return !!active; }

    window.Tour = { run, seen, reset, stop, isOpen };
})();
