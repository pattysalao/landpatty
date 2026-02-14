/* style.css */
.modal {
    display: none; /* ESSENCIAL: Esconde o modal por padrão */
    position: fixed;
    z-index: 1000;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0,0,0,0.6);
}

.modal.active {
    display: flex; /* O JS adiciona essa classe para mostrar */
    justify-content: center;
    align-items: center;
}
