const STORAGE_KEYS = {
    accounts: "ilamath_profiles_accounts_v1",
    profiles: "ilamath_profiles_profiles_v1",
    session: "ilamath_profiles_session_v1",
    viewTracker: "ilamath_profiles_view_tracker_v1",
};

const FONT_MAP = {
    syne: '"Syne", sans-serif',
    manrope: '"Manrope", sans-serif',
    mono: '"Space Mono", monospace',
};

const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const VIEW_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const SETTINGS_TAB_STORAGE_KEY = "ilamath_profiles_settings_tab_v1";
const APP_STATE = {
    session: null,
    profilesCount: 0,
    latestProfiles: [],
    currentProfile: null,
    bootstrapLoaded: false,
};
let youtubeApiPromise = null;
let pageTitleAnimationTimer = 0;

document.addEventListener("mousemove", (event) => {
    document.documentElement.style.setProperty("--mx", `${event.clientX}px`);
    document.documentElement.style.setProperty("--my", `${event.clientY}px`);
});

function getRootPath(path = "") {
    const root = document.body.dataset.root || "./";
    return `${root}${path}`;
}

function cloneData(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
}

async function apiFetch(path, options = {}) {
    const { body, headers = {}, ...rest } = options;
    const response = await fetch(getRootPath(path), {
        credentials: "same-origin",
        ...rest,
        headers: {
            ...(body ? { "Content-Type": "application/json" } : {}),
            ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
    });

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
        ? await response.json().catch(() => ({}))
        : {};

    if (!response.ok) {
        throw new Error(payload.error || "Request failed.");
    }

    return payload;
}

async function loadBootstrapState(force = false) {
    if (APP_STATE.bootstrapLoaded && !force) {
        return cloneData(APP_STATE);
    }

    const payload = await apiFetch("api/bootstrap");
    APP_STATE.session = payload.session || null;
    APP_STATE.profilesCount = Number(payload.profilesCount || 0);
    APP_STATE.latestProfiles = Array.isArray(payload.latestProfiles)
        ? payload.latestProfiles.map((profile) => normalizeProfile(profile))
        : [];
    APP_STATE.bootstrapLoaded = true;

    return cloneData(APP_STATE);
}

function setSessionState(account) {
    APP_STATE.session = account ? cloneData(account) : null;
}

function setCurrentProfileState(profile) {
    APP_STATE.currentProfile = profile ? normalizeProfile(profile) : null;
}

function setLatestProfilesState(profiles) {
    APP_STATE.latestProfiles = Array.isArray(profiles)
        ? profiles.map((profile) => normalizeProfile(profile))
        : [];
}

async function fetchCurrentProfileFromApi() {
    const payload = await apiFetch("api/me/profile");
    setSessionState(payload.account || null);
    setCurrentProfileState(payload.profile || null);
    return cloneData(APP_STATE.currentProfile);
}

async function saveCurrentProfileToApi(nextProfile) {
    const payload = await apiFetch("api/me/profile", {
        method: "PUT",
        body: {
            profile: nextProfile,
        },
    });

    setSessionState(payload.account || null);
    setCurrentProfileState(payload.profile || null);
    return cloneData(APP_STATE.currentProfile);
}

async function resetCurrentProfileToApi() {
    const payload = await apiFetch("api/me/profile/reset", {
        method: "POST",
    });

    setSessionState(payload.account || null);
    setCurrentProfileState(payload.profile || null);
    return cloneData(APP_STATE.currentProfile);
}

async function fetchProfileWithView(username) {
    const normalizedName = slugify(username);
    if (!normalizedName) {
        throw new Error("Укажи username.");
    }

    const payload = await apiFetch(`api/profile/${encodeURIComponent(normalizedName)}/view`, {
        method: "POST",
    });

    return normalizeProfile(payload.profile || {});
}

function slugify(value) {
    return String(value || "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 25);
}

function safeParse(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
        return fallback;
    }
}

function writeStorage(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

function escapeHtml(value) {
    return String(value || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
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

function hexToRgb(hex) {
    const normalized = String(hex || "#000000").replace("#", "");
    const value = normalized.length === 3
        ? normalized.split("").map((char) => char + char).join("")
        : normalized;

    const number = Number.parseInt(value, 16);

    return {
        r: (number >> 16) & 255,
        g: (number >> 8) & 255,
        b: number & 255,
    };
}

function alphaColor(hex, alpha) {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function isDataUrl(value) {
    return /^data:/i.test(String(value || "").trim());
}

function extractYouTubeId(value) {
    const source = String(value || "").trim();

    if (!source) {
        return null;
    }

    try {
        const url = new URL(source);
        const host = url.hostname.replace(/^www\./, "");

        if (host === "youtu.be") {
            return url.pathname.slice(1) || null;
        }

        if (host.endsWith("youtube.com")) {
            if (url.searchParams.get("v")) {
                return url.searchParams.get("v");
            }

            const parts = url.pathname.split("/").filter(Boolean);
            const marker = parts.findIndex((part) => ["embed", "shorts", "live"].includes(part));

            if (marker !== -1 && parts[marker + 1]) {
                return parts[marker + 1];
            }
        }
    } catch (error) {
        return null;
    }

    return null;
}

function getYouTubeEmbedUrl(videoId) {
    return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${videoId}&playsinline=1&rel=0&modestbranding=1&iv_load_policy=3`;
}

function getYouTubeThumbnailUrl(videoId) {
    return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

function ensureYouTubeIframeApi() {
    if (window.YT?.Player) {
        return Promise.resolve(window.YT);
    }

    if (youtubeApiPromise) {
        return youtubeApiPromise;
    }

    youtubeApiPromise = new Promise((resolve, reject) => {
        const existingReady = window.onYouTubeIframeAPIReady;

        window.onYouTubeIframeAPIReady = () => {
            existingReady?.();
            resolve(window.YT);
        };

        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        script.async = true;
        script.onerror = () => reject(new Error("Не удалось загрузить YouTube API."));
        document.head.appendChild(script);
    });

    return youtubeApiPromise;
}

function getMediaSourceInfo(value) {
    const source = String(value || "").trim();

    if (!source) {
        return { type: "none", source: "" };
    }

    const youtubeId = extractYouTubeId(source);
    if (youtubeId) {
        return {
            type: "youtube",
            source,
            youtubeId,
            embedUrl: getYouTubeEmbedUrl(youtubeId),
        };
    }

    if (/^data:video\//i.test(source) || /\.(mp4|webm|ogg|ogv|mov|m4v)([?#].*)?$/i.test(source)) {
        return { type: "video", source };
    }

    if (/^data:image\//i.test(source) || /\.(png|jpe?g|gif|webp|svg|avif|bmp)([?#].*)?$/i.test(source)) {
        return { type: "image", source };
    }

    return { type: "image", source };
}

function getTrackSourceInfo(value) {
    const source = String(value || "").trim();

    if (!source) {
        return { type: "none", source: "" };
    }

    const youtubeId = extractYouTubeId(source);
    if (youtubeId) {
        return {
            type: "youtube",
            source,
            youtubeId,
            thumbnailUrl: getYouTubeThumbnailUrl(youtubeId),
        };
    }

    if (/^data:audio\//i.test(source) || /\.(mp3|wav|ogg|oga|m4a|aac|flac)([?#].*)?$/i.test(source)) {
        return { type: "audio", source };
    }

    if (/^data:video\//i.test(source) || /\.(mp4|webm|ogg|ogv|mov|m4v)([?#].*)?$/i.test(source)) {
        return { type: "video", source };
    }

    return { type: "external", source };
}

function deriveTrackMetadataFromUrl(value) {
    const source = String(value || "").trim();

    if (!source) {
        return { title: "", artist: "" };
    }

    try {
        const url = new URL(source);
        const rawName = decodeURIComponent(url.pathname.split("/").pop() || "");
        const title = rawName
            .replace(/\.[a-z0-9]{2,5}$/i, "")
            .replace(/[-_]+/g, " ")
            .trim();
        const hostname = url.hostname.replace(/^www\./, "");
        const artist = /youtube\.com|youtu\.be/i.test(hostname) ? "" : hostname;

        return {
            title,
            artist,
        };
    } catch (error) {
        return { title: "", artist: "" };
    }
}

function fetchJsonp(url, callbackParam = "callback", timeoutMs = 7000) {
    return new Promise((resolve, reject) => {
        const callbackName = `__ilamathJsonp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const separator = url.includes("?") ? "&" : "?";
        const script = document.createElement("script");
        let timeoutId = 0;

        const cleanup = () => {
            window.clearTimeout(timeoutId);
            delete window[callbackName];
            script.remove();
        };

        window[callbackName] = (payload) => {
            cleanup();
            resolve(payload);
        };

        script.src = `${url}${separator}${callbackParam}=${callbackName}`;
        script.async = true;
        script.onerror = () => {
            cleanup();
            reject(new Error("JSONP request failed."));
        };

        timeoutId = window.setTimeout(() => {
            cleanup();
            reject(new Error("JSONP request timed out."));
        }, timeoutMs);

        document.head.appendChild(script);
    });
}

function readYouTubeVideoData(player) {
    const data = player?.getVideoData?.() || {};

    return {
        title: String(data.title || "").trim(),
        artist: String(data.author || "").trim(),
    };
}

async function fetchTrackMetadataFromPlayer(videoId) {
    if (!videoId || !document.body) {
        return { title: "", artist: "" };
    }

    try {
        const YT = await ensureYouTubeIframeApi();

        return await new Promise((resolve) => {
            const mount = document.createElement("div");
            let player = null;
            let poller = 0;
            let timeoutId = 0;
            let settled = false;

            mount.id = `track-metadata-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            mount.style.position = "fixed";
            mount.style.left = "-9999px";
            mount.style.top = "0";
            mount.style.width = "240px";
            mount.style.height = "135px";
            mount.style.opacity = "0";
            mount.style.pointerEvents = "none";

            const cleanup = () => {
                window.clearInterval(poller);
                window.clearTimeout(timeoutId);

                try {
                    player?.destroy?.();
                } catch (error) {
                    // Ignore player cleanup failures.
                }

                mount.remove();
            };

            const finish = (metadata = { title: "", artist: "" }) => {
                if (settled) {
                    return;
                }

                settled = true;
                cleanup();
                resolve({
                    title: String(metadata.title || "").trim(),
                    artist: String(metadata.artist || "").trim(),
                });
            };

            const inspectMetadata = () => {
                const metadata = readYouTubeVideoData(player);

                if (metadata.title || metadata.artist) {
                    finish(metadata);
                }
            };

            document.body.appendChild(mount);

            player = new YT.Player(mount, {
                width: "240",
                height: "135",
                videoId,
                playerVars: {
                    autoplay: 0,
                    controls: 0,
                    rel: 0,
                    playsinline: 1,
                    modestbranding: 1,
                },
                events: {
                    onReady: (event) => {
                        try {
                            event.target.cueVideoById({
                                videoId,
                                startSeconds: 0,
                                suggestedQuality: "small",
                            });
                        } catch (error) {
                            // If cueing fails, keep polling the initial player state.
                        }

                        inspectMetadata();
                        poller = window.setInterval(inspectMetadata, 250);
                    },
                    onError: () => {
                        finish(readYouTubeVideoData(player));
                    },
                },
            });

            timeoutId = window.setTimeout(() => {
                finish(readYouTubeVideoData(player));
            }, 5000);
        });
    } catch (error) {
        return { title: "", artist: "" };
    }
}

function getYouTubeTrackErrorMessage(code) {
    if (code === 2) {
        return "Ссылка на YouTube выглядит некорректной.";
    }

    if (code === 5) {
        return "YouTube не смог загрузить этот трек.";
    }

    if (code === 100) {
        return "Видео не найдено или удалено на YouTube.";
    }

    if (code === 101 || code === 150) {
        return "Автор видео запретил embed, такой трек внутри профиля не проиграется.";
    }

    return "YouTube embed недоступен для этого трека.";
}

async function fetchTrackMetadata(value) {
    const source = String(value || "").trim();
    const track = getTrackSourceInfo(source);

    if (!source || track.type === "none") {
        return { title: "", artist: "" };
    }

    if (track.type === "youtube") {
        const watchUrl = track.source || `https://www.youtube.com/watch?v=${track.youtubeId}`;
        const endpoints = [
            `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`,
            `https://noembed.com/embed?url=${encodeURIComponent(watchUrl)}`,
        ];

        for (const endpoint of endpoints) {
            try {
                const response = await fetch(endpoint, {
                    headers: {
                        Accept: "application/json",
                    },
                });

                if (!response.ok) {
                    continue;
                }

                const payload = await response.json();
                const title = String(payload.title || "").trim();
                const artist = String(payload.author_name || "").trim();

                if (title || artist) {
                    return { title, artist };
                }
            } catch (error) {
                // Try the next metadata endpoint.
            }
        }

        try {
            const payload = await fetchJsonp(`https://noembed.com/embed?url=${encodeURIComponent(watchUrl)}`);
            const title = String(payload?.title || "").trim();
            const artist = String(payload?.author_name || "").trim();

            if (title || artist) {
                return { title, artist };
            }
        } catch (error) {
            // Fall through to URL-derived metadata.
        }

        const playerMetadata = await fetchTrackMetadataFromPlayer(track.youtubeId);
        if (playerMetadata.title || playerMetadata.artist) {
            return playerMetadata;
        }

        return { title: "", artist: "" };
    }

    return deriveTrackMetadataFromUrl(source);
}

function formatTrackTime(seconds) {
    const safe = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const secs = safe % 60;

    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }

    return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function getTrackToggleIconMarkup(playing = false) {
    return playing
        ? `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="7" y="7" width="10" height="10" rx="1.8" fill="currentColor"></rect>
            </svg>
        `
        : `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 6.5v11l9-5.5-9-5.5Z" fill="currentColor"></path>
            </svg>
        `;
}

function clearSourceFieldUploadState(input) {
    delete input.dataset.mode;
    delete input.dataset.uploadValue;
    delete input.dataset.uploadLabel;
}

function setSourceFieldValue(fieldId, value, uploadLabel) {
    const input = document.getElementById(fieldId);
    if (!input) {
        return;
    }

    const source = String(value || "").trim();

    if (!source) {
        input.value = "";
        clearSourceFieldUploadState(input);
        return;
    }

    if (isDataUrl(source)) {
        input.value = uploadLabel;
        input.dataset.mode = "file";
        input.dataset.uploadValue = source;
        input.dataset.uploadLabel = uploadLabel;
        return;
    }

    input.value = source;
    clearSourceFieldUploadState(input);
}

function clearSourceFieldValue(fieldId) {
    const input = document.getElementById(fieldId);
    if (!input) {
        return;
    }

    input.value = "";
    clearSourceFieldUploadState(input);
}

function readSourceFieldValue(fieldId) {
    const input = document.getElementById(fieldId);
    if (!input) {
        return "";
    }

    if (input.dataset.mode === "file" && input.dataset.uploadValue) {
        return input.dataset.uploadValue;
    }

    return input.value.trim();
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.addEventListener("load", () => {
            resolve(String(reader.result || ""));
        });

        reader.addEventListener("error", () => {
            reject(new Error("Не удалось прочитать файл."));
        });

        reader.readAsDataURL(file);
    });
}

function getAccounts() {
    return safeParse(STORAGE_KEYS.accounts, {});
}

function saveAccounts(accounts) {
    writeStorage(STORAGE_KEYS.accounts, accounts);
}

function getProfiles() {
    return safeParse(STORAGE_KEYS.profiles, {});
}

function saveProfiles(profiles) {
    writeStorage(STORAGE_KEYS.profiles, profiles);
}

function getSession() {
    return APP_STATE.session?.username || null;
}

function getViewTracker() {
    return safeParse(STORAGE_KEYS.viewTracker, {});
}

function saveViewTracker(tracker) {
    writeStorage(STORAGE_KEYS.viewTracker, tracker);
}

function setSession(username) {
    APP_STATE.session = username ? { username } : null;
}

function clearSession() {
    APP_STATE.session = null;
    APP_STATE.currentProfile = null;
}

function formatDate(dateString) {
    return new Intl.DateTimeFormat("ru-RU", {
        year: "numeric",
        month: "short",
        day: "numeric",
    }).format(new Date(dateString));
}

function getNextSequentialUid() {
    const accounts = Object.values(getAccounts());

    if (!accounts.length) {
        return "1";
    }

    const maxUid = accounts.reduce((max, account) => {
        const uid = Number(account.uid) || 0;
        return Math.max(max, uid);
    }, 0);

    return String(maxUid + 1);
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

function createAccount(username, password, displayName, patch = {}) {
    return mergeDeep(
        {
            username,
            password,
            displayName,
            uid: getNextSequentialUid(),
            createdAt: new Date().toISOString(),
        },
        patch
    );
}

function normalizeProfile(profile) {
    const baseAccount = {
        username: profile.username,
        uid: profile.uid || String(Math.floor(10000 + Math.random() * 80000)),
        displayName: profile.displayName || profile.username,
        createdAt: profile.createdAt || new Date().toISOString(),
    };

    return mergeDeep(createDefaultProfile(baseAccount), profile);
}

function parseList(value) {
    return String(value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 20);
}

function parseLinks(value) {
    return String(value || "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
            const [left, right] = line.split("|").map((item) => item.trim());

            if (right) {
                return { label: left, url: right };
            }

            return { label: line.replace(/^https?:\/\//, ""), url: line };
        })
        .filter((item) => item.url);
}

function serializeLinks(links) {
    return (links || [])
        .map((item) => `${item.label} | ${item.url}`)
        .join("\n");
}

function profileUrl(username) {
    return `${getRootPath("profile/")}?u=${encodeURIComponent(username)}`;
}

function showMessage(element, text, tone = "info") {
    if (!element) {
        return;
    }

    element.textContent = text;
    element.className = `message message--${tone}`;
}

function clearPageTitleAnimation() {
    if (pageTitleAnimationTimer) {
        window.clearInterval(pageTitleAnimationTimer);
        pageTitleAnimationTimer = 0;
    }
}

function buildPageTitleFrames(text, mode) {
    const title = String(text || "").trim();

    if (!title) {
        return [""];
    }

    if (mode === "typing") {
        const chars = Array.from(title);
        const revealFrames = chars.map((_, index) => {
            const partial = chars.slice(0, index + 1).join("");
            return index < chars.length - 1 ? `${partial} |` : partial;
        });

        return [...revealFrames, title, title];
    }

    if (mode === "marquee") {
        const chars = Array.from(`${title}   `);
        return chars.map((_, index) => chars.slice(index).concat(chars.slice(0, index)).join(""));
    }

    if (mode === "pulse") {
        return [
            title,
            `• ${title}`,
            `${title} •`,
            `• ${title} •`,
            title,
        ];
    }

    return [title];
}

function applyProfilePageTitle(profile) {
    clearPageTitleAnimation();

    const fallbackTitle = `${profile.displayName} / ILAMath Profiles`;
    const title = String(profile.embedTitle || fallbackTitle).trim() || fallbackTitle;
    const animation = String(profile.theme?.pageTitleAnimation || "none");
    const speed = Math.max(120, Math.min(900, Number(profile.theme?.pageTitleSpeed) || 220));
    const frames = buildPageTitleFrames(title, animation).filter(Boolean);

    document.title = frames[0] || title;

    if (frames.length <= 1) {
        return;
    }

    let frameIndex = 0;
    pageTitleAnimationTimer = window.setInterval(() => {
        frameIndex = (frameIndex + 1) % frames.length;
        document.title = frames[frameIndex] || title;
    }, speed);
}

function sanitizeDescriptionColor(value) {
    const normalized = String(value || "").trim().replace(/^#/, "");

    if (/^[0-9a-f]{3}([0-9a-f]{3})?([0-9a-f]{2})?$/i.test(normalized)) {
        return `#${normalized}`;
    }

    return "var(--profile-primary, #ff8f40)";
}

function replaceDescriptionTag(text, pattern, replacer, maxPasses = 12) {
    let output = String(text || "");

    for (let index = 0; index < maxPasses; index += 1) {
        const next = output.replace(pattern, replacer);

        if (next === output) {
            break;
        }

        output = next;
    }

    return output;
}

function formatEscapedDescriptionInline(text) {
    let output = String(text || "")
        .replace(/\r\n?/g, "\n")
        .replace(/\n/g, "<br>")
        .replace(/\[br\]/gi, "<br>");

    output = replaceDescriptionTag(output, /\[b\]([\s\S]*?)\[\/b\]/gi, (_, inner) => (
        `<strong>${formatEscapedDescriptionInline(inner)}</strong>`
    ));
    output = replaceDescriptionTag(output, /\[(?:em|i)\]([\s\S]*?)\[\/(?:em|i)\]/gi, (_, inner) => (
        `<em>${formatEscapedDescriptionInline(inner)}</em>`
    ));
    output = replaceDescriptionTag(output, /\[u\]([\s\S]*?)\[\/u\]/gi, (_, inner) => (
        `<span class="public-underline">${formatEscapedDescriptionInline(inner)}</span>`
    ));
    output = replaceDescriptionTag(output, /\[del\]([\s\S]*?)\[\/del\]/gi, (_, inner) => (
        `<del>${formatEscapedDescriptionInline(inner)}</del>`
    ));
    output = replaceDescriptionTag(output, /\[theme\]([\s\S]*?)\[\/theme\]/gi, (_, inner) => (
        `<span class="public-theme-text">${formatEscapedDescriptionInline(inner)}</span>`
    ));
    output = replaceDescriptionTag(output, /\[highlight\]([\s\S]*?)\[\/highlight\]/gi, (_, inner) => (
        `<mark class="public-highlight">${formatEscapedDescriptionInline(inner)}</mark>`
    ));
    output = replaceDescriptionTag(output, /\[spoiler\]([\s\S]*?)\[\/spoiler\]/gi, (_, inner) => (
        `<span class="public-spoiler" tabindex="0">${formatEscapedDescriptionInline(inner)}</span>`
    ));
    output = replaceDescriptionTag(output, /\[color=([#0-9a-fA-F]+)\]([\s\S]*?)\[\/color\]/gi, (_, color, inner) => (
        `<span class="public-colorized" style="color: ${sanitizeDescriptionColor(color)}">${formatEscapedDescriptionInline(inner)}</span>`
    ));

    return output;
}

function renderDescriptionInline(text) {
    return formatEscapedDescriptionInline(escapeHtml(text));
}

function collectDescriptionBlocks(text) {
    const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
    const blocks = [];

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const trimmed = line.trim();

        if (!trimmed) {
            blocks.push("");
            continue;
        }

        const multilineMatch = trimmed.match(/^\[(list|quote|code|left|center|right|h)\]/i);

        if (multilineMatch) {
            const tag = multilineMatch[1].toLowerCase();
            const closingPattern = new RegExp(`\\[\\/${tag}\\]`, "i");

            if (!closingPattern.test(trimmed)) {
                const buffer = [line];

                while (index + 1 < lines.length) {
                    index += 1;
                    buffer.push(lines[index]);

                    if (closingPattern.test(lines[index])) {
                        break;
                    }
                }

                blocks.push(buffer.join("\n"));
                continue;
            }
        }

        blocks.push(line);
    }

    return blocks;
}

function renderDescriptionBlock(rawBlock) {
    const block = String(rawBlock || "").trim();

    if (!block) {
        return "<p>&nbsp;</p>";
    }

    if (/^\[hr-theme\]$/i.test(block)) {
        return '<div class="public-divider"></div>';
    }

    if (/^\[hr\]$/i.test(block)) {
        return '<div class="public-divider public-divider--muted"></div>';
    }

    const codeMatch = block.match(/^\[code\]([\s\S]*?)\[\/code\]$/i);
    if (codeMatch) {
        return `<pre class="public-code"><code>${escapeHtml(codeMatch[1].trim())}</code></pre>`;
    }

    const listMatch = block.match(/^\[list\]([\s\S]*?)\[\/list\]$/i);
    if (listMatch) {
        const items = [...listMatch[1].matchAll(/\[item\]([\s\S]*?)\[\/item\]/gi)];

        if (items.length) {
            return `
                <ul class="public-list">
                    ${items.map((item) => `<li>${renderDescriptionInline(item[1].trim())}</li>`).join("")}
                </ul>
            `;
        }
    }

    const headlineMatch = block.match(/^\[h\]([\s\S]*?)\[\/h\]$/i);
    if (headlineMatch) {
        return `<h3 class="public-headline">${renderDescriptionInline(headlineMatch[1].trim())}</h3>`;
    }

    const quoteMatch = block.match(/^\[quote\]([\s\S]*?)\[\/quote\]$/i);
    if (quoteMatch) {
        return `<blockquote class="public-quote">${renderDescriptionInline(quoteMatch[1].trim())}</blockquote>`;
    }

    const alignmentMatch = block.match(/^\[(left|center|right)\]([\s\S]*?)\[\/\1\]$/i);
    if (alignmentMatch) {
        const alignment = alignmentMatch[1].toLowerCase();

        return `<p class="is-${alignment}">${renderDescriptionInline(alignmentMatch[2].trim())}</p>`;
    }

    return `<p>${renderDescriptionInline(block)}</p>`;
}

function renderDescription(text) {
    return collectDescriptionBlocks(text).map(renderDescriptionBlock).join("");
}

function initMarkdownPage() {
    document.querySelectorAll("[data-markdown-preview]").forEach((preview) => {
        preview.innerHTML = renderDescription(preview.dataset.markdownPreview || "");
    });
}

function getCurrentAccount() {
    return APP_STATE.session ? cloneData(APP_STATE.session) : null;
}

function getCurrentProfile() {
    return APP_STATE.currentProfile ? cloneData(APP_STATE.currentProfile) : null;
}

function hydrateHeader() {
    const headerState = document.getElementById("headerSessionState");
    if (!headerState) {
        return;
    }

    const current = getCurrentAccount();
    if (!current) {
        const page = document.body?.dataset?.page || "";
        headerState.textContent = page === "main" ? "register / login" : "guest mode";
        return;
    }

    headerState.textContent = `signed in as ${current.username}`;
}

function seedDemoData() {
    const accounts = getAccounts();
    const profiles = getProfiles();

    if (Object.keys(accounts).length || Object.keys(profiles).length) {
        return;
    }

    const demoAccounts = {
        ila: createAccount("ila", "alesha7720", "ILA", {
            uid: "1",
            createdAt: "2026-04-01T12:20:00.000Z",
        }),
    };

    const demoProfiles = {
        ila: createDefaultProfile(demoAccounts.ila, {
            aliases: ["ila-dd", "ila.dev"],
            description: "[center]hi, i build math and game projects[/center]\n[hr-theme]\ncustom pages, ddnet stuff, frontend experiments.",
            location: "ekaterinburg",
            statusLine: "dashboard open / theme live",
            avatarUrl: "https://avatars.githubusercontent.com/u/202826930?v=4",
            backgroundUrl: "",
            bannerUrl: "",
            website: "https://ilamath.ru/",
            embedTitle: "ILA / public profile",
            views: 114,
            weeklyViews: [1, 3, 2, 4, 2, 0, 5],
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
                revealText: "click to load profile",
            },
            options: {
                showDiscord: true,
            },
        }),
    };

    saveAccounts(demoAccounts);
    saveProfiles(demoProfiles);
}

function migrateLegacyDemoAccounts() {
    const accounts = getAccounts();
    const profiles = getProfiles();
    let changed = false;

    const legacyDemoUsers = [
        { username: "noct", displayName: "Noct" },
        { username: "vanta", displayName: "Vanta" },
    ];

    legacyDemoUsers.forEach(({ username, displayName }) => {
        const account = accounts[username];

        if (account && account.password === "demo123" && account.displayName === displayName) {
            delete accounts[username];
            changed = true;
        }

        const profile = profiles[username];
        if (profile && profile.displayName === displayName) {
            delete profiles[username];
            changed = true;
        }
    });

    const ilaAccount = accounts.ila;
    if (ilaAccount && ilaAccount.password === "demo123" && ilaAccount.displayName === "ILA") {
        accounts.ila = {
            ...ilaAccount,
            password: "alesha7720",
        };
        changed = true;
    }

    if (changed) {
        saveAccounts(accounts);
        saveProfiles(profiles);
    }
}

function syncSequentialUids() {
    const accounts = getAccounts();
    const profiles = getProfiles();
    const orderedAccounts = Object.values(accounts).sort((left, right) => {
        const leftTime = new Date(left.createdAt).getTime();
        const rightTime = new Date(right.createdAt).getTime();

        if (leftTime !== rightTime) {
            return leftTime - rightTime;
        }

        return left.username.localeCompare(right.username);
    });

    let changed = false;

    orderedAccounts.forEach((account, index) => {
        const nextUid = String(index + 1);

        if (account.uid !== nextUid) {
            accounts[account.username] = {
                ...account,
                uid: nextUid,
            };
            changed = true;
        }

        if (profiles[account.username]) {
            const nextProfile = {
                ...profiles[account.username],
                uid: nextUid,
            };

            if (profiles[account.username].uid !== nextUid) {
                profiles[account.username] = nextProfile;
                changed = true;
            }
        }
    });

    if (changed) {
        saveAccounts(accounts);
        saveProfiles(profiles);
    }
}

async function saveCurrentProfile(nextProfile) {
    try {
        return await saveCurrentProfileToApi(nextProfile);
    } catch (error) {
        if (String(error.message || "").includes("Payload too large")) {
            throw new Error("Медиа слишком тяжелые для хранения. Для больших видео лучше использовать прямую ссылку или YouTube.");
        }

        throw error;
    }
}

async function resetCurrentProfile() {
    try {
        return await resetCurrentProfileToApi();
    } catch (error) {
        if (String(error.message || "").includes("Сначала войди")) {
            return null;
        }

        throw error;
    }
}

async function incrementProfileView(username) {
    return fetchProfileWithView(username);
}

function applyThemeVariables(element, profile) {
    const theme = profile.theme;

    element.style.setProperty("--profile-primary", theme.primary);
    element.style.setProperty("--profile-secondary", theme.secondary);
    element.style.setProperty("--profile-primary-soft", alphaColor(theme.primary, 0.22));
    element.style.setProperty("--profile-secondary-soft", alphaColor(theme.secondary, 0.18));
    element.style.setProperty("--profile-primary-text", alphaColor(theme.primary, 0.76));
    element.style.setProperty("--profile-text", theme.text);
    element.style.setProperty("--profile-bg", theme.background);
    element.style.setProperty("--profile-card", alphaColor(theme.cardColor, theme.cardOpacity / 100));
    element.style.setProperty("--profile-radius", `${theme.radius}px`);
    element.style.setProperty("--profile-blur", `${theme.blur}px`);
    element.style.setProperty("--profile-shadow", `${theme.shadowOpacity}`);
    element.style.setProperty("--profile-border", alphaColor(theme.borderColor, 0.72));
    element.style.setProperty("--profile-border-width", `${theme.borderWidth}px`);
    element.style.setProperty("--profile-border-style", theme.borderStyle);
    element.style.setProperty("--profile-overlay", `${theme.overlay}`);
    element.style.setProperty("--profile-avatar-radius", `${theme.avatarRadius}px`);
    element.style.setProperty("--profile-font", FONT_MAP[theme.font] || FONT_MAP.syne);
    element.style.setProperty("--profile-reveal-blur", `${theme.revealBlur}px`);

    element.style.setProperty("--profile-bg-image", "none");
    element.style.setProperty("--profile-banner-image", "none");
}

function renderMediaIntoSlot(slot, value, variant) {
    if (!slot) {
        return;
    }

    slot.innerHTML = "";

    const media = getMediaSourceInfo(value);
    if (media.type === "none") {
        return;
    }

    if (media.type === "image") {
        const image = document.createElement("img");
        image.className = `public-media public-media--image public-media--${variant}`;
        image.src = media.source;
        image.alt = "";
        slot.appendChild(image);
        return;
    }

    if (media.type === "video") {
        const video = document.createElement("video");
        video.className = `public-media public-media--video public-media--${variant}`;
        video.src = media.source;
        video.autoplay = true;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.defaultMuted = true;
        video.setAttribute("aria-hidden", "true");
        slot.appendChild(video);

        video.play().catch(() => {
            // Browser autoplay policy may block the first attempt until interaction.
        });
        return;
    }

    if (media.type === "youtube") {
        const iframe = document.createElement("iframe");
        iframe.className = `public-media public-media--iframe public-media--${variant}`;
        iframe.src = media.embedUrl;
        iframe.title = variant === "banner" ? "Banner video" : "Background video";
        iframe.allow = "autoplay; encrypted-media; picture-in-picture";
        iframe.referrerPolicy = "strict-origin-when-cross-origin";
        iframe.setAttribute("aria-hidden", "true");
        slot.appendChild(iframe);
    }
}

function renderTrackCardMarkup(profile, options = {}) {
    const hasTrackBlock = Boolean(profile.trackTitle || profile.trackArtist || profile.trackUrl);

    if (!hasTrackBlock) {
        return "";
    }

    const track = getTrackSourceInfo(profile.trackUrl);
    const trackTitle = escapeHtml(profile.trackTitle || "custom track");
    const trackArtist = escapeHtml(profile.trackArtist || (profile.trackUrl ? "open source" : "unknown artist"));
    const trackLabel = "now playing";
    const coverMarkup = track.type === "youtube"
        ? `<img class="public-track-card__cover-image" src="${escapeHtml(track.thumbnailUrl)}" alt="${trackTitle}">`
        : `
            <div class="public-track-card__cover-fallback" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                    <path
                        d="M16 4v10.3a3.7 3.7 0 1 1-2-3.3V6.6l7-1.6v8.3a3.7 3.7 0 1 1-2-3.3V4h-3Z"
                        fill="currentColor"
                    ></path>
                </svg>
            </div>
        `;
    const controlsDisabled = options.preview || track.type === "external" || track.type === "none";
    const cardInner = `
        <div class="public-track-card__top">
            <div class="public-track-card__main">
                <div class="public-track-card__cover">${coverMarkup}</div>
                <div class="public-track-card__copy">
                    <span class="public-track-card__label">${escapeHtml(trackLabel)}</span>
                    <strong class="public-track-card__title">${trackTitle}</strong>
                    <span class="public-track-card__artist">${trackArtist}</span>
                </div>
            </div>
            <div class="public-track-card__rail">
                <div class="public-track-card__seek-wrap">
                    <input class="public-track-card__seek" type="range" min="0" max="100" value="0" step="0.1" data-track-action="seek" ${controlsDisabled ? "disabled" : ""}>
                </div>
                <div class="public-track-card__bottom">
                    <span class="public-track-card__time" data-track-time>0:00 / 0:00</span>
                    <button class="public-track-card__button public-track-card__button--icon" type="button" data-track-action="toggle" aria-label="Play track" ${controlsDisabled ? "disabled" : ""}>
                        ${getTrackToggleIconMarkup(false)}
                    </button>
                    <div class="public-track-card__volume-shell">
                        <button class="public-track-card__icon-button" type="button" data-track-action="volume-icon" aria-label="Volume" ${controlsDisabled ? "disabled" : ""}>
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path
                                    d="M5 9.5v5h3.4l4.6 4.1V5.4L8.4 9.5H5Zm11.1-3.3a7 7 0 0 1 0 11.6m-2.6-9a4 4 0 0 1 0 6.5"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="1.8"
                                ></path>
                            </svg>
                        </button>
                        <div class="public-track-card__volume-panel">
                            <input class="public-track-card__volume" type="range" min="0" max="100" value="70" step="1" data-track-action="volume" ${controlsDisabled ? "disabled" : ""}>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="public-track-card__engine" aria-hidden="true"></div>
        <div class="public-track-card__status" data-track-status>${controlsDisabled && options.preview ? "preview only" : ""}</div>
    `;

    return `
        <section
            class="public-track-card"
            data-track-type="${escapeHtml(track.type)}"
            data-track-source="${escapeHtml(profile.trackUrl || "")}"
            data-track-youtube-id="${escapeHtml(track.youtubeId || "")}"
            data-track-preview="${options.preview ? "true" : "false"}"
        >
            ${cardInner}
        </section>
    `;
}

function initTrackCards(container, options = {}) {
    if (!container) {
        return;
    }

    const cards = container.querySelectorAll(".public-track-card");

    cards.forEach((card, index) => {
        const preview = options.preview || card.dataset.trackPreview === "true";
        const type = card.dataset.trackType || "none";
        const source = card.dataset.trackSource || "";
        const youtubeId = card.dataset.trackYoutubeId || "";
        const toggleButton = card.querySelector("[data-track-action='toggle']");
        const volumeButton = card.querySelector("[data-track-action='volume-icon']");
        const seekInput = card.querySelector("[data-track-action='seek']");
        const volumeInput = card.querySelector("[data-track-action='volume']");
        const timeLabel = card.querySelector("[data-track-time]");
        const status = card.querySelector("[data-track-status]");
        const engine = card.querySelector(".public-track-card__engine");
        const titleNode = card.querySelector(".public-track-card__title");
        const artistNode = card.querySelector(".public-track-card__artist");
        const coverImage = card.querySelector(".public-track-card__cover-image");

        if (!toggleButton || !seekInput || !volumeInput || !timeLabel || !engine) {
            return;
        }

        const controls = [toggleButton, seekInput, volumeInput];
        if (volumeButton) {
            controls.push(volumeButton);
        }
        const state = {
            ready: false,
            seeking: false,
            player: null,
            media: null,
            duration: 0,
            poller: 0,
        };

        const applyTrackMetadata = (metadata) => {
            const title = String(metadata?.title || "").trim();
            const artist = String(metadata?.artist || "").trim();

            if (title && titleNode) {
                titleNode.textContent = title;
            }

            if (artist && artistNode) {
                artistNode.textContent = artist;
            }

            if (title && coverImage) {
                coverImage.alt = title;
            }
        };

        const setStatus = (text = "") => {
            if (status) {
                status.textContent = text;
            }
        };

        const setDisabled = (disabled) => {
            controls.forEach((control) => {
                control.disabled = disabled;
            });
        };

        const setPlaying = (playing) => {
            toggleButton.dataset.playing = playing ? "true" : "false";
            toggleButton.classList.toggle("is-playing", playing);
            toggleButton.innerHTML = getTrackToggleIconMarkup(playing);
            toggleButton.setAttribute("aria-label", playing ? "Pause track" : "Play track");
        };

        const updateTimeUi = (current, duration) => {
            const safeDuration = Number.isFinite(duration) ? duration : 0;
            const safeCurrent = Number.isFinite(current) ? current : 0;
            timeLabel.textContent = `${formatTrackTime(safeCurrent)} / ${formatTrackTime(safeDuration)}`;

            if (!state.seeking) {
                const ratio = safeDuration > 0 ? (safeCurrent / safeDuration) * 100 : 0;
                seekInput.value = String(Math.max(0, Math.min(100, ratio)));
            }
        };

        const getCurrentTime = () => {
            if (type === "youtube" && state.player) {
                return Number(state.player.getCurrentTime?.() || 0);
            }

            if (state.media) {
                return Number(state.media.currentTime || 0);
            }

            return 0;
        };

        const getDuration = () => {
            if (type === "youtube" && state.player) {
                return Number(state.player.getDuration?.() || 0);
            }

            if (state.media) {
                return Number(state.media.duration || 0);
            }

            return 0;
        };

        const syncFromEngine = () => {
            const current = getCurrentTime();
            const duration = getDuration();
            state.duration = duration;
            updateTimeUi(current, duration);
        };

        const seekToRatio = (ratio) => {
            const duration = getDuration();
            if (!duration) {
                return;
            }

            const target = duration * ratio;

            if (type === "youtube" && state.player) {
                state.player.seekTo(target, true);
                return;
            }

            if (state.media) {
                state.media.currentTime = target;
            }
        };

        const stopPlayback = () => {
            if (type === "youtube" && state.player) {
                state.player.pauseVideo();
                setPlaying(false);
                syncFromEngine();
                return;
            }

            if (state.media) {
                state.media.pause();
                setPlaying(false);
                syncFromEngine();
            }
        };

        const startPlayback = () => {
            if (!state.ready) {
                setStatus("Плеер еще загружается.");
                return;
            }

            if (type === "youtube" && state.player && window.YT?.PlayerState) {
                setStatus("");
                state.player.playVideo();
                window.setTimeout(() => {
                    if (!state.seeking) {
                        syncFromEngine();
                    }
                }, 180);
                return;
            }

            if (state.media) {
                setStatus("");
                state.media.play().catch(() => {
                    setStatus("Нужно взаимодействие, чтобы запустить трек.");
                });
            }
        };

        const applyVolume = (value) => {
            const volume = Math.max(0, Math.min(100, Number(value) || 0));

            if (type === "youtube" && state.player) {
                state.player.setVolume(volume);
                return;
            }

            if (state.media) {
                state.media.volume = volume / 100;
            }
        };

        const bindSharedControls = () => {
            toggleButton.addEventListener("click", () => {
                if (toggleButton.dataset.playing === "true") {
                    stopPlayback();
                    return;
                }

                startPlayback();
            });

            seekInput.addEventListener("input", () => {
                state.seeking = true;
                const duration = getDuration();
                const target = duration * (Number(seekInput.value || 0) / 100);
                updateTimeUi(target, duration);
            });

            const commitSeek = () => {
                seekToRatio(Number(seekInput.value || 0) / 100);
                state.seeking = false;
                syncFromEngine();
            };

            seekInput.addEventListener("change", commitSeek);
            seekInput.addEventListener("blur", () => {
                if (state.seeking) {
                    commitSeek();
                }
            });

            volumeInput.addEventListener("input", () => {
                applyVolume(volumeInput.value);
            });
        };

        const initHtmlMedia = () => {
            const tagName = type === "audio" ? "audio" : "video";
            const media = document.createElement(tagName);

            media.src = source;
            media.preload = "metadata";
            media.loop = true;
            media.playsInline = true;
            media.controls = false;
            media.volume = Number(volumeInput.value || 70) / 100;
            media.className = "public-track-card__native-engine";
            engine.appendChild(media);

            state.media = media;
            state.ready = true;
            setDisabled(false);
            setStatus("");
            setPlaying(false);
            updateTimeUi(0, 0);

            media.addEventListener("loadedmetadata", syncFromEngine);
            media.addEventListener("durationchange", syncFromEngine);
            media.addEventListener("timeupdate", () => {
                if (!state.seeking) {
                    syncFromEngine();
                }
            });
            media.addEventListener("play", () => {
                setPlaying(true);
                setStatus("");
            });
            media.addEventListener("pause", () => {
                setPlaying(false);
            });
            media.addEventListener("volumechange", () => {
                volumeInput.value = String(Math.round((media.volume || 0) * 100));
            });
            media.addEventListener("error", () => {
                setDisabled(true);
                setStatus("Источник трека недоступен.");
            });

            media.load();
        };

        const initYoutubePlayer = async () => {
            try {
                const YT = await ensureYouTubeIframeApi();
                const mount = document.createElement("div");
                mount.id = `track-player-${Date.now()}-${index}`;
                engine.appendChild(mount);

                const syncYoutubeMetadata = () => {
                    applyTrackMetadata(readYouTubeVideoData(state.player));
                };

                state.player = new YT.Player(mount.id, {
                    width: "240",
                    height: "135",
                    videoId: youtubeId,
                    playerVars: {
                        autoplay: 0,
                        controls: 0,
                        rel: 0,
                        playsinline: 1,
                        loop: 1,
                        playlist: youtubeId,
                        modestbranding: 1,
                    },
                    events: {
                        onReady: (event) => {
                            state.ready = true;
                            state.player.setVolume(Number(volumeInput.value || 70));

                            try {
                                event.target.cueVideoById({
                                    videoId: youtubeId,
                                    startSeconds: 0,
                                    suggestedQuality: "small",
                                });
                            } catch (error) {
                                // Keep the initial player state if cueing fails.
                            }

                            setDisabled(false);
                            setStatus("");
                            setPlaying(false);
                            syncYoutubeMetadata();
                            syncFromEngine();
                            state.poller = window.setInterval(() => {
                                syncYoutubeMetadata();
                                if (!state.seeking) {
                                    syncFromEngine();
                                }
                            }, 250);
                        },
                        onStateChange: (event) => {
                            const playerState = event.data;
                            const isPlaying = playerState === YT.PlayerState.PLAYING || playerState === YT.PlayerState.BUFFERING;
                            syncYoutubeMetadata();
                            syncFromEngine();
                            setPlaying(isPlaying);

                            if (playerState === YT.PlayerState.ENDED) {
                                state.player.seekTo(0, true);
                                state.player.playVideo();
                            }
                        },
                        onError: (event) => {
                            setDisabled(true);
                            setStatus(getYouTubeTrackErrorMessage(event.data));
                        },
                    },
                });
            } catch (error) {
                setDisabled(true);
                setStatus("Не удалось загрузить YouTube player.");
            }
        };

        setDisabled(true);
        setPlaying(false);
        updateTimeUi(0, 0);
        bindSharedControls();

        if (preview) {
            setStatus("preview only");
            return;
        }

        if (!source || type === "none" || type === "external") {
            setStatus(source ? "Источник трека не поддерживается." : "");
            return;
        }

        if (type === "youtube" && youtubeId) {
            initYoutubePlayer();
            return;
        }

        initHtmlMedia();
    });
}

function renderPublicProfile(mount, profile, options = {}) {
    const aliases = profile.aliases.length
        ? `<div class="pill-row">${profile.aliases.map((alias) => `<span class="pill">aka ${escapeHtml(alias)}</span>`).join("")}</div>`
        : "";

    const tagsMarkup = profile.tags.length
        ? `<div class="profile-tag-row">${profile.tags.map((tag) => `<span class="pill">#${escapeHtml(tag)}</span>`).join("")}</div>`
        : "";

    const badges = profile.badges.length
        ? `<div class="profile-tag-row">${profile.badges.map((tag) => `<span class="pill">${escapeHtml(tag)}</span>`).join("")}</div>`
        : "";
    const uidHoverAttrs = profile.options.showUid
        ? ` data-uid="uid ${escapeHtml(profile.uid)}" tabindex="0"`
        : "";
    const identityClass = profile.options.showUid
        ? "public-card__identity public-card__identity--has-uid"
        : "public-card__identity";

    const linkMarkup = profile.links.length
        ? profile.links.map((item) => `
            <a class="public-link" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">
                <div>
                    <span>${escapeHtml(item.url)}</span>
                    <strong>${escapeHtml(item.label)}</strong>
                </div>
                <span>open</span>
            </a>
        `).join("")
        : '<div class="empty-state">Ссылки пока не добавлены.</div>';

    const trackMarkup = renderTrackCardMarkup(profile, options);

    const watermarkContent = `
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
                d="M12 21s-6.7-4.4-9.2-8c-1.8-2.6-1.3-6.5 1.4-8.2 2.1-1.3 4.9-1 6.7.8L12 6.8l1.1-1.2c1.8-1.8 4.6-2.1 6.7-.8 2.7 1.7 3.2 5.6 1.4 8.2C18.7 16.6 12 21 12 21Z"
                fill="currentColor"
            ></path>
        </svg>
        <span>Made by ILAMath</span>
    `;

    const watermarkMarkup = profile.options.watermark
        ? options.preview
            ? `<div class="public-watermark public-watermark--preview">${watermarkContent}</div>`
            : `<a class="public-watermark public-watermark--site" href="${escapeHtml(getRootPath("main/"))}" aria-label="Open main site">${watermarkContent}</a>`
        : "";

    const alignmentClass = profile.theme.alignment === "center" ? "is-center" : "";
    const viewsBadgeMarkup = profile.options.showViews
        ? `
            <div class="public-views-badge public-views-badge--${escapeHtml(profile.options.viewsPosition || "top-right")}">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                        d="M1.5 12s3.9-7 10.5-7 10.5 7 10.5 7-3.9 7-10.5 7S1.5 12 1.5 12Z"
                        fill="none"
                        stroke="currentColor"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="1.7"
                    ></path>
                    <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.7"></circle>
                </svg>
                <span>views</span>
                <strong>${escapeHtml(profile.views)}</strong>
            </div>
        `
        : "";

    mount.innerHTML = `
        <div class="public-root ${options.preview ? "is-preview" : "is-live"}">
            <div class="public-backdrop">
                <div class="public-media-slot public-media-slot--background"></div>
            </div>
            <div class="public-stack">
                <article class="public-card ${alignmentClass}">
                    ${viewsBadgeMarkup}
                    <div class="public-card__banner">
                        <div class="public-media-slot public-media-slot--banner"></div>
                    </div>
                    <div class="public-card__body">
                        <header class="public-card__header">
                            <img class="public-card__avatar" src="${escapeHtml(profile.avatarUrl)}" alt="${escapeHtml(profile.displayName)}">
                            <div class="${identityClass}"${uidHoverAttrs}>
                                <p class="public-card__eyebrow">/${escapeHtml(profile.username)}</p>
                                <h1 class="public-card__title">${escapeHtml(profile.displayName)}</h1>
                                <p class="public-card__subtitle">${escapeHtml(profile.statusLine)}</p>
                            </div>
                        </header>

                        <div class="public-card__copy">
                            ${tagsMarkup}
                            ${aliases}
                            <div class="public-card__bio markdown-rendered">${renderDescription(profile.description)}</div>
                            ${badges}
                        </div>

                        <div class="public-link-grid">${linkMarkup}</div>
                    </div>
                </article>
                ${trackMarkup}
            </div>
            ${watermarkMarkup}
        </div>
    `;

    const root = mount.querySelector(".public-root");
    const stack = mount.querySelector(".public-stack");
    const card = mount.querySelector(".public-card");
    applyThemeVariables(root, profile);
    applyThemeVariables(card, profile);
    renderMediaIntoSlot(root.querySelector(".public-media-slot--background"), profile.backgroundUrl, "background");
    renderMediaIntoSlot(card.querySelector(".public-media-slot--banner"), profile.bannerUrl, "banner");
    initTrackCards(root, options);

    if (profile.theme.layout === "simple") {
        card.style.maxWidth = "760px";
        if (stack) {
            stack.style.maxWidth = "760px";
        }
    }

    if (profile.options.revealScreen && !options.preview) {
        const gate = document.createElement("div");
        gate.className = "reveal-gate";
        gate.tabIndex = 0;
        gate.setAttribute("role", "button");
        gate.setAttribute("aria-label", "Open profile");
        const showRevealText = Boolean(profile.theme.revealTextEnabled && profile.theme.revealText);
        gate.innerHTML = `
            ${showRevealText ? `<div class="reveal-gate__panel"><h2>${escapeHtml(profile.theme.revealText)}</h2></div>` : ""}
        `;

        root.appendChild(gate);
        const closeGate = () => {
            gate.remove();
        };

        gate.addEventListener("click", closeGate);
        gate.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                closeGate();
            }
        });
    }
}

function createCommunityCard(profile) {
    const article = document.createElement("article");
    article.className = "community-card";
    article.innerHTML = `
        <div class="community-card__header">
            <img class="community-card__avatar" src="${escapeHtml(profile.avatarUrl)}" alt="${escapeHtml(profile.displayName)}">
            <div class="community-card__copy">
                <div class="community-card__meta-row">
                    <div class="community-card__meta">/${escapeHtml(profile.username)}</div>
                    <span class="community-card__uid">uid ${escapeHtml(profile.uid)}</span>
                </div>
                <h3 class="community-card__title">${escapeHtml(profile.displayName)}</h3>
            </div>
        </div>
        <p class="community-card__description">${escapeHtml(profile.statusLine)}</p>
        <div class="community-card__swatches">
            <span class="theme-swatch">views ${escapeHtml(profile.views)}</span>
            <span class="theme-swatch">${escapeHtml(profile.location || "nowhere")}</span>
        </div>
        <div class="community-card__footer">
            <div class="pill-row">
                ${profile.tags.slice(0, 2).map((tag) => `<span class="pill">#${escapeHtml(tag)}</span>`).join("")}
            </div>
            <a class="button button--ghost" href="${profileUrl(profile.username)}">Open</a>
        </div>
    `;

    article.style.setProperty("--profile-primary", profile.theme.primary);
    article.style.setProperty("--profile-secondary", profile.theme.secondary);
    return article;
}

function renderCommunityGrid(container, profiles = APP_STATE.latestProfiles, limit = 6) {
    if (!container) {
        return;
    }

    const entries = (profiles || [])
        .map((profile) => normalizeProfile(profile))
        .slice(0, limit);

    container.innerHTML = "";

    entries.forEach((profile) => {
        container.appendChild(createCommunityCard(profile));
    });
}

function renderWeeklyBars(container, values) {
    if (!container) {
        return;
    }

    const max = Math.max(...values, 1);
    container.innerHTML = values.map((value, index) => `
        <div class="bar-chart__item">
            <div class="bar-chart__value" style="height:${Math.max(20, (value / max) * 130)}px"></div>
            <strong>${value}</strong>
            <span class="bar-chart__label">${WEEK_DAYS[index]}</span>
        </div>
    `).join("");
}

function initHomePage() {
    const profileCount = document.getElementById("homeProfileCount");
    if (profileCount) {
        profileCount.textContent = String(APP_STATE.profilesCount || 0);
    }
}

function initMainPage() {
    const registerForm = document.getElementById("registerForm");
    const loginForm = document.getElementById("loginForm");
    const sessionPanel = document.getElementById("sessionPanel");
    const mainMessage = document.getElementById("mainMessage");
    const communityGrid = document.getElementById("communityGrid");
    const mainProfileCount = document.getElementById("mainProfileCount");
    const mainHeaderAuth = document.getElementById("mainHeaderAuth");
    const authPanel = document.getElementById("authPanel");
    const authPanelTitle = document.getElementById("authPanelTitle");
    const authPanelEyebrow = document.getElementById("authPanelEyebrow");
    const authPanelNote = document.getElementById("authPanelNote");
    const authPanelClose = document.getElementById("authPanelClose");
    const authModeButtons = Array.from(document.querySelectorAll("[data-auth-mode]"));
    let current = getCurrentAccount();

    if (mainProfileCount) {
        mainProfileCount.textContent = String(APP_STATE.profilesCount || 0);
    }

    renderCommunityGrid(communityGrid, APP_STATE.latestProfiles);

    const setAuthMode = (mode) => {
        const nextMode = mode === "login" ? "login" : "register";
        const isLogin = nextMode === "login";

        registerForm?.classList.toggle("hidden", isLogin);
        loginForm?.classList.toggle("hidden", !isLogin);

        authModeButtons.forEach((button) => {
            const active = button.dataset.authMode === nextMode;
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-selected", active ? "true" : "false");
        });

        if (authPanelTitle) {
            authPanelTitle.textContent = isLogin ? "Войти в аккаунт" : "Создать аккаунт";
        }

        if (authPanelEyebrow) {
            authPanelEyebrow.textContent = isLogin ? "login" : "register";
        }

        if (authPanelNote) {
            authPanelNote.textContent = isLogin
                ? "Для теста доступен аккаунт ila с паролем alesha7720."
                : "Создай новый аккаунт и сразу перейди в settings, чтобы собрать свой профиль.";
        }
    };

    const closeAuthPanel = () => {
        authPanel?.classList.add("hidden");
    };

    const openAuthPanel = (mode) => {
        if (!authPanel || current) {
            return;
        }

        setAuthMode(mode);
        authPanel.classList.remove("hidden");

        const firstField = authPanel.querySelector(
            mode === "login"
                ? 'input[name="login_username"]'
                : 'input[name="register_username"]'
        );

        window.setTimeout(() => {
            firstField?.focus();
        }, 20);
    };

    const renderSessionPanel = () => {
        if (!sessionPanel) {
            return;
        }

        if (!current) {
            sessionPanel.classList.add("hidden");
            sessionPanel.innerHTML = "";
            return;
        }

        sessionPanel.classList.remove("hidden");
        sessionPanel.innerHTML = `
            <div class="session-banner__content">
                <div>
                    <p class="eyebrow">signed in</p>
                    <strong>${escapeHtml(current.displayName)}</strong>
                    <p class="muted">Аккаунт активен. Всё основное теперь в правом верхнем углу: settings, профиль и logout.</p>
                </div>
                <div class="button-row">
                    <a class="button button--success" href="${getRootPath("settings/")}">Open settings</a>
                    <a class="button button--ghost" href="${profileUrl(current.username)}">Open profile</a>
                </div>
            </div>
        `;
    };

    const renderHeaderAuth = () => {
        if (!mainHeaderAuth) {
            return;
        }

        if (current) {
            mainHeaderAuth.innerHTML = `
                <div class="main-header-auth__group">
                    <a class="button button--success button--compact" href="${getRootPath("settings/")}">Settings</a>
                    <a class="button button--ghost button--compact" href="${profileUrl(current.username)}">Profile</a>
                    <button class="button button--danger button--compact" type="button" id="mainHeaderLogout">Logout</button>
                </div>
            `;

            document.getElementById("mainHeaderLogout")?.addEventListener("click", async () => {
                try {
                    await apiFetch("api/auth/logout", {
                        method: "POST",
                    });
                } catch (error) {
                    // Ignore logout API errors and clear client state anyway.
                }

                clearSession();
                window.location.reload();
            });
            closeAuthPanel();
            return;
        }

        mainHeaderAuth.innerHTML = `
            <div class="main-header-auth__group">
                <button class="button button--ghost button--compact" type="button" data-open-auth="register">Register</button>
                <button class="button button--primary button--compact" type="button" data-open-auth="login">Login</button>
            </div>
        `;

        mainHeaderAuth.querySelectorAll("[data-open-auth]").forEach((button) => {
            button.addEventListener("click", () => {
                openAuthPanel(button.dataset.openAuth || "register");
            });
        });
    };

    renderSessionPanel();
    renderHeaderAuth();
    setAuthMode("register");

    authModeButtons.forEach((button) => {
        button.addEventListener("click", () => {
            setAuthMode(button.dataset.authMode || "register");
        });
    });

    authPanelClose?.addEventListener("click", () => {
        closeAuthPanel();
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeAuthPanel();
        }
    });

    document.addEventListener("click", (event) => {
        if (
            !authPanel ||
            authPanel.classList.contains("hidden") ||
            authPanel.contains(event.target) ||
            mainHeaderAuth?.contains(event.target)
        ) {
            return;
        }

        closeAuthPanel();
    });

    registerForm?.addEventListener("submit", async (event) => {
        event.preventDefault();

        const formData = new FormData(registerForm);
        const username = slugify(formData.get("register_username"));
        const displayName = String(formData.get("register_display_name") || "").trim() || username;
        const password = String(formData.get("register_password") || "");

        if (!username || password.length < 6) {
            showMessage(mainMessage, "Нужен username и пароль хотя бы из 6 символов.", "error");
            return;
        }

        try {
            const payload = await apiFetch("api/auth/register", {
                method: "POST",
                body: {
                    username,
                    displayName,
                    password,
                },
            });

            setSessionState(payload.account || null);
            setLatestProfilesState(payload.latestProfiles || []);
            APP_STATE.profilesCount = Number(payload.profilesCount || APP_STATE.profilesCount || 0);
            current = getCurrentAccount();
            renderCommunityGrid(communityGrid, APP_STATE.latestProfiles);
            if (mainProfileCount) {
                mainProfileCount.textContent = String(APP_STATE.profilesCount || 0);
            }
            renderSessionPanel();
            renderHeaderAuth();
            hydrateHeader();
            closeAuthPanel();

            showMessage(mainMessage, "Аккаунт создан. Перенаправляю тебя в settings.", "success");
            setTimeout(() => {
                window.location.href = getRootPath("settings/");
            }, 700);
        } catch (error) {
            showMessage(mainMessage, error.message || "Не удалось создать аккаунт.", "error");
        }
    });

    loginForm?.addEventListener("submit", async (event) => {
        event.preventDefault();

        const formData = new FormData(loginForm);
        const username = slugify(formData.get("login_username"));
        const password = String(formData.get("login_password") || "");

        try {
            const payload = await apiFetch("api/auth/login", {
                method: "POST",
                body: {
                    username,
                    password,
                },
            });

            setSessionState(payload.account || null);
            setLatestProfilesState(payload.latestProfiles || []);
            APP_STATE.profilesCount = Number(payload.profilesCount || APP_STATE.profilesCount || 0);
            current = getCurrentAccount();
            renderCommunityGrid(communityGrid, APP_STATE.latestProfiles);
            if (mainProfileCount) {
                mainProfileCount.textContent = String(APP_STATE.profilesCount || 0);
            }
            renderSessionPanel();
            renderHeaderAuth();
            hydrateHeader();
            closeAuthPanel();
            showMessage(mainMessage, "Вход выполнен. Перехожу в settings.", "success");
            setTimeout(() => {
                window.location.href = getRootPath("settings/");
            }, 600);
        } catch (error) {
            showMessage(mainMessage, error.message || "Неверный username или пароль.", "error");
        }
    });
}

function fillSettingsForm(profile) {
    const entries = {
        profileUsername: profile.username,
        profileDisplayName: profile.displayName,
        profileAliases: profile.aliases.join(", "),
        profileLocation: profile.location,
        profileStatusLine: profile.statusLine,
        profileDescription: profile.description,
        profileEmbedTitle: profile.embedTitle,
        extraWebsite: profile.website,
        extraDiscord: profile.discord,
        extraLinks: serializeLinks(profile.links),
        extraTags: profile.tags.join(", "),
        extraBadges: profile.badges.join(", "),
        extraTrackTitle: profile.trackTitle,
        extraTrackArtist: profile.trackArtist,
        extraTrackUrl: profile.trackUrl,
        themeLayout: profile.theme.layout,
        themeAlignment: profile.theme.alignment,
        themePrimary: profile.theme.primary,
        themeSecondary: profile.theme.secondary,
        themeText: profile.theme.text,
        themeBackground: profile.theme.background,
        themeCardColor: profile.theme.cardColor,
        themeCardOpacity: profile.theme.cardOpacity,
        themeRadius: profile.theme.radius,
        themeBlur: profile.theme.blur,
        themeShadowOpacity: profile.theme.shadowOpacity,
        themeBorderColor: profile.theme.borderColor,
        themeBorderWidth: profile.theme.borderWidth,
        themeBorderStyle: profile.theme.borderStyle,
        themeOverlay: profile.theme.overlay,
        themeAvatarRadius: profile.theme.avatarRadius,
        themeFont: profile.theme.font,
        themePageTitleAnimation: profile.theme.pageTitleAnimation,
        themePageTitleSpeed: profile.theme.pageTitleSpeed,
        themeRevealText: profile.theme.revealText,
        themeRevealBlur: profile.theme.revealBlur,
        optionViewsPosition: profile.options.viewsPosition,
    };

    Object.entries(entries).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) {
            element.value = value;
        }
    });

    setSourceFieldValue("profileAvatarUrl", profile.avatarUrl, "Uploaded avatar file");
    setSourceFieldValue("profileBannerUrl", profile.bannerUrl, "Uploaded banner media");
    setSourceFieldValue("profileBackgroundUrl", profile.backgroundUrl, "Uploaded background media");

    const toggles = {
        optionShowTheme: profile.options.showTheme,
        optionShowViews: profile.options.showViews,
        optionShowUid: profile.options.showUid,
        optionShowDiscord: profile.options.showDiscord,
        optionShowJoinDate: profile.options.showJoinDate,
        optionRevealScreen: profile.options.revealScreen,
        optionWatermark: profile.options.watermark,
        optionShowLocation: profile.options.showLocation,
        themeRevealTextEnabled: profile.theme.revealTextEnabled,
        themeUsernameSparkles: profile.theme.usernameSparkles,
        themeCursorTrail: profile.theme.cursorTrail,
    };

    Object.entries(toggles).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) {
            element.checked = Boolean(value);
        }
    });
}

function readSettingsForm(current) {
    return normalizeProfile({
        ...current,
        username: document.getElementById("profileUsername")?.value,
        displayName: document.getElementById("profileDisplayName")?.value.trim(),
        aliases: parseList(document.getElementById("profileAliases")?.value),
        location: document.getElementById("profileLocation")?.value.trim(),
        statusLine: document.getElementById("profileStatusLine")?.value.trim(),
        avatarUrl: readSourceFieldValue("profileAvatarUrl"),
        bannerUrl: readSourceFieldValue("profileBannerUrl"),
        backgroundUrl: readSourceFieldValue("profileBackgroundUrl"),
        description: document.getElementById("profileDescription")?.value,
        embedTitle: document.getElementById("profileEmbedTitle")?.value.trim(),
        website: document.getElementById("extraWebsite")?.value.trim(),
        discord: document.getElementById("extraDiscord")?.value.trim(),
        links: parseLinks(document.getElementById("extraLinks")?.value),
        tags: parseList(document.getElementById("extraTags")?.value),
        badges: parseList(document.getElementById("extraBadges")?.value),
        trackTitle: document.getElementById("extraTrackTitle")?.value.trim(),
        trackArtist: document.getElementById("extraTrackArtist")?.value.trim(),
        trackUrl: document.getElementById("extraTrackUrl")?.value.trim(),
        theme: {
            layout: document.getElementById("themeLayout")?.value,
            alignment: document.getElementById("themeAlignment")?.value,
            primary: document.getElementById("themePrimary")?.value,
            secondary: document.getElementById("themeSecondary")?.value,
            text: document.getElementById("themeText")?.value,
            background: document.getElementById("themeBackground")?.value,
            cardColor: document.getElementById("themeCardColor")?.value,
            cardOpacity: Number(document.getElementById("themeCardOpacity")?.value || 80),
            radius: Number(document.getElementById("themeRadius")?.value || 28),
            blur: Number(document.getElementById("themeBlur")?.value || 18),
            shadowOpacity: Number(document.getElementById("themeShadowOpacity")?.value || 40),
            borderColor: document.getElementById("themeBorderColor")?.value,
            borderWidth: Number(document.getElementById("themeBorderWidth")?.value || 1),
            borderStyle: document.getElementById("themeBorderStyle")?.value,
            overlay: Number(document.getElementById("themeOverlay")?.value || 48),
            avatarRadius: Number(document.getElementById("themeAvatarRadius")?.value || 24),
            font: document.getElementById("themeFont")?.value,
            pageTitleAnimation: document.getElementById("themePageTitleAnimation")?.value,
            pageTitleSpeed: Number(document.getElementById("themePageTitleSpeed")?.value || 220),
            revealTextEnabled: document.getElementById("themeRevealTextEnabled")?.checked,
            revealText: document.getElementById("themeRevealText")?.value.trim(),
            revealBlur: Number(document.getElementById("themeRevealBlur")?.value || 18),
            usernameSparkles: document.getElementById("themeUsernameSparkles")?.checked,
            cursorTrail: document.getElementById("themeCursorTrail")?.checked,
        },
        options: {
            showTheme: document.getElementById("optionShowTheme")?.checked,
            showViews: document.getElementById("optionShowViews")?.checked,
            viewsPosition: document.getElementById("optionViewsPosition")?.value,
            showUid: document.getElementById("optionShowUid")?.checked,
            showDiscord: document.getElementById("optionShowDiscord")?.checked,
            showJoinDate: document.getElementById("optionShowJoinDate")?.checked,
            revealScreen: document.getElementById("optionRevealScreen")?.checked,
            watermark: document.getElementById("optionWatermark")?.checked,
            showLocation: document.getElementById("optionShowLocation")?.checked,
        },
    });
}

function updateSettingsSummary(profile) {
    const sidebarAvatar = document.getElementById("sidebarAvatar");
    const sidebarHandle = document.getElementById("sidebarHandle");
    const sidebarName = document.getElementById("sidebarName");
    const sidebarStatus = document.getElementById("sidebarStatus");
    const sidebarPublicUrl = document.getElementById("sidebarPublicUrl");
    const openProfileBtn = document.getElementById("openProfileBtn");
    const dashUid = document.getElementById("dashUid");
    const dashUsername = document.getElementById("dashUsername");
    const dashViews = document.getElementById("dashViews");
    const dashJoin = document.getElementById("dashJoin");
    const dashLastSaved = document.getElementById("dashLastSaved");

    if (sidebarAvatar) {
        sidebarAvatar.src = profile.avatarUrl;
    }

    if (sidebarHandle) {
        sidebarHandle.textContent = `/${profile.username}`;
    }

    if (sidebarName) {
        sidebarName.textContent = profile.displayName;
    }

    if (sidebarStatus) {
        sidebarStatus.textContent = profile.statusLine;
    }

    if (sidebarPublicUrl) {
        sidebarPublicUrl.textContent = profileUrl(profile.username);
    }

    if (openProfileBtn) {
        openProfileBtn.href = profileUrl(profile.username);
    }

    if (dashUid) {
        dashUid.textContent = profile.uid;
    }

    if (dashUsername) {
        dashUsername.textContent = profile.username;
    }

    if (dashViews) {
        dashViews.textContent = String(profile.views);
    }

    if (dashJoin) {
        dashJoin.textContent = formatDate(profile.createdAt);
    }

    if (dashLastSaved) {
        dashLastSaved.textContent = `saved ${formatDate(profile.lastSavedAt || profile.createdAt)}`;
    }

    renderWeeklyBars(document.getElementById("weeklyBars"), profile.weeklyViews);
}

async function initSettingsPage() {
    const gate = document.getElementById("settingsGate");
    const app = document.getElementById("settingsApp");
    const settingsMessage = document.getElementById("settingsMessage");
    const saveAllBtn = document.getElementById("saveAllBtn");
    const resetAllBtn = document.getElementById("resetAllBtn");
    const copyProfileBtn = document.getElementById("copyProfileBtn");
    const logoutBtn = document.getElementById("logoutBtn");
    const previewMount = document.getElementById("previewMount");
    const trackTitleInput = document.getElementById("extraTrackTitle");
    const trackArtistInput = document.getElementById("extraTrackArtist");
    const trackUrlInput = document.getElementById("extraTrackUrl");
    const pageTitleAnimationInput = document.getElementById("themePageTitleAnimation");
    const pageTitleSpeedInput = document.getElementById("themePageTitleSpeed");
    const revealTextInput = document.getElementById("themeRevealText");
    const revealTextEnabledInput = document.getElementById("themeRevealTextEnabled");

    let current = null;

    try {
        current = await fetchCurrentProfileFromApi();
        hydrateHeader();
    } catch (error) {
        current = null;
    }

    if (!current) {
        gate?.classList.remove("hidden");
        app?.classList.add("hidden");
        return;
    }

    gate?.classList.add("hidden");
    app?.classList.remove("hidden");

    const tabButtons = Array.from(app?.querySelectorAll("[data-settings-tab-target]") || []);
    const tabPanels = Array.from(app?.querySelectorAll("[data-settings-tab-panel]") || []);
    const availableTabs = new Set(tabPanels.map((panel) => panel.dataset.settingsTabPanel).filter(Boolean));

    const persistSettingsTab = (tabId) => {
        try {
            localStorage.setItem(SETTINGS_TAB_STORAGE_KEY, tabId);
        } catch (error) {
            // Ignore storage issues for UI-only state.
        }
    };

    const readInitialSettingsTab = () => {
        const hashTab = window.location.hash.replace(/^#/, "");
        if (availableTabs.has(hashTab)) {
            return hashTab;
        }

        try {
            const storedTab = localStorage.getItem(SETTINGS_TAB_STORAGE_KEY) || "";
            if (availableTabs.has(storedTab)) {
                return storedTab;
            }
        } catch (error) {
            // Ignore storage issues and fall through to the default tab.
        }

        return tabPanels[0]?.dataset.settingsTabPanel || "dashboard";
    };

    const activateSettingsTab = (tabId, { persist = true } = {}) => {
        if (!availableTabs.has(tabId)) {
            return;
        }

        tabButtons.forEach((button) => {
            const isActive = button.dataset.settingsTabTarget === tabId;
            button.classList.toggle("is-active", isActive);
            button.setAttribute("aria-selected", isActive ? "true" : "false");
            button.tabIndex = isActive ? 0 : -1;
        });

        tabPanels.forEach((panel) => {
            panel.hidden = panel.dataset.settingsTabPanel !== tabId;
        });

        if (persist) {
            persistSettingsTab(tabId);
        }

        if (window.location.hash !== `#${tabId}`) {
            history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${tabId}`);
        }
    };

    tabButtons.forEach((button, index) => {
        button.addEventListener("click", () => {
            activateSettingsTab(button.dataset.settingsTabTarget || "dashboard");
        });

        button.addEventListener("keydown", (event) => {
            if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
                return;
            }

            event.preventDefault();
            const delta = event.key === "ArrowRight" ? 1 : -1;
            const nextIndex = (index + delta + tabButtons.length) % tabButtons.length;
            const nextButton = tabButtons[nextIndex];
            nextButton?.focus();
            activateSettingsTab(nextButton?.dataset.settingsTabTarget || "dashboard");
        });
    });

    activateSettingsTab(readInitialSettingsTab(), { persist: false });

    const syncRevealTextFieldState = () => {
        if (!revealTextInput) {
            return;
        }

        const enabled = revealTextEnabledInput?.checked !== false;
        revealTextInput.disabled = !enabled;
    };

    const syncPageTitleAnimationFieldState = () => {
        if (!pageTitleSpeedInput) {
            return;
        }

        const enabled = (pageTitleAnimationInput?.value || "none") !== "none";
        pageTitleSpeedInput.disabled = !enabled;
    };

    const mediaPreviewConfigs = [
        {
            fileInputId: "profileAvatarFile",
            sourceFieldId: "profileAvatarUrl",
            previewId: "profileAvatarPreview",
            label: "Аватар",
            maxSizeMb: 2,
        },
        {
            fileInputId: "profileBannerFile",
            sourceFieldId: "profileBannerUrl",
            previewId: "profileBannerPreview",
            label: "Баннер",
            maxSizeMb: 3,
        },
        {
            fileInputId: "profileBackgroundFile",
            sourceFieldId: "profileBackgroundUrl",
            previewId: "profileBackgroundPreview",
            label: "Фон",
            maxSizeMb: 3,
        },
    ];

    const getMediaPreviewKind = (media) => {
        if (media.type === "youtube") {
            return "YouTube";
        }

        if (media.type === "video") {
            return "Video";
        }

        if (media.type === "image") {
            return "Image";
        }

        return "Media";
    };

    const getMediaPreviewTitle = (sourceField, media, label) => {
        if (sourceField.dataset.mode === "file") {
            return sourceField.dataset.uploadLabel || `Uploaded ${label.toLowerCase()}`;
        }

        if (media.type === "youtube") {
            return "YouTube preview";
        }

        try {
            const url = new URL(media.source);
            const filename = decodeURIComponent(url.pathname.split("/").pop() || "").trim();
            return filename || url.hostname.replace(/^www\./, "");
        } catch (error) {
            return media.source;
        }
    };

    const getMediaPreviewSubtitle = (sourceField, media) => {
        if (sourceField.dataset.mode === "file") {
            return "Loaded from file";
        }

        if (media.type === "youtube") {
            return "youtube.com";
        }

        try {
            return new URL(media.source).hostname.replace(/^www\./, "");
        } catch (error) {
            return "Direct source";
        }
    };

    const buildMediaPreviewThumb = (media, title) => {
        if (media.type === "youtube") {
            return `
                <div class="upload-preview__thumb">
                    <img src="${escapeHtml(getYouTubeThumbnailUrl(media.youtubeId))}" alt="${escapeHtml(title)}">
                    <span class="upload-preview__thumb-badge">YT</span>
                </div>
            `;
        }

        if (media.type === "video") {
            return `
                <div class="upload-preview__thumb">
                    <video src="${escapeHtml(media.source)}" muted loop playsinline preload="metadata" aria-hidden="true"></video>
                    <span class="upload-preview__thumb-badge">VID</span>
                </div>
            `;
        }

        return `
            <div class="upload-preview__thumb">
                <img src="${escapeHtml(media.source)}" alt="${escapeHtml(title)}">
            </div>
        `;
    };

    const refreshMediaPreviewCard = ({ fileInputId, sourceFieldId, previewId, label }) => {
        const preview = document.getElementById(previewId);
        const sourceField = document.getElementById(sourceFieldId);
        const fileInput = document.getElementById(fileInputId);

        if (!preview || !sourceField) {
            return;
        }

        const source = readSourceFieldValue(sourceFieldId);
        if (!source) {
            preview.hidden = true;
            preview.innerHTML = "";
            return;
        }

        const media = getMediaSourceInfo(source);
        const title = getMediaPreviewTitle(sourceField, media, label);
        const subtitle = getMediaPreviewSubtitle(sourceField, media);
        const originLabel = sourceField.dataset.mode === "file" ? "File" : "URL";

        preview.hidden = false;
        preview.innerHTML = `
            ${buildMediaPreviewThumb(media, title)}
            <div class="upload-preview__copy">
                <div class="upload-preview__meta">
                    <span class="upload-preview__pill">${escapeHtml(getMediaPreviewKind(media))}</span>
                    <span class="upload-preview__pill upload-preview__pill--muted">${escapeHtml(originLabel)}</span>
                </div>
                <strong class="upload-preview__title">${escapeHtml(title)}</strong>
                <span class="upload-preview__subtitle">${escapeHtml(subtitle)}</span>
            </div>
            <button class="upload-preview__clear" type="button" data-clear-media>Delete</button>
        `;

        preview.querySelector("[data-clear-media]")?.addEventListener("click", (event) => {
            event.preventDefault();
            clearSourceFieldValue(sourceFieldId);
            if (fileInput) {
                fileInput.value = "";
            }
            refreshMediaPreviewCard({ fileInputId, sourceFieldId, previewId, label });
            syncPreview();
            showMessage(settingsMessage, `${label} удален.`, "info");
        });

        preview.querySelector("video")?.play().catch(() => {
            // Ignore autoplay restrictions in the tiny preview.
        });
    };

    const refreshAllMediaPreviewCards = () => {
        mediaPreviewConfigs.forEach(refreshMediaPreviewCard);
    };

    const syncPreview = () => {
        try {
            const draft = readSettingsForm(current);
            renderPublicProfile(previewMount, draft, { preview: true });
            updateSettingsSummary(draft);
        } catch (error) {
            // Ignore noisy preview errors until the final save action.
        }
    };

    let trackMetaTimer = 0;
    let trackMetaRequestId = 0;

    const setTrackMetaFields = (metadata) => {
        if (trackTitleInput) {
            trackTitleInput.value = metadata.title || "";
        }

        if (trackArtistInput) {
            trackArtistInput.value = metadata.artist || "";
        }
    };

    const syncTrackMetadata = async ({ force = false } = {}) => {
        if (!trackUrlInput || !trackTitleInput || !trackArtistInput) {
            return { title: "", artist: "" };
        }

        const trackUrl = trackUrlInput.value.trim();

        if (!trackUrl) {
            setTrackMetaFields({ title: "", artist: "" });
            delete trackUrlInput.dataset.metaUrl;
            syncPreview();
            return { title: "", artist: "" };
        }

        if (
            !force &&
            trackUrlInput.dataset.metaUrl === trackUrl &&
            (trackTitleInput.value.trim() || trackArtistInput.value.trim())
        ) {
            return {
                title: trackTitleInput.value.trim(),
                artist: trackArtistInput.value.trim(),
            };
        }

        const requestId = String(++trackMetaRequestId);
        trackUrlInput.dataset.metaRequestId = requestId;

        const metadata = await fetchTrackMetadata(trackUrl);

        if (trackUrlInput.dataset.metaRequestId !== requestId) {
            return metadata;
        }

        setTrackMetaFields(metadata);
        trackUrlInput.dataset.metaUrl = trackUrl;
        syncPreview();
        return metadata;
    };

    const queueTrackMetadataSync = (delay = 320) => {
        window.clearTimeout(trackMetaTimer);
        trackMetaTimer = window.setTimeout(() => {
            void syncTrackMetadata();
        }, delay);
    };

    const bindUploadInput = ({ fileInputId, sourceFieldId, previewId, label, maxSizeMb }) => {
        const input = document.getElementById(fileInputId);
        const sourceField = document.getElementById(sourceFieldId);

        if (!input || !sourceField) {
            return;
        }

        sourceField.addEventListener("input", () => {
            clearSourceFieldUploadState(sourceField);
            refreshMediaPreviewCard({ fileInputId, sourceFieldId, previewId, label });
        });

        sourceField.addEventListener("change", () => {
            refreshMediaPreviewCard({ fileInputId, sourceFieldId, previewId, label });
        });

        input.addEventListener("change", async () => {
            const file = input.files?.[0];
            if (!file) {
                return;
            }

            if (file.size > maxSizeMb * 1024 * 1024) {
                showMessage(
                    settingsMessage,
                    `${label}: файл слишком большой для локального хранения. Для больших видео лучше использовать прямую ссылку или YouTube.`,
                    "error"
                );
                input.value = "";
                return;
            }

            try {
                const dataUrl = await readFileAsDataUrl(file);
                setSourceFieldValue(sourceFieldId, dataUrl, file.name);
                refreshMediaPreviewCard({ fileInputId, sourceFieldId, previewId, label });
                syncPreview();
                showMessage(settingsMessage, `${label} загружен из файла.`, "success");
            } catch (error) {
                showMessage(settingsMessage, `${label}: не удалось прочитать файл.`, "error");
            } finally {
                input.value = "";
            }
        });
    };

    fillSettingsForm(current);
    syncPageTitleAnimationFieldState();
    syncRevealTextFieldState();
    refreshAllMediaPreviewCards();
    updateSettingsSummary(current);
    renderPublicProfile(previewMount, current, { preview: true });
    void syncTrackMetadata({ force: true });

    mediaPreviewConfigs.forEach(bindUploadInput);

    trackUrlInput?.addEventListener("input", () => {
        delete trackUrlInput.dataset.metaUrl;
        queueTrackMetadataSync();
    });
    trackUrlInput?.addEventListener("change", () => {
        delete trackUrlInput.dataset.metaUrl;
        queueTrackMetadataSync(0);
    });
    trackUrlInput?.addEventListener("blur", () => {
        delete trackUrlInput.dataset.metaUrl;
        queueTrackMetadataSync(0);
    });

    revealTextEnabledInput?.addEventListener("change", () => {
        syncRevealTextFieldState();
        syncPreview();
    });

    pageTitleAnimationInput?.addEventListener("change", () => {
        syncPageTitleAnimationFieldState();
        syncPreview();
    });

    app?.addEventListener("input", syncPreview);
    app?.addEventListener("change", syncPreview);

    saveAllBtn?.addEventListener("click", async () => {
        try {
            await syncTrackMetadata({ force: true });
            const draft = readSettingsForm(current);
            current = await saveCurrentProfile(draft);
            fillSettingsForm(current);
            syncPageTitleAnimationFieldState();
            syncRevealTextFieldState();
            refreshAllMediaPreviewCards();
            updateSettingsSummary(current);
            renderPublicProfile(previewMount, current, { preview: true });
            showMessage(settingsMessage, "Профиль сохранен. Публичная страница уже обновилась.", "success");
            hydrateHeader();
        } catch (error) {
            showMessage(settingsMessage, error.message || "Не удалось сохранить профиль.", "error");
        }
    });

    resetAllBtn?.addEventListener("click", async () => {
        current = await resetCurrentProfile();
        if (!current) {
            return;
        }

        fillSettingsForm(current);
        syncPageTitleAnimationFieldState();
        syncRevealTextFieldState();
        refreshAllMediaPreviewCards();
        updateSettingsSummary(current);
        renderPublicProfile(previewMount, current, { preview: true });
        void syncTrackMetadata({ force: true });
        showMessage(settingsMessage, "Профиль сброшен к дефолтной схеме.", "info");
    });

    copyProfileBtn?.addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(profileUrl(current.username));
            showMessage(settingsMessage, "Ссылка на профиль скопирована.", "success");
        } catch (error) {
            showMessage(settingsMessage, "Не удалось скопировать ссылку.", "error");
        }
    });

    logoutBtn?.addEventListener("click", async () => {
        try {
            await apiFetch("api/auth/logout", {
                method: "POST",
            });
        } catch (error) {
            // Ignore logout API errors and still redirect to the public landing.
        }

        clearSession();
        window.location.href = getRootPath("main/");
    });
}

async function initProfilePage() {
    const mount = document.getElementById("profileMount");
    const profileMessage = document.getElementById("profileMessage");
    const params = new URLSearchParams(window.location.search);
    const username = slugify(params.get("u") || getSession() || "");
    const session = slugify(getSession() || "");
    const isOwnerView = Boolean(session) && session === username;

    if (!isOwnerView) {
        document.body.classList.add("profile-visitor-mode");
    }

    if (!username) {
        showMessage(profileMessage, "Укажи username через ?u=name или войди в аккаунт.", "error");
        mount.innerHTML = `<div class="empty-state">Без username страница профиля не знает, кого рендерить.</div>`;
        return;
    }

    try {
        const profile = await incrementProfileView(username);
        profileMessage?.classList.add("hidden");
        renderPublicProfile(mount, profile);
        applyProfilePageTitle(profile);
    } catch (error) {
        showMessage(profileMessage, error.message || `Профиль /${username} не найден.`, "error");
        mount.innerHTML = `<div class="empty-state">Такого профиля пока нет. Создай его через settings.</div>`;
    }
}

async function bootstrap() {
    const page = document.body.dataset.page;

    try {
        await loadBootstrapState();
    } catch (error) {
        console.error(error);
    }

    hydrateHeader();

    if (page === "home") {
        initHomePage();
    }

    if (page === "main") {
        initMainPage();
    }

    if (page === "settings") {
        await initSettingsPage();
    }

    if (page === "markdown") {
        initMarkdownPage();
    }

    if (page === "profile") {
        await initProfilePage();
    }
}

void bootstrap();
