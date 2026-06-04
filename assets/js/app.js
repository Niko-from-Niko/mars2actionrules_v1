const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const toast = $("#toast");
let toastTimer;
const channelMeta = {
  center: { label: "Центр уведомлений", icon: "#i-bell" },
  email: { label: "E-mail", icon: "#i-mail" },
  telegram: { label: "Telegram", icon: "#i-send" },
  team: { label: "Команда", icon: "#i-users" },
  sms: { label: "SMS", icon: "#i-message" }
};
const recipientDirectory = {
  center: {
    group: "PostgreSQL",
    people: [
      { name: "Иванов Иван Иванович", login: "ivanovii" },
      { name: "Константинопольский Константин Константинович", login: "konstantinopolskyy" },
      { name: "Петров Алексей Петрович", login: "petrova" },
      { name: "Фадеев Антон Николаевич", login: "fadeeva" },
      { name: "Чернышев Артём Александрович", login: "chernishova" },
      { name: "Королев Сергей Данилович", login: "korolevs" }
    ]
  },
  email: {
    group: "PostgreSQL",
    people: [
      { name: "Иванов Иван Иванович", login: "ivanovii" },
      { name: "Константинопольский Константин Константинович", login: "konstantinopolskyy" },
      { name: "Петров Алексей Петрович", login: "petrova" },
      { name: "Фадеев Антон Николаевич", login: "fadeeva" },
      { name: "Чернышев Артём Александрович", login: "chernishova" },
      { name: "Королев Сергей Данилович", login: "korolevs" }
    ]
  },
  telegram: {
    group: "PostgreSQL",
    people: [
      { name: "Иванов Иван Иванович", login: "ivanovii" },
      { name: "Константинопольский Константин Константинович", login: "konstantinopolskyy" },
      { name: "Петров Алексей Петрович", login: "petrova" },
      { name: "Фадеев Антон Николаевич", login: "fadeeva" },
      { name: "Чернышев Артём Александрович", login: "chernishova" },
      { name: "Королев Сергей Данилович", login: "korolevs" }
    ]
  },
  sms: {
    group: "PostgreSQL",
    people: [
      { name: "Иванов Иван Иванович", login: "ivanovii" },
      { name: "Константинопольский Константин Константинович", login: "konstantinopolskyy" },
      { name: "Петров Алексей Петрович", login: "petrova" },
      { name: "Фадеев Антон Николаевич", login: "fadeeva" },
      { name: "Чернышев Артём Александрович", login: "chernishova" },
      { name: "Королев Сергей Данилович", login: "korolevs" }
    ]
  },
  team: {
    group: "PostgreSQL",
    people: [
      { name: "Иванов Иван Иванович", login: "ivanovii" },
      { name: "Константинопольский Константин Константинович", login: "konstantinopolskyy" },
      { name: "Петров Алексей Петрович", login: "petrova" },
      { name: "Фадеев Антон Николаевич", login: "fadeeva" },
      { name: "Чернышев Артём Александрович", login: "chernishova" },
      { name: "Королев Сергей Данилович", login: "korolevs" }
    ]
  }
};
const incidentMeta = {
  "sphere-incidents": { label: "Сфера Инциденты", icon: "#i-incident" },
  "sphere-outages": { label: "Сфера Аварии", icon: "#i-outage" }
};
const ruleSteps = {
  initial: {
    exists: true,
    name: "Начальные действия",
    channels: new Set(),
    incidents: new Set(),
    notificationSettings: {},
    recovery: false,
    delayEnabled: false,
    delayMinutes: 60,
    order: 0
  }
};
let currentStep = "initial";
let stepPendingDelete = null;
let escalationId = 0;
let stepOrder = 0;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
}

function closeMenus(except) {
  $$(".select-wrap.open, .dropdown.open, .period-dropdown.open").forEach((node) => {
    if (node !== except) node.classList.remove("open");
  });
  syncPeriodDropdownLayer();
}

function syncPeriodDropdownLayer() {
  const open = Boolean($(".period-dropdown.open"));
  $(".content-grid")?.classList.toggle("dropdown-open", open);
  $(".side-panel")?.classList.toggle("dropdown-open", open);
  $(".period-area")?.classList.toggle("dropdown-open", open);
}

function parseRecipients(wrap) {
  try {
    return JSON.parse(wrap.dataset.selectedRecipients || "[]");
  } catch {
    return [];
  }
}

function setRecipients(wrap, recipients) {
  const unique = Array.from(new Set(recipients));
  wrap.dataset.selectedRecipients = JSON.stringify(unique);
  wrap.dataset.selected = unique.length ? "true" : "false";
}

function getRecipientConfig(channel) {
  const fallback = recipientDirectory[channel.dataset.channel] || {
    group: "PostgreSQL",
    people: [
      { name: "Иванов Иван Иванович", login: "ivanovii" },
      { name: "Константинопольский Константин Константинович", login: "konstantinopolskyy" },
      { name: "Петров Алексей Петрович", login: "petrova" }
    ]
  };
  const monitoringGroup = $(".group-field")?.dataset.selected === "true"
    ? $(".group-value")?.textContent.trim()
    : "";
  return {
    ...fallback,
    group: monitoringGroup || fallback.group
  };
}

function recipientPlaceholder(channel) {
  const channelName = $(".channel-title > span", channel)?.textContent || "";
  if (channel.dataset.inputMode === "address") {
    if (channelName === "Telegram") return "Введите Telegram ID группового чата";
    if (channelName === "SMS") return "Введите групповой номер или имя рассылки";
    if (channelName === "Команда") return "Введите Team ID группового чата";
    return "Введите групповой адрес";
  }
  return "Выберите получателей из списка";
}

