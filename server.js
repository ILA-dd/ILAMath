const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const STORE_FILE = path.join(DATA_DIR, "store.json");
const SESSION_COOKIE = "ilamath_session";
const VIEWER_COOKIE = "ilamath_viewer";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
const VIEWER_MAX_AGE = 60 * 60 * 24 * 365;
const VIEW_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const BODY_LIMIT_BYTES = 15 * 1024 * 1024;

const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
};

const STATIC_ROUTES = {
    "/": "index.html",
    "/index.html": "index.html",
    "/main": "main/index.html",
    "/main/": "main/index.html",
    "/main/index.html": "main/index.html",
    "/settings": "settings/index.html",
    "/settings/": "settings/index.html",
    "/settings/index.html": "settings/index.html",
    "/profile": "profile/index.html",
    "/profile/": "profile/index.html",
    "/profile/index.html": "profile/index.html",
    "/markdown": "markdown/index.html",
    "/markdown/": "markdown/index.html",
    "/markdown/index.html": "markdown/index.html",
    "/styles.css": "styles.css",
    "/script.js": "script.js",
};

let storeQueue = Promise.resolve();

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

async function ensureStoreFile() {
    await fs.mkdir(DATA_DIR, { recursive: true });

    try {
        await fs.access(STORE_FILE);
    } catch (error) {
        await fs.writeFile(STORE_FILE, JSON.stringify(createSeedStore(), null, 2));
    }
}

