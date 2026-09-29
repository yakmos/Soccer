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

    function displayName(u) {
        return String((u && (u.displayName || u.email)) || 'מנהל').slice(0, 40);
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

    function isCancel(e) {
        const code = (e && e.code) || '';
        return code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request' || code === 'auth/user-cancelled';
    }

    function googleProvider() {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        return provider;
    }

    // חשוב: הפונקציה פותחת חלון מיד, בלי await לפני כן — אחרת הדפדפן חוסם את החלון.
    // משתמש אנונימי (מי שדירג שחקנים מהמכשיר הזה) מקושר ל-Google ושומר את אותו מזהה,
    // כך שקישור ההצבעה שלו ממשיך לעבוד.
    async function signInWithGoogle() {
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

    window.AdminAuth = {
        SUPER_ADMIN_UID,
        getUser, isRealUser, isSuperAdmin, isAdminOf, isOwnerOf, isLegacyGroup,
        displayName, errorMessage, isCancel,
        signInWithGoogle, ensureGoogleUser, loginAsAdmin,
        createInvite, inviteLink, acceptInvite, removeAdmin, signOut
    };
})();
