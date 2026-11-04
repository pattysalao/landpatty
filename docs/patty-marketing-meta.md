# Patty — Marketing e WhatsApp oficial (procedimento de ativação)

> Publicação segura: criar e preparar campanhas não envia mensagens. **O envio real é desabilitado por padrão** e precisa da conta oficial Meta, modelos aprovados, autorização administrativa e testes controlados.

## Fluxo dentro do CRM

1. Abra **Marketing → Campanhas** com uma conta de administração autorizada.
2. Crie um rascunho informando título, **nome exato do template aprovado**, idioma (ex.: `pt_BR`) e uma prévia textual de conferência.
3. Escolha inatividade (0/30/60/90/120/180/365 dias), número mínimo de visitas, mês de aniversário opcional e limite máximo de 500 destinatárias.
4. Confira a prévia paginada. Ela mostra até 80 registros examinados por página e **não representa o total da base**.
5. Prepare os lotes. O sistema salva o cursor no navegador e deduplica por telefone, sem regravar contatos já preparados.
6. Revise o público, exclua destinatárias se necessário e aprove explicitamente.
7. **Somente após a ativação técnica da Meta** aparece a opção de enviar uma destinatária por vez; cada envio exige confirmação. O servidor revalida opt-in, telefone, template aprovado e o intervalo mínimo de 7 dias.
8. Webhooks oficiais atualizam os estados `sent`, `delivered`, `read` e `failed`. Mensagem aceita pela Meta não equivale a entrega.

A data planejada evita envio antes do horário indicado, **mas não há agendador de disparos automáticos** nesta versão. Campanhas em lote continuam sem envio automático.

## Configurar na Vercel (ambiente Production)

Variáveis necessárias, sem divulgar os valores por mensagem ou arquivo:

- `PATTY_META_WABA_ID`: identificador da conta WhatsApp Business.
- `PATTY_META_PHONE_NUMBER_ID`: ID do número emissor registrado.
- `PATTY_META_ACCESS_TOKEN`: token de sistema com permissões oficiais adequadas.
- `PATTY_META_GRAPH_VERSION`: versão da Graph API, por exemplo `vXX.0` (definir versão atualmente suportada no Meta for Developers).
- `PATTY_META_APP_SECRET`: segredo do aplicativo, necessário para validar assinatura de webhook.
- `PATTY_META_WEBHOOK_VERIFY_TOKEN`: token escolhido no painel da Meta para verificar a assinatura do callback.
- `PATTY_META_SEND_ENABLED`: **não cadastrar como `true` até completar os testes autorizados**.

Callback HTTPS: `https://www.pattycentrodebeleza.com.br/api/crm/meta-webhook`.

Na configuração do produto WhatsApp da Meta, assine o evento de mensagens e confira permissões de gerenciamento de modelos e envio. Os modelos promocionais devem estar com status **APPROVED** e idioma igual ao cadastrado. Se o modelo usa a variável `{{1}}` do corpo para nome, marque essa opção no CRM; outros parâmetros de template ainda não são suportados neste envio controlado.

## Proteções do fluxo

- Apenas e-mails gerenciais já autorizados no CRM criam campanhas ou acionam envio.
- Contatos históricos importados começam com `marketingOptIn:false`; **não se presume consentimento por estarem no Gendo**.
- Cada destinatária precisa de opt-in registrado com origem e data, telefone válido e ausência de opt-out.
- Comandos recebidos `PARAR`, `SAIR`, `STOP`, `CANCELAR`, `DESCADASTRAR` e `NÃO QUERO` (incluindo respostas por botão) revogam a permissão no webhook assinado.
- O envio oficial é permitido somente das **09h às 19h, horário de Brasília**, com tentativa máxima a cada 7 dias por telefone.
- A tentativa é travada no Firestore antes da chamada à Meta; erros ambíguos ficam com status `unknown`, sem repetição automática.
- Modelo tem de estar aprovado na própria Meta no momento do envio.
- Dados financeiros históricos não são faturamento de recuperação; os indicadores de retorno exigem confirmação manual.
- A extração original do Gendo em 30/10/2026 era parcial. É preciso conferir a completude dos clientes antes de avaliar cobertura de uma campanha.
- Não ativar automações de marketing em grupo nem APIs não oficiais, como Evolution API.

## Checklist de homologação com número próprio autorizado

- [ ] Fazer inventário e conferência da base de clientes importados.
- [ ] Confirmar acesso de gerente e isolamento de contas de funcionárias.
- [ ] Cadastrar os segredos Meta diretamente na Vercel, sem compartilhá-los.
- [ ] Criar e aprovar um template promocional na Meta.
- [ ] Validar verificação GET e assinatura POST do webhook.
- [ ] Preparar e revisar a campanha usando uma única pessoa com opt-in documentado.
- [ ] Ativar temporariamente envio oficial para **um teste expressamente autorizado**, dentro do horário permitido.
- [ ] Validar ID da mensagem, status aceito, entrega, leitura (quando disponível) e opt-out.
- [ ] Conferir logs e taxas/custos de mensagens antes de considerar envios maiores.
- [ ] Só criar agendamento automático e processamento de filas após concluir a homologação real e estabelecer limites/controle de custos.
