/*!
 * Med Prime — Assistente do site (comunicador).
 * Responde dúvidas, explica o sistema, agenda um contato e encaminha para o WhatsApp.
 * Sem dependências externas, sem rastreamento, sem cookies. Requer assets/chat-engine.js.
 *
 * Para ligar um LLM real no futuro, defina AI_ENDPOINT (um proxy serverless que guarda a
 * chave da API). Pode ser aqui ou antes deste script:
 *   <script>window.MEDPRIME_CHAT_CONFIG = { AI_ENDPOINT: "https://.../chat" };</script>
 * Contrato: POST JSON { message, history:[{role,text}], page } -> JSON { reply, suggestions? }.
 * Em qualquer erro ou demora, o assistente volta ao motor local.
 */
(function () {
  "use strict";

  var CONFIG = {
    AI_ENDPOINT: null,
    AI_TIMEOUT_MS: 9000,
    BOT_NAME: "Assistente Med Prime"
  };
  var over = window.MEDPRIME_CHAT_CONFIG || {};
  for (var k in over) if (Object.prototype.hasOwnProperty.call(over, k)) CONFIG[k] = over[k];

  var E = window.MedPrimeEngine;
  if (!E) { console.warn("Med Prime chat: chat-engine.js não carregado."); return; }

  /* ---------- Ícones ---------- */
  var ICON = {
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    restart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>',
    wa: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z"/></svg>',
    mark: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#0E7A72"/><rect x="14" y="7" width="4" height="18" rx="1" fill="#fff"/><rect x="7" y="14" width="18" height="4" rx="1" fill="#C67A2E"/></svg>'
  };

  /* ---------- DOM ---------- */
  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    if (attrs) for (var a in attrs) {
      if (a === "text") n.textContent = attrs[a];
      else if (a === "className") n.className = attrs[a];
      else n.setAttribute(a, attrs[a]);
    }
    if (html != null) n.innerHTML = html;
    return n;
  }

  var root = el("div", { className: "mpc-root" });
  var launcher = el("button", { type: "button", className: "mpc-launcher", "aria-expanded": "false", "aria-controls": "mpc-panel", "aria-label": "Abrir o chat do Assistente Med Prime" },
    ICON.chat + '<span class="mpc-dot" aria-hidden="true"></span><span>Tire suas dúvidas<span class="mpc-label-long"> com o assistente</span></span>');
  var panel = el("section", { id: "mpc-panel", className: "mpc-panel", role: "dialog", "aria-modal": "false", "aria-labelledby": "mpc-title" });
  panel.innerHTML =
    '<header class="mpc-head">' +
      '<div class="mpc-avatar">' + ICON.mark + '</div>' +
      '<div class="mpc-title"><strong id="mpc-title">' + CONFIG.BOT_NAME + '</strong><span>Respostas na hora · atendimento pelo WhatsApp</span></div>' +
      '<button type="button" class="mpc-iconbtn" data-mpc="restart" aria-label="Recomeçar a conversa" title="Recomeçar">' + ICON.restart + '</button>' +
      '<button type="button" class="mpc-iconbtn" data-mpc="close" aria-label="Fechar o chat (Esc)" title="Fechar">' + ICON.close + '</button>' +
    '</header>' +
    '<div class="mpc-log" role="log" aria-live="polite" aria-relevant="additions" aria-label="Conversa com o assistente" tabindex="0"></div>' +
    '<div class="mpc-foot">' +
      '<form class="mpc-form" novalidate>' +
        '<label class="mpc-sr" for="mpc-input">Sua mensagem</label>' +
        '<input id="mpc-input" class="mpc-input" type="text" autocomplete="off" maxlength="300" placeholder="Digite sua pergunta…" aria-describedby="mpc-err">' +
        '<button type="submit" class="mpc-send" aria-label="Enviar mensagem">' + ICON.send + '</button>' +
      '</form>' +
      '<p id="mpc-err" class="mpc-err" role="alert"></p>' +
      '<div class="mpc-bar"><span>Assistente automático. Sem cadastro.</span>' +
        '<button type="button" class="mpc-wa-link" data-mpc="wa">' + ICON.wa + 'Falar no WhatsApp</button></div>' +
    '</div>';
  root.appendChild(launcher);
  root.appendChild(panel);

  var log = panel.querySelector(".mpc-log");
  var form = panel.querySelector(".mpc-form");
  var input = panel.querySelector(".mpc-input");
  var errBox = panel.querySelector(".mpc-err");

  /* ---------- Estado ---------- */
  var S = { iniciado: false, historico: [], temas: [], ultimaPergunta: "", fluxo: null, ocupado: false, ultimoAgendamento: null };

  function addTema(label) { if (label && S.temas.indexOf(label) === -1) S.temas.push(label); }

  function rolar() { log.scrollTop = log.scrollHeight; }

  function limparChips() { log.querySelectorAll(".mpc-chips").forEach(function (c) { c.remove(); }); }

  function msgBot(texto, extraNode) {
    var m = el("div", { className: "mpc-msg bot" });
    m.textContent = texto;
    if (extraNode) m.appendChild(extraNode);
    log.appendChild(m); rolar();
    S.historico.push({ role: "assistant", text: texto });
    return m;
  }
  function msgUser(texto) {
    var m = el("div", { className: "mpc-msg user", text: texto });
    log.appendChild(m); rolar();
    S.historico.push({ role: "user", text: texto });
  }

  /* chips: lista de strings ou {label, value, cls} */
  function chips(lista, onPick) {
    limparChips();
    if (!lista || !lista.length) return;
    var box = el("div", { className: "mpc-chips", role: "group", "aria-label": "Respostas rápidas" });
    lista.forEach(function (c) {
      var o = typeof c === "string" ? { label: c, value: c } : c;
      var b = el("button", { type: "button", className: "mpc-chip" + (o.cls ? " " + o.cls : ""), text: o.label });
      b.addEventListener("click", function () { (onPick || aoEscolherChip)(o.value != null ? o.value : o.label, o.label); });
      box.appendChild(b);
    });
    log.appendChild(box); rolar();
  }

  function digitando(ms) {
    return new Promise(function (res) {
      var t = el("div", { className: "mpc-typing", "aria-label": "O assistente está digitando" }, "<span></span><span></span><span></span>");
      log.appendChild(t); rolar();
      setTimeout(function () { t.remove(); res(); }, ms);
    });
  }
  function tempoDigitar(txt) { return Math.max(450, Math.min(1300, 250 + String(txt).length * 6)); }

  async function falar(texto, sugestoes, onPick, extraNode) {
    S.ocupado = true;
    limparChips();
    await digitando(tempoDigitar(texto));
    msgBot(texto, extraNode);
    if (sugestoes) chips(sugestoes, onPick);
    S.ocupado = false;
  }

  function erro(msg) {
    errBox.textContent = msg || "";
    input.setAttribute("aria-invalid", msg ? "true" : "false");
  }

  /* ---------- WhatsApp ---------- */
  function abrirWhatsApp(texto) {
    var url = E.urlWhatsApp(texto);
    var w = window.open(url, "_blank", "noopener");
    return { url: url, aberto: !!w };
  }
  function linkWA(url, rotulo) {
    var p = el("div");
    var a = el("a", { href: url, target: "_blank", rel: "noopener", text: rotulo || "Abrir o WhatsApp" });
    p.appendChild(document.createTextNode("\n"));
    p.appendChild(a);
    return p;
  }

  function handoff(motivo) {
    var texto;
    if (motivo === "proposta") texto = "Olá! Vim pelo site e gostaria de solicitar uma proposta comercial do Med Prime." + (S.temas.length ? "\nNo chat do site perguntei sobre: " + S.temas.slice(0, 6).join(", ") + "." : "");
    else if (motivo === "teste") texto = "Olá! Vim pelo site e gostaria de solicitar o ambiente de teste grátis do Med Prime." + (S.temas.length ? "\nNo chat do site perguntei sobre: " + S.temas.slice(0, 6).join(", ") + "." : "");
    else texto = E.mensagemHandoff(S.temas, S.ultimaPergunta);
    var r = abrirWhatsApp(texto);
    falar("Abri o WhatsApp da Med Prime (" + E.WHATSAPP_EXIBICAO + ") com uma mensagem pronta. É só enviar por lá. Se não abriu, toque no link abaixo.",
      ["Agendar contato", "Quais recursos?"], null, linkWA(r.url, "Abrir o WhatsApp " + E.WHATSAPP_EXIBICAO));
  }

  /* ---------- Respostas (LLM opcional + motor local) ---------- */
  async function perguntarIA(texto) {
    if (!CONFIG.AI_ENDPOINT || !window.fetch) return null;
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, CONFIG.AI_TIMEOUT_MS) : null;
    try {
      var r = await fetch(CONFIG.AI_ENDPOINT, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: texto, history: S.historico.slice(-12), page: location.href }),
        signal: ctrl ? ctrl.signal : undefined
      });
      if (!r.ok) return null;
      var j = await r.json();
      return j && typeof j.reply === "string" && j.reply.trim() ? j : null;
    } catch (e) { return null; }
    finally { if (timer) clearTimeout(timer); }
  }

  async function responderPergunta(texto) {
    var local = E.responder(texto);
    if (local.acao === "agendar") { addTema("Agendar contato"); return iniciarAgendamento(); }
    if (local.acao === "whatsapp") return handoff();
    S.ultimaPergunta = texto;
    if (local.label && local.intent !== "saudacao" && local.intent !== "agradecimento") addTema(local.label);
    if (local.extra) { var ex = E.INTENTS.filter(function (i) { return i.id === local.extra; })[0]; if (ex) addTema(ex.label); }

    if (CONFIG.AI_ENDPOINT) {
      S.ocupado = true;
      var t = el("div", { className: "mpc-typing", "aria-label": "O assistente está digitando" }, "<span></span><span></span><span></span>");
      limparChips(); log.appendChild(t); rolar();
      var ia = await perguntarIA(texto);
      t.remove(); S.ocupado = false;
      if (ia) { msgBot(ia.reply); chips(ia.suggestions || local.sugestoes || ["Agendar contato", "Falar no WhatsApp"]); return; }
    }
    await falar(local.texto, local.sugestoes && local.sugestoes.length ? local.sugestoes : ["Agendar contato", "Falar no WhatsApp"]);
  }

  function aoEscolherChip(valor, rotulo) {
    if (S.ocupado) return;
    var v = String(valor);
    if (v === "Agendar contato") { msgUser(rotulo); addTema("Agendar contato"); return iniciarAgendamento(); }
    if (v === "Falar no WhatsApp") { msgUser(rotulo); return handoff(); }
    if (v === "Pedir proposta no WhatsApp") { msgUser(rotulo); addTema("Preço"); return handoff("proposta"); }
    if (v === "Pedir teste no WhatsApp") { msgUser(rotulo); addTema("Teste grátis"); return handoff("teste"); }
    if (v === "__ics") return baixarICS();
    if (v === "__menu") { msgUser(rotulo); return falar("Claro! Sobre o que mais você quer saber?", SUGESTOES_INICIAIS); }
    msgUser(rotulo);
    responderPergunta(v);
  }

  var SUGESTOES_INICIAIS = ["Como funciona a telefonia IA?", "Site com agendamento online", "Quais recursos?", "Quanto custa?", "Teste grátis", "Agendar contato",
    { label: "Falar no WhatsApp", value: "Falar no WhatsApp", cls: "wa" }];

  function saudar() {
    S.iniciado = true;
    falar("Olá! Eu sou o " + CONFIG.BOT_NAME + ".\nPosso explicar como o Med Prime funciona (gestão completa da clínica com telefonia por IA), tirar dúvidas, agendar uma conversa com a equipe ou te passar direto para o WhatsApp. Como posso ajudar?",
      SUGESTOES_INICIAIS);
  }

  /* ---------- Fluxo de agendamento ---------- */
  var PORTES = ["Até 5 profissionais", "6 a 15 profissionais", "16 a 40 profissionais", "Mais de 40 profissionais", "Rede com várias unidades"];
  var INTERESSES = ["Telefonia com IA", "Gestão completa da clínica", "Atendimento por WhatsApp", "Agenda e fila", "Site da clínica integrado", "Prontuário, exames e laudos", "Convênios e TISS", "Financeiro e caixa", "Ambiente de teste grátis"];
  var PERIODOS = [
    { label: "Manhã (08h às 12h)", value: "manha" },
    { label: "Tarde (13h às 18h)", value: "tarde" },
    { label: "Escolher horário", value: "horario" }
  ];
  var ROTULOS = { nome: "Nome", clinica: "Clínica", cidade: "Cidade", telefone: "WhatsApp", porte: "Porte", interesse: "Interesse", dia: "Dia", periodo: "Horário" };

  function iniciarAgendamento() {
    S.fluxo = { passo: null, dados: {}, editando: false, dias: E.proximosDiasUteis(new Date(), 5) };
    falar("Vamos agendar uma conversa com a equipe da Med Prime. São 8 perguntas rápidas, e no fim eu abro o WhatsApp com tudo preenchido. Para sair, é só digitar \"cancelar\".", null).then(function () { irPara("nome"); });
  }

  function configurarInput(passo) {
    input.type = passo === "telefone" ? "tel" : "text";
    input.setAttribute("inputmode", passo === "telefone" ? "tel" : "text");
    input.setAttribute("autocomplete", passo === "nome" ? "name" : (passo === "telefone" ? "tel-national" : (passo === "cidade" ? "address-level2" : "off")));
    var ph = { nome: "Seu nome", clinica: "Nome da clínica", cidade: "Cidade (opcional)", telefone: "(11) 91234-5678", porte: "Escolha uma opção ou digite", interesse: "Escolha uma opção ou digite", dia: "Escolha um dia acima", periodo: "Escolha ou digite um horário (ex.: 10:00)", horario: "Ex.: 14:00", resumo: "Escolha uma opção acima", editar: "Escolha o que corrigir" };
    input.placeholder = ph[passo] || "Digite sua pergunta…";
  }

  function irPara(passo) {
    var f = S.fluxo; if (!f) return;
    f.passo = passo; erro(""); configurarInput(passo);
    var nome = f.dados.nome ? f.dados.nome.split(" ")[0] : "";
    switch (passo) {
      case "nome": return falar("Para começar, qual é o seu nome?", [{ label: "Cancelar", value: "__cancelar" }], fluxoChip);
      case "clinica": return falar((nome && !f.editando ? "Prazer, " + nome + "! " : "") + "Qual é o nome da clínica?", null);
      case "cidade": return falar("Em qual cidade fica a clínica? (opcional)", [{ label: "Pular", value: "__pular" }], fluxoChip);
      case "telefone": return falar("Qual é o seu WhatsApp com DDD? É por ele que a equipe vai confirmar o horário.", null);
      case "porte": return falar("Qual é o porte da clínica?", PORTES, fluxoChip);
      case "interesse": return falar("O que mais interessa você no Med Prime?", INTERESSES, fluxoChip);
      case "dia": return falar("Qual dia é melhor para a conversa? (dias úteis)", f.dias.map(function (d) { return { label: d.curto, value: d.iso }; }), fluxoChip);
      case "periodo": return falar("E qual período ou horário prefere? (horário de Brasília)", PERIODOS, fluxoChip);
      case "horario": return falar("Escolha um horário (horário de Brasília):", E.horariosDisponiveis(), fluxoChip);
      case "resumo": return mostrarResumo();
      case "editar": return falar("O que você quer corrigir?", Object.keys(ROTULOS).map(function (k) { return { label: ROTULOS[k], value: "__edit_" + k }; }).concat([{ label: "Voltar ao resumo", value: "__resumo" }]), fluxoChip);
    }
  }

  function proximo(atual) {
    var f = S.fluxo;
    if (f.editando && atual !== "periodo") { f.editando = false; return irPara("resumo"); }
    var ordem = ["nome", "clinica", "cidade", "telefone", "porte", "interesse", "dia", "periodo"];
    if (atual === "periodo" || atual === "horario") { f.editando = false; return irPara("resumo"); }
    irPara(ordem[ordem.indexOf(atual) + 1]);
  }

  function fluxoChip(valor, rotulo) {
    if (S.ocupado || !S.fluxo) return;
    var f = S.fluxo, v = String(valor);
    if (v === "__cancelar") { msgUser("Cancelar"); return cancelarFluxo(); }
    if (v === "__resumo") { msgUser(rotulo); f.editando = false; return irPara("resumo"); }
    if (v === "__confirmar") { msgUser(rotulo); return confirmar(); }
    if (v === "__editar") { msgUser(rotulo); return irPara("editar"); }
    if (v.indexOf("__edit_") === 0) { msgUser(rotulo); f.editando = true; return irPara(v.slice(7)); }
    if (v === "__ics") return baixarICS();
    if (v === "__menu") { msgUser(rotulo); S.fluxo = null; configurarInput(""); return falar("Claro! Sobre o que mais você quer saber?", SUGESTOES_INICIAIS); }
    if (v === "Falar no WhatsApp") { msgUser(rotulo); return handoff(); }
    msgUser(rotulo);
    processarPasso(v, rotulo);
  }

  function processarPasso(valor, rotulo) {
    var f = S.fluxo, d = f.dados, p = f.passo, v = String(valor).trim();
    function invalido(msg, reask) { erro(msg); falar(msg, reask || null, fluxoChip); }
    switch (p) {
      case "nome":
        if (!E.nomeValido(v)) return invalido("Pode me dizer seu nome? (pelo menos 2 letras)");
        d.nome = v.replace(/\s+/g, " "); return proximo(p);
      case "clinica":
        if (!E.nomeValido(v)) return invalido("Qual é o nome da clínica? (pelo menos 2 letras)");
        d.clinica = v.replace(/\s+/g, " "); return proximo(p);
      case "cidade":
        if (v === "__pular" || /^(pular|nao|não|-)$/i.test(v)) { d.cidade = ""; return proximo(p); }
        if (!E.nomeValido(v)) return invalido("Digite o nome da cidade ou toque em \"Pular\".", [{ label: "Pular", value: "__pular" }]);
        d.cidade = v.replace(/\s+/g, " "); return proximo(p);
      case "telefone":
        if (!E.telefoneValido(v)) return invalido("Esse número não parece válido. Digite o WhatsApp com DDD, por exemplo (11) 91234-5678.");
        d.telefone = E.mascaraTelefone(v); return proximo(p);
      case "porte":
        if (v.length < 1) return invalido("Escolha uma das opções.", PORTES);
        d.porte = rotulo || v; return proximo(p);
      case "interesse":
        if (v.length < 2) return invalido("Escolha uma das opções.", INTERESSES);
        d.interesse = rotulo || v; return proximo(p);
      case "dia": {
        var dia = f.dias.filter(function (x) { return x.iso === v; })[0] || acharDia(v);
        if (!dia) return invalido("Escolha um dos dias úteis abaixo.", f.dias.map(function (x) { return { label: x.curto, value: x.iso }; }));
        d.dia = dia; return proximo(p);
      }
      case "periodo": {
        var n = E.normalizar(v);
        if (v === "manha" || /^manha/.test(n)) { d.periodo = { tipo: "manha", texto: "Manhã (08h às 12h)", inicio: "08:00", fim: "12:00" }; return proximo("periodo"); }
        if (v === "tarde" || /^tarde/.test(n)) { d.periodo = { tipo: "tarde", texto: "Tarde (13h às 18h)", inicio: "13:00", fim: "18:00" }; return proximo("periodo"); }
        if (v === "horario" || /escolher/.test(n)) return irPara("horario");
        var h = lerHora(v);
        if (h) { d.periodo = h; return proximo("periodo"); }
        return invalido("Escolha Manhã, Tarde ou um horário entre 08:00 e 18:00.", PERIODOS);
      }
      case "horario": {
        var hh = lerHora(v);
        if (!hh) return invalido("Escolha um horário entre 08:00 e 17:30.", E.horariosDisponiveis());
        d.periodo = hh; return proximo("horario");
      }
      case "resumo": case "editar":
        return falar("Use os botões acima para confirmar ou corrigir.", null).then(function () { irPara(p); });
    }
  }

  function acharDia(txt) {
    var n = E.normalizar(txt); var f = S.fluxo;
    var m = n.match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
    return f.dias.filter(function (x) {
      var dd = x.iso.slice(8), mm = x.iso.slice(5, 7);
      if (m) return +m[1] === +dd && +m[2] === +mm;
      return n.length >= 3 && E.normalizar(x.longo).indexOf(n.slice(0, 3)) === 0;
    })[0] || null;
  }

  function lerHora(txt) {
    var m = String(txt).match(/^(\d{1,2})(?:\s*[:h]\s*(\d{2}))?\s*h?$/i);
    if (!m) return null;
    var h = +m[1], mi = m[2] ? +m[2] : 0;
    if (mi !== 0 && mi !== 30) return null;
    if (h < 8 || h > 17 || (h === 17 && mi > 30)) return null;
    var p2 = function (x) { return (x < 10 ? "0" : "") + x; };
    var ini = p2(h) + ":" + p2(mi);
    var fimMin = h * 60 + mi + 30;
    return { tipo: "hora", texto: ini, inicio: ini, fim: p2(Math.floor(fimMin / 60)) + ":" + p2(fimMin % 60) };
  }

  function dadosMensagem() {
    var d = S.fluxo.dados;
    return {
      nome: d.nome, clinica: d.clinica, cidade: d.cidade, telefone: d.telefone, porte: d.porte, interesse: d.interesse,
      diaTexto: d.dia.longo, horarioTexto: d.periodo.texto + (d.periodo.tipo === "hora" ? " (horário de Brasília)" : ""),
      temas: S.temas.filter(function (t) { return t !== "Agendar contato"; })
    };
  }

  function mostrarResumo() {
    var d = S.fluxo.dados;
    var ul = el("ul", { className: "mpc-summary" });
    [["Nome", d.nome], ["Clínica", d.clinica], ["Cidade", d.cidade || "não informada"], ["WhatsApp", d.telefone], ["Porte", d.porte], ["Interesse", d.interesse], ["Dia", d.dia.longo], ["Horário", d.periodo.texto]]
      .forEach(function (r) { var li = el("li"); li.appendChild(el("b", { text: r[0] + ": " })); li.appendChild(document.createTextNode(r[1])); ul.appendChild(li); });
    return falar("Confira os dados do agendamento:", [
      { label: "Confirmar e abrir WhatsApp", value: "__confirmar", cls: "wa" },
      { label: "Editar", value: "__editar" },
      { label: "Cancelar", value: "__cancelar" }
    ], fluxoChip, ul);
  }

  function confirmar() {
    var dm = dadosMensagem();
    var texto = E.mensagemAgendamento(dm);
    var r = abrirWhatsApp(texto);
    S.ultimoAgendamento = { dados: JSON.parse(JSON.stringify(S.fluxo.dados)), texto: texto };
    S.fluxo.passo = "feito";
    configurarInput("");
    falar("Pronto, " + S.fluxo.dados.nome.split(" ")[0] + "! Abri o WhatsApp da Med Prime com o pedido de agendamento preenchido. Envie a mensagem por lá e a equipe confirma o horário com você. Se o WhatsApp não abriu, use o link abaixo.\nSe quiser, baixe o convite para a sua agenda (o horário ainda será confirmado pela equipe).",
      [{ label: "Baixar convite (.ics)", value: "__ics", cls: "primary" }, { label: "Voltar às perguntas", value: "__menu" }],
      fluxoChip, linkWA(r.url, "Abrir o WhatsApp " + E.WHATSAPP_EXIBICAO));
  }

  function baixarICS() {
    var ag = S.ultimoAgendamento; if (!ag) return;
    var d = ag.dados;
    var ics = E.gerarICS({
      dataIso: d.dia.iso, inicio: d.periodo.inicio, fim: d.periodo.fim,
      titulo: "Conversa sobre o Med Prime" + (d.periodo.tipo === "hora" ? "" : " (" + d.periodo.texto + ", a confirmar)"),
      descricao: "Pedido de conversa com a equipe da Med Prime, a confirmar pelo WhatsApp " + E.WHATSAPP_EXIBICAO + ".\n\n" + ag.texto.replace(/\*/g, "")
    });
    var blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    var a = el("a", { href: URL.createObjectURL(blob), download: "conversa-med-prime-" + d.dia.iso + ".ics" });
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  function cancelarFluxo() {
    S.fluxo = null; configurarInput(""); erro("");
    falar("Tudo bem, cancelei o agendamento. Posso ajudar com mais alguma coisa?", SUGESTOES_INICIAIS);
  }

  /* ---------- Entrada de texto ---------- */
  input.addEventListener("input", function () {
    if (S.fluxo && S.fluxo.passo === "telefone") {
      var pos = input.value.length, m = E.mascaraTelefone(input.value);
      if (m !== input.value) { input.value = m; try { input.setSelectionRange(m.length, m.length); } catch (e) {} }
    }
    if (errBox.textContent) erro("");
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var v = input.value.trim();
    if (!v || S.ocupado) return;
    input.value = "";
    if (S.fluxo && S.fluxo.passo && S.fluxo.passo !== "feito") {
      if (/^(cancelar|sair|parar)$/i.test(E.normalizar(v))) { msgUser(v); return cancelarFluxo(); }
      msgUser(v);
      return processarPasso(v, null);
    }
    if (S.fluxo && S.fluxo.passo === "feito") S.fluxo = null;
    msgUser(v);
    responderPergunta(v);
  });

  /* ---------- Abrir / fechar ---------- */
  function abrir() {
    root.classList.add("is-open");
    launcher.setAttribute("aria-expanded", "true");
    if (!S.iniciado) saudar();
    setTimeout(function () { input.focus(); }, 60);
  }
  function fechar() {
    root.classList.remove("is-open");
    launcher.setAttribute("aria-expanded", "false");
    launcher.focus();
  }
  function recomecar() {
    log.innerHTML = ""; S.historico = []; S.temas = []; S.ultimaPergunta = ""; S.fluxo = null; S.ultimoAgendamento = null;
    configurarInput(""); erro(""); saudar(); input.focus();
  }

  launcher.addEventListener("click", abrir);
  panel.addEventListener("click", function (e) {
    var b = e.target.closest("[data-mpc]"); if (!b) return;
    var a = b.getAttribute("data-mpc");
    if (a === "close") fechar();
    else if (a === "restart") recomecar();
    else if (a === "wa") { if (!S.iniciado) S.iniciado = true; msgUser("Falar no WhatsApp"); handoff(); }
  });
  document.addEventListener("keydown", function (e) {
    if ((e.key === "Escape" || e.key === "Esc") && root.classList.contains("is-open")) { e.preventDefault(); fechar(); }
  });
  // Qualquer elemento da página com data-mpc-open abre o assistente
  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("[data-mpc-open]");
    if (t) { e.preventDefault(); abrir(); }
  });

  function montar() { document.body.appendChild(root); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", montar); else montar();

  window.MedPrimeChat = { abrir: abrir, fechar: fechar, config: CONFIG };
})();
