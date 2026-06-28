const { Redis } = require('@upstash/redis');

// ================================================
// DEFAULT DATA
// ================================================
const DEFAULT_DONATORS = [
    { name: 'Akira', amount: 'Rp 5.000.000', initial: 'ph-crown', color: '--yellow', label: 'Top Supporter', photo: '' },
    { name: 'Kuro', amount: 'Rp 3.500.000', initial: 'ph-star', color: '--pink', label: 'Legend', photo: '' },
    { name: 'Noru', amount: 'Rp 2.800.000', initial: 'ph-heart', color: '--orange', label: 'Hero', photo: '' },
];

const DEFAULT_EVENTS = [
    { date: 'Agu 15', name: 'Mabar Valorant Subs', time: '19:00 WIB • Live YouTube' },
    { date: 'Agu 18', name: 'QnA & Just Chatting', time: '20:00 WIB • Live YouTube' },
];

const REDIS_KEY_DONORS = 'yasalink_donators';
const REDIS_KEY_EVENTS = 'yasalink_events';

// ================================================
// REDIS INSTANCE (lazy init)
// ================================================
let redis = null;

function getRedis() {
    if (redis) return redis;
    const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
        console.warn('[YasaLink] No Redis credentials found.');
        return null;
    }
    redis = new Redis({ url, token });
    return redis;
}

async function dbGet(db, key) {
    if (!db) return null;
    try {
        let val = await db.get(key);
        if (typeof val === 'string') { try { val = JSON.parse(val); } catch(e){} }
        return val;
    } catch(e) { console.error('[Redis GET]', e.message); return null; }
}

async function dbSet(db, key, val) {
    if (!db) return false;
    try { await db.set(key, JSON.stringify(val)); return true; }
    catch(e) { console.error('[Redis SET]', e.message); return false; }
}

// ================================================
// HANDLER
// ================================================
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const db = getRedis();

    try {
        // ============ GET ============
        if (req.method === 'GET') {
            let donors = await dbGet(db, REDIS_KEY_DONORS);
            if (!donors || !Array.isArray(donors)) {
                donors = DEFAULT_DONATORS;
                await dbSet(db, REDIS_KEY_DONORS, donors);
            }

            let events = await dbGet(db, REDIS_KEY_EVENTS);
            if (!events || !Array.isArray(events)) {
                events = DEFAULT_EVENTS;
                await dbSet(db, REDIS_KEY_EVENTS, events);
            }

            return res.status(200).json({ success: true, data: donors, events });
        }

        // ============ POST ============
        if (req.method === 'POST') {
            const body = req.body || {};
            const { action, password } = body;
            const adminPass = process.env.ADMIN_PASSWORD || 'yasalink2024';

            // --- Login ---
            if (action === 'login') {
                if (password !== adminPass) return res.status(401).json({ success: false, error: 'Password salah!' });
                let donors = await dbGet(db, REDIS_KEY_DONORS) || DEFAULT_DONATORS;
                let events = await dbGet(db, REDIS_KEY_EVENTS) || DEFAULT_EVENTS;
                if (!Array.isArray(donors)) donors = DEFAULT_DONATORS;
                if (!Array.isArray(events)) events = DEFAULT_EVENTS;
                return res.status(200).json({ success: true, data: donors, events });
            }

            // --- Save Donators ---
            if (action === 'save') {
                if (password !== adminPass) return res.status(401).json({ success: false, error: 'Unauthorized' });
                const { donators } = body;
                if (!Array.isArray(donators)) return res.status(400).json({ success: false, error: 'Invalid data' });
                const clean = donators.map(d => ({
                    name: String(d.name || '').slice(0, 50),
                    amount: String(d.amount || '').slice(0, 30),
                    initial: String(d.initial || d.name?.[0] || '?').slice(0, 10),
                    color: String(d.color || '--yellow').slice(0, 20),
                    label: String(d.label || 'Supporter').slice(0, 30),
                    photo: String(d.photo || '').slice(0, 500),
                }));
                const ok = await dbSet(db, REDIS_KEY_DONORS, clean);
                if (!ok && db) return res.status(500).json({ success: false, error: 'Database write failed' });
                return res.status(200).json({ success: true, data: clean });
            }

            // --- Save Events ---
            if (action === 'save_events') {
                if (password !== adminPass) return res.status(401).json({ success: false, error: 'Unauthorized' });
                const { events } = body;
                if (!Array.isArray(events)) return res.status(400).json({ success: false, error: 'Invalid data' });
                const clean = events.map(e => ({
                    date: String(e.date || '').slice(0, 20),
                    name: String(e.name || '').slice(0, 80),
                    time: String(e.time || '').slice(0, 50),
                }));
                const ok = await dbSet(db, REDIS_KEY_EVENTS, clean);
                if (!ok && db) return res.status(500).json({ success: false, error: 'Database write failed' });
                return res.status(200).json({ success: true, events: clean });
            }

            return res.status(400).json({ success: false, error: 'Invalid action' });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('[API Fatal]', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};
