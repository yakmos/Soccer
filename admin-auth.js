// admin-auth.js — כניסת מנהלים עם Google, בעלות על קבוצות והזמנת מנהלים נוספים.
// משותף ל-index.html, registration.html, voters_admin.html ו-admin.html.
// דורש את firebase-app-compat, firebase-auth-compat ו-firebase-firestore-compat.
//
// מודל ההרשאות (נאכף בחוקי Firestore, לא רק כאן):
//   groups/{gid}.ownerUid          — מי שיצר או העביר את הקבוצה לכניסת Google
//   groups/{gid}.admins            — מפה {uid: שם תצוגה} של כל המנהלים
//   groups/{gid}.adminUids         — אותם מזהים כרשימה, בשביל "הקבוצות שלי" בדף הבית
//   groups/{gid}/private/legacy    — הסיסמה הישנה, לא קריאה לאף אחד
//   groups/{gid}/claims/{uid}      — הוכחת סיסמה ישנה בזמן העברה (לא קריאה)
//   groups/{gid}/adminInvites/{c}  — קישורי הזמנה חד-פעמיים למנהל נוסף
(function () {
    'use strict';

    const SUPER_ADMIN_UID = '83rxsZbqtANkW6qoj3DlBPGNtNn1';
    const INVITE_DAYS = 7;

    function auth() { return firebase.auth(); }
    function ts() { return firebase.firestore.FieldValue.serverTimestamp(); }

    // מחכה לשחזור מצב ההתחברות (פעם אחת) ומחזיר את המשתמש או null
    function getUser() {
        return new Promise(resolve => {
            const unsub = auth().onAuthStateChanged(u => { unsub(); resolve(u); });
        });
    }

    function isRealUser(u) { return !!u && !u.isAnonymous; }
    function isSuperAdmin(u) { return !!u && u.uid === SUPER_ADMIN_UID; }

    // includeSuper=false: מנהל-העל לא נכנס אוטומטית למצב ניהול בקבוצות של אחרים
    function isAdminOf(groupData, u, includeSuper) {
        if (!isRealUser(u)) return false;
        if (includeSuper !== false && isSuperAdmin(u)) return true;
        return !!(groupData && groupData.admins && Object.prototype.hasOwnProperty.call(groupData.admins, u.uid));
    }

    function isOwnerOf(groupData, u) {
        return isRealUser(u) && !!groupData && groupData.ownerUid === u.uid;
    }

    // קבוצה ותיקה = נוצרה בשיטת הסיסמה ועדיין לא הועברה לכניסת Google
    function isLegacyGroup(groupData) {
        return !!groupData && !groupData.ownerUid && !groupData.admins;
    }

    // השם נשמר במסמך הקבוצה, שכל מי שיש לו את הקישור רואה — לכן לא נופלים לכתובת האימייל
    function displayName(u) {
        return String((u && u.displayName) || 'מנהל').trim().slice(0, 40) || 'מנהל';
    }

    function randomHex(bytes) {
        const arr = new Uint8Array(bytes);
        crypto.getRandomValues(arr);
        return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
    }

    function errorMessage(e) {
        const code = (e && e.code) || '';
        switch (code) {
            case 'auth/popup-blocked':
                return 'הדפדפן חסם את חלון ההתחברות. אפשר חלונות קופצים לאתר ולחץ שוב.';
            case 'auth/unauthorized-domain':
                return 'הדומיין של האתר עדיין לא מאושר ב-Firebase (Authentication → Settings → Authorized domains).';
            case 'auth/operation-not-allowed':
                return 'כניסה עם Google עדיין לא הופעלה ב-Firebase (Authentication → Sign-in method).';
            case 'auth/network-request-failed':
                return 'אין חיבור לאינטרנט. נסה שוב.';
            case 'auth/web-storage-unsupported':
            case 'auth/operation-not-supported-in-this-environment':
                return 'הדפדפן הזה לא תומך בהתחברות. פתח את הקישור ב-Chrome או ב-Safari (לא מתוך אפליקציה אחרת).';
            case 'permission-denied':
                return 'אין הרשאה לפעולה הזו.';
            default:
                return (e && e.message) ? e.message : String(e);
        }
    }

    // auth/in-app-browser: המשתמש סגר את חלון "ממשיכים בדפדפן" (ראו למטה)
    function isCancel(e) {
        const code = (e && e.code) || '';
        return code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request' || code === 'auth/user-cancelled'
            || code === 'auth/in-app-browser';
    }

    function googleProvider() {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        return provider;
    }

    // ===== דפדפן מובנה של אפליקציה (פייסבוק, אינסטגרם, מסנג'ר ועוד) =====
    // Google חוסמת כניסה מתוך הדפדפנים שאפליקציות מציגות בתוכן, ומראה דף שגיאה. לכן שם, במקום חלון ההתחברות,
    // מציגים חלון קצר: פתיחת הדף בדפדפן הרגיל של הטלפון (עם מה שכבר מילאו, אם הדף העביר קישור כזה), העתקת קישור,
    // ואפשרות שקטה לנסות בכל זאת, למקרה שהזיהוי טעה.
    const UA = navigator.userAgent || '';
    const IS_IOS = /iPhone|iPad|iPod/i.test(UA) || (/Macintosh/.test(UA) && (navigator.maxTouchPoints || 0) > 1);
    const IS_ANDROID = /Android/i.test(UA);
    // שם האפליקציה, לטקסט. '' = אפליקציה אחרת שמציגה דפים בתוכה. null = דפדפן רגיל
    const IN_APP_NAME = (() => {
        if (/Instagram/i.test(UA)) return 'אינסטגרם';
        if (/MessengerForiOS|FB_IAB\/MESSENGER|Orca-Android/i.test(UA)) return "מסנג'ר";
        if (/FBAN|FBAV|FB_IAB/i.test(UA)) return 'פייסבוק';
        if (/TikTok|musical_ly|Bytedance/i.test(UA)) return 'טיקטוק';
        if (/Snapchat/i.test(UA)) return "סנאפצ'ט";
        if (/LinkedInApp/i.test(UA)) return 'לינקדאין';
        if (/WhatsApp/i.test(UA)) return 'וואטסאפ';
        if (/\bLine\//.test(UA)) return 'LINE';
        if (/MicroMessenger/i.test(UA)) return 'WeChat';
        if (IS_ANDROID && /; wv\)/.test(UA)) return '';
        return null;
    })();
    const IN_APP = IN_APP_NAME !== null;

    // הדף הנוכחי, בלי fbclid (מזהה מעקב שפייסבוק מוסיפה לכל קישור)
    function currentHref() {
        try {
            const u = new URL(location.href);
            if (!u.searchParams.has('fbclid')) return location.href;
            u.searchParams.delete('fbclid');
            return u.toString();
        } catch (e) { return location.href; }
    }

    // קישור שמוציא את הכתובת מהאפליקציה. אנדרואיד: intent בלי חבילה מסוימת, כלומר הדפדפן הרגיל של הטלפון.
    // אייפון: באינסטגרם דרך הקישור הפנימי שלה לדפדפן, ובשאר האפליקציות ישר ל-Safari
    function outsideLink(url) {
        try {
            if (IS_ANDROID) {
                const u = new URL(url);
                return { label: 'פתח בדפדפן', href: 'intent://' + u.host + u.pathname + u.search + u.hash
                    + '#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;S.browser_fallback_url='
                    + encodeURIComponent(url) + ';end' };
            }
            if (IS_IOS && /Instagram/i.test(UA)) return { label: 'פתח בדפדפן', href: 'instagram://extbrowser/?url=' + encodeURIComponent(url) };
            if (IS_IOS && /^https:\/\//.test(url)) return { label: 'פתח ב-Safari', href: 'x-safari-' + url };
        } catch (e) { /* כתובת לא תקינה: נשארים עם העתקת הקישור */ }
        return null;
    }

    // העתקה ללוח. קודם הדרך הישנה, שעובדת רק בתוך הלחיצה עצמה, ואחר כך ה-API החדש
    function copyText(text) {
        let ok = false;
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            ta.setSelectionRange(0, text.length);
            ok = document.execCommand('copy');
            ta.remove();
        } catch (e) { ok = false; }
        if (!ok && navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text).then(() => true, () => false);
        }
        return Promise.resolve(ok);
    }

    // הצבעים כתובים כאן במפורש: הקובץ משותף לכמה דפים, ולא בכולם מוגדרים אותם משתנים
    function injectSheetCSS() {
        if (document.getElementById('sm-iab-css')) return;
        const st = document.createElement('style');
        st.id = 'sm-iab-css';
        st.textContent = `
            .sm-iab { position: fixed; inset: 0; z-index: 2147483000; display: flex; align-items: center; justify-content: center; padding: 16px;
                background: rgba(2,6,23,0.74); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); direction: rtl; }
            .sm-iab .sm-iab-card { position: relative; box-sizing: border-box; width: 100%; max-width: 420px; max-height: calc(100vh - 32px); overflow-y: auto;
                margin: 0; padding: 24px 20px 20px; background: #111748; color: #F5F7FF; border: 1px solid #28306F; border-radius: 20px;
                box-shadow: 0 30px 60px rgba(0,0,0,0.5); font-family: 'Heebo', system-ui, -apple-system, sans-serif; line-height: 1.55; text-align: right; }
            .sm-iab h2 { margin: 0 0 8px; padding: 0 0 0 44px; font-family: inherit; font-size: 1.3rem; font-weight: 900; line-height: 1.25; color: #F5F7FF; text-align: right; }
            .sm-iab p { margin: 0 0 10px; padding: 0; font-size: 0.97rem; font-weight: 400; color: #D3D8F6; }
            .sm-iab .sm-iab-keep { color: #AFC2FF; font-size: 0.9rem; font-weight: 700; }
            .sm-iab .sm-iab-go, .sm-iab .sm-iab-copy { display: flex; align-items: center; justify-content: center; box-sizing: border-box; width: 100%;
                margin: 10px 0 0; padding: 14px 18px; border-radius: 12px; font-family: inherit; font-size: 1.05rem; font-weight: 800; line-height: 1.3;
                text-decoration: none; text-align: center; cursor: pointer; -webkit-appearance: none; appearance: none; }
            .sm-iab .sm-iab-go { margin-top: 16px; border: 0; color: #FFFFFF; background: linear-gradient(120deg, #3B63F5 0%, #7046F0 55%, #C23CB8 100%);
                box-shadow: 0 10px 26px rgba(112,70,240,0.35); }
            .sm-iab .sm-iab-go:active, .sm-iab .sm-iab-copy:active { transform: scale(0.98); }
            .sm-iab .sm-iab-copy { color: #F5F7FF; background: transparent; border: 1px solid #28306F; }
            .sm-iab .sm-iab-copy.ok { color: #AFC2FF; border-color: rgba(77,124,255,0.55); background: rgba(77,124,255,0.12); }
            .sm-iab .sm-iab-url { display: block; box-sizing: border-box; width: 100%; margin: 10px 0 0; padding: 11px 12px; border-radius: 10px;
                border: 1px solid #28306F; background: #080B2B; color: #F5F7FF; font-family: inherit; font-size: 0.85rem; line-height: 1.4; direction: ltr; text-align: left; }
            .sm-iab .sm-iab-how { margin: 14px 0 0; color: #A4ACDC; font-size: 0.86rem; }
            .sm-iab .sm-iab-key { display: inline-block; min-width: 1.5em; padding: 0 5px; border: 1px solid #28306F; border-radius: 6px; background: #1A2161;
                color: #F5F7FF; font-weight: 900; line-height: 1.35; text-align: center; }
            .sm-iab .sm-iab-try { display: block; margin: 12px auto 0; padding: 6px 10px; background: none; border: 0; color: #A4ACDC; font-family: inherit;
                font-size: 0.86rem; font-weight: 500; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
            .sm-iab .sm-iab-x { position: absolute; top: 14px; left: 14px; width: 36px; height: 36px; margin: 0; padding: 0; border-radius: 10px; border: 0;
                background: #1A2161; color: #A4ACDC; font-size: 1rem; line-height: 36px; text-align: center; cursor: pointer; }
            .sm-iab :focus-visible { outline: 2px solid #4D7CFF; outline-offset: 2px; }
            @media (max-width: 560px) {
                .sm-iab { align-items: flex-end; padding: 0; }
                .sm-iab .sm-iab-card { max-width: none; max-height: 92vh; border-radius: 20px 20px 0 0; padding-bottom: calc(20px + env(safe-area-inset-bottom)); }
            }
            @media (prefers-reduced-motion: reduce) { .sm-iab .sm-iab-go:active, .sm-iab .sm-iab-copy:active { transform: none; } }`;
        document.head.appendChild(st);
    }

    function inAppError() {
        const e = new Error('Google sign-in is blocked inside in-app browsers');
        e.code = 'auth/in-app-browser';
        return e;
    }

    let sheet = null;
    // opts.url: מה לפתוח בדפדפן (ברירת מחדל: הדף הנוכחי). opts.keep: להגיד שמה שמילאו עובר איתם.
    // opts.text: הסבר משלך. opts.trySignIn: כשיש, כפתור שקט "להתחבר כאן בכל זאת" שמריץ אותו ישר מהלחיצה.
    // מחזיר Promise: מה ש-trySignIn החזיר, או דחייה עם auth/in-app-browser כשסוגרים את החלון
    function openInAppSheet(opts) {
        opts = opts || {};
        if (sheet) sheet.done('replaced');
        injectSheetCSS();
        const url = opts.url || currentHref();
        const out = outsideLink(url);
        const key = '<span class="sm-iab-key">' + (IS_IOS ? '⋯' : '⋮') + '</span>';
        const howText = (out && IS_IOS && !/Instagram/i.test(UA) ? 'אם מופיעה שאלה, אשר אותה. ' : '')
            + (out ? 'לא נפתח? בתפריט ' + key + ' שבפינת המסך בחר לפתוח בדפדפן, או העתק את הקישור והדבק אותו בדפדפן.'
                   : 'בתפריט ' + key + ' שבפינת המסך בחר לפתוח בדפדפן, או העתק את הקישור והדבק אותו בדפדפן.');
        const el = document.createElement('div');
        el.className = 'sm-iab';
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-modal', 'true');
        el.setAttribute('aria-labelledby', 'smIabTitle');
        el.innerHTML = `<div class="sm-iab-card">
            <button class="sm-iab-x" type="button" aria-label="סגור">✕</button>
            <h2 id="smIabTitle">ממשיכים בדפדפן</h2>
            <p class="sm-iab-text"></p>
            ${opts.keep ? '<p class="sm-iab-keep">מה שמילאת יעבור איתך.</p>' : ''}
            ${out ? '<a class="sm-iab-go"></a>' : ''}
            <button class="sm-iab-copy" type="button">העתק קישור</button>
            <p class="sm-iab-how">${howText}</p>
            ${opts.trySignIn ? '<button class="sm-iab-try" type="button">להתחבר כאן בכל זאת</button>' : ''}
        </div>`;
        el.querySelector('.sm-iab-text').textContent = opts.text
            || 'Google לא מאפשרת להתחבר מתוך ' + (IN_APP_NAME || 'האפליקציה הזו') + '. בדפדפן הרגיל של הטלפון זה עובד.';
        const go = el.querySelector('.sm-iab-go');
        if (go) { go.textContent = out.label; go.setAttribute('href', out.href); }
        const copyBtn = el.querySelector('.sm-iab-copy');
        const how = el.querySelector('.sm-iab-how');
        copyBtn.addEventListener('click', () => {
            copyText(url).then(ok => {
                if (!el.isConnected) return;
                if (ok) {
                    copyBtn.textContent = '✓ הקישור הועתק';
                    copyBtn.classList.add('ok');
                    how.textContent = 'עכשיו פתח את ' + (IS_IOS ? 'Safari' : 'הדפדפן') + ' והדבק את הקישור בשורת הכתובת.';
                } else if (!el.querySelector('.sm-iab-url')) {
                    // ההעתקה נחסמה: מציגים את הקישור, לבחירה ידנית
                    const box = document.createElement('input');
                    box.className = 'sm-iab-url';
                    box.readOnly = true;
                    box.value = url;
                    box.setAttribute('aria-label', 'הקישור לדף');
                    copyBtn.insertAdjacentElement('afterend', box);
                    box.addEventListener('focus', () => box.select());
                    box.focus();
                    how.textContent = 'לחץ לחיצה ארוכה על הקישור ובחר "העתק", ואז הדבק אותו בדפדפן.';
                }
            });
        });

        const prevFocus = document.activeElement;
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        document.body.appendChild(el);
        const onKey = e => {
            // Esc סוגר רק את החלון הזה, לא את הטופס שמתחתיו
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (sheet && sheet.el === el) sheet.done('closed'); return; }
            if (e.key !== 'Tab') return;
            // הפוקוס נשאר בתוך החלון
            const items = Array.from(el.querySelectorAll('a[href], button, input')).filter(x => x.getClientRects().length);
            if (!items.length) return;
            const first = items[0], last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        };
        document.addEventListener('keydown', onKey, true);
        setTimeout(() => { if (el.isConnected) (go || copyBtn).focus(); }, 30);

        return new Promise((resolve, reject) => {
            const me = {
                el,
                done(how, tried) {
                    if (sheet === me) sheet = null;
                    el.remove();
                    document.removeEventListener('keydown', onKey, true);
                    document.body.style.overflow = prevOverflow;
                    if (how !== 'replaced') { try { if (prevFocus && prevFocus.focus && prevFocus.isConnected) prevFocus.focus(); } catch (e) { /* לא קריטי */ } }
                    if (how === 'tried') tried.then(resolve, reject);
                    else reject(inAppError());
                }
            };
            sheet = me;
            el.querySelector('.sm-iab-x').addEventListener('click', () => me.done('closed'));
            el.addEventListener('click', e => { if (e.target === el) me.done('closed'); });
            const tryBtn = el.querySelector('.sm-iab-try');
            if (tryBtn) tryBtn.addEventListener('click', () => {
                let p;
                try { p = Promise.resolve(opts.trySignIn()); } catch (e) { p = Promise.reject(e); }
                me.done('tried', p);
            });
        });
    }

    // opts.resume: הקישור לפתיחה בדפדפן, כשהדף רוצה להעביר טופס מלא. opts.keep: הקישור כולל את מה שמילאו.
    // בדפדפן רגיל: ישר לחלון של Google
    function signInWithGoogle(opts) {
        opts = opts || {};
        if (IN_APP) return openInAppSheet({ url: opts.resume, keep: !!opts.keep, trySignIn: googlePopup });
        return googlePopup();
    }

    // חשוב: הפונקציה פותחת חלון מיד, בלי await לפני כן — אחרת הדפדפן חוסם את החלון.
    // משתמש אנונימי (מי שדירג שחקנים מהמכשיר הזה) מקושר ל-Google ושומר את אותו מזהה,
    // כך שקישור ההצבעה שלו ממשיך לעבוד.
    async function googlePopup() {
        const provider = googleProvider();
        const cur = auth().currentUser;
        if (cur && cur.isAnonymous) {
            try {
                return (await cur.linkWithPopup(provider)).user;
            } catch (e) {
                if (e.code === 'auth/credential-already-in-use' || e.code === 'auth/email-already-in-use'
                    || e.code === 'auth/account-exists-with-different-credential') {
                    let cred = e.credential || null;
                    if (!cred && firebase.auth.GoogleAuthProvider.credentialFromError) {
                        try { cred = firebase.auth.GoogleAuthProvider.credentialFromError(e); } catch (_) { cred = null; }
                    }
                    if (cred) return (await auth().signInWithCredential(cred)).user;
                    await auth().signOut();
                    return (await auth().signInWithPopup(provider)).user;
                }
                throw e;
            }
        }
        return (await auth().signInWithPopup(provider)).user;
    }

    function ensureGoogleUser() {
        const cur = auth().currentUser;
        if (isRealUser(cur)) return Promise.resolve(cur);
        return signInWithGoogle();
    }

    // העברת קבוצה ותיקה לכניסת Google. החוקים בודקים את הסיסמה בצד השרת.
    async function claimLegacyGroup(db, groupId, password, u) {
        const groupRef = db.collection('groups').doc(groupId);
        const batch = db.batch();
        batch.set(groupRef.collection('claims').doc(u.uid), { password: password, at: ts() });
        batch.update(groupRef, {
            ownerUid: u.uid,
            admins: { [u.uid]: displayName(u) },
            adminUids: [u.uid],
            password: firebase.firestore.FieldValue.delete()
        });
        await batch.commit();
    }

    // כניסת מנהל מלאה. חייבת להיקרא ישירות מלחיצה של המשתמש.
    // מחזירה { ok, user, claimed }
    async function loginAsAdmin(db, groupId, groupData) {
        let u;
        try {
            u = await ensureGoogleUser();
        } catch (e) {
            if (!isCancel(e)) alert('ההתחברות נכשלה: ' + errorMessage(e));
            return { ok: false };
        }
        if (!u) return { ok: false };

        if (isLegacyGroup(groupData)) {
            // מנהל-העל יכול לקחת בעלות בלי סיסמה (למשל על הקבוצה שלו)
            if (isSuperAdmin(u)) {
                if (confirm('הקבוצה עדיין בשיטת הסיסמה הישנה.\nלהפוך את החשבון שלך לבעלים שלה עכשיו? (מומלץ אם זו הקבוצה שלך)')) {
                    try {
                        await db.collection('groups').doc(groupId).update({
                            ownerUid: u.uid,
                            admins: { [u.uid]: displayName(u) },
                            adminUids: [u.uid],
                            password: firebase.firestore.FieldValue.delete()
                        });
                        alert('✅ הקבוצה עברה לבעלות החשבון שלך. מנהלים נוספים מוסיפים דרך ⚙️ הגדרות → "הזמן מנהל נוסף".');
                        return { ok: true, user: u, claimed: true };
                    } catch (e) {
                        alert('שגיאה בהעברת הקבוצה: ' + errorMessage(e));
                    }
                }
                return { ok: true, user: u };
            }

            const pwd = prompt(
                'זו הפעם הראשונה שנכנסים לקבוצה הזו עם חשבון Google.\n' +
                'הזן את סיסמת המנהל הישנה, והחשבון ' + (u.email || '') + ' יהפוך לבעלים של הקבוצה.\n' +
                'מעכשיו לא תצטרך סיסמה, ורק מי שתזמין יוכל לנהל.'
            );
            if (pwd === null) return { ok: false };
            const clean = pwd.trim();
            if (!clean) { alert('לא הוזנה סיסמה.'); return { ok: false }; }
            try {
                await claimLegacyGroup(db, groupId, clean, u);
            } catch (e) {
                console.error('claim failed', e);
                if (e && e.code === 'permission-denied') {
                    alert('הסיסמה שגויה, או שהקבוצה כבר הועברה למנהל אחר.\nאם זה לא הגיוני — פנה ליוצר האפליקציה.');
                } else {
                    alert('שגיאה בהעברת הקבוצה: ' + errorMessage(e));
                }
                return { ok: false };
            }
            alert('✅ הקבוצה עברה לכניסת Google.\nמעכשיו אתה נכנס כמנהל בלי סיסמה. מנהלים נוספים מוסיפים דרך ⚙️ הגדרות → "הזמן מנהל נוסף".');
            return { ok: true, user: u, claimed: true };
        }

        if (isAdminOf(groupData, u)) return { ok: true, user: u };

        const again = confirm(
            'לחשבון ' + (u.email || displayName(u)) + ' אין הרשאת ניהול בקבוצה הזו.\n' +
            'כדי להפוך למנהל, בקש מהמנהל קישור הזמנה.\n\n' +
            'להתנתק כדי להתחבר עם חשבון Google אחר?'
        );
        if (again) {
            await auth().signOut();
            alert('התנתקת. לחץ שוב על כפתור הניהול כדי להתחבר עם החשבון הנכון.');
        }
        return { ok: false };
    }

    async function createInvite(db, groupId) {
        const u = auth().currentUser;
        if (!isRealUser(u)) throw new Error('צריך להיות מחובר כמנהל');
        const code = randomHex(16);
        const expiresAt = firebase.firestore.Timestamp.fromDate(new Date(Date.now() + INVITE_DAYS * 24 * 3600 * 1000));
        await db.collection('groups').doc(groupId).collection('adminInvites').doc(code).set({
            createdBy: u.uid, createdAt: ts(), expiresAt: expiresAt
        });
        return code;
    }

    function inviteLink(groupId, code) {
        const base = location.origin + location.pathname.replace(/[^/]*$/, '');
        return base + 'index.html?group=' + encodeURIComponent(groupId) + '&adminInvite=' + code;
    }

    // קבלת הזמנה. חייבת להיקרא ישירות מלחיצה של המשתמש.
    async function acceptInvite(db, groupId, code, groupData) {
        let u;
        try {
            u = await ensureGoogleUser();
        } catch (e) {
            if (!isCancel(e)) alert('ההתחברות נכשלה: ' + errorMessage(e));
            return { ok: false };
        }
        if (!u) return { ok: false };
        if (isAdminOf(groupData, u, false)) return { ok: true, user: u, already: true };

        // הצטרפות + מחיקת ההזמנה באותה פעולה — כך הקישור חד-פעמי באמת
        const groupRef = db.collection('groups').doc(groupId);
        try {
            const fresh = await groupRef.get();
            const current = Object.keys((fresh.exists && fresh.data().admins) || {});
            const adminUids = Array.from(new Set(current.concat([u.uid])));
            const batch = db.batch();
            batch.update(groupRef, { ['admins.' + u.uid]: displayName(u), adminUids: adminUids, joinedWithInvite: code });
            batch.delete(groupRef.collection('adminInvites').doc(code));
            await batch.commit();
        } catch (e) {
            console.error('invite failed', e);
            if (e && e.code === 'permission-denied') {
                alert('קישור ההזמנה לא תקף — אולי כבר נוצל או שפג תוקפו (7 ימים).\nבקש מהמנהל קישור חדש.');
            } else {
                alert('שגיאה: ' + errorMessage(e));
            }
            return { ok: false };
        }
        return { ok: true, user: u };
    }

    async function removeAdmin(db, groupId, uid) {
        const groupRef = db.collection('groups').doc(groupId);
        const fresh = await groupRef.get();
        const remaining = Object.keys((fresh.exists && fresh.data().admins) || {}).filter(k => k !== uid);
        await groupRef.update({ ['admins.' + uid]: firebase.firestore.FieldValue.delete(), adminUids: remaining });
    }

    async function signOut() { await auth().signOut(); }

    // ===== מחיקת קבוצה =====
    // מוחק את כל תתי-האוספים, את המודעה ב"מצא משחק" ואת הפוסט בשוק, ובסוף את מסמך הקבוצה.
    // מסמך הקבוצה נמחק אחרון: חוקי האבטחה בודקים דרכו שהמוחק מנהל בקבוצה.
    // onProgress(done, total) — להצגת התקדמות במסך
    const GROUP_SUBCOLLECTIONS = ['players', 'game', 'history', 'history_games', 'adminInvites'];
    const DELETE_CHUNK = 400;        // פחות מהמגבלה של 500 פעולות ב-batch

    async function deleteGroup(db, groupId, onProgress) {
        const groupRef = db.collection('groups').doc(groupId);
        const snap = await groupRef.get();
        if (!snap.exists) return { deleted: 0 };
        const data = snap.data() || {};

        // רק הבעלים או מנהל-העל. בודקים לפני שמוחקים משהו, כדי לא להשאיר קבוצה ריקה
        const u = auth().currentUser;
        if (!isSuperAdmin(u) && !isOwnerOf(data, u)) {
            const err = new Error('only the owner can delete the group');
            err.code = 'permission-denied';
            throw err;
        }

        const refs = [];
        const collect = async col => { const s = await col.get(); s.forEach(d => refs.push(d.ref)); return s; };
        for (const name of GROUP_SUBCOLLECTIONS) await collect(groupRef.collection(name));
        const regs = await groupRef.collection('registrations').get();
        for (const r of regs.docs) {
            await collect(r.ref.collection('entries'));
            await collect(r.ref.collection('cancelled'));
            refs.push(r.ref);
        }
        const voters = await groupRef.collection('voters').get();
        for (const v of voters.docs) {
            await collect(v.ref.collection('votes'));
            refs.push(v.ref);
        }
        // בקשות של שחקנים לחבר פרופיל לכרטיס (שם, תמונה ותאריך לידה) — נמחקות עם הקבוצה
        await collect(groupRef.collection('links')).catch(() => null);
        // הארכיון: כרטיסים של מי שלא נרשם חודש (רק מנהלים קוראים אותו)
        await collect(groupRef.collection('archive')).catch(() => null);
        // הסיסמה הישנה של קבוצות ותיקות — רק מנהל-העל רשאי לקרוא ולמחוק אותה
        if (isSuperAdmin(u)) await collect(groupRef.collection('private')).catch(() => null);

        let listingRef = null;
        if (data.listingId) {
            const l = await db.collection('listings').doc(data.listingId).get().catch(() => null);
            if (l && l.exists) listingRef = l.ref;
        }

        // מודעת "מחפשים שחקן" של הקבוצה (מזהה אקראי) והקישור שלה לקבוצה. כל מנהל בקבוצה רשאי להוריד אותה,
        // ולכן זה קורה לפני שמסמך הקבוצה נמחק. מודעה ישנה שמנהל אחר פרסם (בלי קישור) תרד לבד כשהזמן שלה ייגמר
        if (data.marketPostId) {
            const post = db.collection('market_posts').doc(data.marketPostId);
            await post.delete().catch(() => null);
            await post.collection('private').doc('group').delete().catch(() => null);
        }

        const total = refs.length + 1;
        const report = n => { if (onProgress) { try { onProgress(n, total); } catch (e) { /* תצוגה בלבד */ } } };
        report(0);
        for (let i = 0; i < refs.length; i += DELETE_CHUNK) {
            const batch = db.batch();
            refs.slice(i, i + DELETE_CHUNK).forEach(ref => batch.delete(ref));
            await batch.commit();
            report(Math.min(i + DELETE_CHUNK, refs.length));
        }
        const last = db.batch();
        last.delete(db.collection('market_posts').doc(groupId));
        if (listingRef) last.delete(listingRef);
        last.delete(groupRef);
        await last.commit();
        report(total);
        return { deleted: total };
    }

    // פניות מטופס יצירת הקשר שעוד לא נקראו (רק מנהל-העל רשאי לקרוא אותן). פנייה נקראת כשנפתחת תיבת הפניות ב-admin.html.
    // cb(מספר) נקרא בכל שינוי. מחזיר פונקציה שמפסיקה להאזין
    function watchUnreadMessages(db, cb) {
        return db.collection('contact_messages').orderBy('createdAt', 'desc').limit(50).onSnapshot(
            snap => cb(snap.docs.filter(d => !d.data().readAt).length),
            e => { console.warn('unread messages', e); cb(0); });
    }

    window.AdminAuth = {
        SUPER_ADMIN_UID,
        getUser, isRealUser, isSuperAdmin, isAdminOf, isOwnerOf, isLegacyGroup,
        displayName, errorMessage, isCancel,
        signInWithGoogle, ensureGoogleUser, loginAsAdmin,
        inApp: IN_APP, inAppName: IN_APP_NAME, openInBrowser: openInAppSheet,
        createInvite, inviteLink, acceptInvite, removeAdmin, signOut,
        deleteGroup, watchUnreadMessages
    };
})();
