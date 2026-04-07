import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const DATA_DIR = path.join(ROOT, "data");
const STORE_FILE = path.join(DATA_DIR, "store.json");
const STORE_KEY = "ilamath:store:v1";
const LOCK_KEY = "ilamath:store:v1:lock";

const SESSION_COOKIE = "ilamath_session";
const VIEWER_COOKIE = "ilamath_viewer";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
const VIEWER_MAX_AGE = 60 * 60 * 24 * 365;
const VIEW_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const REDIS_LOCK_TTL_MS = 10_000;
const REDIS_LOCK_WAIT_MS = 8_000;
const REDIS_LOCK_RETRY_MS = 160;

let fileStoreQueue = Promise.resolve();

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function slugify(value) {
    return String(value || "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 25);
}

function mergeDeep(base, patch) {
    const output = Array.isArray(base) ? [...base] : { ...base };

    Object.entries(patch || {}).forEach(([key, value]) => {
        if (
            value &&
            typeof value === "object" &&
            !Array.isArray(value) &&
            base &&
            typeof base[key] === "object" &&
            !Array.isArray(base[key])
        ) {
            output[key] = mergeDeep(base[key], value);
            return;
        }

        output[key] = value;
    });

    return output;
}

function safeJsonParse(raw, fallback) {
    try {
        return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
        return fallback;
    }
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
    const hash = crypto.scryptSync(password, salt, 64).toString("hex");
    return { salt, hash };
}

function verifyPassword(password, account) {
    if (!account?.passwordSalt || !account?.passwordHash) {
        return false;
    }

    const expected = Buffer.from(account.passwordHash, "hex");
    const actual = crypto.scryptSync(password, account.passwordSalt, 64);

    if (expected.length !== actual.length) {
        return false;
    }

    return crypto.timingSafeEqual(expected, actual);
}

function createPublicAccount(account) {
    if (!account) {
        return null;
    }

    return {
        username: account.username,
        displayName: account.displayName,
        uid: account.uid,
        createdAt: account.createdAt,
    };
}

function createDefaultProfile(account, patch = {}) {
    const base = {
        username: account.username,
        uid: account.uid,
        displayName: account.displayName,
        aliases: [],
        description: "[center]new profile loaded[/center]\n[hr-theme]\nРасскажи о себе, добавь ссылки и собери свою страницу.",
        location: "internet",
        statusLine: "build something sharp",
        avatarUrl: `https://api.dicebear.com/9.x/shapes/svg?seed=${encodeURIComponent(account.username)}`,
        bannerUrl: "",
        backgroundUrl: "",
        website: "",
        discord: "",
        embedTitle: `${account.displayName} / ILAMath`,
        lastSavedAt: new Date().toISOString(),
        createdAt: account.createdAt,
        views: 0,
        weeklyViews: [0, 1, 2, 0, 3, 1, 4],
        links: [],
        tags: ["new"],
        badges: ["local"],
        trackTitle: "",
        trackArtist: "",
        trackUrl: "",
        theme: {
            layout: "default",
            alignment: "left",
            primary: "#ff8f40",
            secondary: "#4de6be",
            text: "#f6f0e8",
            background: "#090c11",
            cardColor: "#11161f",
            cardOpacity: 80,
            radius: 28,
            blur: 18,
            shadowOpacity: 40,
            borderColor: "#ff8f40",
            borderWidth: 1,
            borderStyle: "solid",
            overlay: 48,
            avatarRadius: 24,
            font: "syne",
            pageTitleAnimation: "none",
            pageTitleSpeed: 220,
            revealTextEnabled: true,
            revealText: "click to enter",
            revealBlur: 18,
            usernameSparkles: false,
            cursorTrail: true,
        },
        options: {
            showTheme: true,
            showViews: true,
            viewsPosition: "top-right",
            showUid: true,
            showDiscord: false,
            showJoinDate: true,
            revealScreen: true,
            watermark: true,
            showLocation: true,
        },
    };

    return mergeDeep(base, patch);
}

function normalizeProfile(profile) {
    const baseAccount = {
        username: profile.username,
        uid: profile.uid || "1",
        displayName: profile.displayName || profile.username || "user",
        createdAt: profile.createdAt || new Date().toISOString(),
    };

    return mergeDeep(createDefaultProfile(baseAccount), profile);
}

function createSeedStore() {
    const password = hashPassword("alesha7720");
    const account = {
        username: "ila",
        displayName: "ILA",
        uid: "1",
        createdAt: "2026-04-01T12:20:00.000Z",
        passwordHash: password.hash,
        passwordSalt: password.salt,
    };

    const profile = createDefaultProfile(account, {
        aliases: ["ila-dd", "ila.dev"],
        description: "[center]hi, i build math and game projects[/center]\n[hr-theme]\ncustom pages, ddnet stuff, frontend experiments.",
        location: "ekaterinburg",
        statusLine: "dashboard open / theme live",
        avatarUrl: "https://avatars.githubusercontent.com/u/202826930?v=4",
        website: "https://ilamath.ru/",
        embedTitle: "ILA / public profile",
        views: 0,
        weeklyViews: [0, 0, 0, 0, 0, 0, 0],
        links: [
            { label: "ILAMath", url: "https://ilamath.ru/" },
            { label: "GitHub", url: "https://github.com/ILA-dd" },
        ],
        tags: ["math", "frontend", "ddnet"],
        badges: ["owner", "verified", "custom-theme"],
        trackTitle: "Static Love",
        trackArtist: "Local Storage Club",
        discord: "ILA",
        theme: {
            primary: "#ff8f40",
            secondary: "#2f66ff",
            cardColor: "#0f1118",
            cardOpacity: 86,
            font: "syne",
            overlay: 38,
            revealText: "click to continue",
        },
        options: {
            showDiscord: true,
        },
    });

    return {
        accounts: {
            ila: account,
        },
        profiles: {
            ila: profile,
        },
        sessions: {},
        viewTracker: {},
    };
}

function getRedisConfig() {
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";

    if (!url || !token) {
        return null;
    }

    return {
        url: url.replace(/\/+$/g, ""),
        token,
    };
}

function shouldUseRedis() {
    return Boolean(getRedisConfig());
}

async function redisRequest(commandParts) {
    const config = getRedisConfig();
    if (!config) {
        throw new Error(
            "Redis storage is not configured. Connect Upstash Redis in Vercel and set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN."
        );
    }

    const response = await fetch(config.url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${config.token}`,
            "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify(commandParts),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok || payload.error) {
        throw new Error(payload.error || "Redis request failed.");
    }

    return payload.result;
}

async function redisGet(key) {
    return redisRequest(["GET", key]);
}

async function redisSet(key, value) {
    return redisRequest(["SET", key, value]);
}

async function redisSetIfNotExists(key, value, ttlMs) {
    const result = await redisRequest(["SET", key, value, "NX", "PX", ttlMs]);

    return result === "OK";
}

async function redisDel(key) {
    return redisRequest(["DEL", key]);
}

async function ensureRedisSeed() {
    const current = await redisGet(STORE_KEY);
    if (current) {
        return;
    }

    await redisSet(STORE_KEY, JSON.stringify(createSeedStore()));
}

async function acquireRedisLock() {
    const token = crypto.randomBytes(16).toString("hex");
    const deadline = Date.now() + REDIS_LOCK_WAIT_MS;

    while (Date.now() < deadline) {
        const locked = await redisSetIfNotExists(LOCK_KEY, token, REDIS_LOCK_TTL_MS);
        if (locked) {
            return token;
        }

        await sleep(REDIS_LOCK_RETRY_MS);
    }

    throw new Error("Storage is busy. Try again in a moment.");
}

async function releaseRedisLock(token) {
    try {
        const current = await redisGet(LOCK_KEY);
        if (current === token) {
            await redisDel(LOCK_KEY);
        }
    } catch (error) {
        return;
    }
}

async function ensureStoreFile() {
    await fs.mkdir(DATA_DIR, { recursive: true });

    try {
        await fs.access(STORE_FILE);
    } catch (error) {
        await fs.writeFile(STORE_FILE, JSON.stringify(createSeedStore(), null, 2));
    }
}

async function readFileStore() {
    await ensureStoreFile();
    const raw = await fs.readFile(STORE_FILE, "utf8");
    const parsed = safeJsonParse(raw, createSeedStore());

    return {
        accounts: parsed.accounts || {},
        profiles: parsed.profiles || {},
        sessions: parsed.sessions || {},
        viewTracker: parsed.viewTracker || {},
    };
}

async function writeFileStore(store) {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tempFile = `${STORE_FILE}.tmp`;
    await fs.writeFile(tempFile, JSON.stringify(store, null, 2));
    await fs.rename(tempFile, STORE_FILE);
}

async function withFileStore(callback) {
    const previous = fileStoreQueue;
    let release = null;
    fileStoreQueue = new Promise((resolve) => {
        release = resolve;
    });

    await previous;

    try {
        const store = await readFileStore();
        const payload = await callback(store);
        const changed = Boolean(payload && typeof payload === "object" && payload.changed);
        const result = payload && typeof payload === "object" && "result" in payload
            ? payload.result
            : payload;

        if (changed) {
            await writeFileStore(store);
        }

        return result;
    } finally {
        release();
    }
}

async function withRedisStore(callback) {
    if (!shouldUseRedis()) {
        throw new Error(
            "Redis storage is not configured. Connect Upstash Redis in Vercel and set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN."
        );
    }

    await ensureRedisSeed();
    const lockToken = await acquireRedisLock();

    try {
        const raw = await redisGet(STORE_KEY);
        const parsed = safeJsonParse(raw, createSeedStore());
        const store = {
            accounts: parsed.accounts || {},
            profiles: parsed.profiles || {},
            sessions: parsed.sessions || {},
            viewTracker: parsed.viewTracker || {},
        };

        const payload = await callback(store);
        const changed = Boolean(payload && typeof payload === "object" && payload.changed);
        const result = payload && typeof payload === "object" && "result" in payload
            ? payload.result
            : payload;

        if (changed) {
            await redisSet(STORE_KEY, JSON.stringify(store));
        }

        return result;
    } finally {
        await releaseRedisLock(lockToken);
    }
}

async function useStore(callback) {
    if (shouldUseRedis()) {
        return withRedisStore(callback);
    }

    if (process.env.VERCEL) {
        throw new Error(
            "This deployment is running on Vercel without persistent storage. Connect Upstash Redis in the Vercel Marketplace before going live."
        );
    }

    return withFileStore(callback);
}

function getNextSequentialUid(store) {
    const accounts = Object.values(store.accounts || {});

    if (!accounts.length) {
        return "1";
    }

    const maxUid = accounts.reduce((max, account) => {
        const uid = Number(account.uid) || 0;
        return Math.max(max, uid);
    }, 0);

    return String(maxUid + 1);
}

function parseCookies(request) {
    const raw = request.headers.get("cookie") || "";
    const cookies = {};

    raw.split(";").forEach((entry) => {
        const [name, ...rest] = entry.trim().split("=");
        if (!name) {
            return;
        }

        cookies[name] = decodeURIComponent(rest.join("=") || "");
    });

    return cookies;
}

function serializeCookie(name, value, options = {}) {
    const parts = [`${name}=${encodeURIComponent(value)}`];

    if (options.path) {
        parts.push(`Path=${options.path}`);
    }

    if (options.httpOnly) {
        parts.push("HttpOnly");
    }

    if (options.sameSite) {
        parts.push(`SameSite=${options.sameSite}`);
    }

    if (typeof options.maxAge === "number") {
        parts.push(`Max-Age=${options.maxAge}`);
    }

    if (options.secure) {
        parts.push("Secure");
    }

    return parts.join("; ");
}

function pushCookie(cookies, value) {
    cookies.push(value);
}

function setSessionCookie(cookies, token) {
    pushCookie(
        cookies,
        serializeCookie(SESSION_COOKIE, token, {
            path: "/",
            httpOnly: true,
            sameSite: "Lax",
            maxAge: SESSION_MAX_AGE,
            secure: process.env.NODE_ENV === "production",
        })
    );
}

function clearSessionCookie(cookies) {
    pushCookie(
        cookies,
        serializeCookie(SESSION_COOKIE, "", {
            path: "/",
            httpOnly: true,
            sameSite: "Lax",
            maxAge: 0,
            secure: process.env.NODE_ENV === "production",
        })
    );
}

function ensureViewerCookie(request, cookies) {
    const existing = parseCookies(request)[VIEWER_COOKIE];

    if (existing) {
        return existing;
    }

    const next = crypto.randomBytes(18).toString("hex");
    pushCookie(
        cookies,
        serializeCookie(VIEWER_COOKIE, next, {
            path: "/",
            sameSite: "Lax",
            maxAge: VIEWER_MAX_AGE,
            secure: process.env.NODE_ENV === "production",
        })
    );

    return next;
}

function json(payload, options = {}) {
    const headers = new Headers({
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        ...(options.headers || {}),
    });

    (options.cookies || []).forEach((cookie) => {
        headers.append("Set-Cookie", cookie);
    });

    return new Response(JSON.stringify(payload), {
        status: options.status || 200,
        headers,
    });
}

function cleanupExpiredSessions(store) {
    const now = Date.now();

    Object.entries(store.sessions || {}).forEach(([token, session]) => {
        const createdAt = new Date(session.createdAt || 0).getTime();
        if (!createdAt || now - createdAt > SESSION_MAX_AGE * 1000) {
            delete store.sessions[token];
        }
    });
}

function findSessionAccount(request, store) {
    cleanupExpiredSessions(store);
    const token = parseCookies(request)[SESSION_COOKIE];

    if (!token) {
        return null;
    }

    const session = store.sessions[token];
    if (!session) {
        return null;
    }

    return store.accounts[session.username] || null;
}

function issueSession(store, cookies, username) {
    const token = crypto.randomBytes(24).toString("hex");
    store.sessions[token] = {
        username,
        createdAt: new Date().toISOString(),
    };
    setSessionCookie(cookies, token);
}

function clearSession(store, request, cookies) {
    const token = parseCookies(request)[SESSION_COOKIE];
    if (token && store.sessions[token]) {
        delete store.sessions[token];
    }

    clearSessionCookie(cookies);
}

function serializeCommunityProfiles(store, limit = 6) {
    return Object.values(store.profiles || {})
        .map((profile) => normalizeProfile(profile))
        .sort((left, right) => {
            const leftTime = new Date(left.createdAt || 0).getTime();
            const rightTime = new Date(right.createdAt || 0).getTime();

            if (leftTime !== rightTime) {
                return rightTime - leftTime;
            }

            return Number(right.uid || 0) - Number(left.uid || 0);
        })
        .slice(0, limit);
}

function validateAuthPayload(body) {
    const username = slugify(body?.username);
    const displayName = String(body?.displayName || "").trim() || username;
    const password = String(body?.password || "");

    if (!username) {
        return { error: "Username обязателен." };
    }

    if (password.length < 6) {
        return { error: "Пароль должен быть минимум из 6 символов." };
    }

    return { username, displayName, password };
}

function normalizeProfilePayload(input, existingProfile, account) {
    const draft = normalizeProfile({
        ...(existingProfile || {}),
        ...(input || {}),
        username: slugify(input?.username || account.username) || account.username,
        uid: account.uid,
        createdAt: account.createdAt,
        displayName: String(input?.displayName || existingProfile?.displayName || account.displayName || account.username).trim() || account.username,
        lastSavedAt: new Date().toISOString(),
    });

    draft.views = existingProfile?.views || 0;
    draft.weeklyViews = Array.isArray(existingProfile?.weeklyViews)
        ? existingProfile.weeklyViews.slice(0, 7)
        : [0, 0, 0, 0, 0, 0, 0];

    draft.uid = account.uid;
    draft.createdAt = account.createdAt;
    draft.aliases = Array.isArray(draft.aliases) ? draft.aliases.slice(0, 20) : [];
    draft.tags = Array.isArray(draft.tags) ? draft.tags.slice(0, 20) : [];
    draft.badges = Array.isArray(draft.badges) ? draft.badges.slice(0, 20) : [];
    draft.links = Array.isArray(draft.links) ? draft.links.slice(0, 20) : [];

    return draft;
}

async function parseJsonBody(request) {
    try {
        return await request.json();
    } catch (error) {
        return {};
    }
}

function getUsernameFromRequest(request) {
    const url = new URL(request.url);
    return slugify(url.searchParams.get("username") || "");
}

function handleUnexpectedError(error) {
    return json(
        {
            error: "Server error.",
            details: process.env.NODE_ENV === "development" ? error.message : undefined,
        },
        { status: 500 }
    );
}

export async function handleBootstrap(request) {
    if (request.method !== "GET") {
        return json({ error: "Method not allowed." }, { status: 405 });
    }

    try {
        const payload = await useStore((store) => {
            const account = findSessionAccount(request, store);

            return {
                result: {
                    session: createPublicAccount(account),
                    profilesCount: Object.keys(store.profiles || {}).length,
                    latestProfiles: serializeCommunityProfiles(store),
                },
            };
        });

        return json(payload);
    } catch (error) {
        return handleUnexpectedError(error);
    }
}

export async function handleRegister(request) {
    if (request.method !== "POST") {
        return json({ error: "Method not allowed." }, { status: 405 });
    }

    try {
        const body = await parseJsonBody(request);
        const validated = validateAuthPayload(body);

        if (validated.error) {
            return json({ error: validated.error }, { status: 400 });
        }

        const cookies = [];
        const payload = await useStore((store) => {
            if (store.accounts[validated.username]) {
                return { result: { error: "Такой username уже занят." } };
            }

            const password = hashPassword(validated.password);
            const account = {
                username: validated.username,
                displayName: validated.displayName,
                uid: getNextSequentialUid(store),
                createdAt: new Date().toISOString(),
                passwordHash: password.hash,
                passwordSalt: password.salt,
            };

            store.accounts[validated.username] = account;
            store.profiles[validated.username] = createDefaultProfile(account, {
                displayName: validated.displayName,
                tags: ["fresh"],
                badges: ["new"],
            });
            issueSession(store, cookies, validated.username);

            return {
                changed: true,
                result: {
                    account: createPublicAccount(account),
                    profilesCount: Object.keys(store.profiles || {}).length,
                    latestProfiles: serializeCommunityProfiles(store),
                },
            };
        });

        if (payload.error) {
            return json(payload, { status: 409 });
        }

        return json(payload, { status: 201, cookies });
    } catch (error) {
        return handleUnexpectedError(error);
    }
}

export async function handleLogin(request) {
    if (request.method !== "POST") {
        return json({ error: "Method not allowed." }, { status: 405 });
    }

    try {
        const body = await parseJsonBody(request);
        const username = slugify(body?.username);
        const password = String(body?.password || "");
        const cookies = [];

        const payload = await useStore((store) => {
            const account = store.accounts[username];

            if (!account || !verifyPassword(password, account)) {
                return { result: { error: "Неверный username или пароль." } };
            }

            issueSession(store, cookies, username);

            return {
                changed: true,
                result: {
                    account: createPublicAccount(account),
                    profilesCount: Object.keys(store.profiles || {}).length,
                    latestProfiles: serializeCommunityProfiles(store),
                },
            };
        });

        if (payload.error) {
            return json(payload, { status: 401 });
        }

        return json(payload, { cookies });
    } catch (error) {
        return handleUnexpectedError(error);
    }
}

export async function handleLogout(request) {
    if (request.method !== "POST") {
        return json({ error: "Method not allowed." }, { status: 405 });
    }

    try {
        const cookies = [];
        await useStore((store) => {
            clearSession(store, request, cookies);
            return { changed: true, result: { ok: true } };
        });

        return json({ ok: true }, { cookies });
    } catch (error) {
        return handleUnexpectedError(error);
    }
}

export async function handleMeProfile(request) {
    if (request.method === "GET") {
        try {
            const payload = await useStore((store) => {
                const account = findSessionAccount(request, store);

                if (!account) {
                    return { result: { error: "Сначала войди в аккаунт." } };
                }

                return {
                    result: {
                        account: createPublicAccount(account),
                        profile: normalizeProfile(store.profiles[account.username] || createDefaultProfile(account)),
                    },
                };
            });

            if (payload.error) {
                return json(payload, { status: 401 });
            }

            return json(payload);
        } catch (error) {
            return handleUnexpectedError(error);
        }
    }

    if (request.method === "PUT") {
        try {
            const body = await parseJsonBody(request);
            const payload = await useStore((store) => {
                const account = findSessionAccount(request, store);
                if (!account) {
                    return { result: { error: "Сначала войди в аккаунт." } };
                }

                const incoming = body?.profile || body || {};
                const nextUsername = slugify(incoming.username || account.username);
                if (!nextUsername) {
                    return { result: { error: "Username не может быть пустым." } };
                }

                if (nextUsername !== account.username && store.accounts[nextUsername]) {
                    return { result: { error: "Такой username уже занят." } };
                }

                const existingProfile = normalizeProfile(store.profiles[account.username] || createDefaultProfile(account));
                const nextProfile = normalizeProfilePayload(incoming, existingProfile, account);
                const previousUsername = account.username;

                if (nextUsername !== previousUsername) {
                    const nextAccount = {
                        ...account,
                        username: nextUsername,
                        displayName: nextProfile.displayName,
                    };

                    store.accounts[nextUsername] = nextAccount;
                    delete store.accounts[previousUsername];

                    store.profiles[nextUsername] = {
                        ...nextProfile,
                        username: nextUsername,
                    };
                    delete store.profiles[previousUsername];

                    Object.values(store.sessions || {}).forEach((session) => {
                        if (session.username === previousUsername) {
                            session.username = nextUsername;
                        }
                    });

                    return {
                        changed: true,
                        result: {
                            account: createPublicAccount(nextAccount),
                            profile: normalizeProfile(store.profiles[nextUsername]),
                        },
                    };
                }

                store.accounts[previousUsername] = {
                    ...account,
                    displayName: nextProfile.displayName,
                };
                store.profiles[previousUsername] = nextProfile;

                return {
                    changed: true,
                    result: {
                        account: createPublicAccount(store.accounts[previousUsername]),
                        profile: normalizeProfile(store.profiles[previousUsername]),
                    },
                };
            });

            if (payload.error) {
                const status = payload.error.includes("занят") ? 409 : 400;
                return json(payload, { status });
            }

            return json(payload);
        } catch (error) {
            return handleUnexpectedError(error);
        }
    }

    return json({ error: "Method not allowed." }, { status: 405 });
}

export async function handleMeProfileReset(request) {
    if (request.method !== "POST") {
        return json({ error: "Method not allowed." }, { status: 405 });
    }

    try {
        const payload = await useStore((store) => {
            const account = findSessionAccount(request, store);
            if (!account) {
                return { result: { error: "Сначала войди в аккаунт." } };
            }

            const existing = normalizeProfile(store.profiles[account.username] || createDefaultProfile(account));
            const fallback = createDefaultProfile(account, {
                avatarUrl: existing.avatarUrl,
                displayName: account.displayName,
            });

            store.profiles[account.username] = fallback;

            return {
                changed: true,
                result: {
                    account: createPublicAccount(account),
                    profile: normalizeProfile(fallback),
                },
            };
        });

        if (payload.error) {
            return json(payload, { status: 401 });
        }

        return json(payload);
    } catch (error) {
        return handleUnexpectedError(error);
    }
}

export async function handlePublicProfile(request) {
    if (request.method !== "GET") {
        return json({ error: "Method not allowed." }, { status: 405 });
    }

    const username = getUsernameFromRequest(request);
    if (!username) {
        return json({ error: "Username обязателен." }, { status: 400 });
    }

    try {
        const payload = await useStore((store) => {
            const profile = store.profiles[username];
            if (!profile) {
                return { result: { error: "Профиль не найден." } };
            }

            return { result: { profile: normalizeProfile(profile) } };
        });

        if (payload.error) {
            return json(payload, { status: 404 });
        }

        return json(payload);
    } catch (error) {
        return handleUnexpectedError(error);
    }
}

export async function handlePublicProfileView(request) {
    if (request.method !== "POST") {
        return json({ error: "Method not allowed." }, { status: 405 });
    }

    const username = getUsernameFromRequest(request);
    if (!username) {
        return json({ error: "Username обязателен." }, { status: 400 });
    }

    try {
        const cookies = [];
        const payload = await useStore((store) => {
            const profile = store.profiles[username];
            if (!profile) {
                return { result: { error: "Профиль не найден." } };
            }

            const normalized = normalizeProfile(profile);
            const sessionAccount = findSessionAccount(request, store);

            if (sessionAccount?.username === username) {
                return { result: { profile: normalized } };
            }

            const viewerId = sessionAccount?.username || ensureViewerCookie(request, cookies);
            const trackerKey = `${username}:${viewerId}`;
            const lastViewAt = Number(store.viewTracker[trackerKey] || 0);
            const now = Date.now();

            if (lastViewAt && now - lastViewAt < VIEW_COOLDOWN_MS) {
                return { result: { profile: normalized } };
            }

            store.viewTracker[trackerKey] = now;
            const dayIndex = (new Date(now).getDay() + 6) % 7;
            normalized.views += 1;
            normalized.weeklyViews[dayIndex] = (normalized.weeklyViews[dayIndex] || 0) + 1;
            store.profiles[username] = normalized;

            return {
                changed: true,
                result: {
                    profile: normalizeProfile(normalized),
                },
            };
        });

        if (payload.error) {
            return json(payload, { status: 404 });
        }

        return json(payload, { cookies });
    } catch (error) {
        return handleUnexpectedError(error);
    }
}
