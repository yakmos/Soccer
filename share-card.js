// share-card.js — תמונה של הקבוצות לשליחה בוואטסאפ: שם הקבוצה, התאריך, השחקנים לפי תפקיד,
// ובתחתית הקישור לאתר (כל מי שרואה את הקבוצות בוואטסאפ רואה גם איפה עושים כזה).
// מצוירת על canvas, בלי צילום מסך של הדף: אותה תמונה בכל טלפון, וקריאה גם בתצוגה המוקטנת של וואטסאפ.
(function () {
    'use strict';

    const W = 1080, PAD = 56;
    const C = {
        bg: '#080B2B', glow: 'rgba(77,124,255,0.20)', card: '#111748', line: '#28306F',
        text: '#F5F7FF', muted: '#A4ACDC', accent: '#8EA8FF', pitch: 'rgba(164,172,220,0.07)'
    };
    // צבע לכל סוג תפקיד, כמו בכרטיסי הקבוצות באתר
    const ROLE_COLORS = { 'שוער': '#A78BFA', 'בלם': '#60A5FA', 'מגן': '#60A5FA', 'קשר': '#C4B5FD', 'חלוץ': '#F87171' };
    const FONT = "'Heebo', 'Arial Hebrew', Arial, sans-serif";
    const font = (weight, size) => `${weight} ${size}px ${FONT}`;

    async function fontsReady() {
        if (!document.fonts || !document.fonts.load) return;
        try {
            await Promise.all(['900 76px', '800 44px', '700 38px', '700 26px', '500 34px'].map(f => document.fonts.load(`${f} Heebo`, 'אבג')));
        } catch (e) { /* בלי הגופן — גופן המערכת */ }
    }

    // הטקסט נכנס לרוחב: קודם מקטינים עד minSize, ואחר כך קוטעים עם "…"
    function fitText(ctx, text, weight, size, minSize, maxW) {
        let s = size;
        ctx.font = font(weight, s);
        while (s > minSize && ctx.measureText(text).width > maxW) { s -= 2; ctx.font = font(weight, s); }
        if (ctx.measureText(text).width <= maxW) return text;
        let t = text;
        while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
        return t + '…';
    }

    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    const HEAD_H = 270, CARD_HEAD = 96, ROW_H = 74, CARD_PAD_B = 26, CARD_GAP = 26, FOOT_H = 210;
    const cardHeight = t => CARD_HEAD + Math.ceil(Math.max(1, t.players.length) / 2) * ROW_H + CARD_PAD_B;

    // data: { group, title, date, teams: [{ name, color, players: [{ name, role }] }], cta, link }
    function draw(canvas, data) {
        const teams = data.teams || [];
        const H = HEAD_H + teams.reduce((s, t) => s + cardHeight(t) + CARD_GAP, 0) + FOOT_H;
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');
        ctx.direction = 'rtl';
        ctx.textBaseline = 'alphabetic';

        // רקע: הכחול של האתר, הילה למעלה, וקווי מגרש עדינים
        ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
        const g = ctx.createRadialGradient(W * 0.85, 0, 0, W * 0.85, 0, W * 0.9);
        g.addColorStop(0, C.glow); g.addColorStop(1, 'rgba(77,124,255,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = C.pitch; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(W / 2, H / 2, 210, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();

        // כותרת
        const R = W - PAD;
        ctx.textAlign = 'right';
        ctx.fillStyle = C.muted;
        ctx.fillText(fitText(ctx, data.group || '', 700, 38, 28, W - 2 * PAD), R, 104);
        ctx.fillStyle = C.text;
        ctx.fillText(fitText(ctx, data.title || '', 900, 76, 56, W - 2 * PAD), R, 188);
        ctx.fillStyle = C.muted;
        ctx.fillText(fitText(ctx, data.date || '', 500, 34, 26, W - 2 * PAD), R, 236);

        // קבוצה = כרטיס: פס בצבע הקבוצה בצד ימין, השם, והשחקנים בשני טורים (מימין לשמאל, לפי סדר התפקידים)
        let y = HEAD_H;
        const cardW = W - 2 * PAD, colGap = 28, inner = 40;
        const colW = (cardW - 2 * inner - colGap) / 2;
        teams.forEach(t => {
            const h = cardHeight(t);
            roundRect(ctx, PAD, y, cardW, h, 30);
            ctx.fillStyle = C.card; ctx.fill();
            ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.stroke();
            ctx.save(); roundRect(ctx, PAD, y, cardW, h, 30); ctx.clip();
            ctx.fillStyle = t.color || C.accent; ctx.fillRect(R - 12, y, 12, h);
            ctx.restore();

            const dotX = R - inner - 14, headY = y + 62;
            ctx.beginPath(); ctx.arc(dotX, headY - 14, 14, 0, Math.PI * 2);
            ctx.fillStyle = t.color || C.accent; ctx.fill();
            ctx.strokeStyle = 'rgba(245,247,255,0.55)'; ctx.lineWidth = 2; ctx.stroke();
            ctx.fillStyle = C.text; ctx.textAlign = 'right';
            ctx.fillText(fitText(ctx, t.name || '', 800, 44, 32, cardW - 2 * inner - 50), dotX - 30, headY);

            ctx.strokeStyle = C.line; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(PAD + inner, y + CARD_HEAD - 8); ctx.lineTo(R - inner, y + CARD_HEAD - 8); ctx.stroke();

            (t.players || []).forEach((p, k) => {
                const col = k % 2, row = Math.floor(k / 2);
                const colRight = R - inner - col * (colW + colGap);
                const baseY = y + CARD_HEAD + row * ROW_H + 50;
                // התפקיד: תווית קטנה בקצה השמאלי של הטור
                const role = p.role || '';
                let roleW = 0;
                if (role) {
                    ctx.font = font(700, 26);
                    roleW = ctx.measureText(role).width + 28;
                    const rx = colRight - colW, ry = baseY - 34;
                    const rc = ROLE_COLORS[role] || C.muted;
                    roundRect(ctx, rx, ry, roleW, 44, 22);
                    ctx.fillStyle = rc + '26'; ctx.fill();
                    ctx.fillStyle = rc; ctx.textAlign = 'center';
                    ctx.fillText(role, rx + roleW / 2, baseY - 2);
                }
                ctx.textAlign = 'right'; ctx.fillStyle = C.text;
                ctx.fillText(fitText(ctx, p.name || '', 700, 38, 28, colW - roleW - 16), colRight, baseY);
            });
            y += h + CARD_GAP;
        });

        // תחתית: למי שרואה את התמונה בוואטסאפ, איפה עושים כזה
        const fy = y + 10;
        ctx.strokeStyle = C.line; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(PAD, fy); ctx.lineTo(R, fy); ctx.stroke();
        ctx.textAlign = 'right'; ctx.fillStyle = C.text;
        ctx.fillText(fitText(ctx, data.cta || '', 700, 36, 26, W - 2 * PAD), R, fy + 72);
        ctx.fillStyle = C.accent;
        ctx.direction = 'ltr'; ctx.textAlign = 'right';
        ctx.fillText(fitText(ctx, data.link || '', 800, 40, 28, W - 2 * PAD - 240), R, fy + 130);
        ctx.fillStyle = C.muted; ctx.textAlign = 'left';
        ctx.fillText(fitText(ctx, 'Soccer Manager', 700, 30, 22, 260), PAD, fy + 130);
        ctx.direction = 'rtl';
        return canvas;
    }

    async function teamsImage(data) {
        await fontsReady();
        const canvas = draw(document.createElement('canvas'), data);
        return new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'));
    }

    // שליחה: בטלפון נפתח חלון השיתוף (וואטסאפ ביניהם). בלי שיתוף קבצים (מחשב) — התמונה יורדת
    async function share(opts) {
        const file = new File([opts.blob], opts.filename || 'teams.png', { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({ files: [file], title: opts.title || '', text: opts.text || '' });
                return 'shared';
            } catch (e) {
                if (e && e.name === 'AbortError') return 'cancelled';
            }
        }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(opts.blob);
        a.download = opts.filename || 'teams.png';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        return 'downloaded';
    }

    window.ShareCard = { teamsImage, share, draw };
})();
