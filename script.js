/**
 * ILAMath - Unified Site JavaScript
 */

// Мобильное меню
function toggleMenu() {
    const navLinks = document.getElementById('navLinks');
    const spans = document.querySelectorAll('.hamburger span');

    if (navLinks) {
        navLinks.classList.toggle('active');

        if (navLinks.classList.contains('active')) {
            if (spans[0]) spans[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
            if (spans[1]) spans[1].style.opacity = '0';
            if (spans[2]) spans[2].style.transform = 'rotate(-45deg) translate(5px, -5px)';
        } else {
            if (spans[0]) spans[0].style.transform = 'none';
            if (spans[1]) spans[1].style.opacity = '1';
            if (spans[2]) spans[2].style.transform = 'none';
        }
    }
}

// Переключение темы отключено: используем единый стиль тем
function toggleTheme() {
    return;
}

// Инициализация при загрузке
window.addEventListener('DOMContentLoaded', () => {
    const yearElement = document.getElementById('year');

    // Принудительно единый тёмный стиль для всех страниц тем.
    document.body.classList.remove('light-theme');
    localStorage.removeItem('theme');

    if (yearElement) {
        yearElement.textContent = String(new Date().getFullYear());
    }
});