function syncRecipientInputMode(channel) {
  const wrap = $(".select-wrap[data-recipient-picker='true']", channel);
  if (!wrap) return;

  const listButton = $(".select-button", wrap);
  const addressInput = $(".recipient-address-input", wrap);
  const addressMode = channel.dataset.inputMode === "address";
  if (listButton) listButton.hidden = addressMode;
  if (addressInput) {
    addressInput.hidden = !addressMode;
    addressInput.placeholder = recipientPlaceholder(channel);
  }
  if (addressMode) wrap.classList.remove("open");
}

function renderRecipientValue(wrap) {
  const channel = wrap.closest(".channel");
  const display = $(".select-value", wrap);
  if (!channel || !display) return;

  const selected = parseRecipients(wrap);
  display.innerHTML = "";
  display.classList.toggle("has-tokens", selected.length > 0);

  if (!selected.length) {
    display.textContent = recipientPlaceholder(channel);
    return;
  }

  selected.forEach((login) => {
    const token = document.createElement("span");
    token.className = "recipient-token";
    token.textContent = login;

    const close = document.createElement("span");
    close.className = "recipient-token-x";
    close.setAttribute("aria-hidden", "true");
    close.textContent = "×";
    token.append(close);
    display.append(token);
  });
}

function syncRecipientMenu(wrap) {
  const channel = wrap.closest(".channel");
  const config = getRecipientConfig(channel);
  const selected = parseRecipients(wrap);
  const logins = config.people.map((person) => person.login);
  const selectedPeople = selected.filter((login) => logins.includes(login));
  const groupSelected = selectedPeople.length === logins.length && logins.every((login) => selected.includes(login));

  const groupButton = $("[data-recipient-group]", wrap);
  if (groupButton) {
    const groupLabel = $("[data-recipient-group-label]", groupButton);
    if (groupLabel) groupLabel.textContent = config.group;
    groupButton.classList.toggle("selected", groupSelected);
    groupButton.setAttribute("aria-checked", String(groupSelected));
  }

  $$("[data-recipient-user]", wrap).forEach((button) => {
    const active = selectedPeople.includes(button.dataset.recipientUser);
    button.classList.toggle("selected", active);
    button.setAttribute("aria-checked", String(active));
  });

  renderRecipientValue(wrap);
}

function toggleRecipient(wrap, value) {
  const selected = parseRecipients(wrap);
  const next = selected.includes(value)
    ? selected.filter((item) => item !== value)
    : [...selected, value];
  setRecipients(wrap, next);
  syncRecipientMenu(wrap);
  persistCurrentStep();
  updateCreateState();
}

function toggleRecipientGroup(wrap) {
  const channel = wrap.closest(".channel");
  const { people } = getRecipientConfig(channel);
  const logins = people.map((person) => person.login);
  const selected = parseRecipients(wrap);
  const allSelected = logins.every((login) => selected.includes(login));
  setRecipients(wrap, allSelected ? [] : logins);
  syncRecipientMenu(wrap);
  persistCurrentStep();
  updateCreateState();
}

function initRecipientPickers() {
  $$(".channel").forEach((channel) => {
    channel.dataset.inputMode = channel.dataset.inputMode || "list";
    const wrap = $(".select-wrap", channel);
    if (!wrap) return;
    const menu = $(".menu", wrap);
    if (!menu) return;

    const config = getRecipientConfig(channel);
    wrap.dataset.recipientPicker = "true";
    menu.classList.add("recipient-menu");
    if (!$(".recipient-address-input", wrap)) {
      const input = document.createElement("input");
      input.className = "recipient-address-input";
      input.type = "text";
      input.hidden = true;
      input.autocomplete = "off";
      input.addEventListener("click", (event) => event.stopPropagation());
      input.addEventListener("input", () => {
        wrap.dataset.addressValue = input.value;
        wrap.dataset.selected = input.value.trim() ? "true" : "false";
        persistCurrentStep();
        updateCreateState();
      });
      $(".select-button", wrap).after(input);
    }
    menu.innerHTML = `
      <button class="recipient-row recipient-group" type="button" role="checkbox" aria-checked="false" data-recipient-group>
        <span class="recipient-check"><svg class="icon icon-sm"><use href="#i-check"></use></svg></span>
        <span data-recipient-group-label>${config.group}</span>
      </button>
      <div class="recipient-users">
        ${config.people.map((person) => `
          <button class="recipient-row recipient-user" type="button" role="checkbox" aria-checked="false" data-recipient-user="${person.login}">
            <span class="recipient-check"><svg class="icon icon-sm"><use href="#i-check"></use></svg></span>
            <span class="recipient-user-text">${person.name} <span class="recipient-login">(${person.login})</span></span>
          </button>
        `).join("")}
      </div>
    `;

    $("[data-recipient-group]", wrap).addEventListener("click", (event) => {
      event.stopPropagation();
      toggleRecipientGroup(wrap);
    });

    $$("[data-recipient-user]", wrap).forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleRecipient(wrap, button.dataset.recipientUser);
      });
    });

    syncRecipientMenu(wrap);
    syncRecipientInputMode(channel);
  });
}

