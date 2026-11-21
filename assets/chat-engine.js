/*!
 * Med Prime — motor de respostas do Assistente (100% local, sem dependências).
 * Base de conhecimento construída a partir do texto do site medprime.ia.br.
 * Pode ser usado no navegador (window.MedPrimeEngine) ou no Node (module.exports).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MedPrimeEngine = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var WHATSAPP_NUMERO = "5511979760006";
  var WHATSAPP_EXIBICAO = "(11) 97976-0006";

  /* ---------- Normalização de texto ---------- */
  function normalizar(txt) {
    return String(txt || "")
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/ç/g, "c")
      .replace(/[^a-z0-9\s/]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  var STOP = {
    "a":1,"o":1,"as":1,"os":1,"de":1,"da":1,"do":1,"das":1,"dos":1,"e":1,"em":1,"no":1,"na":1,"nos":1,"nas":1,
    "um":1,"uma":1,"para":1,"pra":1,"pro":1,"por":1,"com":1,"que":1,"se":1,"me":1,"eu":1,"voce":1,"voces":1,
    "vc":1,"vcs":1,"tem":1,"ter":1,"ha":1,"é":1,"eh":1,"sao":1,"ao":1,"mais":1,"muito":1,"isso":1,"esse":1,
    "essa":1,"qual":1,"quais":1,"como":1,"sobre":1,"sistema":1,"medprime":1,"med":1,"prime":1,"meu":1,"minha":1,
    "seu":1,"sua":1,"nosso":1,"nossa":1,"ja":1,"so":1,"tambem":1,"fazer":1,"faz":1,"pode":1,"posso":1,"consigo":1,
    "gostaria":1,"queria":1,"quero":1,"saber":1,"ola":0,"oi":0
  };

  function tokens(norm) {
    return norm.split(" ").filter(function (t) { return t && !STOP[t]; });
  }

  /* Distância de Levenshtein com limite (rápida o suficiente para frases curtas). */
  function distancia(a, b, max) {
    if (a === b) return 0;
    var la = a.length, lb = b.length;
    if (Math.abs(la - lb) > max) return max + 1;
    var prev = new Array(lb + 1), cur = new Array(lb + 1), i, j;
    for (j = 0; j <= lb; j++) prev[j] = j;
    for (i = 1; i <= la; i++) {
      cur[0] = i;
      var menor = cur[0];
      for (j = 1; j <= lb; j++) {
        var custo = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + custo);
        // transposição (ex.: "teelfonia")
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          cur[j] = Math.min(cur[j], prev[j - 1]); // aproximação barata
        }
        if (cur[j] < menor) menor = cur[j];
      }
      if (menor > max) return max + 1;
      var t = prev; prev = cur; cur = t;
    }
    return prev[lb];
  }

  /* Um token do usuário "bate" com uma palavra-chave? Retorna 0..1 */
  function similaridade(tok, chave) {
    if (tok === chave) return 1;
    if (chave.length <= 3 || tok.length <= 2) return 0;          // curtas: só exato
    // radical: "agendar"/"agendamento", "migrar"/"migracao"
    var raiz = chave.length >= 6 ? chave.slice(0, chave.length - 2) : chave;
    if (chave.length >= 5 && tok.length >= raiz.length && tok.indexOf(raiz) === 0) return 0.9;
    if (tok.length >= 5 && chave.indexOf(tok) === 0 && tok.length >= chave.length - 3) return 0.85;
    var max = chave.length >= 8 ? 2 : (chave.length >= 4 ? 1 : 0);
    if (max && distancia(tok, chave, max) <= max) return 0.8;
    return 0;
  }

  /* ---------- Base de conhecimento (somente o que o site afirma) ---------- */
  var W = "WhatsApp " + WHATSAPP_EXIBICAO;
  var INTENTS = [
    {
      id: "saudacao", label: "Saudação",
      frases: ["bom dia", "boa tarde", "boa noite", "tudo bem"],
      chaves: ["oi", "ola", "opa", "eai", "hello", "salve"],
      resposta: "Olá! Sou o Assistente Med Prime. Posso explicar como funciona o sistema, a telefonia com IA, o ambiente de teste grátis, ou agendar uma conversa com a equipe. Sobre o que você quer saber?",
      sugestoes: ["Como funciona a telefonia IA?", "Quais recursos?", "Teste grátis", "Agendar contato"]
    },
    {
      id: "agradecimento", label: "Agradecimento", peso: 0.8,
      frases: ["muito obrigado", "valeu mesmo"],
      chaves: ["obrigado", "obrigada", "obg", "valeu", "agradeco", "show", "perfeito", "otimo"],
      resposta: "Por nada! Se quiser, eu agendo uma conversa com a equipe ou abro o WhatsApp para você agora.",
      sugestoes: ["Agendar contato", "Falar no WhatsApp"]
    },
    {
      id: "telefonia", label: "Telefonia com IA",
      frases: ["inteligencia artificial", "bot de telefone", "atendente virtual", "atende ligacao", "atende o telefone", "ligacoes perdidas", "telefonia ia", "telefonia com ia", "atender telefone", "atende telefone"],
      chaves: ["telefonia", "telefone", "ligacao", "ligacoes", "ligar", "chamada", "chamadas", "bot", "robo", "ia", "ura", "voz", "atendente", "virtual", "triagem"],
      resposta: "A telefonia com IA do Med Prime atende as ligações da clínica sem depender de a recepção estar livre no balcão. Funciona assim:\n1. A ligação chega e o bot atende.\n2. Ele entende o que a pessoa precisa: agenda, confirma, remarca, tira dúvidas, faz a triagem e, quando necessário, transfere para um atendente humano.\n3. Consulta a agenda real, com as regras daquela agenda (horários livres, ordem de chegada, limites e feriados).\n4. No modo de marcação, o pré-agendamento entra direto no Med Prime, visível para a recepção.\nO bot atende 24 horas, todos os dias.",
      sugestoes: ["A IA substitui a recepção?", "Funciona com a agenda?", "Teste grátis", "Agendar contato"]
    },
    {
      id: "horario_bot", label: "Horário da telefonia",
      frases: ["24 horas", "24h", "fim de semana", "final de semana", "que horario", "qual horario", "horario de atendimento", "a noite", "de madrugada"],
      chaves: ["madrugada", "domingo", "sabado", "feriado", "24h", "noturno", "noite"],
      resposta: "A telefonia com inteligência artificial atende as ligações 24 horas, todos os dias. Assim a clínica não perde ligação fora do horário da recepção.",
      sugestoes: ["Como funciona a telefonia IA?", "Agendar contato"]
    },
    {
      id: "substitui_recepcao", label: "IA x recepção",
      frases: ["substitui a recepcao", "substituir a recepcao", "substitui recepcionista", "tirar a recepcao", "atendente humano", "falar com humano", "pessoa de verdade"],
      chaves: ["recepcionista", "recepcionistas", "demitir", "substitui", "humano", "humana"],
      resposta: "Não. O bot de telefone atende a ligação, faz o pré-agendamento quando a agenda está configurada para isso e transfere para um atendente humano quando a situação pede. A recepção continua no balcão, na fila e nas exceções.",
      sugestoes: ["Como funciona a telefonia IA?", "Quais recursos?"]
    },
    {
      id: "agenda", label: "Agenda",
      frases: ["minha agenda", "marcar consulta", "marcacao de consulta", "pre agendamento", "ordem de chegada", "horarios livres", "funciona com a agenda", "confirmacao de consulta"],
      chaves: ["agenda", "agendas", "consulta", "consultas", "marcacao", "remarcar", "remarcacao", "confirmacao", "confirmar", "faltas", "falta", "horarios"],
      resposta: "O Med Prime centraliza as agendas por unidade, médico e tipo de atendimento, com horários, limites, preferências e feriados configuráveis. O médico acompanha a própria agenda em \"Minha Agenda\".\nA integração com o bot de telefone é direta: cada agenda define se o bot só informa o atendimento por ordem de chegada ou se oferece horários livres e grava o pré-agendamento no sistema. O atendente virtual também apoia a confirmação e o reagendamento no fluxo da ligação.",
      sugestoes: ["Como funciona a telefonia IA?", "Tem mais de uma unidade?", "Agendar contato"]
    },
    {
      id: "fila", label: "Fila e painel",
      frases: ["fila de atendimento", "chamar senha", "painel de senha", "painel de chamada"],
      chaves: ["fila", "filas", "painel", "totem", "telao", "senha", "senhas", "recepcao", "balcao", "chamador"],
      resposta: "O sistema tem fila de atendimento, painel de filas, totem e telão com som e vídeo para chamar a senha. Templates de recepção e conferência de visitas apoiam o fluxo na porta da clínica.",
      sugestoes: ["Quais recursos?", "Agendar contato"]
    },
    {
      id: "prontuario", label: "Prontuário",
      frases: ["prontuario eletronico", "cadastro de paciente", "cadastro do paciente", "historico do paciente"],
      chaves: ["prontuario", "prontuarios", "pep", "anamnese", "paciente", "pacientes", "documentos", "pedidos"],
      resposta: "Sim, o Med Prime tem prontuário eletrônico. No prontuário da pessoa ficam o cadastro do paciente, documentos, observações, visitas, guias e pedidos, e o financeiro de cada conta.",
      sugestoes: ["Portal do paciente", "Exames e laudos", "Agendar contato"]
    },
    {
      id: "exames", label: "Exames e laudos",
      frases: ["assinatura digital", "laudo digital", "laudos digitais", "exames de imagem", "centro de diagnostico"],
      chaves: ["exame", "exames", "laudo", "laudos", "dicom", "orthanc", "pacs", "imagem", "imagens", "diagnostico", "radiologia", "assinatura", "assinado", "assinados"],
      resposta: "Exames do dia, pendentes e carregamento de imagens (incluindo Orthanc/DICOM). Os laudos têm fluxo para escrever, apoio da assistente, assinatura digital e modelos. É um módulo pensado também para centros de diagnóstico.",
      sugestoes: ["Portal do paciente", "Quais recursos?", "Agendar contato"]
    },
    {
      id: "portal", label: "Portal do paciente",
      frases: ["portal do paciente", "ver resultado", "resultado de exame", "resultado do exame", "paciente acessar"],
      chaves: ["portal", "resultado", "resultados", "cpf"],
      resposta: "No portal do paciente, a pessoa consulta documentos e resultados com o número do prontuário e o CPF, sem precisar de cadastro. Também pode criar uma conta para entrar com e-mail e senha, e há uma jornada específica para consultar o resultado.",
      sugestoes: ["Exames e laudos", "Quais recursos?"]
    },
    {
      id: "convenios", label: "Convênios e TISS",
      frases: ["guia tiss", "guias tiss", "sp sadt", "sp/sadt", "plano de saude", "planos de saude", "tabela de preco", "tabelas de preco"],
      chaves: ["convenio", "convenios", "tiss", "sadt", "guia", "guias", "faturamento", "faturar", "fatura", "faturas", "operadora", "operadoras", "glosa", "unimed"],
      resposta: "Sim. Há cadastro de convênios, tabelas de preço, consulta de procedimentos e emissão de guias TISS de consulta e SP/SADT, além do acompanhamento de faturas com as operadoras. Tudo no mesmo sistema, em vez de planilhas e retrabalho entre recepção e financeiro.",
      sugestoes: ["Financeiro e caixa", "Agendar contato"]
    },
    {
      id: "financeiro", label: "Financeiro e caixa",
      frases: ["financeiro e caixa", "contas a pagar", "contas a receber", "nota fiscal", "notas fiscais", "fluxo de caixa"],
      chaves: ["caixa", "financeiro", "fechamento", "fechamentos", "tesouraria", "nfe", "nfse", "pagamento", "pagamentos", "recebimento", "contas"],
      resposta: "O caixa é por unidade, com sessão, entradas, saídas, fila, histórico, supervisão e fechamento do período, além do recebimento de fechamentos e do repasse do dia. A tesouraria cuida das contas a pagar e a receber da empresa, em controle separado do caixa das unidades, com acompanhamento das notas fiscais pedidas no caixa.",
      sugestoes: ["Repasse médico", "Convênios e TISS", "Agendar contato"]
    },
    {
      id: "repasse", label: "Repasse médico",
      frases: ["repasse medico", "repasse dos medicos", "pagamento dos medicos", "comissao dos medicos"],
      chaves: ["repasse", "repasses", "comissao", "honorarios"],
      resposta: "O módulo de repasse médico traz o relatório de exames realizados no período (particular e convênio) como base para o cálculo do repasse, além do acompanhamento do repasse do dia.",
      sugestoes: ["Financeiro e caixa", "Relatórios"]
    },
    {
      id: "equipe", label: "Equipe e permissões",
      frases: ["controle de acesso", "nivel de acesso", "perfis de acesso", "cadastro de medicos"],
      chaves: ["usuario", "usuarios", "permissao", "permissoes", "perfil", "perfis", "acesso", "equipe", "medicos", "solicitantes", "login"],
      resposta: "Há cadastro de médicos, solicitantes, usuários e permissões por papel, da recepção e do caixa até a administração da rede de unidades.",
      sugestoes: ["Quais recursos?", "Agendar contato"]
    },
    {
      id: "estoque", label: "Estoque",
      frases: ["controle de estoque", "gestao de estoque"],
      chaves: ["estoque", "estoques", "insumos", "insumo", "materiais", "almoxarifado", "inventario", "produtos"],
      resposta: "Sim, o Med Prime tem controle de estoque da clínica no mesmo sistema da operação, junto dos demais módulos de gestão. Os detalhes do módulo a equipe mostra na demonstração.",
      sugestoes: ["Relatórios", "Agendar contato"]
    },
    {
      id: "relatorios", label: "Relatórios",
      frases: ["relatorios gerais", "indicadores da clinica"],
      chaves: ["relatorio", "relatorios", "indicadores", "indicador", "dashboard", "graficos", "kpi", "estatisticas"],
      resposta: "O sistema tem relatórios gerais da operação para acompanhar o que acontece no dia a dia da clínica, além dos relatórios já usados no repasse e no financeiro.",
      sugestoes: ["Repasse médico", "Agendar contato"]
    },
    {
      id: "lgpd", label: "LGPD e segurança",
      frases: ["protecao de dados", "dados pessoais", "dados dos pacientes", "seguranca dos dados"],
      chaves: ["lgpd", "seguranca", "seguro", "privacidade", "sigilo", "dados", "criptografia", "backup", "vazamento"],
      resposta: "O Med Prime tem recursos de LGPD para apoiar o tratamento de dados pessoais dos pacientes no sistema, e as permissões são por papel na equipe. Para detalhes técnicos de segurança (por exemplo, backup ou hospedagem), o melhor é confirmar direto com a equipe no WhatsApp.",
      sugestoes: ["Falar no WhatsApp", "Agendar contato"]
    },
    {
      id: "whatsapp_paciente", label: "Atendimento por WhatsApp",
      frases: ["atendimento por whatsapp", "whatsapp com paciente", "whatsapp do paciente", "whatsapp da clinica", "atende no whatsapp", "atende pelo whatsapp"],
      chaves: ["whatsapp", "whats", "zap", "wpp", "zapzap", "mensagem", "mensagens"],
      resposta: "O Med Prime tem atendimento por WhatsApp com o paciente, no mesmo software da gestão e da telefonia. Se quiser falar com a equipe da Med Prime pelo WhatsApp agora, é só tocar em \"Falar no WhatsApp\".",
      sugestoes: ["Falar no WhatsApp", "Como funciona a telefonia IA?"]
    },
    {
      id: "unidades", label: "Várias unidades",
      frases: ["mais de uma unidade", "varias unidades", "multi unidade", "rede de clinicas", "filiais"],
      chaves: ["unidades", "unidade", "multiunidade", "filial", "filiais", "rede", "redes"],
      resposta: "Sim. O Med Prime tem cadastro de unidades, agendas por local e caixa de cada unidade, com a tesouraria da empresa em um controle separado. Ele já roda no dia a dia de uma clínica com mais de uma unidade.",
      sugestoes: ["Para que porte de clínica?", "Agendar contato"]
    },
    {
      id: "porte", label: "Porte da clínica",
      frases: ["para quem e", "porte da clinica", "clinica pequena", "clinica grande", "consultorio pequeno", "serve para", "atende clinica", "medio porte", "grande porte", "quantos medicos"],
      chaves: ["porte", "pequena", "pequeno", "grande", "media", "medio", "consultorio", "tamanho", "hospital", "centro", "especialidade", "especialidades"],
      resposta: "O Med Prime foi feito para clínicas de médio e grande porte, centros de diagnóstico e redes com mais de uma unidade, ou seja, operações com volume e um fluxo clínico que vai além da consulta isolada. Se a sua clínica é de outro perfil, vale conversar com a equipe para avaliar se faz sentido.",
      sugestoes: ["Agendar contato", "Teste grátis"]
    },
    {
      id: "site_clinica", label: "Site da clínica integrado",
      frases: ["site da clinica", "site para clinica", "site para a clinica", "site integrado", "site com agenda", "site com agendamento", "criar site", "fazer site", "pagina da clinica", "site proprio", "site integrado com agenda", "integracao com a agenda da clinica", "integracao com a agenda", "integracao com agenda", "integrado com a agenda", "integrado a agenda", "integrado com o sistema"],
      chaves: ["site", "sites", "website", "pagina", "landing"],
      resposta: "Novo no portfólio: a Med Prime entrega um site para a clínica integrado ao sistema.\n• Agendamento online na agenda real: o paciente vê os horários livres, com as regras, limites e feriados da agenda, e a marcação entra direto no Med Prime.\n• Assistente de IA que abre a ficha: coleta dados pessoais, convênio e motivo da consulta antes do atendimento, e a ficha chega pronta no sistema.\n• Consentimento LGPD do paciente no próprio fluxo.\n• Senha acompanhada pelo celular, por um link aberto no navegador, sem aplicativo.\n• Menos trabalho na recepção e menos fila.\nO preço é sob consulta pelo WhatsApp.",
      sugestoes: ["Como funciona a abertura da ficha?", "Acompanhar a senha pelo celular", "Agendar contato"]
    },
    {
      id: "agendamento_online", label: "Agendamento online",
      frases: ["agendamento online", "agendar online", "agendar pela internet", "marcar online", "marcacao online", "agendamento pela internet", "agendamento pelo site", "agendar pelo site", "marcar pelo site", "paciente agendar sozinho", "paciente marcar sozinho", "agenda online"],
      chaves: ["online", "internet", "autoagendamento"],
      resposta: "Sim. No site da clínica integrado ao Med Prime, o paciente agenda online nos horários livres da agenda real da clínica, com as mesmas regras, limites e feriados configurados no sistema. A marcação entra direto no Med Prime, visível para a recepção. Em seguida, o assistente de IA já faz a abertura da ficha.",
      sugestoes: ["Como funciona a abertura da ficha?", "Site da clínica", "Agendar contato"]
    },
    {
      id: "ficha_paciente", label: "Abertura da ficha",
      frases: ["abertura da ficha", "abrir a ficha", "abrir ficha", "ficha do paciente", "fixa do paciente", "ficha pronta", "cadastro antes da consulta", "pre cadastro", "preencher cadastro", "preencher a ficha", "dados do convenio", "motivo da consulta", "como funciona a abertura da ficha"],
      chaves: ["ficha", "fichas", "fixa", "precadastro", "cadastro", "cadastrar", "formulario", "carteirinha", "motivo"],
      resposta: "No site da clínica, um assistente de IA ajuda o paciente a abrir a ficha antes da consulta: coleta dados pessoais, convênio e motivo da consulta, e pede o consentimento LGPD para o uso desses dados. A ficha chega pronta no Med Prime, então a recepção confere em vez de digitar, e o paciente espera menos no balcão.",
      sugestoes: ["Acompanhar a senha pelo celular", "LGPD", "Agendar contato"]
    },
    {
      id: "senha_celular", label: "Senha pelo celular",
      frases: ["senha pelo celular", "senha no celular", "acompanhar a senha", "acompanhar senha", "acompanhar a fila", "acompanhar pelo celular", "ver a senha", "minha vez", "sem aplicativo", "precisa de aplicativo", "precisa baixar"],
      chaves: ["celular", "smartphone", "aplicativo", "app", "link", "notificacao", "notificacoes", "aviso"],
      resposta: "O paciente acompanha a senha da fila pelo celular, por um link que abre no navegador, sem precisar instalar aplicativo. Esse link também pode chegar pelo WhatsApp. Assim ele não precisa ficar parado olhando o painel da recepção.",
      sugestoes: ["Site da clínica", "Fila e painel", "Agendar contato"]
    },
    {
      id: "recursos", label: "Recursos",
      frases: ["o que o sistema faz", "o que faz", "quais recursos", "quais modulos", "quais funcionalidades", "o que tem", "como funciona o sistema", "o que e o med prime"],
      chaves: ["recursos", "recurso", "modulos", "modulo", "funcionalidades", "funcionalidade", "funcoes", "ferramentas", "faz", "oferece", "software"],
      resposta: "O Med Prime reúne, no mesmo sistema:\n• Telefonia com IA (24h, todos os dias), integrada à agenda\n• Atendimento por WhatsApp com o paciente\n• Agendas e unidades\n• Fila, painel, totem e telão\n• Pacientes e prontuário eletrônico\n• Exames e laudos digitais assinados (Orthanc/DICOM)\n• Portal do paciente\n• Site da clínica integrado: agendamento online e assistente de IA que abre a ficha\n• Convênios, guias TISS e tabelas de preço\n• Caixa, fechamentos, tesouraria e notas fiscais\n• Repasse médico\n• Equipe e permissões\n• Estoque\n• Relatórios gerais\n• Recursos de LGPD\nQuer que eu explique algum deles?",
      sugestoes: ["Como funciona a telefonia IA?", "Prontuário", "Convênios e TISS", "Agendar contato"]
    },
    {
      id: "preco", label: "Preço",
      frases: ["quanto custa", "quanto e", "qual o valor", "qual valor", "qual o preco", "tabela de valores", "valor mensal", "pedir proposta"],
      chaves: ["preco", "precos", "presso", "custa", "custo", "custos", "valor", "valores", "mensalidade", "assinatura", "orcamento", "proposta", "investimento", "cobranca", "pagar", "barato", "caro", "plano", "planos"],
      resposta: "O preço é sob consulta pelo WhatsApp. O valor depende do porte da clínica, do número de unidades e dos módulos utilizados. Posso abrir o WhatsApp com um pedido de proposta, ou agendar uma conversa com a equipe.",
      sugestoes: ["Pedir proposta no WhatsApp", "Agendar contato", "Teste grátis"]
    },
    {
      id: "teste", label: "Teste grátis",
      frases: ["teste gratis", "teste gratuito", "ambiente de teste", "periodo de teste", "sem custo", "testar o sistema", "de graca"],
      chaves: ["teste", "testar", "gratis", "gratuito", "gratuita", "trial", "experimentar", "experimento", "degustacao"],
      resposta: "Sim! A clínica pode solicitar um ambiente de teste sem custo para conhecer o software na prática: agenda, fila, prontuário, exames, laudos, caixa e telefonia. É o mesmo sistema já em operação real, não um protótipo, e não há cobrança por esse ambiente. Quer que eu abra o pedido pelo WhatsApp?",
      sugestoes: ["Pedir teste no WhatsApp", "Agendar contato"]
    },
    {
      id: "implantacao", label: "Implantação",
      frases: ["quanto tempo", "prazo de implantacao", "tempo de implantacao", "comecar a usar", "como comecar", "colocar no ar", "treinamento da equipe"],
      chaves: ["implantacao", "implantar", "implementacao", "implementar", "instalacao", "instalar", "prazo", "prazos", "onboarding", "dias", "treinamento", "treinar"],
      resposta: "A implantação é feita em até 30 dias. O caminho é apresentado na demonstração, com as unidades, usuários e agendas da sua clínica. E os dados do sistema antigo são migrados sem custo.",
      sugestoes: ["Migração de dados", "Agendar contato"]
    },
    {
      id: "migracao", label: "Migração de dados",
      frases: ["sistema antigo", "sistema atual", "trocar de sistema", "mudar de sistema", "levar os dados", "importar dados", "substitui o sistema", "ja usamos", "outro sistema"],
      chaves: ["migracao", "migrar", "migrados", "importar", "importacao", "exportar", "transferir", "trocar", "substituir", "antigo", "atual"],
      resposta: "Os dados do sistema antigo são migrados sem custo. Se o Med Prime vai substituir ou conviver com o que a clínica usa hoje depende do que vocês precisam manter. Na demonstração a equipe mapeia agenda, prontuário, fila, exames, laudos e financeiro para avaliar isso com vocês.",
      sugestoes: ["Implantação", "Agendar contato"]
    },
    {
      id: "integracao", label: "Integrações",
      frases: ["integra com outro", "integra com outros", "integracao com outro", "integracao com outros", "outros sistemas", "outro sistema", "api"],
      chaves: ["integracao", "integracoes", "integrar", "integra", "api", "sistemas"],
      resposta: "No site, as integrações descritas são a integração direta do bot de telefone com a agenda e o carregamento de imagens de exames com suporte a Orthanc/DICOM. Para outra integração específica, é melhor confirmar com a equipe no WhatsApp.",
      sugestoes: ["Falar no WhatsApp", "Agendar contato"]
    },
    {
      id: "operacao", label: "Já em operação",
      frases: ["ja funciona", "funciona mesmo", "esta pronto", "e um prototipo", "quem usa", "tem clientes", "ja esta em uso", "em uso", "em operacao"],
      chaves: ["prototipo", "clientes", "cliente", "referencia", "referencias", "depoimento", "depoimentos", "confiavel", "pronto", "operacao", "funcionando"],
      resposta: "Sim, o sistema já está em funcionamento, em operação real no dia a dia de uma clínica com mais de uma unidade: agenda, fila, exames, laudos, caixa e atendimento. Não é um protótipo. Você pode conferir na prática pelo ambiente de teste sem custo.",
      sugestoes: ["Teste grátis", "Agendar contato"]
    },
    {
      id: "suporte", label: "Suporte",
      frases: ["suporte tecnico", "ajuda tecnica", "atendimento ao cliente", "se der problema"],
      chaves: ["suporte", "chamado", "chamados", "problema", "problemas", "manutencao", "atualizacao", "atualizacoes", "sla"],
      resposta: "O site não detalha o modelo de suporte, então não quero te passar informação errada. A equipe da Med Prime explica como funciona o suporte direto pelo WhatsApp, ou numa conversa agendada.",
      sugestoes: ["Falar no WhatsApp", "Agendar contato"]
    },
    {
      id: "sobre", label: "Sobre a Med Prime",
      frases: ["quem e a med prime", "quem desenvolveu", "quem fez", "sobre a empresa", "onde fica", "endereco", "cnpj"],
      chaves: ["empresa", "desenvolvedor", "desenvolveu", "fabricante", "endereco", "cnpj", "localizacao", "sede"],
      resposta: "O sistema foi desenvolvido pela própria Med Prime, e o atendimento comercial é feito pelo WhatsApp " + WHATSAPP_EXIBICAO + ". Lá a equipe responde qualquer dúvida sobre a empresa e o sistema.",
      sugestoes: ["Falar no WhatsApp", "Agendar contato"]
    },
    {
      id: "demonstracao", label: "Demonstração",
      frases: ["agendar demonstracao", "ver uma demonstracao", "apresentacao do sistema", "ver as telas"],
      chaves: ["demonstracao", "demo", "apresentacao", "apresentar", "telas", "tela"],
      resposta: "Na demonstração a equipe percorre os módulos com a rotina da sua clínica e mostra cada tela no seu contexto. Posso agendar agora: são só algumas perguntas rápidas e depois eu abro o WhatsApp com tudo preenchido.",
      sugestoes: ["Agendar contato", "Teste grátis"]
    },
    {
      id: "agendar", label: "Agendar contato", acao: "agendar",
      frases: ["agendar contato", "agendar uma conversa", "marcar uma conversa", "marcar reuniao", "agendar reuniao", "me liga", "me ligue", "entrem em contato", "entre em contato", "quero conversar", "falar com vendedor", "falar com consultor", "falar com comercial"],
      chaves: ["reuniao", "conversa", "contato", "retorno", "vendedor", "consultor", "comercial", "agendar", "agendamento", "marcar"],
      resposta: "Vamos agendar! São só algumas perguntas rápidas.",
      sugestoes: []
    },
    {
      id: "whatsapp_handoff", label: "Falar no WhatsApp", acao: "whatsapp",
      frases: ["falar no whatsapp", "chamar no whatsapp", "abrir whatsapp", "abre o whatsapp", "ir para o whatsapp", "mandar whatsapp", "seu whatsapp", "numero do whatsapp", "qual o whatsapp", "telefone de contato", "numero de contato", "falar com alguem", "falar com uma pessoa", "falar com atendente"],
      chaves: [],
      resposta: "Claro! Vou abrir o WhatsApp da Med Prime (" + WHATSAPP_EXIBICAO + ") com um resumo da nossa conversa.",
      sugestoes: []
    }
  ];

  // Pré-normaliza
  INTENTS.forEach(function (it) {
    it._frases = (it.frases || []).map(normalizar);
    it._chaves = (it.chaves || []).map(normalizar);
    if (it.peso == null) it.peso = 1;
  });

  /* Pontua o texto contra todas as intenções. */
  function classificar(texto) {
    var norm = normalizar(texto);
    var padded = " " + norm + " ";
    var toks = tokens(norm);
    var todos = norm.split(" ").filter(Boolean);
    var resultados = INTENTS.map(function (it) {
      var score = 0, hits = [];
      it._frases.forEach(function (f) {
        if (f && padded.indexOf(" " + f + " ") !== -1) { score += 2.5; hits.push(f); }
      });
      it._chaves.forEach(function (k) {
        var lista = k.length <= 3 ? todos : toks; // chaves curtas como "ia", "oi" podem ser stop-words
        var melhor = 0;
        for (var i = 0; i < lista.length; i++) {
          var s = similaridade(lista[i], k);
          if (s > melhor) melhor = s;
          if (melhor === 1) break;
        }
        if (melhor) { score += melhor; hits.push(k); }
      });
      return { intent: it, score: score * it.peso, hits: hits };
    });
    resultados.sort(function (a, b) { return b.score - a.score; });
    return { norm: norm, ranking: resultados };
  }

  var LIMIAR = 0.8;

  var FALLBACK = "Essa eu não sei responder com segurança, e prefiro não chutar. A equipe da Med Prime pode te explicar direitinho: quer que eu agende um contato ou abra o WhatsApp agora?";

  function responder(texto) {
    var c = classificar(texto);
    var top = c.ranking[0];
    if (!c.norm || !top || top.score < LIMIAR) {
      return { intent: null, label: null, texto: FALLBACK, sugestoes: ["Agendar contato", "Falar no WhatsApp", "Quais recursos?"], acao: null, score: top ? top.score : 0 };
    }
    var it = top.intent;
    // Se a pergunta trouxe dois temas fortes (ex.: "telefonia e preço"), junta as duas respostas.
    var extra = null, seg = c.ranking[1];
    if (!it.acao && seg && !seg.intent.acao && seg.score >= 2 && seg.score >= top.score * 0.75 &&
        it.id !== "saudacao" && seg.intent.id !== "saudacao" && seg.intent.id !== "agradecimento" && it.id !== "agradecimento") {
      extra = seg.intent;
    }
    return {
      intent: it.id,
      label: it.label,
      texto: it.resposta + (extra ? "\n\n" + extra.resposta : ""),
      sugestoes: it.sugestoes || [],
      acao: it.acao || null,
      score: top.score,
      extra: extra ? extra.id : null
    };
  }

  /* ---------- WhatsApp ---------- */
  function urlWhatsApp(texto) {
    return "https://wa.me/" + WHATSAPP_NUMERO + "?text=" + encodeURIComponent(texto);
  }

  function mensagemHandoff(temas, ultimaPergunta) {
    var linhas = ["Olá! Vim pelo site do Med Prime e gostaria de falar com a equipe."];
    var t = (temas || []).filter(function (x) { return x && x !== "Agendar contato"; });
    if (t.length) linhas.push("No chat do site perguntei sobre: " + t.slice(0, 6).join(", ") + ".");
    if (ultimaPergunta) {
      var p = String(ultimaPergunta).trim();
      if (p.length > 160) p = p.slice(0, 157) + "...";
      linhas.push("Minha última dúvida: \"" + p + "\"");
    }
    return linhas.join("\n");
  }

  function mensagemAgendamento(d) {
    var l = ["Olá! Gostaria de agendar uma conversa sobre o Med Prime.", ""];
    l.push("*Nome:* " + d.nome);
    l.push("*Clínica:* " + d.clinica);
    if (d.cidade) l.push("*Cidade:* " + d.cidade);
    l.push("*WhatsApp:* " + d.telefone);
    l.push("*Porte:* " + d.porte);
    l.push("*Interesse principal:* " + d.interesse);
    l.push("*Dia preferido:* " + d.diaTexto);
    l.push("*Horário preferido:* " + d.horarioTexto);
    if (d.temas && d.temas.length) { l.push(""); l.push("No chat do site perguntei sobre: " + d.temas.slice(0, 6).join(", ") + "."); }
    l.push(""); l.push("Aguardo a confirmação. Obrigado!");
    return l.join("\n");
  }

  /* ---------- Datas / telefone ---------- */
  var DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
  var DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  function pad(n) { return (n < 10 ? "0" : "") + n; }

  /* Próximos n dias úteis (seg–sex) a partir de amanhã. */
  function proximosDiasUteis(base, n) {
    var d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    var out = [];
    while (out.length < (n || 5)) {
      d.setDate(d.getDate() + 1);
      var w = d.getDay();
      if (w === 0 || w === 6) continue;
      out.push({
        iso: d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()),
        curto: DIAS_CURTOS[w] + " " + pad(d.getDate()) + "/" + pad(d.getMonth() + 1),
        longo: DIAS[w] + ", " + pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear()
      });
    }
    return out;
  }

  function horariosDisponiveis() {
    var h = [];
    for (var i = 8; i <= 17; i++) h.push(pad(i) + ":00");
    return h;
  }

  function soDigitos(s) { return String(s || "").replace(/\D/g, ""); }

  function mascaraTelefone(v) {
    var d = soDigitos(v);
    if (d.length > 11 && d.indexOf("55") === 0) d = d.slice(2);
    d = d.slice(0, 11);
    if (!d.length) return "";
    if (d.length <= 2) return "(" + d;
    if (d.length <= 6) return "(" + d.slice(0, 2) + ") " + d.slice(2);
    if (d.length <= 10) return "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6);
    return "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
  }

  function telefoneValido(v) {
    var d = soDigitos(v);
    if (d.length > 11 && d.indexOf("55") === 0) d = d.slice(2);
    if (d.length !== 10 && d.length !== 11) return false;
    var ddd = parseInt(d.slice(0, 2), 10);
    if (ddd < 11 || ddd > 99 || d[0] === "0" || d[1] === "0") return false;
    if (d.length === 11 && d[2] !== "9") return false;
    if (/^(\d)\1+$/.test(d.slice(2))) return false;
    return true;
  }

  function nomeValido(v) {
    var s = String(v || "").trim();
    return s.length >= 2 && s.length <= 80 && /[A-Za-zÀ-ÿ]/.test(s) && !/[<>{}]/.test(s);
  }

  /* .ics (Brasília = UTC-3, sem horário de verão desde 2019) */
  function gerarICS(d) {
    // d: { dataIso: "2026-11-23", inicio: "09:00", fim: "09:30", titulo, descricao }
    function utc(dataIso, hhmm) {
      var p = dataIso.split("-"), h = hhmm.split(":");
      var dt = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2], +h[0] + 3, +h[1]));
      return dt.getUTCFullYear() + pad(dt.getUTCMonth() + 1) + pad(dt.getUTCDate()) + "T" + pad(dt.getUTCHours()) + pad(dt.getUTCMinutes()) + "00Z";
    }
    function esc(s) { return String(s).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;"); }
    var agora = new Date();
    var stamp = agora.getUTCFullYear() + pad(agora.getUTCMonth() + 1) + pad(agora.getUTCDate()) + "T" + pad(agora.getUTCHours()) + pad(agora.getUTCMinutes()) + pad(agora.getUTCSeconds()) + "Z";
    return [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Med Prime//Assistente do site//PT-BR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      "UID:" + stamp + "-" + Math.random().toString(36).slice(2) + "@medprime.ia.br",
      "DTSTAMP:" + stamp,
      "DTSTART:" + utc(d.dataIso, d.inicio),
      "DTEND:" + utc(d.dataIso, d.fim),
      "SUMMARY:" + esc(d.titulo),
      "DESCRIPTION:" + esc(d.descricao),
      "URL:https://wa.me/" + WHATSAPP_NUMERO,
      "STATUS:TENTATIVE",
      "END:VEVENT", "END:VCALENDAR", ""
    ].map(dobrar).join("\r\n");
  }

  /* RFC 5545: linhas com no máximo 75 octetos (UTF-8), continuação com espaço. */
  function dobrar(linha) {
    var out = "", atual = "", bytes = 0;
    for (var i = 0; i < linha.length; i++) {
      var ch = linha[i], cp = linha.codePointAt(i);
      if (cp > 0xffff) { ch = linha.slice(i, i + 2); i++; }
      var b = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
      if (bytes + b > (out ? 74 : 75)) { out += (out ? "\r\n " : "") + atual; atual = ""; bytes = 0; }
      atual += ch; bytes += b;
    }
    return out ? out + "\r\n " + atual : atual;
  }

  return {
    WHATSAPP_NUMERO: WHATSAPP_NUMERO,
    WHATSAPP_EXIBICAO: WHATSAPP_EXIBICAO,
    INTENTS: INTENTS,
    normalizar: normalizar,
    classificar: classificar,
    responder: responder,
    urlWhatsApp: urlWhatsApp,
    mensagemHandoff: mensagemHandoff,
    mensagemAgendamento: mensagemAgendamento,
    proximosDiasUteis: proximosDiasUteis,
    horariosDisponiveis: horariosDisponiveis,
    mascaraTelefone: mascaraTelefone,
    telefoneValido: telefoneValido,
    nomeValido: nomeValido,
    gerarICS: gerarICS
  };
});
