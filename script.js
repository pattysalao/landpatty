document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Dados Completos dos 8 Serviços
    const servicesData = {
        'cabelos': {
            title: 'Cabelos: Corte e Tratamento',
            desc: 'Especialistas em mechas, coloração e cortes modernos. Utilizamos produtos premium para garantir a saúde dos fios.',
            msg: 'Olá, gostaria de agendar Cabelo.'
        },
        'unhas': {
            title: 'Unhas: Manicure e Pedicure',
            desc: 'Alongamento em fibra, gel e nail art exclusiva. Spa de pés e mãos completo.',
            msg: 'Olá, gostaria de agendar Unhas.'
        },
        'pele': {
            title: 'Estética Facial',
            desc: 'Limpeza de pele profunda, peeling e hidratação para renovar sua pele.',
            msg: 'Olá, gostaria de agendar Estética Facial.'
        },
        'sobrancelhas': {
            title: 'Design de Sobrancelhas',
            desc: 'Design estratégico, micropigmentação fio a fio e henna.',
            msg: 'Olá, gostaria de agendar Sobrancelhas.'
        },
        'massagem': {
            title: 'Massoterapia',
            desc: 'Massagem relaxante, modeladora e drenagem linfática.',
            msg: 'Olá, gostaria de agendar Massagem.'
        },
        'make': {
            title: 'Maquiagem Profissional',
            desc: 'Maquiagem para eventos sociais, noivas e ensaios fotográficos.',
            msg: 'Olá, gostaria de agendar Maquiagem.'
        },
        'tattoo': {
            title: 'Tattoo Art',
            desc: 'Traços finos e delicados. Tatuagem feminina com segurança e estilo.',
            msg: 'Olá, gostaria de agendar Tattoo.'
        },
        'estetica': {
            title: 'Estética Corporal',
            desc: 'Tratamentos para redução de medidas e cuidados corporais.',
            msg: 'Olá, gostaria de agendar Estética Corporal.'
        }
    };

    // 2. Lógica do Modal
    const modal = document.getElementById('service-modal');
    const closeBtn = document.querySelector('.close-button');
    const modalTitle = document.getElementById('modal-service-title');
    const modalDesc = document.getElementById('modal-service-description');
    const modalBtn = document.querySelector('.modal-whatsapp');

    // Abrir Modal
    document.querySelectorAll('.btn-detalhes').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const type = btn.getAttribute('data-service');
            const data = servicesData[type];
            if(data && modal) {
                modalTitle.textContent = data.title;
                modalDesc.textContent = data.desc;
                modalBtn.href = `https://wa.me/5511912345678?text=${encodeURIComponent(data.msg)}`;
                modal.classList.add('active');
                document.body.style.overflow = 'hidden';
            }
        });
    });

    // Fechar Modal
    const closeModal = () => {
        if(modal) {
            modal.classList.remove('active');
            document.body.style.overflow = 'auto';
        }
    };

    if(closeBtn) closeBtn.addEventListener('click', closeModal);
    window.addEventListener('click', (e) => { if(e.target === modal) closeModal(); });

    // 3. Hero Slideshow Simples
    let slideIndex = 0;
    const slides = document.querySelectorAll('.carousel-item');
    if(slides.length > 0) {
        setInterval(() => {
            slides[slideIndex].classList.remove('active');
            slideIndex = (slideIndex + 1) % slides.length;
            slides[slideIndex].classList.add('active');
        }, 5000);
    }
});