function updateStepTabsLayout() {
  const tabs = $(".step-tabs");
  if (!tabs) return;

  const tabItems = $$(".step-tab-item", tabs).filter((item) => !item.hidden);
  const count = tabItems.length;
  if (!count) return;

  const addButton = $("#add-step-tab");
  const available = Math.max(0, tabs.clientWidth - (addButton?.offsetWidth || 0));
  const gap = Math.min(4, available / Math.max(count * 18, 1));
  const basis = Math.min(260, Math.max(0, (available - gap * count) / count));
  const manyTabs = count > 5;
  const activeBasis = manyTabs ? Math.min(280, basis * 1.25) : basis;
  const inactiveBasis = manyTabs && count > 1
    ? Math.max(0, (available - gap * count - activeBasis) / (count - 1))
    : basis;

  tabs.style.setProperty("--step-tab-gap", `${gap}px`);
  tabs.style.setProperty("--step-tab-basis", `${manyTabs ? inactiveBasis : basis}px`);
  tabs.style.setProperty("--step-tab-active-basis", `${activeBasis}px`);
  tabs.classList.toggle("many-tabs", manyTabs);
  tabs.classList.toggle("compressed", basis < 120);
  tabs.classList.toggle("dense", basis < 72);

  const activeTab = $(".step-tab-item.active", tabs);
  const activeLeft = activeTab ? Math.max(0, activeTab.offsetLeft) : 0;
  const activeRight = activeTab ? Math.min(tabs.clientWidth, activeTab.offsetLeft + activeTab.offsetWidth) : 0;
  tabs.style.setProperty("--step-tab-left-line", `${activeLeft}px`);
  tabs.style.setProperty("--step-tab-right-line-left", `${activeRight}px`);
}

function scheduleStepTabsLayout() {
  requestAnimationFrame(updateStepTabsLayout);
}

function isEscalationStep(stepName) {
  return stepName !== "initial";
}

function getOrderedStepNames() {
  return Object.entries(ruleSteps)
    .filter(([, step]) => step.exists)
    .sort(([, first], [, second]) => first.order - second.order)
    .map(([stepName]) => stepName);
}

function getEscalationStepNames() {
  return getOrderedStepNames().filter(isEscalationStep);
}

function getStepNumber(stepName) {
  const index = getOrderedStepNames().indexOf(stepName);
  return index >= 0 ? index + 1 : 0;
}

function updateBreadcrumbTitle() {
  const title = $("#rule-name").value.trim();
  $(".crumb-current").textContent = title || "New Action Rule";
}

function updateCreateState() {
  const hasName = $("#rule-name").value.trim().length > 0;
  const hasActiveAction = Object.values(ruleSteps).some((step) => (
    step.exists && (step.channels.size > 0 || step.incidents.size > 0)
  ))
    || $$(".channel .check-button.active, .incident-channel .check-button.active").length > 0;
  $("#create").disabled = !(hasName && hasActiveAction);
}

function getActiveChannelIds() {
  return $$(".channel")
    .filter((channel) => $(".check-button", channel).classList.contains("active"))
    .map((channel) => channel.dataset.channel);
}

function getActiveIncidentIds() {
  return $$(".incident-channel")
    .filter((channel) => $(".check-button", channel).classList.contains("active"))
    .map((channel) => channel.dataset.incidentChannel);
}

function getNotificationSettings() {
  return $$(".channel").reduce((settings, channel) => {
    const wrap = $(".select-wrap[data-recipient-picker='true']", channel);
    if (!wrap) return settings;

    const addressInput = $(".recipient-address-input", wrap);
    settings[channel.dataset.channel] = {
      address: addressInput?.value || wrap.dataset.addressValue || "",
      inputMode: channel.dataset.inputMode || "list",
      recipients: parseRecipients(wrap)
    };
    return settings;
  }, {});
}

function applyNotificationSettings(settings = {}) {
  $$(".channel").forEach((channel) => {
    const wrap = $(".select-wrap[data-recipient-picker='true']", channel);
    if (!wrap) return;

    const channelSettings = settings[channel.dataset.channel] || {};
    const inputMode = channelSettings.inputMode || "list";
    const address = channelSettings.address || "";
    channel.dataset.inputMode = inputMode;
    setRecipients(wrap, channelSettings.recipients || []);
    wrap.dataset.addressValue = address;

    const addressInput = $(".recipient-address-input", wrap);
    if (addressInput) addressInput.value = address;

    $$(".tiny-pill", channel).forEach((pill) => {
      const active = inputMode === "address"
        ? pill.textContent.includes("адрес")
        : !pill.textContent.includes("адрес");
      pill.classList.toggle("active", active);
    });

    syncRecipientMenu(wrap);
    syncRecipientInputMode(channel);
  });
}

