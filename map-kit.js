// map-kit.js — מפה (Leaflet + OpenStreetMap) ל"מצא קבוצה" בדף הבית ולסימון המגרש בהגדרות הקבוצה.
// Leaflet נטען רק כשפותחים מפה, כדי לא להאט את הטעינה הרגילה של הדפים.
(function () {
    'use strict';

    const BASE = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/';
    // טביעות האצבע של הקבצים, כדי שהדפדפן ירוץ רק את הגרסה המקורית
    const SRI = {
        js: 'sha512-BwHfrr4c9kmRkLw6iXFdzcdWV/PGkVgiIyIWLLlTSXzWQzxuSg4DiQUCpauz/EWjgk5TYQqX/kvn9pG1NpYfqg==',
        css: 'sha512-Zcn6bjR/8RZbLEpLIeOwNtzREBAJnUKESxces60Mpoj+2okopSAcSUIUOseddDm0cxnGQzxIR7vJgsLZbdLE3w=='
    };
    const ISRAEL = [[29.45, 34.25], [33.35, 35.9]];
    let loading = null;

    function addStyle() {
        if (document.getElementById('mapKitStyle')) return;
        const st = document.createElement('style');
        st.id = 'mapKitStyle';
        st.textContent = `
            .mk-map { direction: ltr; background: #0B1220; isolation: isolate; z-index: 0; }   /* השכבות של Leaflet נשארות מתחת לסרגלים של הדף */
            .mk-map .leaflet-tile-pane { filter: brightness(0.86) saturate(0.85); }
            .mk-map .leaflet-control-attribution { font: 11px/1.4 'Heebo', sans-serif; direction: ltr; }
            .mk-pin { position: relative; width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center;
                background: #1E293B; border: 3px solid var(--mk-c, #FBBF24); box-shadow: 0 3px 10px rgba(0,0,0,0.45); font-size: 17px; line-height: 1; overflow: hidden; }
            .mk-pin img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
            .mk-pin.sel { transform: scale(1.18); box-shadow: 0 0 0 4px rgba(255,255,255,0.35), 0 3px 12px rgba(0,0,0,0.5); }
            .mk-pin.approx { border-style: dashed; }
            .mk-me { width: 16px; height: 16px; border-radius: 50%; background: #3B82F6; border: 3px solid #fff; box-shadow: 0 0 0 6px rgba(59,130,246,0.25); }
            .mk-drop { width: 30px; height: 30px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); background: #EF4444; border: 3px solid #fff; box-shadow: 0 3px 10px rgba(0,0,0,0.4); }
            .leaflet-div-icon.mk-icon { background: none; border: 0; }
            .map-msg { height: 100%; display: grid; place-items: center; text-align: center; color: #94A3B8; padding: 20px; direction: rtl; font-family: 'Heebo', sans-serif; }`;
        document.head.appendChild(st);
    }

    function load() {
        addStyle();
        if (window.L && window.L.map) return Promise.resolve(window.L);
        if (loading) return loading;
        loading = new Promise((resolve, reject) => {
            if (!document.querySelector('link[data-leaflet]')) {
                const css = document.createElement('link');
                css.rel = 'stylesheet';
                css.href = BASE + 'leaflet.css';
                css.integrity = SRI.css;
                css.crossOrigin = 'anonymous';
                css.dataset.leaflet = '1';
                document.head.appendChild(css);
            }
            const s = document.createElement('script');
            s.src = BASE + 'leaflet.js';
            s.integrity = SRI.js;
            s.crossOrigin = 'anonymous';
            s.async = true;
            s.onload = () => (window.L && window.L.map ? resolve(window.L) : reject(new Error('leaflet')));
            s.onerror = () => { loading = null; s.remove(); reject(new Error('leaflet-load')); };
            document.head.appendChild(s);
        });
        return loading;
    }

    // מפה חדשה במסגרת el, מכוונת לישראל
    function create(el) {
        const L = window.L;
        el.classList.add('mk-map');
        el.setAttribute('dir', 'ltr');
        const map = L.map(el, { zoomControl: true, attributionControl: true, scrollWheelZoom: true });
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
        }).addTo(map);
        map.attributionControl.setPrefix(false);
        map.fitBounds(ISRAEL);
        return map;
    }

    // נעץ עגול בצבע מצב הקבוצה, עם סמל הקבוצה בפנים (html מוכן, כבר עבר escape)
    function pinIcon(color, innerHTML, opts) {
        const o = opts || {};
        return window.L.divIcon({
            className: 'mk-icon',
            html: `<span class="mk-pin${o.selected ? ' sel' : ''}${o.approx ? ' approx' : ''}" style="--mk-c:${color}">${innerHTML || ''}</span>`,
            iconSize: [36, 36], iconAnchor: [18, 18]
        });
    }
    function meIcon() { return window.L.divIcon({ className: 'mk-icon', html: '<span class="mk-me"></span>', iconSize: [16, 16], iconAnchor: [8, 8] }); }
    function dropIcon() { return window.L.divIcon({ className: 'mk-icon', html: '<span class="mk-drop"></span>', iconSize: [30, 30], iconAnchor: [15, 30] }); }

    // המיקום של המכשיר (רק בהסכמת המשתמש, ולא נשמר בשום מקום)
    function locate() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) return reject(new Error('unsupported'));
            navigator.geolocation.getCurrentPosition(
                p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
                e => reject(e),
                { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
        });
    }
    function locateError(e) {
        if (e && e.code === 1) return 'אין הרשאה למיקום. אפשר לאשר אותה בהגדרות הדפדפן.';
        if (e && e.message === 'unsupported') return 'הדפדפן הזה לא תומך באיתור מיקום.';
        return 'לא הצלחנו למצוא את המיקום. נסו שוב בעוד רגע.';
    }

    window.MapKit = { load, create, pinIcon, meIcon, dropIcon, locate, locateError, ISRAEL };
})();
