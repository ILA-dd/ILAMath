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

const topbar = document.querySelector(".topbar");
const highlightsLinks = document.querySelectorAll('a[href="#highlights"]');

highlightsLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
        const target = document.getElementById("highlights");
        if (!target) {
            return;
        }

        event.preventDefault();
        const topbarHeight = topbar ? topbar.offsetHeight : 0;
        const offset = Math.max(0, topbarHeight - 22);
        const targetTop = target.getBoundingClientRect().top + window.scrollY;

        window.scrollTo({
            top: Math.max(0, targetTop - offset),
            behavior: "smooth"
        });

        history.replaceState(null, "", "#highlights");
    });
});

document.getElementById("year").textContent = String(new Date().getFullYear());