function pluralize(value, forms) {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

function delayLabel(value) {
  const totalMinutes = Math.max(0, Math.floor(Number(value) || 0));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const parts = [];

  if (hours) {
    parts.push(`${hours} ${pluralize(hours, ["час", "часа", "часов"])}`);
  }

  if (minutes) {
    parts.push(`${minutes} ${pluralize(minutes, ["минута", "минуты", "минут"])}`);
  }

  return parts.length ? parts.join(" ") : "0 минут";
}

function normalizeDelayMinutes(value) {
  const minutes = Math.floor(Number(value) || 0);
  return Math.max(1, minutes);
}

function renderStepSummary(stepName) {
  const summary = $(`[data-step-summary="${stepName}"]`);
  const step = ruleSteps[stepName];
  if (!summary) return;

  const selectedChannels = Array.from(step.channels);
  const selectedIncidents = Array.from(step.incidents);
  if (!selectedChannels.length && !selectedIncidents.length) {
    summary.textContent = "Действия не выбраны";
    return;
  }

  const notificationIcons = selectedChannels.map((id) => {
    const meta = channelMeta[id];
    return meta ? `<svg class="icon icon-sm" aria-label="${meta.label}"><use href="${meta.icon}"></use></svg>` : "";
  }).join("");
  const incidentIcons = selectedIncidents.map((id) => {
    const meta = incidentMeta[id];
    return meta ? `<svg class="icon icon-sm" aria-label="${meta.label}"><use href="${meta.icon}"></use></svg>` : "";
  }).join("");
  const lines = [];

  if (notificationIcons) {
    lines.push(`<span class="summary-line"><span>Оповещения:</span><span class="summary-icons">${notificationIcons}</span></span>`);
  }

  if (incidentIcons) {
    lines.push(`<span class="summary-line"><span>Инциденты:</span><span class="summary-icons">${incidentIcons}</span></span>`);
  }

  summary.innerHTML = lines.join("");
}

function updateStepSummaries() {
  getOrderedStepNames().forEach(renderStepSummary);
}

function updateStepName(stepName) {
  const step = ruleSteps[stepName];
  const stepNumber = getStepNumber(stepName);
  const label = $(`[data-step-label="${stepName}"]`);
  const cardTitle = $(`[data-step-card-title="${stepName}"]`);
  if (label) label.textContent = step.name;
  if (cardTitle && cardTitle.dataset.editing !== "true") {
    cardTitle.textContent = `Шаг ${stepNumber}: ${step.name}`;
  }
  $$(`[data-rename-step="${stepName}"]`).forEach((button) => {
    button.setAttribute("aria-label", `Переименовать этап ${step.name}`);
  });
  $$(`[data-delete-step="${stepName}"]`).forEach((button) => {
    button.setAttribute("aria-label", `Удалить шаг ${step.name}`);
  });
}

function updateStepNames() {
  getOrderedStepNames().forEach(updateStepName);
}

function renameStep(stepName) {
  const step = ruleSteps[stepName];
  const cardTitle = $(`[data-step-card-title="${stepName}"]`);
  if (!step || !cardTitle) return;

  const existingInput = $(".step-name-input", cardTitle);
  if (existingInput) {
    existingInput.focus();
    existingInput.select();
    return;
  }

  const stepNumber = getStepNumber(stepName);
  const originalName = step.name;
  const prefix = document.createElement("span");
  const input = document.createElement("input");
  let finished = false;

  prefix.className = "step-name-prefix";
  prefix.textContent = `Шаг ${stepNumber}:`;
  input.className = "step-name-input";
  input.type = "text";
  input.value = originalName;
  input.setAttribute("aria-label", "Название этапа");

  cardTitle.dataset.editing = "true";
  cardTitle.classList.add("editing");
  cardTitle.textContent = "";
  cardTitle.append(prefix, input);

  function finishEditing(commit) {
    if (finished) return;
    finished = true;

    const nextName = input.value.trim();
    delete cardTitle.dataset.editing;
    cardTitle.classList.remove("editing");

    if (commit && nextName) {
      step.name = nextName;
    } else if (commit && !nextName) {
      showToast("Название этапа не может быть пустым");
    }

    updateStepName(stepName);
    scheduleStepTabsLayout();
  }

  input.addEventListener("click", (event) => event.stopPropagation());
  input.addEventListener("mousedown", (event) => event.stopPropagation());
  input.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      finishEditing(true);
    }
    if (event.key === "Escape") {
      event.preventDefault();
      finishEditing(false);
    }
  });
  input.addEventListener("blur", () => finishEditing(true));

  requestAnimationFrame(() => {
    input.focus();
    input.select();
  });
}

function persistCurrentStep() {
  const step = ruleSteps[currentStep];
  if (!step) return;
  step.channels = new Set(getActiveChannelIds());
  step.incidents = new Set(getActiveIncidentIds());
  step.notificationSettings = getNotificationSettings();
  step.recovery = $("#recovery").checked;
  step.delayEnabled = $("#delay-enabled").checked;
  step.delayMinutes = normalizeDelayMinutes($("#delay-minutes").value);
  updateStepDelayBadge(currentStep);
  updateStepSummaries();
  updateCreateState();
}

function updateStepDelayBadge(stepName) {
  const step = ruleSteps[stepName];
  const badge = $(`[data-step-delay-badge="${stepName}"]`);
  if (!step || !badge) return;

  badge.textContent = step.delayEnabled ? `Через ${delayLabel(step.delayMinutes)}` : "Сейчас";
  badge.classList.toggle("delayed", step.delayEnabled);
}

function syncDelayUi() {
  const delay = ruleSteps[currentStep];
  $("#delay-enabled").checked = delay.delayEnabled;
  $("#delay-minutes").value = delay.delayMinutes;
  $("#delay-minutes").disabled = !delay.delayEnabled;
  $("#delay-input").hidden = !delay.delayEnabled;
  $$("[data-delay-step]").forEach((button) => {
    button.disabled = !delay.delayEnabled;
  });
  updateStepDelayBadge(currentStep);
}

function syncStepNavigation() {
  $$(".step-tab").forEach((tab) => {
    const isActive = tab.dataset.stepTab === currentStep;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });

  $$(".step-tab-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.stepTabWrap === currentStep);
  });

  $$(".step-card").forEach((card) => {
    card.classList.toggle("active", card.dataset.stepCard === currentStep);
  });
  scheduleStepTabsLayout();
}

