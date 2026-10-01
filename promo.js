// promo.js — תחתית הדפים שהשחקנים רואים (הרשמה, דירוגים, MVP, דף הקבוצה):
// 1. שורת "פתחו קבוצה משלכם": כל שחקן שנכנס מהוואטסאפ רואה אותה; מי שמארגן משחק משלו יכול לפתוח קבוצה בחינם.
// 2. קישורים למדיניות הפרטיות, לתנאי השימוש ולטופס יצירת הקשר (מוצגים גם למנהלים).
// <script src="promo.js" data-from="registration" defer></script>  —  data-from מסמן מאיזה דף הגיעו
(function () {
    'use strict';
    const script = document.currentScript;
    const from = (script && script.dataset.from) || 'page';

    function mount() {
        if (document.getElementById('smPromo')) return;

        const style = document.createElement('style');
        style.textContent = `
            .sm-promo-wrap { max-width: 540px; margin: 28px auto 12px; padding: 0 16px; direction: rtl; }
            body.is-admin .sm-promo-wrap { display: none; }
            #smPromo { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-radius: 14px;
                background: rgba(16,185,129,0.07); border: 1px solid rgba(16,185,129,0.28);
                color: #E2E8F0; text-decoration: none; font-family: 'Heebo', system-ui, sans-serif; line-height: 1.45;
                transition: background .15s, border-color .15s; }
            #smPromo:hover, #smPromo:focus-visible { background: rgba(16,185,129,0.12); border-color: rgba(16,185,129,0.5); }
            #smPromo .sm-ic { font-size: 1.5rem; flex: none; }
            #smPromo .sm-tx { flex: 1; min-width: 0; font-size: .88rem; color: #94A3B8; }
            #smPromo .sm-tx b { display: block; color: #F8FAFC; font-size: .98rem; font-weight: 800; }
            #smPromo .sm-nw { white-space: nowrap; }
            #smPromo .sm-go { flex: none; background: #10B981; color: #052E22; font-weight: 800; font-size: .85rem;
                padding: 8px 12px; border-radius: 10px; white-space: nowrap; }
            .sm-legal { max-width: 540px; margin: 12px auto 28px; padding: 0 16px; text-align: center; direction: rtl;
                font-family: 'Heebo', system-ui, sans-serif; font-size: .8rem; line-height: 1.8; color: #64748B; }
            .sm-legal a { color: #94A3B8; text-decoration: none; }
            .sm-legal a:hover, .sm-legal a:focus-visible { color: #F8FAFC; text-decoration: underline; }
            .sm-legal span { margin: 0 8px; }`;
        document.head.appendChild(style);

        const wrap = document.createElement('div');
        wrap.className = 'sm-promo-wrap';
        wrap.innerHTML = `<a id="smPromo" href="home.html?from=${encodeURIComponent(from)}">
            <span class="sm-ic" aria-hidden="true">⚽</span>
            <span class="sm-tx"><b>מארגנים משחק קבוע?</b>פתחו קבוצה משלכם בחינם <span class="sm-nw">ב&#8209;Soccer&nbsp;Manager</span></span>
            <span class="sm-go">פתחו קבוצה</span>
        </a>`;
        document.body.appendChild(wrap);

        // בפנייה מדף של קבוצה, מזהה הקבוצה מצורף לטופס (למשל לבקשה למחוק פרטי שחקן)
        const gid = new URLSearchParams(location.search).get('group');
        const groupParam = gid && /^[A-Za-z0-9]{1,40}$/.test(gid) ? '&group=' + gid : '';
        const legal = document.createElement('nav');
        legal.className = 'sm-legal';
        legal.setAttribute('aria-label', 'מידע על האתר');
        legal.innerHTML = `<a href="privacy.html">מדיניות פרטיות</a><span aria-hidden="true">·</span><a href="terms.html">תנאי שימוש</a><span aria-hidden="true">·</span><a href="contact.html?from=${encodeURIComponent(from)}${groupParam}">יצירת קשר</a>`;
        document.body.appendChild(legal);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
    else mount();
})();
