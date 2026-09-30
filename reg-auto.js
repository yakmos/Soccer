// reg-auto.js — הרשמה שנפתחת לבד כל שבוע.
// המנהל קובע בדף הקבוצה ימי משחק, שעה ומתי ההרשמה נפתחת (group.regSchedule).
// בכל כניסה של מנהל נוצרים מראש מסמכי הרשמה ל-4 השבועות הקרובים, כל אחד עם
// gameAt (תחילת המשחק) ו-opensAt (פתיחת ההרשמה). הקישור הקבוע registration.html?group=X
// מוצא את ההרשמה הנוכחית בשאילתה אחת, וחוקי האבטחה חוסמים הרשמה לפני opensAt.
// משותף ל-index.html ול-registration.html.
(function () {
    'use strict';

    const GRACE_MS = 3 * 60 * 60 * 1000;   // משחק נחשב "עבר" 3 שעות אחרי שהתחיל
    const HORIZON_DAYS = 28;               // כמה ימים קדימה יוצרים הרשמות מראש
    const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
    const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

    const pad = n => String(n).padStart(2, '0');
    const minutesOf = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const hm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

    function toMs(t) {
        if (t == null) return null;
        if (typeof t.toMillis === 'function') return t.toMillis();
        if (t instanceof Date) return t.getTime();
        const n = Number(t);
        return Number.isFinite(n) ? n : null;
    }
    function toDate(t) { const v = toMs(t); return v == null ? null : new Date(v); }

    // ===== הגדרות =====
    // בודק ומנקה את ההגדרות. מחזיר תמיד sched (גם לא תקין, כדי למלא טופס), ו-error בעברית
    function validate(input) {
        const s = input || {};
        const days = Array.from(new Set((Array.isArray(s.days) ? s.days : [])
            .map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6))).sort((a, b) => a - b);
        const time = TIME_RE.test(s.time || '') ? s.time : '';
        const openTime = TIME_RE.test(s.openTime || '') ? s.openTime : '';
        const openDaysBefore = Number(s.openDaysBefore);
        const notice = typeof s.notice === 'string' ? s.notice.trim().slice(0, 300) : '';
        const sched = { enabled: s.enabled !== false, days, time, openDaysBefore, openTime, notice };
        let error = '';
        if (!days.length) error = 'בחר לפחות יום משחק אחד.';
        else if (!time) error = 'בחר את שעת המשחק.';
        else if (!Number.isInteger(openDaysBefore) || openDaysBefore < 0 || openDaysBefore > 6) error = 'בחר מתי ההרשמה נפתחת.';
        else if (!openTime) error = 'בחר את שעת פתיחת ההרשמה.';
        else if (openDaysBefore === 0 && minutesOf(openTime) >= minutesOf(time)) error = 'ביום המשחק, ההרשמה צריכה להיפתח לפני שעת המשחק.';
        return { ok: !error, error, sched };
    }

    // ההגדרות הפעילות של הקבוצה, או null (כבוי, חסר או לא תקין)
    function active(group) {
        if (!group || !group.regSchedule) return null;
        const r = validate(group.regSchedule);
        return r.ok && r.sched.enabled ? r.sched : null;
    }

    // ===== לוח המשחקים =====
    // המשחקים הקרובים לפי ההגדרות: מתי כל משחק מתחיל ומתי נפתחת ההרשמה אליו
    function occurrences(sched, from, horizonDays) {
        const v = validate(sched);
        if (!v.ok) return [];
        const s = v.sched;
        const now = toMs(from) != null ? toMs(from) : Date.now();
        const base = new Date(now);
        const [gh, gm] = s.time.split(':').map(Number);
        const [oh, om] = s.openTime.split(':').map(Number);
        const out = [];
        for (let i = -1; i <= (horizonDays || HORIZON_DAYS); i++) {
            const day = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
            if (!s.days.includes(day.getDay())) continue;
            const gameAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), gh, gm);
            if (gameAt.getTime() + GRACE_MS <= now) continue;
            const opensAt = new Date(day.getFullYear(), day.getMonth(), day.getDate() - s.openDaysBefore, oh, om);
            const raw = ymd(gameAt);
            out.push({
                id: 'a' + raw.replace(/-/g, '') + s.time.replace(':', ''),
                key: raw + ' ' + s.time,
                gameDateRaw: raw,
                gameDate: `${pad(gameAt.getDate())}-${pad(gameAt.getMonth() + 1)}-${gameAt.getFullYear()}`,
                gameTime: s.time,
                gameAt, opensAt
            });
        }
        return out;
    }

    // תחילת המשחק ממסמך הרשמה: gameAt, או תאריך + שעה (כולל הפורמטים הישנים DD-MM-YYYY ו-DD/MM/YYYY)
    function gameAtOf(d, defaultTime) {
        if (!d) return null;
        const at = toDate(d.gameAt);
        if (at) return at;
        let y, m, day;
        const raw = String(d.gameDateRaw || '');
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
            [y, m, day] = raw.split('-').map(Number);
        } else {
            const p = String(d.gameDate || '').split(/[-/.]/).map(Number);
            if (p.length !== 3 || p.some(n => !Number.isFinite(n))) return null;
            if (p[0] > 31) [y, m, day] = p; else [day, m, y] = p;
        }
        const t = /^(\d{1,2}):(\d{2})$/.exec(d.gameTime || '') || /^(\d{1,2}):(\d{2})$/.exec(defaultTime || '');
        if (!t) return null;
        const dt = new Date(y, m - 1, day, Number(t[1]), Number(t[2]));
        return Number.isNaN(dt.getTime()) ? null : dt;
    }

    // מזהה משחק לפי תאריך ושעה מקומיים — כדי לא ליצור פעמיים הרשמה לאותו משחק
    function keyOf(d) {
        const at = gameAtOf(d, '20:00');
        return at ? ymd(at) + ' ' + hm(at) : '';
    }

    // ===== קריאה ומצב =====
    // ההרשמות שהמשחק שלהן עוד לא עבר, לפי סדר המשחקים (הרשמות ידניות ישנות בלי gameAt לא נכללות)
    async function fetchUpcoming(groupRef, limit) {
        const since = firebase.firestore.Timestamp.fromMillis(Date.now() - GRACE_MS);
        const snap = await groupRef.collection('registrations')
            .where('gameAt', '>', since).orderBy('gameAt').limit(limit || 6).get();
        return snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
    }

    // open = אפשר להירשם · soon = תיפתח בהמשך · off = בוטלה לפני שנפתחה · closed = נסגרה · done = המשחק עבר
    function status(r, now) {
        const t = now == null ? Date.now() : now;
        const opens = toMs(r.opensAt);
        const game = gameAtOf(r);
        if (game && game.getTime() + GRACE_MS <= t) return 'done';
        if (!r.open) return opens != null && opens > t ? 'off' : 'closed';
        if (opens != null && opens > t) return 'soon';
        return 'open';
    }

    function split(regs, now) {
        const t = now == null ? Date.now() : now;
        return {
            open: regs.filter(r => status(r, t) === 'open'),
            next: regs.find(r => status(r, t) === 'soon') || null
        };
    }

    // הרגע הבא שבו המצב משתנה (הרשמה נפתחת או משחק מסתיים) — כדי לרענן בדיוק אז
    function nextChange(regs, now) {
        const t = now == null ? Date.now() : now;
        let best = null;
        for (const r of regs) {
            const game = gameAtOf(r);
            for (const v of [toMs(r.opensAt), game ? game.getTime() + GRACE_MS : null]) {
                if (v != null && v > t && (best == null || v < best)) best = v;
            }
        }
        return best;
    }

    // ===== טקסטים =====
    function dayLabel(d) { return `יום ${DAY_NAMES[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}`; }

    // "יום חמישי 8.10 · 20:00"
    function gameLabel(r) {
        const d = gameAtOf(r);
        return d ? `${dayLabel(d)} · ${hm(d)}` : String((r && r.gameDate) || '');
    }

    // "היום ב-12:00" / "מחר ב-12:00" / "יום שני 5.10 ב-12:00"
    function whenLabel(t, now) {
        const d = toDate(t);
        if (!d) return '';
        const n = new Date(now == null ? Date.now() : now);
        const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate())
            - new Date(n.getFullYear(), n.getMonth(), n.getDate())) / 86400000);
        if (diff === 0) return `היום ב-${hm(d)}`;
        if (diff === 1) return `מחר ב-${hm(d)}`;
        return `${dayLabel(d)} ב-${hm(d)}`;
    }

    // לשילוב במשפט: "היום ב-12:00" / "מחר ב-12:00" / "ביום שני 5.10 ב-12:00"
    function whenPhrase(t, now) {
        const w = whenLabel(t, now);
        return w.startsWith('יום') ? 'ב' + w : w;
    }

    // לשילוב במשפט: "ביום חמישי 8.10 · 20:00"
    function gamePhrase(r) {
        const g = gameLabel(r);
        return g.startsWith('יום') ? 'ב' + g : g;
    }

    function unit(n, one, two, many) { return n === 1 ? one : (n === 2 && two) ? two : `${n} ${many}`; }
    const daysTxt = n => unit(n, 'יום', 'יומיים', 'ימים');
    const hoursTxt = n => unit(n, 'שעה', 'שעתיים', 'שעות');
    const minsTxt = n => unit(n, 'דקה', '', 'דקות');
    const secsTxt = n => unit(n, 'שנייה', '', 'שניות');
    const and = part => (/^\d/.test(part) ? 'ו-' : 'ו') + part;

    // "בעוד יומיים ו-3 שעות" / "בעוד שעה ו-5 דקות" / "בעוד 42 שניות"
    function countdown(msLeft) {
        let s = Math.max(0, Math.ceil(msLeft / 1000));
        const d = Math.floor(s / 86400); s -= d * 86400;
        const h = Math.floor(s / 3600); s -= h * 3600;
        const m = Math.floor(s / 60); s -= m * 60;
        if (d) return 'בעוד ' + daysTxt(d) + (h ? ' ' + and(hoursTxt(h)) : '');
        if (h) return 'בעוד ' + hoursTxt(h) + (m ? ' ' + and(minsTxt(m)) : '');
        if (m >= 10) return 'בעוד ' + minsTxt(m);
        if (m) return 'בעוד ' + minsTxt(m) + (s ? ' ' + and(secsTxt(s)) : '');
        return s ? 'בעוד ' + secsTxt(s) : 'עכשיו';
    }

    function daysPhrase(days) {
        const names = days.map(i => DAY_NAMES[i]);
        if (names.length === 1) return `כל יום ${names[0]}`;
        return `בימי ${names.slice(0, -1).join(', ')} ו${names[names.length - 1]}`;
    }

    function openPhrase(n) {
        return n === 0 ? 'ביום המשחק' : n === 1 ? 'יום לפני' : n === 2 ? 'יומיים לפני' : `${n} ימים לפני`;
    }

    // { game: "משחק כל יום חמישי ב-20:00", open: "ההרשמה נפתחת 3 ימים לפני, ב-12:00" }
    function describe(sched) {
        const s = validate(sched).sched;
        const many = s.days.length > 1 && s.openDaysBefore > 0;
        return {
            game: `משחק ${daysPhrase(s.days)} ב-${s.time}`,
            open: `ההרשמה נפתחת ${openPhrase(s.openDaysBefore)}${many ? ' כל משחק' : ''}, ב-${s.openTime}`
        };
    }

    // הקישור הקבוע של הקבוצה — אותו קישור כל שבוע
    function stableLink(groupId) {
        const dir = location.pathname.replace(/[^/]*$/, '');
        return `${location.origin}${dir}registration.html?group=${encodeURIComponent(groupId)}`;
    }

    window.RegAuto = {
        GRACE_MS, HORIZON_DAYS,
        validate, active, occurrences, gameAtOf, keyOf,
        fetchUpcoming, status, split, nextChange,
        gameLabel, gamePhrase, whenLabel, whenPhrase, countdown, describe, openPhrase, stableLink,
        ymd, hm, toMs
    };
})();
