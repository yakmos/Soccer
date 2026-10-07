// profile-kit.js — פרופיל שחקן (לא חובה): שם, תאריך לידה ותמונת פנים, וחיבור לכרטיס השחקן בקבוצות.
// הפרופיל נשמר ב-users/{uid}, ורק בעל החשבון קורא אותו. כששחקן מבקש להתחבר לכרטיס שלו בקבוצה,
// עותק של השם, תאריך הלידה והתמונה (אם בחר) נשמר בבקשה (groups/{gid}/links/{uid}), ומנהלי הקבוצה מאשרים.
// אחרי האישור הכרטיס מחזיק את מזהה החשבון (players/{pid}.uid), ובדף ההרשמה נרשמים בלחיצה אחת.
// משותף ל-home.html ול-index.html. דורש firebase (compat) ו-GroupPrefs.resizeIcon.
(function () {
    'use strict';

    const NAME_MAX = 60;
    const PHOTO_MAX = 40000;
    const PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/]+=*$/;
    const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
    const ADULT = 18;

    const ts = () => firebase.firestore.FieldValue.serverTimestamp();
    const del = () => firebase.firestore.FieldValue.delete();
    const userRef = (db, uid) => db.collection('users').doc(uid);
    const linkRef = (db, gid, uid) => db.collection('groups').doc(gid).collection('links').doc(uid);

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
    function cleanName(s) {
        return String(s == null ? '' : s).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
    }
    function photoOk(p) { return typeof p === 'string' && p.length <= PHOTO_MAX && PHOTO_RE.test(p); }

    // 'YYYY-MM-DD' של תאריך אמיתי, משנת 1930 ועד היום
    function validBirthDate(s) {
        const m = DATE_RE.exec(String(s || ''));
        if (!m) return false;
        const y = +m[1], mo = +m[2], d = +m[3];
        const dt = new Date(y, mo - 1, d);
        if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return false;
        return y >= 1930 && dt <= new Date();
    }
    function age(s, now) {
        if (!validBirthDate(s)) return null;
        const [y, mo, d] = s.split('-').map(Number);
        const n = now || new Date();
        let a = n.getFullYear() - y;
        if (n.getMonth() + 1 < mo || (n.getMonth() + 1 === mo && n.getDate() < d)) a--;
        return a;
    }
    function isMinor(s) { const a = age(s); return a !== null && a < ADULT; }
    function todayStr() {
        const n = new Date();
        return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
    }

    // עיגול עם התמונה, או האות הראשונה של השם
    function avatarHTML(profile, cls) {
        const p = profile || {};
        if (photoOk(p.photo)) return `<span class="${cls || 'pk-av'}"><img src="${p.photo}" alt=""></span>`;
        const ch = cleanName(p.name).charAt(0) || '👤';
        return `<span class="${cls || 'pk-av'}">${esc(ch)}</span>`;
    }

    // ===== קריאה ושמירה =====
    async function load(db, uid) {
        const s = await userRef(db, uid).get();
        return s.exists ? s.data() : null;
    }

    // existing: הפרופיל הנוכחי (עדכון), או null (יצירה). מחזיר את הפרופיל כפי שנשמר
    async function save(db, uid, f, existing) {
        const name = cleanName(f.name);
        if (!name) throw Object.assign(new Error('name'), { code: 'pk/name' });
        const bd = validBirthDate(f.birthDate) ? f.birthDate : null;
        const photo = photoOk(f.photo) ? f.photo : null;
        const consent = !!(bd && isMinor(bd) && f.parentConsent);
        const data = { name, updatedAt: ts() };
        if (existing) {
            data.birthDate = bd || del();
            data.photo = photo || del();
            data.parentConsent = consent ? true : del();
            await userRef(db, uid).update(data);
        } else {
            if (bd) data.birthDate = bd;
            if (photo) data.photo = photo;
            if (consent) data.parentConsent = true;
            data.createdAt = ts();
            await userRef(db, uid).set(data);
        }
        const out = Object.assign({}, existing || {}, { name });
        if (bd) out.birthDate = bd; else delete out.birthDate;
        if (photo) out.photo = photo; else delete out.photo;
        if (consent) out.parentConsent = true; else delete out.parentConsent;
        return out;
    }

    // הקבוצות שהפרופיל מחובר אליהן או ביקש להתחבר: {gid: {pid, name}}. שם הקבוצה בשביל דף הבית
    function setGroup(db, uid, gid, pid, groupName) {
        return userRef(db, uid).update({ ['groups.' + gid]: { pid, name: String(groupName || '').slice(0, NAME_MAX) }, updatedAt: ts() });
    }
    function dropGroup(db, uid, gid) {
        return userRef(db, uid).update({ ['groups.' + gid]: del(), updatedAt: ts() });
    }

    // ===== חיבור לכרטיס שחקן בקבוצה =====
    async function getLink(db, gid, uid) {
        const s = await linkRef(db, gid, uid).get();
        return s.exists ? s.data() : null;
    }

    // בקשה למנהלי הקבוצה. הם רואים את השם, את תאריך הלידה, ואת התמונה רק אם withPhoto
    async function requestLink(db, uid, gid, groupName, pid, profile, withPhoto) {
        const req = { pid, name: cleanName(profile.name), createdAt: ts() };
        if (withPhoto && photoOk(profile.photo)) req.photo = profile.photo;
        if (validBirthDate(profile.birthDate)) req.birthDate = profile.birthDate;
        await linkRef(db, gid, uid).set(req);
        await setGroup(db, uid, gid, pid, groupName).catch(e => console.warn('profile groups', e));
    }

    async function cancelLink(db, uid, gid) {
        await linkRef(db, gid, uid).delete();
        await dropGroup(db, uid, gid).catch(() => {});
    }

    // השחקן מנתק בעצמו את הפרופיל מהכרטיס (חוקי האבטחה מתירים לו למחוק רק את המזהה שלו)
    async function unlinkSelf(db, uid, gid, pid) {
        await db.collection('groups').doc(gid).collection('players').doc(pid).update({ uid: del() });
        await dropGroup(db, uid, gid).catch(() => {});
    }

    // מחיקת הפרופיל: קודם הבקשות והחיבורים בקבוצות שברשימה, ואז הפרופיל עצמו
    async function removeAll(db, uid, profile) {
        const groups = (profile && profile.groups) || {};
        for (const gid of Object.keys(groups)) {
            const pid = groups[gid] && groups[gid].pid;
            await linkRef(db, gid, uid).delete().catch(() => {});
            if (pid) {
                const ref = db.collection('groups').doc(gid).collection('players').doc(pid);
                const snap = await ref.get().catch(() => null);
                if (snap && snap.exists && snap.data().uid === uid) await ref.update({ uid: del() }).catch(() => {});
            }
        }
        await userRef(db, uid).delete();
    }

    // מצב החיבור בקבוצה אחת: 'linked' (הכרטיס מחובר), 'pending' (מחכה למנהל), או null
    async function groupState(db, uid, gid, pid) {
        if (pid) {
            const p = await db.collection('groups').doc(gid).collection('players').doc(pid).get();
            if (p.exists && p.data().uid === uid) return 'linked';
        }
        return (await getLink(db, gid, uid)) ? 'pending' : null;
    }

    // ===== חלון יצירה ועריכה של הפרופיל =====
    function injectCSS() {
        if (document.getElementById('profileKitStyle')) return;
        const st = document.createElement('style');
        st.id = 'profileKitStyle';
        st.textContent = `
            .pk-overlay { position: fixed; inset: 0; z-index: 1200; background: rgba(2,6,23,0.72); display: flex; align-items: center; justify-content: center; padding: 16px; }
            .pk-card { position: relative; width: 100%; max-width: 440px; max-height: calc(100vh - 32px); overflow-y: auto; background: #1E293B; color: #F1F5F9;
                border: 1px solid #334155; border-radius: 18px; padding: 22px; font-family: 'Heebo', sans-serif; direction: rtl; text-align: right; box-shadow: 0 30px 60px rgba(0,0,0,0.5); }
            .pk-card h2 { margin: 0 0 6px; font-size: 1.3rem; font-weight: 900; padding-left: 30px; }
            .pk-x { position: absolute; top: 14px; left: 14px; width: 30px; height: 30px; border-radius: 50%; border: 0; background: rgba(255,255,255,0.08); color: #F1F5F9; font-size: 0.95rem; cursor: pointer; }
            .pk-intro { color: #94A3B8; font-size: 0.9rem; line-height: 1.55; margin: 0 0 14px; }
            .pk-photo-row { display: flex; align-items: center; gap: 14px; margin: 6px 0 16px; padding: 12px; border: 1px solid #334155; border-radius: 14px; background: rgba(255,255,255,0.03); }
            .pk-av, .pk-av-lg { flex: none; display: grid; place-items: center; border-radius: 50%; overflow: hidden; background: #0F172A; border: 2px solid #334155; color: #94A3B8; font-weight: 900; }
            .pk-av { width: 40px; height: 40px; font-size: 1rem; }
            .pk-av-lg { width: 72px; height: 72px; font-size: 1.6rem; }
            .pk-av img, .pk-av-lg img { width: 100%; height: 100%; object-fit: cover; display: block; }
            .pk-photo-tx { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
            .pk-photo-tx b { font-size: 0.95rem; }
            .pk-photo-tx small { color: #94A3B8; font-size: 0.82rem; line-height: 1.45; }
            .pk-photo-acts { display: flex; align-items: center; gap: 12px; margin-top: 6px; flex-wrap: wrap; }
            .pk-btn-sm { display: inline-flex; align-items: center; gap: 4px; border: 1px solid rgba(16,185,129,0.45); color: #6EE7B7; background: rgba(16,185,129,0.1); border-radius: 9px; padding: 5px 11px; font: 800 0.82rem 'Heebo', sans-serif; cursor: pointer; }
            .pk-btn-sm:focus-within { outline: 2px solid #10B981; outline-offset: 2px; }
            .pk-link { background: none; border: 0; padding: 0; color: #94A3B8; font: 700 0.82rem 'Heebo', sans-serif; text-decoration: underline; cursor: pointer; }
            .pk-field { display: flex; flex-direction: column; gap: 5px; margin-bottom: 14px; font-size: 0.85rem; font-weight: 800; color: #CBD5E1; }
            .pk-field input { width: 100%; box-sizing: border-box; padding: 11px 12px; border-radius: 10px; border: 1px solid #334155; background: #0F172A; color: #F1F5F9; font: 700 1rem 'Heebo', sans-serif; color-scheme: dark; }
            .pk-field input:focus { outline: none; border-color: #10B981; }
            .pk-field small { color: #94A3B8; font-weight: 500; font-size: 0.8rem; }
            .pk-consent { display: flex; align-items: flex-start; gap: 8px; margin: -4px 0 14px; padding: 10px 12px; border-radius: 10px; background: rgba(251,191,36,0.08); border: 1px solid rgba(251,191,36,0.35); color: #FDE68A; font-size: 0.86rem; font-weight: 700; line-height: 1.45; cursor: pointer; }
            .pk-consent[hidden] { display: none; }
            .pk-consent input { margin-top: 3px; width: 17px; height: 17px; accent-color: #F59E0B; flex: none; }
            .pk-err { margin: 0 0 12px; padding: 9px 12px; border-radius: 10px; background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.4); color: #FCA5A5; font-size: 0.86rem; font-weight: 700; }
            .pk-err[hidden] { display: none; }
            .pk-acts { display: flex; gap: 10px; }
            .pk-save, .pk-cancel { flex: 1; border-radius: 12px; padding: 12px; font: 900 1rem 'Heebo', sans-serif; cursor: pointer; }
            .pk-save { background: #10B981; color: #04241A; border: 0; }
            .pk-save:disabled { opacity: 0.6; cursor: default; }
            .pk-cancel { background: transparent; color: #CBD5E1; border: 1px solid #334155; flex: 0 0 auto; padding-inline: 18px; }
            .pk-note { color: #94A3B8; font-size: 0.78rem; line-height: 1.5; margin: 14px 0 0; }
            .pk-note a { color: #6EE7B7; }
            @media (max-width: 560px) {
                .pk-overlay { align-items: flex-end; padding: 0; }
                .pk-card { border-radius: 18px 18px 0 0; max-height: 92vh; padding: 20px 16px calc(20px + env(safe-area-inset-bottom)); }
            }`;
        document.head.appendChild(st);
    }

    // opts: { db, user, profile } — profile קיים לעריכה, או null ליצירה. מחזיר את הפרופיל השמור, או null אם בוטל
    function openEditor(opts) {
        injectCSS();
        const { db, user } = opts;
        const existing = opts.profile || null;
        const prevFocus = document.activeElement;
        return new Promise(resolve => {
            let photo = existing && photoOk(existing.photo) ? existing.photo : '';
            let busy = false;
            const ov = document.createElement('div');
            ov.className = 'pk-overlay';
            ov.innerHTML = `<div class="pk-card" role="dialog" aria-modal="true" aria-labelledby="pkTitle">
                <button type="button" class="pk-x" data-act="close" aria-label="סגירה">✕</button>
                <h2 id="pkTitle">${existing ? 'עריכת פרופיל שחקן' : 'פרופיל שחקן'}</h2>
                ${existing ? '' : '<p class="pk-intro">לא חובה. עם פרופיל נרשמים למשחקים בלחיצה אחת, והחברים מזהים אותך בהרכב.</p>'}
                <div class="pk-photo-row">
                    <span data-slot="avatar"></span>
                    <div class="pk-photo-tx">
                        <b>תמונת פנים</b>
                        <small>כדי שהחברים יזהו אותך בהרכב ובחלוקה.</small>
                        <div class="pk-photo-acts">
                            <label class="pk-btn-sm">📷 <span data-slot="photoBtn"></span><input type="file" accept="image/*" data-slot="file" style="position:absolute; width:1px; height:1px; opacity:0;"></label>
                            <button type="button" class="pk-link" data-act="photoDel">הסרת התמונה</button>
                        </div>
                    </div>
                </div>
                <label class="pk-field"><span>שם *</span><input data-slot="name" maxlength="${NAME_MAX}" autocomplete="name" placeholder="השם שלך, כמו שהחברים מכירים"></label>
                <label class="pk-field"><span>תאריך לידה</span><input data-slot="birth" type="date" min="1930-01-01" max="${todayStr()}"><small>יש קבוצות שנותנות עדיפות בהרשמה לפי גיל.</small></label>
                <label class="pk-consent" data-slot="consentRow" hidden><input type="checkbox" data-slot="consent"><span>אני מתחת לגיל 18, והורה שלי אישר לי ליצור פרופיל.</span></label>
                <p class="pk-err" data-slot="err" role="alert" hidden></p>
                <div class="pk-acts">
                    <button type="button" class="pk-save" data-act="save">${existing ? 'שמירה' : 'יצירת הפרופיל'}</button>
                    <button type="button" class="pk-cancel" data-act="close">ביטול</button>
                </div>
                <p class="pk-note">רק אתה רואה את הפרופיל. כשתבקש להתחבר לכרטיס שלך בקבוצה, מנהלי הקבוצה יראו את השם ואת תאריך הלידה, ואת התמונה אם תבחר. <a href="privacy.html#players" target="_blank" rel="noopener">מדיניות הפרטיות</a></p>
            </div>`;
            const $ = s => ov.querySelector(`[data-slot="${s}"]`);
            const nameEl = $('name'), birthEl = $('birth'), consentRow = $('consentRow'), consentEl = $('consent'), errEl = $('err');
            nameEl.value = cleanName(existing ? existing.name : (user && user.displayName));
            birthEl.value = existing && validBirthDate(existing.birthDate) ? existing.birthDate : '';
            consentEl.checked = !!(existing && existing.parentConsent);

            const paintPhoto = () => {
                $('avatar').innerHTML = avatarHTML({ photo, name: nameEl.value }, 'pk-av-lg');
                $('photoBtn').textContent = photo ? 'החלפת תמונה' : 'בחירת תמונה';
                ov.querySelector('[data-act="photoDel"]').hidden = !photo;
            };
            const paintConsent = () => { consentRow.hidden = !isMinor(birthEl.value); };
            const showErr = msg => { errEl.textContent = msg; errEl.hidden = !msg; };
            paintPhoto();
            paintConsent();

            const close = result => {
                document.removeEventListener('keydown', onKey, true);
                ov.remove();
                if (prevFocus && typeof prevFocus.focus === 'function') { try { prevFocus.focus({ preventScroll: true }); } catch (e) { /* לא קריטי */ } }
                resolve(result);
            };
            const onKey = e => { if (e.key === 'Escape' && !busy) { e.stopPropagation(); close(null); } };
            document.addEventListener('keydown', onKey, true);

            nameEl.addEventListener('input', () => { if (!photo) paintPhoto(); });
            birthEl.addEventListener('input', paintConsent);
            birthEl.addEventListener('change', paintConsent);
            $('file').addEventListener('change', async e => {
                const file = e.target.files && e.target.files[0];
                e.target.value = '';
                if (!file) return;
                showErr('');
                try { photo = await GroupPrefs.resizeIcon(file); paintPhoto(); }
                catch (err) { showErr('לא הצלחנו לקרוא את התמונה. נסו תמונה אחרת (JPG או PNG).'); }
            });
            ov.addEventListener('click', async e => {
                if (e.target === ov) { if (!busy) close(null); return; }
                const act = e.target.closest('[data-act]');
                if (!act || busy) return;
                if (act.dataset.act === 'close') return close(null);
                if (act.dataset.act === 'photoDel') { photo = ''; paintPhoto(); return; }
                if (act.dataset.act !== 'save') return;
                const name = cleanName(nameEl.value);
                const bd = birthEl.value;
                if (!name) { showErr('מה השם שלך?'); nameEl.focus(); return; }
                if (bd && !validBirthDate(bd)) { showErr('תאריך הלידה לא תקין.'); birthEl.focus(); return; }
                if (bd && isMinor(bd) && !consentEl.checked) { showErr('כדי ליצור פרופיל מתחת לגיל 18 צריך אישור של הורה.'); consentEl.focus(); return; }
                busy = true;
                act.disabled = true;
                act.textContent = 'שומר… ⏳';
                showErr('');
                try {
                    const saved = await save(db, user.uid, { name, birthDate: bd, photo, parentConsent: consentEl.checked }, existing);
                    close(saved);
                } catch (err) {
                    console.error('profile save', err);
                    busy = false;
                    act.disabled = false;
                    act.textContent = existing ? 'שמירה' : 'יצירת הפרופיל';
                    showErr(err && err.code === 'permission-denied'
                        ? 'הפרופיל לא נשמר: חוקי האבטחה ב-Firebase עוד לא עודכנו.'
                        : 'הפרופיל לא נשמר. בדקו את החיבור לאינטרנט ונסו שוב.');
                }
            });
            document.body.appendChild(ov);
            nameEl.focus({ preventScroll: true });
        });
    }

    window.ProfileKit = {
        NAME_MAX, cleanName, photoOk, validBirthDate, age, isMinor, avatarHTML, injectCSS,
        load, save, setGroup, dropGroup, getLink, requestLink, cancelLink, unlinkSelf, removeAll, groupState, openEditor
    };
})();