function applyStepState(stepName) {
  const step = ruleSteps[stepName];
  $$(".channel").forEach((channel) => {
    const button = $(".check-button", channel);
    const active = step.channels.has(channel.dataset.channel);
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  $$(".incident-channel").forEach((channel) => {
    const button = $(".check-button", channel);
    const active = step.incidents.has(channel.dataset.incidentChannel);
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  applyNotificationSettings(step.notificationSettings);
  $("#recovery").checked = step.recovery;
  syncStepNavigation();
  syncDelayUi();
  syncChannelSettings();
  syncIncidentChannels();
  updateStepSummaries();
  updateCreateState();
}

function bindStepTab(button) {
  button.addEventListener("click", () => setCurrentStep(button.dataset.stepTab));
}

function bindStepCard(card) {
  card.addEventListener("click", () => setCurrentStep(card.dataset.stepCard));
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setCurrentStep(card.dataset.stepCard);
    }
  });
}

function bindRenameButton(button) {
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    renameStep(button.dataset.renameStep);
  });
  button.addEventListener("keydown", (event) => {
    event.stopPropagation();
  });
}

function bindDeleteButton(button) {
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    openDeleteStepModal(button.dataset.deleteStep);
  });
  button.addEventListener("keydown", (event) => {
    event.stopPropagation();
  });
}

function createEscalationState() {
  escalationId += 1;
  stepOrder += 1;

  const stepName = `escalation-${escalationId}`;
  ruleSteps[stepName] = {
    exists: true,
    name: escalationId === 1 ? "Эскалация" : `Эскалация ${escalationId}`,
    channels: new Set(),
    incidents: new Set(),
    notificationSettings: {},
    recovery: false,
    delayEnabled: false,
    delayMinutes: 60,
    order: stepOrder
  };

  return stepName;
}

function renderEscalationTab(stepName) {
  const tabWrap = document.createElement("span");
  tabWrap.className = "step-tab-item";
  tabWrap.dataset.stepTabWrap = stepName;
  tabWrap.innerHTML = `
    <button class="step-tab" type="button" role="tab" aria-selected="false" data-step-tab="${stepName}">
      <span data-step-label="${stepName}"></span>
    </button>
    <button class="delete-step" type="button" data-delete-step="${stepName}">
      <svg class="icon icon-sm"><use href="#i-close"></use></svg>
    </button>
  `;

  $("#add-step-tab").before(tabWrap);
  bindStepTab($(".step-tab", tabWrap));
  bindDeleteButton($(".delete-step", tabWrap));
  scheduleStepTabsLayout();
}

function renderEscalationCard(stepName) {
  const card = document.createElement("div");
  card.className = "step-card";
  card.setAttribute("role", "button");
  card.tabIndex = 0;
  card.dataset.stepCard = stepName;
  card.innerHTML = `
    <span class="step-card-head">
      <span class="step-dot"></span>
      <span class="step-card-title" data-step-card-title="${stepName}"></span>
      <span class="step-card-actions">
        <button class="card-rename-step" type="button" data-rename-step="${stepName}">
          <svg class="icon icon-sm"><use href="#i-pencil"></use></svg>
        </button>
        <span class="step-badge" data-step-delay-badge="${stepName}">Сейчас</span>
      </span>
    </span>
    <span class="step-summary" data-step-summary="${stepName}">Действия не выбраны</span>
  `;

  $(".step-cards").append(card);
  bindStepCard(card);
  bindRenameButton($("[data-rename-step]", card));
}

function renderEscalationStep(stepName) {
  renderEscalationTab(stepName);
  renderEscalationCard(stepName);
  updateStepName(stepName);
  updateStepDelayBadge(stepName);
  renderStepSummary(stepName);
}

function removeStepElements(stepName) {
  $(`[data-step-tab-wrap="${stepName}"]`)?.remove();
  $(`[data-step-card="${stepName}"]`)?.remove();
  scheduleStepTabsLayout();
}

function setCurrentStep(stepName) {
  if (!ruleSteps[stepName] || !ruleSteps[stepName].exists) return;

  if (stepName === currentStep) {
    applyStepState(stepName);
    return;
  }
  persistCurrentStep();
  currentStep = stepName;
  applyStepState(stepName);
}

function addEscalationStep() {
  const stepName = createEscalationState();
  renderEscalationStep(stepName);
  updateStepNames();
  setCurrentStep(stepName);
  showToast("Добавлен шаг эскалации");
}

function closeDeleteStepModal() {
  stepPendingDelete = null;
  $("#delete-step-modal").hidden = true;
}

function openDeleteStepModal(stepName) {
  if (stepName === "initial") {
    showToast("Вкладку Начальные действия удалить нельзя");
    return;
  }

  if (!ruleSteps[stepName] || !ruleSteps[stepName].exists) return;

  stepPendingDelete = stepName;
  $("#delete-step-modal").hidden = false;
  $("#delete-step-cancel").focus();
}

function deleteStep(stepName) {
  if (stepName === "initial") {
    showToast("Вкладку Начальные действия удалить нельзя");
    return;
  }

  if (!ruleSteps[stepName] || !ruleSteps[stepName].exists) return;

  if (currentStep !== stepName) {
    persistCurrentStep();
  }

  if (currentStep === stepName) {
    currentStep = "initial";
  }

  removeStepElements(stepName);
  delete ruleSteps[stepName];
  updateStepNames();
  applyStepState(currentStep);
  syncChannelSettings();
  updateCreateState();
  showToast("Шаг эскалации удален");
}

function syncChannelSettings() {
  const showSettings = $("#make-default").checked && $(".group-field")?.dataset.selected === "true";
  $$(".channel").forEach((channel) => {
    const active = $(".check-button", channel).classList.contains("active");
    channel.dataset.active = String(active);
    $$(".channel-options, .select-wrap", channel).forEach((node) => {
      const visible = showSettings && active;
      node.hidden = !visible;
      if (!visible) node.classList.remove("open");
    });
    const picker = $(".select-wrap[data-recipient-picker='true']", channel);
    if (picker) {
      syncRecipientMenu(picker);
      syncRecipientInputMode(channel);
    }
  });
}

