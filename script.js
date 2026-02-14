document.addEventListener('DOMContentLoaded', function() {

    // --- Animação de Scroll com IntersectionObserver (ALTA PERFORMANCE) ---
    const fadeInElements = document.querySelectorAll('.fade-in');

    const observerOptions = {
        root: null, // observa em relação à viewport
        rootMargin: '0px',
        threshold: 0.1 // aciona quando 10% do elemento está visível
    };

    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                // Para de observar o elemento uma vez que ele já apareceu
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Observa cada um dos elementos
    fadeInElements.forEach(el => {
        observer.observe(el);
    });

    // --- (OPCIONAL) Lógica do Header que encolhe ao rolar a tela ---
    const header = document.querySelector('header');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            header.style.padding = '0.5rem 0';
        } else {
            header.style.padding = '1rem 0';
        }
    });

    // A lógica de Modal e Carrossel pode ser adicionada aqui se necessário.
    // Pelo novo layout focado em grids, os carrosséis foram removidos para uma
    // experiência mais leve e direta, mas o código pode ser inserido aqui
    // caso você queira mantê-los.

});
