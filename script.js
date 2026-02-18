document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. Dados dos Serviços (O "Banco de Dados" do site) ---
    const servicesData = {
        'cabelos': {
            title: 'Cabelos: Corte e Coloração',
            desc: 'Transforme seu visual com nossos especialistas em mechas, loiros perfeitos e cortes modernos. Utilizamos produtos de linhas premium para garantir a saúde dos fios.',
            whatsapp: 'Olá! Gostaria de agendar um horário para Cabelo.'
        },
        'unhas': {
            title: 'Unhas: Manicure e Pedicure',
            desc: 'Cuidados completos para mãos e pés. Oferecemos alongamento em fibra de vidro, gel, blindagem e nail art exclusiva.',
            whatsapp: 'Olá! Gostaria de agendar um horário para Unhas.'
        },
        'pele': {
            title: 'Estética Facial',
            desc: 'Protocolos de limpeza de pele profunda, peeling, hidratação e tratamentos anti-idade para renovar sua autoestima.',
            whatsapp: 'Olá! Gostaria de saber mais sobre Estética Facial.'
        },
        'massagem': {
            title: 'Massoterapia e Bem-Estar',
            desc: 'Relaxe com nossas massagens. Drenagem linfática para reduzir medidas ou massagem relaxante para aliviar o estresse.',
            whatsapp: 'Olá! Gostaria de agendar uma Massagem.'
        },
        'sobrancelhas': { // Caso adicione no futuro
            title: 'Design de Sobrancelhas',
            desc: 'Micropigmentação e design estratégico para realçar o seu olhar.',
            whatsapp: 'Olá! Gostaria de agendar Sobrancelha.'
        }
    };

    // --- 2. Lógica do Modal ---
    const modal = document.getElementById('service-modal');
    const closeBtn = document.querySelector('.close-button');
    const modalTitle = document.getElementById('modal-service-title');
    const modalDesc = document.getElementById('modal-service-description');
    const modalWhatsapp = document.querySelector('.modal-whatsapp');
    const btnsDetalhes = document.querySelectorAll('.btn-detalhes');

    // Função para abrir o modal
    btnsDetalhes.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const serviceType = btn.getAttribute('data-service');
            const data = servicesData[serviceType];

            if (data) {
                // Preenche as informações
                modalTitle.textContent = data.title;
                modalDesc.textContent = data.desc;
                modalWhatsapp.href = `https://wa.me/5511912345678?text=${encodeURIComponent(data.whatsapp)}`;
                
                // Abre o modal
                modal.classList.add('active');
                document.body.style.overflow = 'hidden'; // Trava o scroll do fundo
            }
        });
    });

    // Função para fechar o modal
    const closeModal = () => {
        modal.classList.remove('active');
        document.body.style.overflow = 'auto'; // Destrava o scroll
    };

    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    // Fecha ao clicar fora da caixa branca
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });

    // --- 3. Smooth Scroll (Navegação Suave) ---
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);
            
            if (targetElement) {
                // Fecha menu mobile se estiver aberto (opcional)
                targetElement.scrollIntoView({
                    behavior: 'smooth'
                });
            }
        });
    });
});
