document.addEventListener('DOMContentLoaded', function() {

    // Função para Carrossel Genérico
    function setupCarousel(containerSelector, carouselSelector, arrowLeftSelector, arrowRightSelector) {
        const container = document.querySelector(containerSelector);
        const carousel = document.querySelector(carouselSelector);
        const arrowLeft = document.querySelector(arrowLeftSelector);
        const arrowRight = document.querySelector(arrowRightSelector);

        if (!carousel || !arrowLeft || !arrowRight) return;

        arrowLeft.addEventListener('click', () => {
            const itemWidth = carousel.querySelector(':first-child').offsetWidth;
            carousel.scrollLeft -= itemWidth + 30; // 30 é o gap
        });

        arrowRight.addEventListener('click', () => {
            const itemWidth = carousel.querySelector(':first-child').offsetWidth;
            carousel.scrollLeft += itemWidth + 30; // 30 é o gap
        });
    }

    // Inicializa os Carrosséis
    setupCarousel('.services-carousel-container', '.services-carousel', '.services-carousel-container .left', '.services-carousel-container .right');
    setupCarousel('.testimonials-carousel-container', '.testimonials-carousel', '.testimonials-carousel-container .left', '.testimonials-carousel-container .right');

    // --- Lógica do Modal de Serviços ---
    const modal = document.getElementById('serviceModal');
    const modalTitle = document.getElementById('modal-service-title');
    const modalDescription = document.getElementById('modal-service-description');
    const modalGallery = document.getElementById('modal-service-gallery');
    const closeButton = document.querySelector('.close-button');
    const detailButtons = document.querySelectorAll('.btn-detalhes');

    // Dados dos serviços (pode ser expandido)
    const servicesData = {
        cabelos: {
            title: 'Cabelos: Cortes, Cores e Tratamentos',
            description: 'Nossos especialistas em cabelo utilizam técnicas avançadas para criar o visual perfeito para você. De cortes modernos a colorações vibrantes e tratamentos de reconstrução capilar, garantimos um resultado deslumbrante e saudável.',
            images: [
                'https://images.pexels.com/photos/1642823/pexels-photo-1642823.jpeg',
                'https://images.pexels.com/photos/3993449/pexels-photo-3993449.jpeg',
                'https://images.pexels.com/photos/3993442/pexels-photo-3993442.jpeg'
            ]
        },
        unhas: {
            title: 'Unhas: Nail Art e Cuidados',
            description: 'Oferecemos serviços completos de manicure e pedicure, incluindo alongamentos em gel e fibra de vidro, além de designs de nail art exclusivos. Utilizamos produtos de alta qualidade para garantir unhas bonitas e saudáveis por mais tempo.',
            images: [
                'https://images.pexels.com/photos/8534241/pexels-photo-8534241.jpeg',
                'https://images.pexels.com/photos/3997394/pexels-photo-3997394.jpeg',
                'https://images.pexels.com/photos/7043323/pexels-photo-7033323.jpeg'
            ]
        },
        pele: {
            title: 'Tratamentos de Pele',
            description: 'Cuide da sua pele com nossos tratamentos faciais personalizados. Oferecemos limpeza de pele profunda, hidratação, peeling de diamante e tratamentos rejuvenescedores para uma pele radiante e saudável.',
            images: [
                'https://images.pexels.com/photos/4041392/pexels-photo-4041392.jpeg',
                'https://images.pexels.com/photos/3738362/pexels-photo-3738362.jpeg'
            ]
        },
        sobrancelhas: {
            title: 'Design de Sobrancelhas',
            description: 'Realce seu olhar com nossos serviços de design de sobrancelhas, micropigmentação fio a fio e brow lamination. Nossas especialistas criam o formato ideal para harmonizar com seu rosto.',
             images: [
                'https://images.pexels.com/photos/4127521/pexels-photo-4127521.jpeg',
                'https://images.pexels.com/photos/7045722/pexels-photo-7045722.jpeg'
            ]
        },
        massagem: {
            title: 'Massagens Relaxantes e Terapêuticas',
            description: 'Relaxe e renove suas energias com nossas massagens. Oferecemos opções como massagem relaxante, modeladora e drenagem linfática, realizadas em um ambiente tranquilo e acolhedor.',
             images: [
                'https://images.pexels.com/photos/4389666/pexels-photo-4389666.jpeg',
                'https://images.pexels.com/photos/7679450/pexels-photo-7679450.jpeg'
            ]
        },
        make: {
            title: 'Maquiagem Profissional',
            description: 'Para festas, eventos ou para o dia a dia, nossa equipe de maquiadores cria looks incríveis que valorizam sua beleza natural. Utilizamos produtos de marcas renomadas para garantir um acabamento perfeito e duradouro.',
             images: [
                'https://images.pexels.com/photos/1926620/pexels-photo-1926620.jpeg',
                'https://images.pexels.com/photos/208052/pexels-photo-208052.jpeg'
            ]
        }
    };

    detailButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            const serviceKey = e.target.dataset.service;
            const data = servicesData[serviceKey];

            if (data) {
                modalTitle.textContent = data.title;
                modalDescription.textContent = data.description;
                
                modalGallery.innerHTML = ''; // Limpa a galeria
                data.images.forEach(imgUrl => {
                    const img = document.createElement('img');
                    img.src = imgUrl;
                    img.alt = data.title;
                    modalGallery.appendChild(img);
                });

                modal.classList.add('active');
            }
        });
    });

    // Fechar o modal
    function closeModal() {
        modal.classList.remove('active');
    }

    closeButton.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });

});
