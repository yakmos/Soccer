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

    // מודעה ל"מצא משחק": רק השדות שחוקי האבטחה מאפשרים, בגבולות האורך
    function buildListing(f) {
        return {
            ownerUid: f.ownerUid,
            name: String(f.name || '').trim().slice(0, 60),
            city: String(f.city || '').trim().slice(0, 40),
            venue: String(f.venue || '').trim().slice(0, 60),
            days: cleanDays(f.days),
            time: cleanTime(f.time),
            level: LEVELS[f.level] ? f.level : '',
            description: String(f.description || '').trim().slice(0, 300),
            phone: f.phone
        };
    }

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

    function rememberGroup(id, name, city) {
        if (!id) return;
        try {
            const list = getRecentGroups().filter(g => g.id !== id);
            list.unshift({ id, name: String(name || '').slice(0, 60), city: String(city || '').slice(0, 40), t: Date.now() });
            localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 12)));
        } catch (e) { /* מצב גלישה פרטית וכו' — לא קריטי */ }
    }

    window.GroupPrefs = {
        priorityLabel,
        DAY_NAMES, DAY_SHORT, LEVELS, CITIES,
        cleanDays, cleanTime, formatSchedule, normalizePhone, phoneToIntl, buildListing,
        renderDayChips, readDayChips, fillCityList, levelOptionsHTML,
        getRecentGroups, rememberGroup
    };
})();
