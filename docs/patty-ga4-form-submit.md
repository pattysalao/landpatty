# Patty Centro de Beleza — diagnóstico e validação de `form_submit` (GA4/GTM)

## O que mudou no site
O código em `index.html` encaminha os dois formulários para `POST /api/leads` (formulário hero de agendamento e formulário opcional de serviços). Agora os dois emitem o evento de **dataLayer** `form_submit` exclusivamente quando a API responde `ok:true` **e** `created:true`.

Parâmetros do evento: `form_id`, `form_name` (`agendamento_hero` ou `captura_servico`), `form_service` (categoria conhecida do serviço), `lead_source` (origem no site). O `form_submit` não inclui nome, telefone, data solicitada nem conteúdo do WhatsApp. A rotina `crm_lead_saved` permanece para novos leads, e `crm_capture_failed` acompanha as falhas de registro. A tentativa de agendamento `form_agendamento_submit` e o clique de WhatsApp **não** equivalem a `form_submit`.

**Importante:** `dataLayer.push({event:'form_submit',...})` fornece dados ao **GTM**, mas não garante envio ao GA4. A tag precisa existir e estar publicada no container usado pelo site, `GTM-NKZC9T42`.

## Configuração necessária no Google Tag Manager
1. Abra o container **GTM-NKZC9T42** na conta que administra o site.
2. Em **Acionadores**, crie um **Evento personalizado**, nome exato `form_submit` (correspondência exata), sem condições extras para começar. Não use acionador genérico de envio nativo do formulário para contar esse evento customizado.
3. Em **Tags**, crie uma tag **Google Analytics: evento do GA4**, usando o ID da propriedade GA4 Patty já configurado (sem inventar identificador). Defina nome do evento `form_submit`; selecione o acionador acima.
4. Opcional: crie Variáveis de camada de dados `form_id`, `form_name`, `form_service`, `lead_source` e mapeie-as em parâmetros de evento de mesmo nome. Não envie `lead_reference`, `name`, `phone` nem mensagens como parâmetros.
5. Confira se o GTM já transmite `form_submit` via outra tag ou medição otimizada; **não publique tags duplicadas**.
6. Use **Visualizar/Tag Assistant** para simular uma inscrição com autorização e conferir `form_submit` apenas **depois** de resposta `201/created:true` da API. O GTM deve exibir o evento e exatamente uma tag GA4 disparada.
7. No GA4, acompanhe **Administração → DebugView** e depois **Relatórios → Engajamento → Eventos**. O relatório padrão pode demorar a consolidar; DebugView é o primeiro teste.
8. Só então considere marcar esse evento como **evento principal** (key event). **Não altere imediatamente as conversões principais do Google Ads**, pois a campanha Performance Max já otimiza cliques no WhatsApp e houve mudanças nas configurações de mensuração.
9. Faça uma validação controlada de falha na API: **não** deve registrar `form_submit`; o botão de WhatsApp continua funcionando. Retentativa com a mesma referência, quando `created:false`, também **não** conta novo evento.

## QA e critérios de aceite
- [ ] `scripts/test-form-submit.mjs` aprovado no GitHub Actions.
- [ ] Deploy em produção `READY` (validar commit exato).
- [ ] HTML do domínio oficial inclui `registrarFormularioConfirmado`.
- [ ] GTM Preview reconhece o evento `form_submit` sem PII e registra uma única tag GA4.
- [ ] GA4 DebugView recebe `form_submit`.
- [ ] Não houve mudança de configuração das ações de conversão existentes no Google Ads.
- [ ] Testes reais de formulário usam apenas dados autorizados, e são marcados como teste no CRM. **Não importar nem alterar dados das clientes para esta validação.**

## Indicadores
Separe `form_start` (início de formulário), `form_agendamento_submit` (tentativa), `form_submit` (lead novo confirmado pelo servidor), `whatsapp_click` (intenção de abrir chat), `agendamento_confirmado` (somente após confirmação pela equipe) e receita efetivamente registrada. Não some eventos como clientes únicas.
