// group-prefs.js — הגדרות קבוצה משותפות ל-index.html ול-registration.html
(function () {
    'use strict';

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

    window.GroupPrefs = { priorityLabel };
})();
