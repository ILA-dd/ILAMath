// Home page interactions
const menuBtn = document.getElementById("menuBtn");
const mobileMenu = document.getElementById("mobileMenu");
const mobileLinks = mobileMenu.querySelectorAll("a");

menuBtn.addEventListener("click", () => {
    const isOpen = mobileMenu.style.display === "block";
    mobileMenu.style.display = isOpen ? "none" : "block";
    menuBtn.setAttribute("aria-expanded", String(!isOpen));
});

mobileLinks.forEach((link) => {
    link.addEventListener("click", () => {
        mobileMenu.style.display = "none";
        menuBtn.setAttribute("aria-expanded", "false");
    });
});

const revealCards = document.querySelectorAll(".reveal-card");
const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
        if (entry.isIntersecting) {
            entry.target.classList.add("show");
            observer.unobserve(entry.target);
        }
    });
}, { threshold: 0.14 });

revealCards.forEach((card, index) => {
    card.style.transitionDelay = `${Math.min(index * 35, 220)}ms`;
    observer.observe(card);
});

const topbarWrap = document.querySelector(".topbar-wrap");
const pageHashLinks = document.querySelectorAll('a[href^="#"]');

const getAnchorOffset = () => {
    const topbarHeight = topbarWrap ? topbarWrap.offsetHeight : 0;
    return Math.max(0, topbarHeight - 18);
};

const scrollToHashTarget = (hash, behavior) => {
    if (!hash || hash === "#") {
        return false;
    }

    const target = document.querySelector(hash);
    if (!target) {
        return false;
    }

    const targetTop = target.getBoundingClientRect().top + window.scrollY;
    const scrollTop = Math.max(0, targetTop - getAnchorOffset());

    window.scrollTo({
        top: scrollTop,
        behavior
    });

    return true;
};

pageHashLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
        const hash = link.getAttribute("href");
        if (!scrollToHashTarget(hash, "smooth")) {
            return;
        }

        event.preventDefault();
        history.replaceState(null, "", hash);
    });
});

window.addEventListener("load", () => {
    if (!window.location.hash) {
        return;
    }

    requestAnimationFrame(() => {
        scrollToHashTarget(window.location.hash, "auto");
    });
});

document.getElementById("year").textContent = String(new Date().getFullYear());

