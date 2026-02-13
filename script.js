document.addEventListener('DOMContentLoaded', () => {
    // Smooth Scroll para links de navegação
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();

            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                targetElement.scrollIntoView({
                    behavior: 'smooth'
                });
            }
        });
    });

    // --- Carrossel da Hero Section ---
    const heroCarousel = document.querySelector('.hero-carousel');
    const heroItems = heroCarousel ? document.querySelectorAll('.hero-carousel .carousel-item') : [];
    const navDotsContainer = document.querySelector('.carousel-nav');
    let currentHeroIndex = 0;

    if (heroItems.length > 0 && navDotsContainer) {
        navDotsContainer.innerHTML = ''; 
        heroItems.forEach((_, index) => {
            const dot = document.createElement('button');
            dot.classList.add('nav-dot');
            if (index === 0) dot.classList.add('active');
            dot.addEventListener('click', () => {
                goToHeroSlide(index);
                resetHeroAutoPlay();
            });
            navDotsContainer.appendChild(dot);
        });
    }
    const heroNavDots = navDotsContainer ? document.querySelectorAll('.carousel-nav .nav-dot') : [];

    function goToHeroSlide(index) {
        if (heroItems.length === 0) return;

        heroItems.forEach((item, i) => {
            if (item.querySelector('video') && i !== index) {
                item.querySelector('video').pause();
            }
        });

        if (heroItems[currentHeroIndex]) heroItems[currentHeroIndex].classList.remove('active');
        if (heroNavDots[currentHeroIndex]) heroNavDots[currentHeroIndex].classList.remove('active');
        
        currentHeroIndex = (index + heroItems.length) % heroItems.length;
        
        if (heroItems[currentHeroIndex]) heroItems[currentHeroIndex].classList.add('active');
        if (heroNavDots[currentHeroIndex]) heroNavDots[currentHeroIndex].classList.add('active');
        
        if (heroItems[currentHeroIndex] && heroItems[currentHeroIndex].querySelector('video')) {
            heroItems[currentHeroIndex].querySelector('video').play();
        }
    }

    function nextHeroSlide() {
        goToHeroSlide(currentHeroIndex + 1);
    }

    let heroAutoPlayInterval;
    if (heroItems.length > 1) { // Só ativa o autoplay se houver mais de um slide
        heroAutoPlayInterval = setInterval(nextHeroSlide, 7000);
    }

    function resetHeroAutoPlay() {
        if (heroAutoPlayInterval) clearInterval(heroAutoPlayInterval);
        if (heroItems.length > 1) {
            heroAutoPlayInterval = setInterval(nextHeroSlide, 7000);
        }
    }

    if (heroItems[0] && heroItems[0].querySelector('video')) {
        heroItems[0].querySelector('video').play();
    }


    // --- Carrossel de Serviços e Avaliações (Drag & Drop) ---
    function setupCarousel(carouselContainerClass, carouselClass, cardClass, arrowLeftClass, arrowRightClass) {
        const carouselContainer = document.querySelector(carouselContainerClass);
        if (!carouselContainer) return;

        const carousel = carouselContainer.querySelector(carouselClass);
        const cards = carousel ? carousel.querySelectorAll(cardClass) : [];
        const prevBtn = carouselContainer.querySelector(arrowLeftClass);
        const nextBtn = carouselContainer.querySelector(arrowRightClass);

        if (!carousel || cards.length === 0) return;

        let isDragging = false;
        let startPos = 0;
        let scrollLeft = 0;

        const getCardWidth = () => {
            if (cards.length > 0) {
                const cardStyle = getComputedStyle(cards[0]);
                return cards[0].offsetWidth + parseFloat(cardStyle.marginLeft) + parseFloat(cardStyle.marginRight);
            }
            return 330; 
        };

        const updateArrows = () => {
            if (!prevBtn || !nextBtn) return;
            prevBtn.style.display = carousel.scrollLeft > 0 ? 'block' : 'none';
            nextBtn.style.display = carousel.scrollLeft < (carousel.scrollWidth - carousel.clientWidth - 1) ? 'block' : 'none'; // -1 para evitar bug de float
        };

        carousel.addEventListener('mousedown', (e) => {
            isDragging = true;
            carousel.classList.add('dragging');
            startPos = e.pageX - carousel.offsetLeft;
            scrollLeft = carousel.scrollLeft;
        });

        carousel.addEventListener('mouseleave', () => {
            isDragging = false;
            carousel.classList.remove('dragging');
        });

        carousel.addEventListener('mouseup', () => {
            isDragging = false;
            carousel.classList.remove('dragging');
        });

        carousel.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            e.preventDefault();
            const x = e.pageX - carousel.offsetLeft;
            const walk = (x - startPos) * 1.5;
            carousel.scrollLeft = scrollLeft - walk;
        });

        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                carousel.scrollBy({ left: -getCardWidth() * 2, behavior: 'smooth' });
                setTimeout(updateArrows, 600);
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                carousel.scrollBy({ left: getCardWidth() * 2, behavior: 'smooth' });
                setTimeout(updateArrows, 600);
            });
        }

        carousel.addEventListener('scroll', updateArrows);
        window.addEventListener('resize', updateArrows);
        updateArrows();
    }

    setupCarousel('.services-carousel-container', '.services-carousel', '.service-card', '.services-carousel-container .carousel-arrow.left', '.services-carousel-container .carousel-arrow.right');
    setupCarousel('.testimonials-carousel-container', '.testimonials-carousel', '.testimonial-card', '.testimonials-carousel-container .testimonial-arrow.left', '.testimonials-carousel-container .testimonial-arrow.right');

    // --- Modal de Detalhes do Serviço ---
    const serviceModal = document.getElementById('service-modal');
    const closeModalBtn = serviceModal ? serviceModal.querySelector('.close-button') : null;
    const modalServiceTitle = document.getElementById('modal-service-title');
    const modalServiceDescription = document.getElementById('modal-service-description');
    const modalServiceCTA = document.getElementById('modal-service-cta');
    const modalGallery = serviceModal ? serviceModal.querySelector('.modal-gallery') : null;

    document.querySelectorAll('.btn-detalhes').forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            const serviceType = e.target.dataset.service;
            console.log("Service Type Clicked:", serviceType); // DEBUG: Verifica qual serviço foi clicado
            
            let serviceData = {};
            switch(serviceType) {
                case 'cabelos':
                    serviceData = {
                        title: "Cabelos: Corte, Coloração e Tratamentos",
                        description: "Nossos hair stylists são experts em criar visuais que combinam com seu estilo e personalidade. Oferecemos desde cortes modernos, colorações vibrantes, mechas e balayages, até tratamentos intensivos para a saúde e brilho dos seus fios, como hidratação profunda, reconstrução e terapia capilar.",
                        images: ["https://via.placeholder.com/600x400/D4A25C/fff?text=CabelosDetalhe1", "https://via.placeholder.com/600x400/801A39/fff?text=CabelosDetalhe2"],
                        whatsappText: "Olá! Gostaria de agendar um serviço de Cabelos."
                    };
                    break;
                case 'unhas':
                    serviceData = {
                        title: "Unhas: Manicure, Pedicure e Nail Art",
                        description: "Transforme suas mãos e pés com nossas manicures e pedicures impecáveis. Trabalhamos com alongamentos em gel, fibra de vidro e acrílico, além de nail art personalizada e as últimas tendências para unhas elegantes e duradouras.",
                        images: ["https://via.placeholder.com/600x400/D4A25C/fff?text=UnhasDetalhe1", "https://via.placeholder.com/600x400/801A39/fff?text=UnhasDetalhe2"],
                        whatsappText: "Olá! Gostaria de agendar um serviço de Unhas."
                    };
                    break;
                case 'pele':
                    serviceData = {
                        title: "Tratamento de Pele: Rosto Radiante e Saudável",
                        description: "Nossos tratamentos faciais são pensados para a saúde e beleza da sua pele. Oferecemos limpeza de pele profunda, hidratação intensa, revitalização, e terapias anti-idade com produtos de alta tecnologia para um rosto luminoso e rejuvenecido.",
                        images: ["https://via.placeholder.com/600x400/D4A25C/fff?text=PeleDetalhe1", "https://via.placeholder.com/600x400/801A39/fff?text=PeleDetalhe2"],
                        whatsappText: "Olá! Gostaria de agendar um Tratamento de Pele."
                    };
                    break;
                case 'sobrancelhas':
                    serviceData = {
                        title: "Sobrancelhas: Design e Micropigmentação",
                        description: "Realce seu olhar com sobrancelhas perfeitamente desenhadas. Nossos serviços incluem design de sobrancelhas personalizado, coloração com henna, laminação e micropigmentação fio a fio para um resultado natural e duradouro.",
                        images: ["https://via.placeholder.com/600x400/D4A25C/fff?text=SobrancelhaDetalhe1", "https://via.placeholder.com/600x400/801A39/fff?text=SobrancelhaDetalhe2"],
                        whatsappText: "Olá! Gostaria de agendar um serviço de Sobrancelhas."
                    };
                    break;
                case 'massagem':
                    serviceData = {
                        title: "Massagem: Relaxamento e Bem-Estar",
                        description: "Relaxe e renove suas energias com nossas diversas opções de massagem. Oferecemos massagem relaxante, terapêutica, modeladora e drenagem linfática, todas executadas por profissionais qualificadas para proporcionar um momento de puro bem-estar.",
                        images: ["https://via.placeholder.com/600x400/D4A25C/fff?text=MassagemDetalhe1", "https://via.placeholder.com/600x400/801A39/fff?text=MassagemDetalhe2"],
                        whatsappText: "Olá! Gostaria de agendar um serviço de Massagem."
                    };
                    break;
                case 'make':
                    serviceData = {
                        title: "Make: Maquiagem para Eventos e Cursos",
                        description: "Esteja deslumbrante em qualquer ocasião com nossas maquiagens profissionais. Criamos looks para festas, casamentos, eventos especiais e também oferecemos cursos de automaquiagem personalizados para você aprender a realçar sua beleza.",
                        images: ["https://via.placeholder.com/600x400/D4A25C/fff?text=MakeDetalhe1", "https://via.placeholder.com/600x400/801A39/fff?text=MakeDetalhe2"],
                        whatsappText: "Olá! Gostaria de agendar um serviço de Maquiagem."
                    };
                    break;
                case 'tattoo':
                    serviceData = {
                        title: "Tattoo: Arte na Pele com Estilo",
                        description: "Nosso estúdio de tatuagem boutique oferece um ambiente seguro e artístico para criar sua próxima obra de arte na pele. Especializados em tatuagens fineline, delicadas e personalizadas, com foco em design exclusivo e higiene rigorosa.",
                        images: ["https://via.placeholder.com/600x400/D4A25C/fff?text=TattooDetalhe1", "https://via.placeholder.com/600x400/801A39/fff?text=TattooDetalhe2"],
                        whatsappText: "Olá! Gostaria de agendar uma consulta para Tattoo."
                    };
                    break;
                case 'estetica':
                    serviceData = {
                        title: "Estética: Cuidados Completos para Seu Corpo",
                        description: "Além dos tratamentos faciais e corporais, oferecemos serviços de depilação (cera e a laser), drenagem linfática manual e outros procedimentos estéticos para cuidar do seu corpo de forma integral, promovendo bem-estar e resultados visíveis.",
                        images: ["https://via.placeholder.com/600x400/D4A25C/fff?text=EsteticaDetalhe1", "https://via.placeholder.com/600x400/801A39/fff?text=EsteticaDetalhe2"],
                        whatsappText: "Olá! Gostaria de agendar um serviço de Estética."
                    };
                    break;
                default:
                    serviceData = { 
                        title: "Serviço Não Encontrado", 
                        description: "Desculpe, não conseguimos encontrar detalhes para este serviço no momento. Por favor, entre em contato conosco para mais informações ou tente outro serviço.", 
                        images: ["https://via.placeholder.com/600x400/801A39/fff?text=Erro+Servico"],
                        whatsappText: "Olá! Gostaria de mais informações sobre um serviço não listado."
                    };
                    console.warn("Service Type not found in switch:", serviceType); // DEBUG: Alerta se o tipo de serviço não for encontrado
            }
            console.log("Service Data populated:", serviceData); // DEBUG: Mostra os dados que serão usados

            // Popula os elementos do modal com os dados, com verificações null
            if (modalServiceTitle) modalServiceTitle.textContent = serviceData.title;
            if (modalServiceDescription) modalServiceDescription.textContent = serviceData.description;
            if (modalServiceCTA) modalServiceCTA.href = `https://wa.me/5511912345678?text=${encodeURIComponent(serviceData.whatsappText)}`;
            
            if (modalGallery) {
                modalGallery.innerHTML = ''; // Limpa a galeria existente
                serviceData.images.forEach(src => {
                    const img = document.createElement('img');
                    img.src = src;
                    img.alt = serviceData.title;
                    img.onerror = () => { console.error("Erro ao carregar imagem:", src); }; // DEBUG: Captura erros de carregamento de imagem
                    modalGallery.appendChild(img);
                });
            } else {
                console.error("Erro: Elemento modalGallery não encontrado."); // DEBUG: Alerta se modalGallery for null
            }

            // Exibe o modal e desabilita o scroll do body
            if (serviceModal) {
                serviceModal.classList.add('active');
                document.body.style.overflow = 'hidden';
            } else {
                console.error("Erro: Elemento serviceModal não encontrado."); // DEBUG: Alerta se serviceModal for null
            }
        });
    });

    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => {
            if (serviceModal) serviceModal.classList.remove('active');
            document.body.style.overflow = 'auto';
        });
    }

    // Fecha o modal clicando fora dele
    window.addEventListener('click', (event) => {
        if (serviceModal && event.target === serviceModal) {
            serviceModal.classList.remove('active');
            document.body.style.overflow = 'auto';
        }
    });

    // --- Integração Conceitual do Feed do Instagram ---
    // ATENÇÃO: A API do Instagram Business ou Creator é necessária para buscar feeds dinamicamente.
    // Isso geralmente exige um backend para segurança e gerenciamento de tokens.
    // Para uma landing page estática simples, você pode usar um widget de terceiros ou
    // simplesmente atualizar as imagens placeholder manualmente com seus posts mais recentes.
    // O código abaixo é uma **simulação** e **NÃO** funciona com a API real do Instagram
    // sem um setup de backend adequado.

    // async function fetchInstagramFeed() {
    //     const accessToken = 'YOUR_INSTAGRAM_ACCESS_TOKEN'; // OBTENHA ISSO DA API DO INSTAGRAM
    //     const url = `https://graph.instagram.com/me/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink&access_token=${accessToken}`;
    //     const feedContainer = document.getElementById('insta-feed-container');

    //     try {
    //         const response = await fetch(url);
    //         const data = await response.json();

    //         if (data && data.data && feedContainer) {
    //             feedContainer.innerHTML = ''; // Limpa os placeholders
    //             data.data.slice(0, 6).forEach(post => { // Pega os 6 últimos posts
    //                 if (post.media_type === 'IMAGE' || post.media_type === 'CAROUSEL_ALBUM') {
    //                     const link = document.createElement('a');
    //                     link.href = post.permalink;
    //                     link.target = "_blank";
    //                     link.classList.add('insta-post');

    //                     const img = document.createElement('img');
    //                     img.src = post.media_url;
    //                     img.alt = post.caption ? post.caption.substring(0, 100) : 'Instagram Post';
    //                     link.appendChild(img);
    //                     feedContainer.appendChild(link);
    //                 }
    //             });
    //         }
    //     } catch (error) {
    //         console.error("Erro ao buscar feed do Instagram:", error);
    //         // Manter placeholders em caso de erro
    //     }
    // }

    // fetchInstagramFeed(); // Descomente e configure com seu token se for usar a API real
});