function syncIncidentChannels() {
  $$(".incident-channel").forEach((channel) => {
    const active = $(".check-button", channel).classList.contains("active");
    const settings = $(".incident-settings", channel);
    if (settings) {
      settings.hidden = !active;
      if (!active) {
        $$(".select-wrap.open", settings).forEach((select) => select.classList.remove("open"));
      }
    }
  });
}

function setCurrentTab(name) {
  $$(".tab").forEach((tab) => {
    const isActive = tab.dataset.tab === name;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });
  $$(".panel-section").forEach((panel) => {
    panel.hidden = panel.dataset.panel !== name;
  });
}

initRecipientPickers();

$$(".nav, .brand").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.classList.contains("nav")) {
      $$(".nav").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
    }
    showToast(button.title || button.dataset.toast || "Раздел открыт");
  });
});

$$(".segment").forEach((button) => {
  button.addEventListener("click", () => {
    $$(".segment").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    showToast(button.dataset.mode === "advanced" ? "Включен продвинутый режим" : "Включен базовый режим");
  });
});

$$(".tab").forEach((button) => {
  button.addEventListener("click", () => setCurrentTab(button.dataset.tab));
});

$$(".step-tab").forEach((button) => {
  button.addEventListener("click", () => setCurrentStep(button.dataset.stepTab));
});

$$(".step-card").forEach((button) => {
  button.addEventListener("click", () => setCurrentStep(button.dataset.stepCard));
  button.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setCurrentStep(button.dataset.stepCard);
    }
  });
});

$$("[data-rename-step]").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    renameStep(button.dataset.renameStep);
  });
  button.addEventListener("keydown", (event) => {
    event.stopPropagation();
  });
});

$$("[data-delete-step]").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    openDeleteStepModal(button.dataset.deleteStep);
  });
  button.addEventListener("keydown", (event) => {
    event.stopPropagation();
  });
});

$("#add-escalation").addEventListener("click", addEscalationStep);
$("#add-step-tab").addEventListener("click", addEscalationStep);

$$(".check-button").forEach((button) => {
  button.addEventListener("click", () => {
    const active = !button.classList.contains("active");
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
    syncChannelSettings();
    syncIncidentChannels();
    persistCurrentStep();
    updateStepSummaries();
    updateCreateState();
  });
});

$$("[data-mode-pill]").forEach((button) => {
  button.addEventListener("click", () => {
    const group = button.closest(".channel-options");
    $$(".tiny-pill", group).forEach((pill) => pill.classList.remove("active"));
    button.classList.add("active");
    const channel = button.closest(".channel");
    const wrap = $(".select-wrap", channel);
    channel.dataset.inputMode = button.textContent.includes("адрес") ? "address" : "list";
    syncRecipientInputMode(channel);
    renderRecipientValue(wrap);
    if (button.textContent.includes("адрес")) {
      $(".recipient-address-input", wrap)?.focus();
    } else {
      renderRecipientValue(wrap);
    }
  });
});

$$(".select-button").forEach((button) => {
  button.addEventListener("click", (event) => {
    const wrap = button.closest(".select-wrap");
    const channel = button.closest(".channel");
    if (wrap.dataset.recipientPicker === "true" && channel?.dataset.inputMode === "address") {
      closeMenus();
      event.stopPropagation();
      return;
    }
    closeMenus(wrap);
    wrap.classList.toggle("open");
    event.stopPropagation();
  });
});

$$(".select-wrap .menu button").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.closest(".recipient-menu")) return;
    const wrap = button.closest(".select-wrap");
    const value = button.dataset.value || button.textContent.trim();
    const display = $(".select-value", wrap);
    const groupValue = $(".group-value", wrap);
    if (groupValue) {
      groupValue.textContent = value;
    } else if (display) {
      display.textContent = value;
    }
    wrap.dataset.selected = "true";
    wrap.classList.remove("open");
    syncChannelSettings();
    persistCurrentStep();
    updateCreateState();
  });
});

$$("[data-menu-trigger]").forEach((button) => {
  button.addEventListener("click", (event) => {
    const dropdown = button.closest(".dropdown");
    closeMenus(dropdown);
    dropdown.classList.toggle("open");
    event.stopPropagation();
  });
});

$$("[data-preset]").forEach((button) => {
  button.addEventListener("click", () => {
    $("#rule-name").value = button.textContent.trim();
    button.closest(".dropdown").classList.remove("open");
    showToast("Шаблон применен");
    updateBreadcrumbTitle();
    updateCreateState();
  });
});

$$("[data-add-chip]").forEach((button) => {
  button.addEventListener("click", () => {
    const chip = document.createElement("button");
    chip.className = "filter-chip";
    chip.type = "button";
    chip.dataset.filterChip = "";
    chip.innerHTML = '<span class="chip-x">×</span>' + button.dataset.addChip + '<svg class="icon icon-sm"><use href="#i-chevron"></use></svg>';
    $("#filter-row").insertBefore(chip, $(".filter-search"));
    chip.addEventListener("click", removeChip);
    button.closest(".dropdown").classList.remove("open");
  });
});

function removeChip(event) {
  event.currentTarget.remove();
  showToast("Фильтр удален");
}

$$("[data-filter-chip]").forEach((chip) => chip.addEventListener("click", removeChip));

$("#clear-filters").addEventListener("click", () => {
  $$("[data-filter-chip]").forEach((chip) => chip.remove());
  $("#filter-name").value = "";
  showToast("Фильтры очищены");
});