async function readStoreFile() {
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

async function writeStoreFile(store) {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tempFile = `${STORE_FILE}.tmp`;
    await fs.writeFile(tempFile, JSON.stringify(store, null, 2));
    await fs.rename(tempFile, STORE_FILE);
}

async function useStore(callback) {
    const previous = storeQueue;
    let release = null;
    storeQueue = new Promise((resolve) => {
        release = resolve;
    });

    await previous;

    try {
        const store = await readStoreFile();
        const payload = await callback(store);
        const changed = Boolean(payload && typeof payload === "object" && payload.changed);
        const result = payload && typeof payload === "object" && "result" in payload
            ? payload.result
            : payload;

        if (changed) {
            await writeStoreFile(store);
        }

        return result;
    } finally {
        release();
    }
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

function parseCookies(req) {
    const raw = req.headers.cookie || "";
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

function appendSetCookie(res, value) {
    const previous = res.getHeader("Set-Cookie");

    if (!previous) {
        res.setHeader("Set-Cookie", value);
        return;
    }

    const list = Array.isArray(previous) ? previous : [previous];
    res.setHeader("Set-Cookie", [...list, value]);
}

function setSessionCookie(res, token) {
    appendSetCookie(
        res,
        `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`
    );
}

function clearSessionCookie(res) {
    appendSetCookie(
        res,
        `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
    );
}

function ensureViewerCookie(req, res) {
    const cookies = parseCookies(req);
    const existing = cookies[VIEWER_COOKIE];

    if (existing) {
        return existing;
    }

    const next = crypto.randomBytes(18).toString("hex");
    appendSetCookie(
        res,
        `${VIEWER_COOKIE}=${encodeURIComponent(next)}; Path=/; SameSite=Lax; Max-Age=${VIEWER_MAX_AGE}`
    );
    return next;
}

function readRequestBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let total = 0;

        req.on("data", (chunk) => {
            total += chunk.length;
            if (total > BODY_LIMIT_BYTES) {
                reject(new Error("Payload too large."));
                req.destroy();
                return;
            }

            chunks.push(chunk);
        });

        req.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf8");
            resolve(raw ? safeJsonParse(raw, null) : {});
        });

        req.on("error", reject);
    });
}

function json(res, statusCode, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
    });
    res.end(body);
}

function notFound(res) {
    json(res, 404, { error: "Not found." });
}

function sendFile(res, filePath) {
    return fs.readFile(filePath)
        .then((content) => {
            const extension = path.extname(filePath).toLowerCase();
            res.writeHead(200, {
                "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
            });
            res.end(content);
        })
        .catch(() => {
            notFound(res);
        });
}

function getStaticFilePath(pathname) {
    if (!STATIC_ROUTES[pathname]) {
        return null;
    }

    return path.join(ROOT, STATIC_ROUTES[pathname]);
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

function findSessionAccount(req, store) {
    cleanupExpiredSessions(store);
    const token = parseCookies(req)[SESSION_COOKIE];

    if (!token) {
        return null;
    }

    const session = store.sessions[token];
    if (!session) {
        return null;
    }

    return store.accounts[session.username] || null;
}

function issueSession(store, res, username) {
    const token = crypto.randomBytes(24).toString("hex");
    store.sessions[token] = {
        username,
        createdAt: new Date().toISOString(),
    };
    setSessionCookie(res, token);
}

function clearSession(store, req, res) {
    const token = parseCookies(req)[SESSION_COOKIE];
    if (token && store.sessions[token]) {
        delete store.sessions[token];
    }

    clearSessionCookie(res);
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

async function handleApi(req, res, url) {
    const pathname = url.pathname;

    if (pathname === "/api/bootstrap" && req.method === "GET") {
        const payload = await useStore((store) => {
            const account = findSessionAccount(req, store);

            return {
                result: {
                    session: createPublicAccount(account),
                    profilesCount: Object.keys(store.profiles || {}).length,
                    latestProfiles: serializeCommunityProfiles(store),
                },
            };
        });

        json(res, 200, payload);
        return;
    }

    if (pathname === "/api/auth/register" && req.method === "POST") {
        const body = await readRequestBody(req);
        const validated = validateAuthPayload(body);

        if (validated.error) {
            json(res, 400, { error: validated.error });
            return;
        }

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
            issueSession(store, res, validated.username);

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
            json(res, 409, payload);
            return;
        }

        json(res, 201, payload);
        return;
    }

    if (pathname === "/api/auth/login" && req.method === "POST") {
        const body = await readRequestBody(req);
        const username = slugify(body?.username);
        const password = String(body?.password || "");

        const payload = await useStore((store) => {
            const account = store.accounts[username];

            if (!account || !verifyPassword(password, account)) {
                return { result: { error: "Неверный username или пароль." } };
            }

            issueSession(store, res, username);

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
            json(res, 401, payload);
            return;
        }

        json(res, 200, payload);
        return;
    }

    if (pathname === "/api/auth/logout" && req.method === "POST") {
        await useStore((store) => {
            clearSession(store, req, res);
            return { changed: true, result: { ok: true } };
        });

        json(res, 200, { ok: true });
        return;
    }

    if (pathname === "/api/me/profile" && req.method === "GET") {
        const payload = await useStore((store) => {
            const account = findSessionAccount(req, store);

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
            json(res, 401, payload);
            return;
        }

        json(res, 200, payload);
        return;
    }

    if (pathname === "/api/me/profile" && req.method === "PUT") {
        const body = await readRequestBody(req);

        const payload = await useStore((store) => {
            const account = findSessionAccount(req, store);
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
            json(res, status, payload);
            return;
        }

        json(res, 200, payload);
        return;
    }

    if (pathname === "/api/me/profile/reset" && req.method === "POST") {
        const payload = await useStore((store) => {
            const account = findSessionAccount(req, store);
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
            json(res, 401, payload);
            return;
        }

        json(res, 200, payload);
        return;
    }

    if (pathname.startsWith("/api/profile/")) {
        const parts = pathname.split("/").filter(Boolean);
        const username = slugify(parts[2] || "");
        const isViewRoute = parts[3] === "view";

        if (!username) {
            json(res, 400, { error: "Username обязателен." });
            return;
        }

        if (req.method === "GET" && !isViewRoute) {
            const payload = await useStore((store) => {
                const profile = store.profiles[username];
                if (!profile) {
                    return { result: { error: "Профиль не найден." } };
                }

                return { result: { profile: normalizeProfile(profile) } };
            });

            if (payload.error) {
                json(res, 404, payload);
                return;
            }

            json(res, 200, payload);
            return;
        }

        if (req.method === "POST" && isViewRoute) {
            const payload = await useStore((store) => {
                const profile = store.profiles[username];
                if (!profile) {
                    return { result: { error: "Профиль не найден." } };
                }

                const normalized = normalizeProfile(profile);
                const sessionAccount = findSessionAccount(req, store);

                if (sessionAccount?.username === username) {
                    return { result: { profile: normalized } };
                }

                const viewerId = sessionAccount?.username || ensureViewerCookie(req, res);
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
                json(res, 404, payload);
                return;
            }

            json(res, 200, payload);
            return;
        }
    }

    notFound(res);
}

async function handleRequest(req, res) {
    try {
        const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

        if (url.pathname.startsWith("/api/")) {
            await handleApi(req, res, url);
            return;
        }

        const filePath = getStaticFilePath(url.pathname);

        if (!filePath) {
            notFound(res);
            return;
        }

        await sendFile(res, filePath);
    } catch (error) {
        json(res, 500, {
            error: "Server error.",
            details: process.env.NODE_ENV === "development" ? error.message : undefined,
        });
    }
}

const server = http.createServer((req, res) => {
    void handleRequest(req, res);
});

server.listen(PORT, () => {
    console.log(`ILAMath Profiles server running on http://localhost:${PORT}`);
});
