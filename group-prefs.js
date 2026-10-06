// group-prefs.js — הגדרות ופורמטים משותפים לדף הבית, לאפליקציית הקבוצה ולדף ההרשמה
(function () {
    'use strict';

    // ===== קבוצת עדיפות בהרשמה =====
    // קבוצות שהתווית שלהן נקבעה לפני שהיא הפכה להגדרה.
    // מגדים נשארת "תושב מגדים" גם בלי שמירה בהגדרות.
    const LEGACY_PRIORITY_LABELS = {
        'CBLYpMMYzyc9k9dDPOjC': 'תושב מגדים'
    };

    // שם קבוצת העדיפות בהרשמה (השדה isMoshavResident אצל השחקנים).
    // '' = לקבוצה אין קבוצת עדיפות: הכפתור מוסתר והסימון לא משפיע על ההרשמה.
    // קבוצות חדשות נוצרות עם '' ; קבוצות ותיקות שלא הגדירו כלום מקבלות "תושב".
    function priorityLabel(groupId, groupData) {
        const s = (groupData && groupData.settings) || {};
        if (typeof s.priorityLabel === 'string') return s.priorityLabel.trim().slice(0, 30);
        return LEGACY_PRIORITY_LABELS[groupId] || 'תושב';
    }

    // ===== מי נכנס כשההרשמה מלאה (settings.regPriority) =====
    // mode 'first' = כל הקודם זוכה. mode 'rules' = לפי הכללים שסומנו, בסדר החשיבות הזה:
    //   active  — שחקן פעיל (מסומן בכרטיס) לפני שחקן לא פעיל
    //   veteran — ותיק לפני חדש
    //   label   — מי שמסומן בקבוצת העדיפות (למשל "תושב מגדים"). כשהכלל "פעילים" פועל, זה עוזר רק לשחקן פעיל,
    //             וכשהכלל "ותיקים" פועל — רק לשחקן חדש (הוותיקים ממילא קודמים)
    //   age     — מגיל ageMin ומעלה. בלי תאריך לידה נחשבים צעירים
    // בתוך אותה דרגה, מי שנרשם ראשון. ב-4 השעות שלפני המשחק אף אחד לא נדחק (registration.html).
    // קבוצה בלי regPriority נפתחה לפני שזו הפכה להגדרה, וממשיכה עם הכללים שהיו קבועים עד אז (כולם, מגיל 30).
    const DEFAULT_PRIORITY_AGE = 30;
    const PRIORITY_AGE_MIN = 16, PRIORITY_AGE_MAX = 70;

    function validPriorityAge(n) {
        const v = Number(n);
        return Number.isInteger(v) && v >= PRIORITY_AGE_MIN && v <= PRIORITY_AGE_MAX;
    }

    // ההגדרות כפי שנשמרו (לטופס ההגדרות): כל כלל עם הסימון שלו, גם כשהמצב הוא "כל הקודם זוכה"
    function priorityPrefs(groupId, groupData) {
        const s = (groupData && groupData.settings) || {};
        const labelText = priorityLabel(groupId, groupData);
        const p = s.regPriority;
        if (!p || typeof p !== 'object') {
            return { mode: 'rules', active: true, veteran: true, label: !!labelText, age: true, ageMin: DEFAULT_PRIORITY_AGE, labelText, legacy: true };
        }
        return {
            mode: p.mode === 'rules' ? 'rules' : 'first',
            active: p.active === true,
            veteran: p.veteran === true,
            label: p.label === true,
            age: p.age === true,
            ageMin: validPriorityAge(p.ageMin) ? Number(p.ageMin) : DEFAULT_PRIORITY_AGE,
            labelText
        };
    }

    // הכללים שפועלים בפועל: label = שם קבוצת העדיפות או '' ; age = הגיל או 0
    function regPriority(groupId, groupData) {
        const p = priorityPrefs(groupId, groupData);
        const on = p.mode === 'rules';
        const cfg = {
            active: on && p.active,
            veteran: on && p.veteran,
            label: on && p.label ? p.labelText : '',
            age: on && p.age ? p.ageMin : 0
        };
        cfg.mode = (cfg.active || cfg.veteran || cfg.label || cfg.age) ? 'rules' : 'first';
        return cfg;
    }

    // דרגת העדיפות של שחקן: מספר קטן יותר = נכנס קודם. 0 לכולם ב"כל הקודם זוכה".
    // player = כרטיס השחקן (הדגלים), age = הגיל בשנים או null
    function priorityRank(cfg, player, age) {
        if (!cfg || cfg.mode !== 'rules' || !player) return 0;
        let rank = 0;
        const rule = ok => { rank = rank * 2 + (ok ? 0 : 1); };
        if (cfg.active) rule(!!player.isActive);
        if (cfg.veteran) rule(!player.isNew);
        if (cfg.label) rule(!!player.isMoshavResident && (!cfg.active || !!player.isActive) && (!cfg.veteran || !!player.isNew));
        if (cfg.age) rule(age != null && age >= cfg.age);
        return rank;
    }

    // למי עוזר הסימון של קבוצת העדיפות, לפי הכללים האחרים שפועלים
    function priorityLabelScope(cfg) {
        if (cfg.active && cfg.veteran) return 'מבין השחקנים החדשים והפעילים';
        if (cfg.veteran) return 'מבין השחקנים החדשים';
        if (cfg.active) return 'מבין השחקנים הפעילים';
        return '';
    }

    // הכללים שפועלים, בשפה פשוטה ובסדר החשיבות (לדף ההרשמה ולהגדרות)
    function priorityRuleTexts(cfg) {
        if (!cfg || cfg.mode !== 'rules') return [];
        const out = [];
        if (cfg.active) out.push('✅ שחקנים פעילים');
        if (cfg.veteran) out.push('⭐ ותיקים לפני 🆕 חדשים');
        if (cfg.label) {
            const scope = priorityLabelScope(cfg);
            out.push('🏠 ' + cfg.label + (scope ? ' (' + scope + ')' : ''));
        }
        if (cfg.age) out.push(`🎂 מגיל ${cfg.age} ומעלה`);
        return out;
    }

    // ===== הוספת כמה שחקנים בבת אחת: רשימת שמות מודבקת, גם מהוואטסאפ =====
    const PLAYER_NAME_MAX = 40;
    const BULK_MAX = 100;

    // מה שלפני השם בשורה שהועתקה מצ'אט: "[5.10.2026, 20:15] יקיר: " / "5.10.2026, 20:15 - יקיר: "
    const CHAT_PREFIX = /^\s*(?:\[[^\]]{4,40}\]|\d{1,2}[./-]\d{1,2}[./-]\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AaPp][Mm])?\s*[-–])\s*[^:]{1,40}:\s*/;
    const BIDI = /[\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;
    const TIME_OR_DATE = /\b\d{1,2}:\d{2}\b|\b\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?\b/;

    // השורה בלי מה שמסביב לשם: טלפון, מספור ותבליטים, הערות בסוגריים או אחרי מקף, "+1"
    function stripLineExtras(raw) {
        let s = String(raw || '').replace(BIDI, '').replace(CHAT_PREFIX, '');
        s = s.replace(/(?:\+?972[\s-]?|0)5\d(?:[\s-]?\d){7}/g, ' ');
        s = s.replace(/^\s*(?:[-–—•·*▪◦~>]+|\(?\d{1,3}\s*[.):\-]|\(\d{1,3}\))\s*/u, '');
        s = s.replace(/\([^)]*\)/g, ' ').replace(/\s[-–—]\s.*$/, '').replace(/\+\s*\d+/g, ' ');
        return s;
    }

    // "1. אבי כהן ✅" → "אבי כהן". אחרי stripLineExtras: מוריד אימוג'ים וסימנים, ומרכאות מסביב לשם
    function cleanPlayerName(raw) {
        const s = stripLineExtras(raw).replace(/[^\p{L}\p{M}\p{N}\s'"׳״.\-]/gu, ' ');
        return s.replace(/\s+/g, ' ').trim().replace(/^[.\-'"׳״]+/, '').replace(/[.\-'"׳״]+$/, '').trim();
    }

    // להשוואת שמות: בלי הבדלי רווחים, גרש וגדולות/קטנות
    function playerNameKey(name) {
        return String(name || '').toLowerCase().replace(/[׳`’]/g, "'").replace(/[״”“]/g, '"').replace(/\s+/g, ' ').trim();
    }

    // { names: שמות להוספה, existing: כבר בסגל, dupes: פעמיים ברשימה, tooLong, skipped: שורות שלא נראו כמו שם, overflow: מעבר למגבלה }
    function parsePlayerList(text, existingNames) {
        const have = new Set((existingNames || []).map(playerNameKey));
        const out = { names: [], existing: [], dupes: [], tooLong: [], skipped: [], overflow: 0 };
        const seen = new Set();
        const skip = t => { const v = t.replace(BIDI, '').trim(); out.skipped.push(v.length > 30 ? v.slice(0, 30) + '…' : v); };
        const parts = [];
        String(text || '').split(/\r?\n/).forEach(line => {
            line.replace(BIDI, '').replace(CHAT_PREFIX, '').split(/[,،;]+/).forEach(part => parts.push(part));
        });
        parts.forEach(part => {
            const t = part.trim();
            if (!t || !/\p{L}/u.test(t)) return;                                   // ריקה, או רק אימוג'ים ומספרים
            if (/[:：]\s*$/.test(t)) return skip(t);                               // כותרת, למשל "רשימה לשישי:"
            if (TIME_OR_DATE.test(stripLineExtras(t))) return skip(t);              // שעה או תאריך, למשל "שישי 20:00"
            const name = cleanPlayerName(t);
            if (!/\p{L}/u.test(name)) return skip(t);
            if (name.length > PLAYER_NAME_MAX) { out.tooLong.push(name.slice(0, PLAYER_NAME_MAX) + '…'); return; }
            const key = playerNameKey(name);
            if (seen.has(key)) { out.dupes.push(name); return; }
            seen.add(key);
            if (have.has(key)) { out.existing.push(name); return; }
            if (out.names.length >= BULK_MAX) { out.overflow++; return; }
            out.names.push(name);
        });
        return out;
    }

    // ===== פרטי קבוצה: ימים, רמה, טלפון, ערים =====
    const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
    const DAY_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
    const LEVELS = { all: 'כל הרמות', casual: 'כיף, בלי לחץ', mid: 'רמה בינונית', high: 'רמה גבוהה' };

    // הצעות להשלמה אוטומטית בלבד — אפשר להקליד כל יישוב
    const CITIES = [
        'תל אביב-יפו', 'ירושלים', 'חיפה', 'ראשון לציון', 'פתח תקווה', 'אשדוד', 'נתניה', 'באר שבע',
        'בני ברק', 'חולון', 'רמת גן', 'אשקלון', 'רחובות', 'בת ים', 'בית שמש', 'כפר סבא', 'הרצליה',
        'חדרה', 'מודיעין-מכבים-רעות', 'לוד', 'רמלה', 'רעננה', 'נצרת', 'ראש העין', 'הוד השרון',
        'קריית גת', 'נהריה', 'עפולה', 'קריית אתא', 'יבנה', 'אילת', 'עכו', 'נס ציונה', 'אלעד',
        'קריית ביאליק', 'קריית מוצקין', 'קריית ים', 'קריית אונו', 'גבעתיים', 'טבריה', 'אור יהודה',
        'יהוד-מונוסון', 'דימונה', 'קריית שמונה', 'נוף הגליל', 'כרמיאל', 'צפת', 'שדרות', 'נתיבות',
        'אופקים', 'ערד', 'מגדל העמק', 'טירת כרמל', 'נשר', 'זכרון יעקב', 'פרדס חנה-כרכור', 'אור עקיבא',
        'רמת השרון', 'גבעת שמואל', 'גדרה', 'קריית מלאכי', 'יקנעם עילית', 'עתלית', 'אום אל-פחם',
        'רהט', 'טייבה', 'שפרעם', 'טמרה', 'סכנין', 'באקה אל-גרבייה', 'מעלות-תרשיחא'
    ];

    function cleanDays(days) {
        if (!Array.isArray(days)) return [];
        const nums = days.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6);
        return Array.from(new Set(nums)).sort((a, b) => a - b);
    }

    function cleanTime(t) {
        return typeof t === 'string' && /^\d{2}:\d{2}$/.test(t) ? t : '';
    }

    // "שישי 16:00" / "שני וחמישי · 20:00" / "א׳ ג׳ ה׳ · 20:00"
    function formatSchedule(schedule) {
        const s = schedule || {};
        const days = cleanDays(s.days);
        const time = cleanTime(s.time);
        let d = '';
        if (days.length === 1) d = DAY_NAMES[days[0]];
        else if (days.length === 2) d = DAY_NAMES[days[0]] + ' ו' + DAY_NAMES[days[1]];
        else if (days.length > 2) d = days.map(i => DAY_SHORT[i]).join(' ');
        if (d && time) return days.length === 1 ? d + ' ' + time : d + ' · ' + time;
        return d || time;
    }

    // מספר ישראלי בפורמט 05XXXXXXXX (או קווי 0XXXXXXXX). מחזיר '' אם לא תקין.
    function normalizePhone(input) {
        let digits = String(input || '').replace(/\D/g, '');
        if (digits.startsWith('972')) digits = '0' + digits.slice(3);
        return /^0\d{8,9}$/.test(digits) ? digits : '';
    }

    function phoneToIntl(phone) {
        return '972' + String(phone || '').replace(/^0/, '');
    }

    // מודעה ל"מצא קבוצה": רק השדות שחוקי האבטחה מאפשרים, בגבולות האורך.
    // looking: האם הקבוצה מחפשת שחקנים חדשים. lat/lng: המגרש על המפה (לא חובה)
    function buildListing(f) {
        const l = {
            ownerUid: f.ownerUid,
            name: String(f.name || '').trim().slice(0, 60),
            city: String(f.city || '').trim().slice(0, 40),
            venue: String(f.venue || '').trim().slice(0, 60),
            days: cleanDays(f.days),
            time: cleanTime(f.time),
            level: LEVELS[f.level] ? f.level : '',
            description: String(f.description || '').trim().slice(0, 300),
            phone: f.phone,
            icon: cleanIcon(f.icon)
        };
        // שדות חדשים נכתבים רק כשיש בהם משהו, כך שמודעה רגילה נשמרת גם לפי החוקים הקודמים
        if (f.looking === false) l.looking = false;
        const pos = cleanLatLng(f.lat, f.lng);
        if (pos) { l.lat = pos.lat; l.lng = pos.lng; }
        return l;
    }

    // ===== המפה ב"מצא קבוצה" =====
    // מיקום תקין, מעוגל ל-5 ספרות (בערך מטר), או null
    function cleanLatLng(lat, lng) {
        const a = Number(lat), b = Number(lng);
        if (lat == null || lng == null || !Number.isFinite(a) || !Number.isFinite(b)) return null;
        if (a < -90 || a > 90 || b < -180 || b > 180) return null;
        return { lat: Math.round(a * 1e5) / 1e5, lng: Math.round(b * 1e5) / 1e5 };
    }

    // מרכז משוער של כל עיר מהרשימה, לקבוצות שעוד לא סימנו את המגרש במפה
    const CITY_COORDS = {
        'תל אביב-יפו': [32.0853, 34.7818], 'ירושלים': [31.7683, 35.2137], 'חיפה': [32.794, 34.9896], 'ראשון לציון': [31.973, 34.7925],
        'פתח תקווה': [32.084, 34.8878], 'אשדוד': [31.8044, 34.6553], 'נתניה': [32.3215, 34.8532], 'באר שבע': [31.2518, 34.7913],
        'בני ברק': [32.0807, 34.8338], 'חולון': [32.0158, 34.7874], 'רמת גן': [32.0684, 34.8248], 'אשקלון': [31.6688, 34.5743],
        'רחובות': [31.8928, 34.8113], 'בת ים': [32.0171, 34.7454], 'בית שמש': [31.747, 34.9881], 'כפר סבא': [32.1782, 34.9076],
        'הרצליה': [32.1663, 34.8433], 'חדרה': [32.434, 34.9196], 'מודיעין-מכבים-רעות': [31.898, 35.0104], 'לוד': [31.951, 34.8881],
        'רמלה': [31.9293, 34.8664], 'רעננה': [32.1848, 34.8713], 'נצרת': [32.6996, 35.3035], 'ראש העין': [32.0956, 34.9566],
        'הוד השרון': [32.15, 34.888], 'קריית גת': [31.61, 34.7642], 'נהריה': [33.0058, 35.0947], 'עפולה': [32.6078, 35.2897],
        'קריית אתא': [32.8115, 35.1132], 'יבנה': [31.877, 34.739], 'אילת': [29.5577, 34.9519], 'עכו': [32.9281, 35.0818],
        'נס ציונה': [31.9293, 34.7987], 'אלעד': [32.0522, 34.9512], 'קריית ביאליק': [32.8275, 35.0857], 'קריית מוצקין': [32.8371, 35.0773],
        'קריית ים': [32.8494, 35.0689], 'קריית אונו': [32.0636, 34.8553], 'גבעתיים': [32.0722, 34.8125], 'טבריה': [32.7959, 35.531],
        'אור יהודה': [32.0296, 34.8569], 'יהוד-מונוסון': [32.0333, 34.8833], 'דימונה': [31.07, 35.0333], 'קריית שמונה': [33.2079, 35.5702],
        'נוף הגליל': [32.7075, 35.3236], 'כרמיאל': [32.919, 35.2901], 'צפת': [32.9646, 35.496], 'שדרות': [31.525, 34.5969],
        'נתיבות': [31.4231, 34.5886], 'אופקים': [31.312, 34.62], 'ערד': [31.2589, 35.2128], 'מגדל העמק': [32.675, 35.241],
        'טירת כרמל': [32.7605, 34.9714], 'נשר': [32.766, 35.044], 'זכרון יעקב': [32.5707, 34.9524], 'פרדס חנה-כרכור': [32.474, 34.974],
        'אור עקיבא': [32.507, 34.919], 'רמת השרון': [32.146, 34.839], 'גבעת שמואל': [32.078, 34.849], 'גדרה': [31.814, 34.779],
        'קריית מלאכי': [31.73, 34.746], 'יקנעם עילית': [32.659, 35.11], 'עתלית': [32.688, 34.94], 'אום אל-פחם': [32.519, 35.153],
        'רהט': [31.393, 34.754], 'טייבה': [32.266, 35.009], 'שפרעם': [32.806, 35.17], 'טמרה': [32.853, 35.198],
        'סכנין': [32.864, 35.296], 'באקה אל-גרבייה': [32.418, 35.042], 'מעלות-תרשיחא': [33.016, 35.271]
    };
    const cityKey = s => String(s || '').replace(/[\s\-־"'׳״.]/g, '').replace(/^קרית/, 'קריית');
    const CITY_KEYS = Object.keys(CITY_COORDS).map(c => [cityKey(c), c]);

    // [lat, lng] של העיר, גם כשהשם כתוב קצת אחרת ("תל אביב", "קרית ים"), או null
    function cityCoords(city) {
        const k = cityKey(city);
        if (!k) return null;
        const hit = CITY_KEYS.find(([ck]) => ck === k) || CITY_KEYS.find(([ck]) => ck.startsWith(k) || k.startsWith(ck));
        return hit ? CITY_COORDS[hit[1]].slice() : null;
    }

    // מרחק בקילומטרים בין שתי נקודות
    function distanceKm(a, b) {
        const R = 6371, rad = x => x * Math.PI / 180;
        const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
        const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
        return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
    }

    const toMillis = v => v == null ? null : (typeof v.toMillis === 'function' ? v.toMillis() : (v instanceof Date ? v.getTime() : (Number.isFinite(Number(v)) ? Number(v) : null)));

    // ההרשמה השבועית במודעה (regAuto): ימים, שעת משחק, ומתי נפתחת ההרשמה
    function listingAuto(sched) {
        if (!sched) return null;
        const days = cleanDays(sched.days), time = cleanTime(sched.time), openTime = cleanTime(sched.openTime);
        const before = Number(sched.openDaysBefore);
        if (!days.length || !time || !openTime || !Number.isInteger(before) || before < 0 || before > 6) return null;
        return { days, time, openDaysBefore: before, openTime };
    }

    // האם לפי ההרשמה השבועית ההרשמה פתוחה עכשיו (בין פתיחת ההרשמה לתחילת המשחק)
    function autoOpenAt(a, t) {
        const s = listingAuto(a);
        if (!s) return false;
        const [gh, gm] = s.time.split(':').map(Number), [oh, om] = s.openTime.split(':').map(Number);
        const base = new Date(t);
        for (let i = 0; i <= 7; i++) {
            const day = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
            if (!s.days.includes(day.getDay())) continue;
            const gameAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), gh, gm).getTime();
            const opensAt = new Date(day.getFullYear(), day.getMonth(), day.getDate() - s.openDaysBefore, oh, om).getTime();
            if (opensAt <= t && t < gameAt) return true;
        }
        return false;
    }

    // מצב הקבוצה במפה: open = יש משחק שפתוח להרשמה · looking = מחפשים שחקנים · closed = לא מחפשים כרגע
    function listingStatus(l, now) {
        const t = now == null ? Date.now() : now;
        if (!l || l.looking === false) return 'closed';
        const og = l.openGame ? toMillis(l.openGame.at) : null;
        if (og && og > t) return 'open';
        if (autoOpenAt(l.regAuto, t)) return 'open';
        return 'looking';
    }
    const LISTING_STATUS = {
        open: { icon: '🟢', text: 'יש משחק פתוח להרשמה', color: '#10B981' },
        looking: { icon: '🟡', text: 'מחפשים שחקנים', color: '#FBBF24' },
        closed: { icon: '⚪', text: 'לא מחפשים כרגע', color: '#94A3B8' }
    };

    // ===== רכיבי טופס משותפים =====
    function renderDayChips(container, selected) {
        const sel = new Set(cleanDays(selected));
        container.innerHTML = DAY_SHORT.map((label, i) =>
            `<button type="button" class="day-chip" data-day="${i}" aria-pressed="${sel.has(i)}" aria-label="${DAY_NAMES[i]}">${label}</button>`
        ).join('');
        container.querySelectorAll('.day-chip').forEach(b => b.addEventListener('click', () => {
            b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
        }));
    }

    function readDayChips(container) {
        const on = container.querySelectorAll('.day-chip[aria-pressed="true"]');
        return cleanDays(Array.from(on).map(b => b.dataset.day));
    }

    function fillCityList(datalist) {
        if (datalist && !datalist.children.length) {
            datalist.innerHTML = CITIES.map(c => `<option value="${c}"></option>`).join('');
        }
    }

    function levelOptionsHTML(selected, emptyLabel) {
        return `<option value="">${emptyLabel || 'לא צוין'}</option>` + Object.keys(LEVELS).map(k =>
            `<option value="${k}"${k === selected ? ' selected' : ''}>${LEVELS[k]}</option>`
        ).join('');
    }

    // ===== קבוצות שנפתחו במכשיר הזה (לשחקנים, בלי התחברות) =====
    const RECENT_KEY = 'recentGroups';

    function getRecentGroups() {
        try {
            const a = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
            return Array.isArray(a) ? a.filter(g => g && typeof g.id === 'string' && g.id) : [];
        } catch (e) { return []; }
    }

    function saveRecent(list) {
        try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 12))); }
        catch (e) { /* מצב גלישה פרטית, או שהאחסון מלא — לא קריטי */ }
    }

    function recentEntry(id, name, city, icon, t) {
        const e = { id, name: String(name || '').slice(0, 60), city: String(city || '').slice(0, 40), t: t || Date.now() };
        const ic = cleanIcon(icon);
        if (ic !== DEFAULT_ICON) e.icon = ic;
        return e;
    }

    function rememberGroup(id, name, city, icon) {
        if (!id) return;
        const list = getRecentGroups().filter(g => g.id !== id);
        list.unshift(recentEntry(id, name, city, icon));
        saveRecent(list);
    }

    // עדכון שם/עיר/סמל של קבוצה שכבר ברשימה, בלי לשנות את הסדר
    function updateRecentGroup(id, name, city, icon) {
        const list = getRecentGroups();
        const i = list.findIndex(g => g.id === id);
        if (i < 0) return false;
        const next = recentEntry(id, name || list[i].name, city, icon, list[i].t);
        if (JSON.stringify(next) === JSON.stringify(list[i])) return false;
        list[i] = next;
        saveRecent(list);
        return true;
    }

    // קבוצה שנמחקה יוצאת מהרשימה
    function forgetGroup(id) {
        const list = getRecentGroups();
        const next = list.filter(g => g.id !== id);
        if (next.length !== list.length) saveRecent(next);
    }

    // ===== סמל הקבוצה: אימוג'י מהרשימה, או תמונה קטנה שהמנהל העלה =====
    const DEFAULT_ICON = '⚽';
    const GROUP_ICONS = ['⚽', '🏀', '🥅', '🏆', '⭐', '🔥', '⚡', '👑', '🚀', '💪', '🎯', '🦁', '🐯', '🦅', '🐺', '🦈', '🐉', '🐂', '🐻', '🐝'];
    const IMG_ICON_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+\/]+=*$/;
    const ICON_SIZE = 128;           // פיקסלים — מספיק לתצוגה חדה, וקטן מספיק לשמירה במסמך הקבוצה
    const ICON_MAX_CHARS = 30000;    // התמונה נשמרת גם במודעה ב"מצא משחק". חוקי האבטחה מגבילים ל-40,000

    function isImageIcon(icon) {
        return typeof icon === 'string' && icon.length <= 40000 && IMG_ICON_RE.test(icon);
    }

    function cleanIcon(icon) {
        if (isImageIcon(icon)) return icon;
        return GROUP_ICONS.includes(icon) ? icon : DEFAULT_ICON;
    }

    // fill=true: התמונה ממלאת את הריבוע של הכרטיס. אחרת: בגודל השורה, ליד שם הקבוצה
    function iconHTML(icon, fill) {
        const ic = cleanIcon(icon);
        if (!isImageIcon(ic)) return `<span class="gp-icon-emoji">${ic}</span>`;
        const style = fill
            ? 'width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;'
            : 'width:1.35em;height:1.35em;object-fit:cover;border-radius:24%;display:inline-block;vertical-align:-0.3em;';
        return `<img class="gp-icon-img" src="${ic}" alt="" style="${style}">`;
    }

    // תמונה מהמחשב/הטלפון → ריבוע קטן מהמרכז, JPEG. נכשל (ולא נתקע) אם הדפדפן לא יודע לקרוא את הקובץ
    function resizeIcon(file) {
        return new Promise((resolve, reject) => {
            if (!file) return reject(new Error('image-unreadable'));
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image-unreadable')); };
            img.onload = () => {
                URL.revokeObjectURL(url);
                const w = img.naturalWidth, h = img.naturalHeight, side = Math.min(w, h);
                if (!side) return reject(new Error('image-unreadable'));
                const encode = (size, quality) => {
                    const c = document.createElement('canvas');
                    c.width = c.height = size;
                    const ctx = c.getContext('2d');
                    ctx.fillStyle = '#1E293B';          // רקע לתמונות שקופות (לוגו PNG)
                    ctx.fillRect(0, 0, size, size);
                    ctx.imageSmoothingQuality = 'high';
                    ctx.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, size, size);
                    return c.toDataURL('image/jpeg', quality);
                };
                // תמונה עמוסה בפרטים יוצאת גדולה — מורידים איכות ואז גודל, עד שהיא נכנסת במגבלה
                let out = encode(ICON_SIZE, 0.85);
                if (out.length > ICON_MAX_CHARS) out = encode(ICON_SIZE, 0.7);
                if (out.length > ICON_MAX_CHARS) out = encode(96, 0.7);
                if (out.length > ICON_MAX_CHARS) out = encode(64, 0.6);
                if (!isImageIcon(out)) return reject(new Error('image-unreadable'));
                resolve(out);
            };
            img.src = url;
        });
    }

    function injectIconPickerCSS() {
        if (document.getElementById('gp-icon-css')) return;
        const st = document.createElement('style');
        st.id = 'gp-icon-css';
        st.textContent = `
            .gp-icons { display: flex; flex-wrap: wrap; gap: 6px; }
            .gp-icon-opt { width: 38px; height: 38px; padding: 0; border-radius: 10px; display: grid; place-items: center; overflow: hidden;
                font-size: 1.2rem; line-height: 1; cursor: pointer; font-family: inherit; color: var(--muted, var(--text-muted, #94A3B8));
                border: 1px solid var(--border, var(--border-color, #334155)); background: var(--bg, var(--bg-color, #0F172A)); }
            .gp-icon-opt[aria-pressed="true"] { border-color: var(--primary, var(--primary-color, #10B981)); background: rgba(16,185,129,0.15);
                box-shadow: 0 0 0 2px rgba(16,185,129,0.25); }
            .gp-icon-opt:disabled { opacity: 0.5; cursor: default; }
            .gp-icon-upload { font-size: 1.05rem; }
            .gp-icon-upload img { width: 100%; height: 100%; object-fit: cover; display: block; }
            .gp-icon-msg { font-size: 0.8rem; color: var(--muted, var(--text-muted, #94A3B8)); margin-top: 6px; min-height: 1em; }
            .gp-icon-msg.err { color: #F87171; }`;
        document.head.appendChild(st);
    }

    // בוחר סמל: אימוג'ים + אריח "העלה תמונה". הערך הנבחר נשמר על האלמנט עצמו
    function renderIconPicker(container, selected) {
        injectIconPickerCSS();
        const sel = cleanIcon(selected);
        container._gpIcon = sel;
        container._gpBusy = false;
        container._gpUpload = isImageIcon(sel) ? sel : '';
        container.innerHTML = `<div class="gp-icons" role="group" aria-label="סמל הקבוצה">${
            GROUP_ICONS.map(ic => `<button type="button" class="gp-icon-opt" data-icon="${ic}" aria-pressed="${ic === sel}">${ic}</button>`).join('')
        }<button type="button" class="gp-icon-opt gp-icon-upload" data-upload="1" aria-pressed="${isImageIcon(sel)}" title="העלאת תמונה" aria-label="העלאת תמונה"></button></div>
        <input type="file" accept="image/*" hidden>
        <div class="gp-icon-msg" aria-live="polite"></div>`;
        const uploadBtn = container.querySelector('.gp-icon-upload');
        const fileInput = container.querySelector('input[type="file"]');
        const msg = container.querySelector('.gp-icon-msg');
        const hint = () => {
            msg.classList.remove('err');
            if (!container._gpUpload) msg.textContent = 'או העלה תמונה (לוגו של הקבוצה)';
            else msg.textContent = isImageIcon(container._gpIcon) ? 'לחץ על התמונה כדי להחליף אותה' : 'לחץ על התמונה כדי לבחור בה';
        };
        const paintUpload = () => {
            uploadBtn.innerHTML = container._gpUpload ? `<img src="${container._gpUpload}" alt="">` : '📷';
            hint();
        };
        const select = value => {
            container._gpIcon = value;
            container.querySelectorAll('.gp-icon-opt').forEach(b => {
                const on = b.dataset.upload ? isImageIcon(value) : b.dataset.icon === value;
                b.setAttribute('aria-pressed', String(on));
            });
            hint();
        };
        paintUpload();
        container.querySelectorAll('.gp-icon-opt[data-icon]').forEach(b => b.addEventListener('click', () => select(b.dataset.icon)));
        uploadBtn.addEventListener('click', () => {
            // תמונה שכבר הועלתה ולא נבחרה — לחיצה בוחרת בה. אחרת פותחים בחירת קובץ
            if (container._gpUpload && !isImageIcon(container._gpIcon)) return select(container._gpUpload);
            fileInput.click();
        });
        fileInput.addEventListener('change', async () => {
            const file = fileInput.files && fileInput.files[0];
            fileInput.value = '';
            if (!file) return;
            container._gpBusy = true;
            uploadBtn.textContent = '⏳';
            msg.classList.remove('err');
            msg.textContent = 'מכין את התמונה…';
            try {
                container._gpUpload = await resizeIcon(file);
                paintUpload();
                select(container._gpUpload);
            } catch (e) {
                paintUpload();
                msg.classList.add('err');
                msg.textContent = 'לא הצלחנו לקרוא את התמונה. נסה תמונה אחרת (JPG או PNG).';
            } finally {
                container._gpBusy = false;
            }
        });
    }

    function readIconPicker(container) {
        return cleanIcon(container && container._gpIcon);
    }

    function iconPickerBusy(container) {
        return !!(container && container._gpBusy);
    }

    window.GroupPrefs = {
        priorityLabel, priorityPrefs, regPriority, priorityRank, priorityLabelScope, priorityRuleTexts,
        validPriorityAge, DEFAULT_PRIORITY_AGE, PRIORITY_AGE_MIN, PRIORITY_AGE_MAX,
        cleanPlayerName, playerNameKey, parsePlayerList, PLAYER_NAME_MAX, BULK_MAX,
        DAY_NAMES, DAY_SHORT, LEVELS, CITIES,
        cleanDays, cleanTime, formatSchedule, normalizePhone, phoneToIntl, buildListing,
        cleanLatLng, cityCoords, distanceKm, listingAuto, listingStatus, LISTING_STATUS,
        renderDayChips, readDayChips, fillCityList, levelOptionsHTML,
        getRecentGroups, rememberGroup, updateRecentGroup, forgetGroup,
        DEFAULT_ICON, GROUP_ICONS, cleanIcon, isImageIcon, iconHTML, resizeIcon,
        renderIconPicker, readIconPicker, iconPickerBusy
    };
})();