$("#toggle-filter").addEventListener("click", () => {
  const row = $("#filter-row");
  row.hidden = !row.hidden;
  $("#toggle-filter").firstChild.textContent = row.hidden
    ? "Показать фильтр в Консоли событий"
    : "Открыть фильтр в Консоли событий";
});

$$("[data-clear]").forEach((button) => {
  button.addEventListener("click", () => {
    const input = $(button.dataset.clear);
    input.value = "";
    input.focus();
    if (input.id === "rule-name") updateBreadcrumbTitle();
    updateCreateState();
  });
});

$("#rule-name").addEventListener("input", () => {
  updateBreadcrumbTitle();
  updateCreateState();
});
$("#recovery").addEventListener("change", persistCurrentStep);

$("#delay-enabled").addEventListener("change", () => {
  persistCurrentStep();
  syncDelayUi();
});

$("#delay-minutes").addEventListener("input", () => {
  $("#delay-minutes").value = $("#delay-minutes").value.replace(/\D/g, "");
  ruleSteps[currentStep].delayMinutes = normalizeDelayMinutes($("#delay-minutes").value);
  persistCurrentStep();
  syncDelayUi();
});

$$("[data-delay-step]").forEach((button) => {
  button.addEventListener("click", () => {
    const nextValue = normalizeDelayMinutes($("#delay-minutes").value) + Number(button.dataset.delayStep);
    $("#delay-minutes").value = normalizeDelayMinutes(nextValue);
    persistCurrentStep();
    syncDelayUi();
  });
});

function syncPeriodicSettings() {
  const periodicActive = $("[data-period='periodic']")?.classList.contains("active");
  const settings = $("#periodic-settings");
  if (settings) settings.hidden = !periodicActive;
  $(".period-area")?.classList.toggle("periodic-open", Boolean(periodicActive));
  updateWeekdayAction();
}

function syncUnlimitedTime() {
  const unlimited = $("#unlimited-time")?.checked;
  const settings = $("#periodic-settings");
  if (settings) settings.classList.toggle("time-unlimited", Boolean(unlimited));
  $$("#timezone-dropdown, .time-dropdown").forEach((dropdown) => {
    dropdown.classList.toggle("disabled", Boolean(unlimited));
    dropdown.classList.remove("open");
    const trigger = $("button", dropdown);
    if (trigger) {
      trigger.disabled = Boolean(unlimited);
      trigger.setAttribute("aria-disabled", String(Boolean(unlimited)));
      trigger.setAttribute("aria-expanded", "false");
    }
  });
}

function getSelectedWeekdays() {
  return $$(".weekday-button.active").map((button) => button.dataset.weekday);
}

function updateWeekdayAction() {
  const allSelected = getSelectedWeekdays().length === $$(".weekday-button").length;
  const action = $("#weekday-all");
  if (action) action.textContent = allSelected ? "Сбросить" : "Выбрать все";
}

function validateWeekdays(showError = true) {
  const error = $("#weekday-error");
  const periodicActive = $("[data-period='periodic']")?.classList.contains("active");
  const invalid = periodicActive && getSelectedWeekdays().length === 0;
  if (error && showError) error.hidden = !invalid;
  updateWeekdayAction();
  return !invalid;
}

function setTimezone(value) {
  const triggerValue = $(".period-select-value", $("#timezone-dropdown"));
  if (triggerValue) triggerValue.textContent = value;
  $$("#timezone-dropdown .period-menu-option").forEach((option) => {
    const selected = option.dataset.timezone === value;
    option.classList.toggle("selected", selected);
    option.setAttribute("aria-selected", String(selected));
  });
}

function buildTimeOptions() {
  const values = [];
  for (let hour = 0; hour < 24; hour += 1) {
    for (let minute = 0; minute < 60; minute += 30) {
      values.push(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
    }
  }
  return values;
}

function setTimeValue(dropdown, value) {
  const display = $("[data-time-value]", dropdown);
  if (display) display.textContent = value || "__:__";
  dropdown.dataset.value = value || "";
  dropdown.classList.toggle("has-value", Boolean(value));
  $$(".period-menu-option", dropdown).forEach((option) => {
    const selected = option.dataset.time === value;
    option.classList.toggle("selected", selected);
    option.setAttribute("aria-selected", String(selected));
  });
}

function initPeriodicControls() {
  const timeOptions = buildTimeOptions();
  $$(".time-dropdown").forEach((dropdown) => {
    const menu = $(".time-menu", dropdown);
    if (!menu || menu.dataset.ready === "true") return;
    menu.dataset.ready = "true";
    menu.innerHTML = timeOptions.map((value) => (
      `<button class="period-menu-option" type="button" role="option" aria-selected="false" data-time="${value}">${value}</button>`
    )).join("");
  });

  $$(".period-dropdown > button").forEach((trigger) => {
    trigger.addEventListener("click", (event) => {
      const dropdown = trigger.closest(".period-dropdown");
      if (dropdown.classList.contains("disabled")) return;
      if (dropdown.classList.contains("time-dropdown") && !validateWeekdays(true)) {
        event.stopPropagation();
        return;
      }
      const nextOpen = !dropdown.classList.contains("open");
      closeMenus(dropdown);
      dropdown.classList.toggle("open", nextOpen);
      trigger.setAttribute("aria-expanded", String(nextOpen));
      syncPeriodDropdownLayer();
      event.stopPropagation();
    });
  });

  $$("#timezone-dropdown .period-menu-option").forEach((option) => {
    option.addEventListener("click", (event) => {
      setTimezone(option.dataset.timezone);
      option.closest(".period-dropdown").classList.remove("open");
      syncPeriodDropdownLayer();
      event.stopPropagation();
    });
  });

  $$(".time-dropdown .period-menu-option").forEach((option) => {
    option.addEventListener("click", (event) => {
      const dropdown = option.closest(".time-dropdown");
      setTimeValue(dropdown, option.dataset.time);
      dropdown.classList.remove("open");
      syncPeriodDropdownLayer();
      event.stopPropagation();
    });
  });
}

$$(".radio-option").forEach((button) => {
  button.addEventListener("click", () => {
    const group = button.closest('[role="radiogroup"]') || document;
    $$(".radio-option", group).forEach((option) => {
      const active = option === button;
      option.classList.toggle("active", active);
      option.setAttribute("aria-checked", String(active));
    });
    syncPeriodicSettings();
  });
});

$$(".weekday-button").forEach((button) => {
  button.addEventListener("click", () => {
    button.classList.toggle("active");
    validateWeekdays(false);
    if (getSelectedWeekdays().length > 0) $("#weekday-error").hidden = true;
  });
});

$("#weekday-all")?.addEventListener("click", () => {
  const allSelected = getSelectedWeekdays().length === $$(".weekday-button").length;
  $$(".weekday-button").forEach((button) => button.classList.toggle("active", !allSelected));
  validateWeekdays(false);
  if (getSelectedWeekdays().length > 0) $("#weekday-error").hidden = true;
});

$("#unlimited-time")?.addEventListener("change", syncUnlimitedTime);

function syncDefaultField() {
  const group = $(".group-field");
  const enabled = $("#make-default").checked;
  group.hidden = !enabled;
  if (!enabled) {
    $(".group-value").textContent = "";
    delete group.dataset.selected;
    group.classList.remove("open");
  }
}

$("#make-default").addEventListener("change", () => {
  syncDefaultField();
  syncChannelSettings();
});

$("#delete-step-cancel").addEventListener("click", closeDeleteStepModal);

$("#delete-step-confirm").addEventListener("click", () => {
  const stepName = stepPendingDelete;
  closeDeleteStepModal();
  deleteStep(stepName);
});

$("#delete-step-modal").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) {
    closeDeleteStepModal();
  }
});

$("#cancel").addEventListener("click", () => {
  closeMenus();
  $("#rule-name").value = "PostgreSQL Linux";
  updateBreadcrumbTitle();
  $("#filter-name").value = "Processor";
  $("#make-default").checked = false;
  syncDefaultField();
  $$(".radio-row [data-period]").forEach((button) => {
    const active = button.dataset.period === "always";
    button.classList.toggle("active", active);
    button.setAttribute("aria-checked", String(active));
  });
  $$(".weekday-button").forEach((button) => button.classList.remove("active"));
  $("#weekday-error").hidden = true;
  setTimezone("Москва UTC(SU)+3");
  $$(".time-dropdown").forEach((dropdown) => setTimeValue(dropdown, ""));
  $("#unlimited-time").checked = false;
  syncPeriodicSettings();
  syncUnlimitedTime();
  ruleSteps.initial.channels.clear();
  ruleSteps.initial.incidents.clear();
  ruleSteps.initial.notificationSettings = {};
  ruleSteps.initial.recovery = false;
  ruleSteps.initial.delayEnabled = false;
  ruleSteps.initial.delayMinutes = 60;
  ruleSteps.initial.name = "Начальные действия";
  getEscalationStepNames().forEach((stepName) => {
    removeStepElements(stepName);
    delete ruleSteps[stepName];
  });
  escalationId = 0;
  stepOrder = 0;
  currentStep = "initial";
  updateStepNames();
  $$(".select-wrap").forEach((wrap) => {
    delete wrap.dataset.selected;
    delete wrap.dataset.selectedRecipients;
    if (wrap.dataset.recipientPicker === "true") {
      const channel = wrap.closest(".channel");
      channel.dataset.inputMode = "list";
      wrap.dataset.addressValue = "";
      const addressInput = $(".recipient-address-input", wrap);
      if (addressInput) addressInput.value = "";
      $$(".tiny-pill", channel).forEach((pill, index) => pill.classList.toggle("active", index === 0));
      syncRecipientMenu(wrap);
      syncRecipientInputMode(channel);
    }
  });
  $$(".check-button").forEach((button) => {
    button.classList.remove("active");
    button.setAttribute("aria-pressed", "false");
  });
  $("#recovery").checked = false;
  applyStepState("initial");
  syncChannelSettings();
  syncIncidentChannels();
  updateCreateState();
  showToast("Изменения отменены");
});

$("#create").addEventListener("click", () => {
  showToast("Правило создано: " + $("#rule-name").value.trim());
});

$$("[data-toast]").forEach((button) => {
  button.addEventListener("click", () => showToast(button.dataset.toast));
});

document.addEventListener("click", () => closeMenus());
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMenus();
    closeDeleteStepModal();
  }
});
window.addEventListener("resize", updateStepTabsLayout);
const stepTabsNode = $(".step-tabs");
if (stepTabsNode && "ResizeObserver" in window) {
  new ResizeObserver(updateStepTabsLayout).observe(stepTabsNode);
}

$("#make-default").checked = false;
initPeriodicControls();
syncDefaultField();
syncPeriodicSettings();
$("#weekday-error").hidden = true;
syncUnlimitedTime();
syncIncidentChannels();
updateBreadcrumbTitle();
updateStepNames();
currentStep = "initial";
applyStepState("initial");
updateStepTabsLayout();
