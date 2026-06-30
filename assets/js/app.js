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
const recipientPeople = [
  { name: "Иванов Иван Иванович", login: "ivanovii" },
  { name: "Константинопольский Константин Константинович", login: "konstantinopolskyy" },
  { name: "Петров Алексей Петрович", login: "petrova" },
  { name: "Фадеев Антон Николаевич", login: "fadeeva" },
  { name: "Чернышев Артём Александрович", login: "chernishova" },
  { name: "Королев Сергей Данилович", login: "korolevs" },
  { name: "Смирнова Анна Сергеевна", login: "smirnovaa" },
  { name: "Кузнецов Дмитрий Олегович", login: "kuznetsovdo" },
  { name: "Попова Мария Андреевна", login: "popovama" },
  { name: "Соколов Николай Викторович", login: "sokolovnv" },
  { name: "Лебедева Елена Павловна", login: "lebedevaep" },
  { name: "Новиков Максим Игоревич", login: "novikovmi" },
  { name: "Морозова Ольга Романовна", login: "morozovaor" },
  { name: "Волков Артём Сергеевич", login: "volkovas" },
  { name: "Алексеева Наталья Юрьевна", login: "alekseevany" },
  { name: "Козлов Михаил Денисович", login: "kozlovmd" }
];
const recipientPeopleByLogin = Object.fromEntries(
  recipientPeople.map((person) => [person.login, person])
);
const selectRecipientPeople = (...logins) => logins.map((login) => recipientPeopleByLogin[login]);
const recipientGroups = {
  "Администраторы PostgreSQL": recipientPeople,
  "Администраторы Oracle": selectRecipientPeople(
    "ivanovii", "petrova", "fadeeva", "korolevs", "smirnovaa", "kuznetsovdo",
    "popovama", "sokolovnv", "lebedevaep", "novikovmi", "morozovaor", "kozlovmd"
  ),
  "Администраторы Redis": selectRecipientPeople(
    "konstantinopolskyy", "chernishova", "smirnovaa", "popovama", "sokolovnv",
    "novikovmi", "morozovaor", "volkovas", "alekseevany"
  ),
  "Администраторы MySQL": selectRecipientPeople(
    "ivanovii", "fadeeva", "korolevs", "kuznetsovdo",
    "lebedevaep", "volkovas", "alekseevany", "kozlovmd"
  ),
  "Администраторы ClickHouse": selectRecipientPeople(
    "petrova", "chernishova", "korolevs", "smirnovaa", "kuznetsovdo", "popovama",
    "sokolovnv", "lebedevaep", "novikovmi", "morozovaor", "volkovas"
  )
};
const defaultRecipientGroups = {
  center: "Администраторы PostgreSQL",
  email: "Администраторы Oracle",
  telegram: "Администраторы Redis",
  sms: "Администраторы MySQL",
  team: "Администраторы ClickHouse"
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
    incidentSettings: {},
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
let draggedEscalationCard = null;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
}

function closeMenus(except) {
  $$(".select-wrap.open, .dropdown.open, .period-dropdown.open, .filter-control.open").forEach((node) => {
    if (node !== except) {
      node.classList.remove("open");
      $("[data-filter-trigger]", node)?.setAttribute("aria-expanded", "false");
    }
  });
  syncDropdownLayers();
}

function syncDropdownLayers() {
  const periodDropdownOpen = Boolean($(".period-dropdown.open"));
  const mainDropdownOpen = Boolean($(".main-panel .select-wrap.open"));
  $(".content-grid")?.classList.toggle("dropdown-open", periodDropdownOpen || mainDropdownOpen);
  $(".main-panel")?.classList.toggle("dropdown-open", mainDropdownOpen);
  $(".side-panel")?.classList.toggle("dropdown-open", periodDropdownOpen);
  $(".period-area")?.classList.toggle("dropdown-open", periodDropdownOpen);
}

function positionSelectMenu(wrap) {
  const menu = $(".menu", wrap);
  const boundary = $(".frame")?.getBoundingClientRect();
  if (!menu || !boundary) return;

  wrap.classList.remove("open-up");
  const triggerRect = wrap.getBoundingClientRect();
  const menuHeight = menu.offsetHeight;
  const spaceBelow = boundary.bottom - triggerRect.bottom - 6;
  const spaceAbove = triggerRect.top - boundary.top - 6;
  wrap.classList.toggle("open-up", menuHeight > spaceBelow && spaceAbove > spaceBelow);
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
  const monitoringGroup = $(".group-field")?.dataset.selected === "true"
    ? $(".group-value")?.textContent.trim()
    : "";
  const group = monitoringGroup
    || defaultRecipientGroups[channel.dataset.channel]
    || "Администраторы PostgreSQL";
  return {
    group,
    people: recipientGroups[group] || recipientPeople.slice(0, 3)
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

function renderRecipientMenu(wrap) {
  const channel = wrap.closest(".channel");
  const menu = $(".recipient-menu", wrap);
  const config = getRecipientConfig(channel);
  if (!menu || wrap.dataset.recipientGroup === config.group) return;

  const availableLogins = new Set(config.people.map((person) => person.login));
  setRecipients(
    wrap,
    parseRecipients(wrap).filter((login) => availableLogins.has(login))
  );
  wrap.dataset.recipientGroup = config.group;
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
}

function initRecipientPickers() {
  $$(".channel").forEach((channel) => {
    channel.dataset.inputMode = channel.dataset.inputMode || "list";
    const wrap = $(".select-wrap", channel);
    if (!wrap) return;
    const menu = $(".menu", wrap);
    if (!menu) return;

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
    renderRecipientMenu(wrap);
    syncRecipientMenu(wrap);
    syncRecipientInputMode(channel);
  });
}

function getOrderedStepNames() {
  return Object.entries(ruleSteps)
    .filter(([, step]) => step.exists)
    .sort(([, first], [, second]) => first.order - second.order)
    .map(([stepName]) => stepName);
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

function initIncidentFields() {
  $$(".incident-required .select-value").forEach((display) => {
    display.dataset.placeholder = display.textContent.trim();
  });
}

function getIncidentSettings() {
  return $$(".incident-channel").reduce((settings, channel) => {
    const activeLevel = $(".radio-option.active[data-incident-level]", channel);
    const levelLabel = $(".incident-field-label", channel)?.textContent.trim() || "Уровень";
    const fields = $$(".incident-fields-grid .incident-field", channel).map((field) => {
      const wrap = $(".select-wrap", field);
      const display = $(".select-value", field);
      return {
        name: $(".incident-field-label", field)?.textContent.replace("*", "").trim() || "Поле",
        value: wrap?.dataset.selected === "true" ? display?.textContent.trim() || "" : ""
      };
    });

    settings[channel.dataset.incidentChannel] = {
      level: {
        id: activeLevel?.dataset.incidentLevel || "degradation",
        name: levelLabel,
        value: activeLevel?.textContent.trim() || "Деградация"
      },
      fields
    };
    return settings;
  }, {});
}

function applyIncidentSettings(settings = {}) {
  $$(".incident-channel").forEach((channel) => {
    const channelSettings = settings[channel.dataset.incidentChannel] || {};
    const levelId = channelSettings.level?.id || "degradation";
    $$(".radio-option[data-incident-level]", channel).forEach((button) => {
      const active = button.dataset.incidentLevel === levelId;
      button.classList.toggle("active", active);
      button.setAttribute("aria-checked", String(active));
    });

    $$(".incident-fields-grid .incident-field", channel).forEach((field) => {
      const wrap = $(".select-wrap", field);
      const display = $(".select-value", field);
      const name = $(".incident-field-label", field)?.textContent.replace("*", "").trim();
      const value = channelSettings.fields?.find((item) => item.name === name)?.value || "";
      display.textContent = value || display.dataset.placeholder;
      wrap.dataset.selected = value ? "true" : "false";
      wrap.classList.remove("open", "open-up");
    });
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
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];

  if (days) {
    parts.push(`${days} ${pluralize(days, ["день", "дня", "дней"])}`);
  }

  if (hours) {
    parts.push(`${hours} ${pluralize(hours, ["час", "часа", "часов"])}`);
  }

  if (minutes) {
    parts.push(`${minutes} ${pluralize(minutes, ["минуту", "минуты", "минут"])}`);
  }

  return parts.length ? parts.join(" ") : "0 минут";
}

const MAX_DELAY_MINUTES = 30 * 24 * 60;

function normalizeDelayMinutes(value) {
  const minutes = Math.floor(Number(value) || 0);
  return Math.min(MAX_DELAY_MINUTES, Math.max(1, minutes));
}

function getDelayParts(value) {
  const totalMinutes = normalizeDelayMinutes(value);
  return {
    days: Math.floor(totalMinutes / 1440),
    hours: Math.floor((totalMinutes % 1440) / 60),
    minutes: totalMinutes % 60
  };
}

function getDelayInputMinutes() {
  const readValue = (id) => Math.max(0, Math.floor(Number($(id).value) || 0));
  return normalizeDelayMinutes(
    readValue("#delay-days") * 1440
    + readValue("#delay-hours") * 60
    + readValue("#delay-minutes")
  );
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function summaryIconWithTooltip(meta, rows, emptyText = "Данные не заполнены") {
  const tooltipRows = rows.length
    ? rows.map(({ name, value, stacked = false }) => `
        <span class="summary-tooltip-row${stacked ? " stacked" : ""}">
          ${name ? `<span class="summary-tooltip-label">${escapeHtml(name)}:</span>` : ""}
          <span>${escapeHtml(value)}</span>
        </span>
      `).join("")
    : `<span class="summary-tooltip-row">${escapeHtml(emptyText)}</span>`;

  return `
    <span class="summary-icon-tooltip" tabindex="0" aria-label="${escapeHtml(meta.label)}">
      <svg class="icon icon-sm" aria-hidden="true"><use href="${meta.icon}"></use></svg>
      <span class="summary-tooltip" role="tooltip">
        <strong class="summary-tooltip-title">${escapeHtml(meta.label)}</strong>
        ${tooltipRows}
      </span>
    </span>
  `;
}

function positionSummaryTooltip(target) {
  const tooltip = $(".summary-tooltip", target);
  if (!tooltip) return;

  const margin = 8;
  const targetRect = target.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const left = Math.min(
    Math.max(margin, targetRect.left),
    window.innerWidth - tooltipRect.width - margin
  );
  const spaceAbove = targetRect.top - margin;
  const top = tooltipRect.height <= spaceAbove
    ? targetRect.top - tooltipRect.height - margin
    : Math.min(targetRect.bottom + margin, window.innerHeight - tooltipRect.height - margin);

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${Math.max(margin, top)}px`;
}

function renderStepSummary(stepName) {
  const summary = $(`[data-step-summary="${stepName}"]`);
  const step = ruleSteps[stepName];
  if (!summary) return;

  const selectedChannels = Array.from(step.channels);
  const selectedIncidents = Array.from(step.incidents);
  const isEmpty = !selectedChannels.length && !selectedIncidents.length;
  summary.classList.toggle("empty", isEmpty);
  if (isEmpty) {
    summary.textContent = "Действия не выбраны";
    return;
  }

  const notificationIcons = selectedChannels.map((id) => {
    const meta = channelMeta[id];
    if (!meta) return "";

    const isPersonalRule = !$("#make-default").checked;
    const settings = step.notificationSettings?.[id] || {};
    const recipients = settings.inputMode === "address"
      ? [settings.address].filter(Boolean)
      : (settings.recipients || []).map((login) => recipientPeopleByLogin[login]?.name || login);
    const rows = isPersonalRule
      ? []
      : recipients.map((recipient, index) => ({
          name: index === 0 ? "Адресаты" : "",
          value: recipient,
          stacked: index === 0
        }));
    const emptyText = isPersonalRule
      ? "Личное правило оповещений по выбранному каналу"
      : "Данные не заполнены";
    return summaryIconWithTooltip(meta, rows, emptyText);
  }).join("");
  const incidentIcons = selectedIncidents.map((id) => {
    const meta = incidentMeta[id];
    if (!meta) return "";

    const settings = step.incidentSettings?.[id] || {};
    const rows = [];
    if (settings.level?.value) {
      rows.push({ name: settings.level.name, value: settings.level.value });
    }
    (settings.fields || []).forEach((field) => {
      if (field.value) rows.push({ name: field.name, value: field.value });
    });
    return summaryIconWithTooltip(meta, rows);
  }).join("");
  const lines = [];

  if (notificationIcons) {
    const recoveryIndicator = step.recovery
      ? '<span class="summary-recovery-indicator" role="img" aria-label="Recovery-события включены" title="Recovery-события включены"></span>'
      : "";
    lines.push(`<span class="summary-line"><span>Оповещения:</span><span class="summary-icons">${notificationIcons}${recoveryIndicator}</span></span>`);
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
  const cardTitle = $(`[data-step-card-title="${stepName}"]`);
  if (cardTitle && cardTitle.dataset.editing !== "true") {
    cardTitle.textContent = `Шаг ${stepNumber}: ${step.name}`;
  }
  const cardDelete = $(`[data-card-delete-step="${stepName}"]`);
  if (cardDelete) cardDelete.setAttribute("aria-label", `Удалить шаг ${step.name}`);
  const dragHandle = $(`[data-drag-step="${stepName}"]`);
  if (dragHandle) dragHandle.setAttribute("aria-label", `Переместить шаг ${step.name}`);
  const currentTitle = $("#current-step-title");
  if (currentStep === stepName && currentTitle.dataset.editing !== "true") {
    currentTitle.textContent = `Шаг ${stepNumber}: ${step.name}`;
    $("#rename-current-step").setAttribute("aria-label", `Переименовать этап ${step.name}`);
    $("#delete-current-step").setAttribute("aria-label", `Удалить шаг ${step.name}`);
  }
}

function updateStepNames() {
  getOrderedStepNames().forEach(updateStepName);
}

function renameStep(stepName) {
  const step = ruleSteps[stepName];
  const title = $("#current-step-title");
  if (!step || stepName !== currentStep || !title) return;

  const existingInput = $(".step-name-input", title);
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

  title.dataset.editing = "true";
  title.classList.add("editing");
  title.textContent = "";
  title.append(prefix, input);

  function finishEditing(commit) {
    if (finished) return;
    finished = true;

    const nextName = input.value.trim();
    delete title.dataset.editing;
    title.classList.remove("editing");

    if (commit && nextName) {
      step.name = nextName;
    } else if (commit && !nextName) {
      showToast("Название этапа не может быть пустым");
    }

    updateStepName(stepName);
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
  step.incidentSettings = getIncidentSettings();
  step.recovery = $("#recovery").checked;
  step.delayEnabled = $("#delay-enabled").checked;
  step.delayMinutes = getDelayInputMinutes();
  syncDelayStepperButtons(step);
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

function syncDelayStepperButtons(delay) {
  $$("[data-delay-unit]").forEach((button) => {
    const delta = Number(button.dataset.delayDelta);
    button.disabled = !delay.delayEnabled
      || (delta > 0 && delay.delayMinutes >= MAX_DELAY_MINUTES)
      || (delta < 0 && delay.delayMinutes <= 1);
  });
}

function syncDelayUi() {
  const delay = ruleSteps[currentStep];
  const parts = getDelayParts(delay.delayMinutes);
  $("#delay-enabled").checked = delay.delayEnabled;
  $("#delay-days").value = parts.days;
  $("#delay-hours").value = parts.hours;
  $("#delay-minutes").value = parts.minutes;
  $("#delay-input").hidden = !delay.delayEnabled;
  $$("[data-delay-value]").forEach((input) => {
    input.disabled = !delay.delayEnabled;
  });
  syncDelayStepperButtons(delay);
  updateStepDelayBadge(currentStep);
}

function syncStepNavigation() {
  $$(".step-card").forEach((card) => {
    card.classList.toggle("active", card.dataset.stepCard === currentStep);
  });
  syncStepDeletionState();
  updateStepName(currentStep);
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
  applyIncidentSettings(step.incidentSettings);
  $("#recovery").checked = step.recovery;
  syncStepNavigation();
  syncDelayUi();
  syncChannelSettings();
  syncIncidentChannels();
  updateStepSummaries();
  updateCreateState();
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

function getEscalationCards() {
  return $$(".step-card", $(".step-cards"));
}

function isTopStep(stepName) {
  return getEscalationCards()[0]?.dataset.stepCard === stepName;
}

function syncStepDeletionState() {
  getEscalationCards().forEach((card, index) => {
    const button = $("[data-card-delete-step]", card);
    if (button) button.hidden = index === 0;
  });
  $("#delete-current-step").hidden = isTopStep(currentStep);
}

function syncEscalationDragState() {
  const enabled = getEscalationCards().length >= 2;
  getEscalationCards().forEach((card) => {
    card.classList.toggle("drag-enabled", enabled);
    const handle = $("[data-drag-step]", card);
    handle.hidden = !enabled;
    handle.draggable = enabled;
  });
}

function persistEscalationCardOrder() {
  const cards = getEscalationCards();
  cards.forEach((card, index) => {
    ruleSteps[card.dataset.stepCard].order = index;
  });
  stepOrder = Math.max(0, cards.length - 1);
  updateStepNames();
  syncStepDeletionState();
}

function clearStepDropIndicators() {
  getEscalationCards().forEach((card) => {
    card.classList.remove("drop-before", "drop-after");
  });
}

function captureStepCardPositions() {
  return new Map(getEscalationCards().map((card) => [card, card.getBoundingClientRect().top]));
}

function animateStepCardShift(previousPositions) {
  getEscalationCards().forEach((card) => {
    if (card === draggedEscalationCard) return;
    const previousTop = previousPositions.get(card);
    if (previousTop === undefined) return;
    const delta = previousTop - card.getBoundingClientRect().top;
    if (!delta || typeof card.animate !== "function") return;
    card.animate(
      [{ transform: `translateY(${delta}px)` }, { transform: "translateY(0)" }],
      { duration: 120, easing: "cubic-bezier(.2, .8, .2, 1)" }
    );
  });
}

function finishStepCardShiftAnimations() {
  getEscalationCards().forEach((card) => {
    if (typeof card.getAnimations !== "function") return;
    card.getAnimations().forEach((animation) => animation.cancel());
  });
}

function moveEscalationCard(card, direction) {
  const cards = getEscalationCards();
  const currentIndex = cards.indexOf(card);
  const nextIndex = currentIndex + direction;
  if (nextIndex < 0 || nextIndex >= cards.length) return;

  const target = cards[nextIndex];
  if (direction < 0) target.before(card);
  else target.after(card);
  persistEscalationCardOrder();
  $("[data-drag-step]", card).focus();
}

function bindEscalationDrag(card) {
  const handle = $("[data-drag-step]", card);

  handle.addEventListener("click", (event) => event.stopPropagation());
  handle.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      moveEscalationCard(card, event.key === "ArrowUp" ? -1 : 1);
    }
  });
  handle.addEventListener("dragstart", (event) => {
    if (getEscalationCards().length < 2) {
      event.preventDefault();
      return;
    }
    draggedEscalationCard = card;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", card.dataset.stepCard);
    event.dataTransfer.setDragImage(card, 24, card.offsetHeight / 2);
    requestAnimationFrame(() => card.classList.add("dragging"));
  });
  handle.addEventListener("dragend", () => {
    const shouldPersist = draggedEscalationCard === card;
    finishStepCardShiftAnimations();
    card.classList.remove("dragging");
    clearStepDropIndicators();
    draggedEscalationCard = null;
    if (shouldPersist) persistEscalationCardOrder();
  });

  card.addEventListener("dragover", (event) => {
    if (!draggedEscalationCard || draggedEscalationCard === card) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const insertBefore = event.clientY < card.getBoundingClientRect().top + card.offsetHeight / 2;
    clearStepDropIndicators();
    card.classList.add(insertBefore ? "drop-before" : "drop-after");
    const reference = insertBefore ? card : card.nextElementSibling;
    if (reference !== draggedEscalationCard && draggedEscalationCard.nextElementSibling !== reference) {
      const previousPositions = captureStepCardPositions();
      $(".step-cards").insertBefore(draggedEscalationCard, reference);
      animateStepCardShift(previousPositions);
    }
  });
  card.addEventListener("drop", (event) => {
    if (!draggedEscalationCard) return;
    event.preventDefault();
    const droppedCard = draggedEscalationCard;
    finishStepCardShiftAnimations();
    clearStepDropIndicators();
    droppedCard.classList.remove("dragging");
    draggedEscalationCard = null;
    persistEscalationCardOrder();
  });
}

function bindStepDelete(card) {
  const button = $("[data-card-delete-step]", card);
  if (!button) return;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    openDeleteStepModal(card.dataset.stepCard);
  });
  button.addEventListener("keydown", (event) => event.stopPropagation());
}

function createEscalationState() {
  escalationId += 1;
  stepOrder += 1;

  const stepName = `escalation-${escalationId}`;
  ruleSteps[stepName] = {
    exists: true,
    name: `Эскалация ${escalationId}`,
    channels: new Set(),
    incidents: new Set(),
    notificationSettings: {},
    incidentSettings: {},
    recovery: false,
    delayEnabled: false,
    delayMinutes: 60,
    order: stepOrder
  };

  return stepName;
}

function renderEscalationCard(stepName) {
  const card = document.createElement("div");
  card.className = "step-card escalation-step-card";
  card.setAttribute("role", "button");
  card.tabIndex = 0;
  card.dataset.stepCard = stepName;
  card.innerHTML = `
    <span class="step-card-head">
      <span class="step-card-leading">
        <button class="card-drag-handle" type="button" draggable="false" data-drag-step="${stepName}" aria-label="Переместить шаг ${stepName}" title="Переместить шаг" hidden>
          <svg class="icon icon-sm"><use href="#i-grip"></use></svg>
        </button>
        <span class="step-dot"></span>
      </span>
      <span class="step-card-title" data-step-card-title="${stepName}"></span>
      <span class="step-card-actions">
        <span class="step-badge" data-step-delay-badge="${stepName}">Сейчас</span>
        <button class="card-delete-step" type="button" data-card-delete-step="${stepName}">
          <svg class="icon icon-sm"><use href="#i-trash"></use></svg>
        </button>
      </span>
    </span>
    <span class="step-summary" data-step-summary="${stepName}">Действия не выбраны</span>
  `;

  $(".step-cards").append(card);
  bindStepCard(card);
  bindEscalationDrag(card);
  bindStepDelete(card);
  syncEscalationDragState();
  syncStepDeletionState();
}

function renderEscalationStep(stepName) {
  renderEscalationCard(stepName);
  updateStepName(stepName);
  updateStepDelayBadge(stepName);
  renderStepSummary(stepName);
}

function removeStepElements(stepName) {
  $(`[data-step-card="${stepName}"]`)?.remove();
  syncEscalationDragState();
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
  if (isTopStep(stepName)) {
    showToast("Верхний шаг удалить нельзя");
    return;
  }

  if (!ruleSteps[stepName] || !ruleSteps[stepName].exists) return;

  stepPendingDelete = stepName;
  $("#delete-step-modal").hidden = false;
  $("#delete-step-cancel").focus();
}

function deleteStep(stepName) {
  if (isTopStep(stepName)) {
    showToast("Верхний шаг удалить нельзя");
    return;
  }

  if (!ruleSteps[stepName] || !ruleSteps[stepName].exists) return;

  if (currentStep !== stepName) {
    persistCurrentStep();
  }

  const card = $(`[data-step-card="${stepName}"]`);
  const fallbackStep = card?.previousElementSibling?.dataset.stepCard
    || card?.nextElementSibling?.dataset.stepCard;

  removeStepElements(stepName);
  if (stepName === "initial") ruleSteps.initial.exists = false;
  else delete ruleSteps[stepName];
  if (currentStep === stepName) currentStep = fallbackStep;
  persistEscalationCardOrder();
  applyStepState(currentStep);
  showToast("Шаг удален");
}

function resetChannelSelections() {
  $$(".channel").forEach((channel) => {
    const checkbox = $(".check-button", channel);
    checkbox.classList.remove("active");
    checkbox.setAttribute("aria-pressed", "false");

    const picker = $(".select-wrap[data-recipient-picker='true']", channel);
    if (!picker) return;

    setRecipients(picker, []);
    picker.dataset.addressValue = "";
    picker.classList.remove("open", "open-up");
    const addressInput = $(".recipient-address-input", picker);
    if (addressInput) addressInput.value = "";
  });
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
      renderRecipientMenu(picker);
      syncRecipientMenu(picker);
      syncRecipientInputMode(channel);
    }
  });
  syncDropdownLayers();
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
  syncDropdownLayers();
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

initIncidentFields();
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
    const advanced = button.dataset.mode === "advanced";
    $("#filter-row").hidden = advanced;
    $("#advanced-filter").hidden = !advanced;
    closeMenus();
    if (advanced) requestAnimationFrame(() => $("#mql-query").focus());
    showToast(advanced ? "Включен продвинутый режим" : "Включен базовый режим");
  });
});

$$(".tab").forEach((button) => {
  button.addEventListener("click", () => setCurrentTab(button.dataset.tab));
});

$$(".step-card").forEach((card) => {
  bindStepCard(card);
  bindEscalationDrag(card);
  bindStepDelete(card);
});
syncEscalationDragState();
syncStepDeletionState();

$("#add-escalation").addEventListener("click", addEscalationStep);
$("#rename-current-step").addEventListener("click", () => renameStep(currentStep));
$("#delete-current-step").addEventListener("click", () => openDeleteStepModal(currentStep));

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
    syncDropdownLayers();
    if (wrap.classList.contains("open")) positionSelectMenu(wrap);
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
      const previousGroup = groupValue.textContent.trim();
      groupValue.textContent = value;
      if (previousGroup && previousGroup !== value) resetChannelSelections();
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

const basicFilterState = {
  source: new Set(),
  severity: new Set(),
  hosts: [],
  tags: [],
  more: new Set()
};

const moreFilterValues = {};

const basicFilterLabels = {
  source: "Источник",
  severity: "Важность",
  hosts: "Хост",
  tags: "Теги",
  more: "Больше"
};

function getBasicFilterCount(type) {
  return basicFilterState[type].size ?? basicFilterState[type].length;
}

function updateClearAllFiltersVisibility() {
  const hasStructuredFilters = ["source", "severity", "hosts", "tags"]
    .some((type) => getBasicFilterCount(type) > 0);
  const hasConfiguredMoreFilters = Object.keys(moreFilterValues).length > 0;
  const hasName = $("#filter-name").value.trim().length > 0;
  const hasAnyFilter = hasStructuredFilters || hasConfiguredMoreFilters || hasName;
  $("[data-clear='#filter-name']").hidden = !hasName;
  $("#clear-filters").hidden = !hasAnyFilter;
  $("#filter-row").classList.toggle("has-clear-all", hasAnyFilter);
}

function updateBasicFilterControl(type) {
  const control = $(`[data-filter-control="${type}"]`);
  const count = getBasicFilterCount(type);
  if (!control) return;
  if (type === "more") {
    $("[data-filter-label]", control).textContent = basicFilterLabels[type];
    control.classList.remove("has-value");
    updateClearAllFiltersVisibility();
    return;
  }
  $("[data-filter-label]", control).textContent = count
    ? `${basicFilterLabels[type]} (${count})`
    : basicFilterLabels[type];
  $("[data-filter-clear]", control).hidden = count === 0;
  control.classList.toggle("has-value", count > 0);
  updateClearAllFiltersVisibility();
}

function renderMoreFilterButtons() {
  const container = $("#more-filter-buttons");
  const iconTemplate = $(".filter-control-trigger .icon", $("[data-filter-control='more']"));
  container.textContent = "";

  Array.from(basicFilterState.more).forEach((filterName, index) => {
    const control = document.createElement("div");
    const trigger = document.createElement("button");
    const triggerLabel = document.createElement("span");
    const popover = document.createElement("div");
    control.className = "filter-control more-value-control";
    control.dataset.moreFilter = filterName;
    trigger.className = "filter-control-trigger";
    trigger.type = "button";
    trigger.dataset.filterTrigger = "";
    trigger.setAttribute("aria-expanded", "false");
    triggerLabel.textContent = moreFilterValues[filterName]
      ? `${filterName}: ${moreFilterValues[filterName]}`
      : filterName;
    trigger.append(triggerLabel, iconTemplate.cloneNode(true));
    popover.className = "filter-popover";

    ["Да", "Нет"].forEach((value) => {
      const option = document.createElement("label");
      const radio = document.createElement("input");
      const text = document.createElement("span");
      option.className = "filter-option";
      radio.type = "radio";
      radio.name = `more-filter-${index}`;
      radio.value = value;
      radio.checked = moreFilterValues[filterName] === value;
      text.textContent = value;
      radio.addEventListener("change", () => {
        moreFilterValues[filterName] = value;
        triggerLabel.textContent = `${filterName}: ${value}`;
        control.classList.remove("open");
        trigger.setAttribute("aria-expanded", "false");
        updateClearAllFiltersVisibility();
      });
      option.append(radio, text);
      popover.append(option);
    });

    trigger.addEventListener("click", (event) => {
      const shouldOpen = !control.classList.contains("open");
      closeMenus(shouldOpen ? control : null);
      control.classList.toggle("open", shouldOpen);
      trigger.setAttribute("aria-expanded", String(shouldOpen));
      event.stopPropagation();
    });
    popover.addEventListener("click", (event) => event.stopPropagation());
    control.append(trigger, popover);
    container.append(control);
  });
}

function renderFilterTokens(type) {
  const list = $(`[data-filter-token-list="${type}"]`);
  if (!list) return;
  list.textContent = "";
  basicFilterState[type].forEach((value) => {
    const token = document.createElement("span");
    const text = document.createElement("span");
    const remove = document.createElement("button");
    token.className = "filter-token";
    text.className = "filter-token-text";
    text.textContent = value;
    remove.className = "filter-token-remove";
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Удалить ${value}`);
    remove.addEventListener("click", (event) => {
      event.stopPropagation();
      basicFilterState[type] = basicFilterState[type].filter((item) => item !== value);
      renderFilterTokens(type);
      updateBasicFilterControl(type);
    });
    token.append(text, remove);
    list.append(token);
  });
}

function commitFilterTokens(input, commitRemainder = false) {
  const type = input.dataset.filterTokenInput;
  const parts = input.value.split(",");
  if (!commitRemainder && parts.length === 1) return;
  const values = (commitRemainder ? parts : parts.slice(0, -1))
    .map((value) => value.trim())
    .filter(Boolean);
  basicFilterState[type] = Array.from(new Set([...basicFilterState[type], ...values]));
  input.value = commitRemainder ? "" : parts.at(-1);
  renderFilterTokens(type);
  updateBasicFilterControl(type);
}

function clearBasicFilter(type) {
  if (basicFilterState[type] instanceof Set) {
    basicFilterState[type].clear();
    $$("input[type='checkbox']", $(`[data-filter-control="${type}"]`)).forEach((input) => {
      input.checked = false;
    });
    if (type === "more") {
      Object.keys(moreFilterValues).forEach((key) => delete moreFilterValues[key]);
      renderMoreFilterButtons();
    }
  } else {
    basicFilterState[type] = [];
    const input = $(`[data-filter-token-input="${type}"]`);
    if (input) input.value = "";
    renderFilterTokens(type);
  }
  updateBasicFilterControl(type);
}

$$("[data-filter-trigger]").forEach((button) => {
  button.addEventListener("click", (event) => {
    const control = button.closest(".filter-control");
    const shouldOpen = !control.classList.contains("open");
    closeMenus(shouldOpen ? control : null);
    control.classList.toggle("open", shouldOpen);
    button.setAttribute("aria-expanded", String(shouldOpen));
    if (shouldOpen) requestAnimationFrame(() => $("[data-filter-token-input]", control)?.focus());
    event.stopPropagation();
  });
});

$$("[data-filter-popover]").forEach((popover) => {
  popover.addEventListener("click", (event) => event.stopPropagation());
});

$$('[data-filter-control="source"] input, [data-filter-control="severity"] input, [data-filter-control="more"] input').forEach((input) => {
  input.addEventListener("change", () => {
    const type = input.closest(".filter-control").dataset.filterControl;
    if (input.checked) basicFilterState[type].add(input.value);
    else basicFilterState[type].delete(input.value);
    if (type === "more") {
      if (!input.checked) delete moreFilterValues[input.value];
      renderMoreFilterButtons();
    }
    updateBasicFilterControl(type);
  });
});

$$("[data-filter-token-input]").forEach((input) => {
  input.addEventListener("input", () => commitFilterTokens(input));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitFilterTokens(input, true);
    }
    if (event.key === "Backspace" && !input.value && basicFilterState[input.dataset.filterTokenInput].length) {
      basicFilterState[input.dataset.filterTokenInput].pop();
      renderFilterTokens(input.dataset.filterTokenInput);
      updateBasicFilterControl(input.dataset.filterTokenInput);
    }
  });
  input.addEventListener("blur", () => commitFilterTokens(input, true));
});

$$("[data-filter-clear]").forEach((button) => {
  button.addEventListener("click", (event) => {
    clearBasicFilter(button.dataset.filterClear);
    event.stopPropagation();
  });
});

$("#clear-filters").addEventListener("click", () => {
  ["source", "severity", "hosts", "tags"].forEach(clearBasicFilter);
  Object.keys(moreFilterValues).forEach((key) => delete moreFilterValues[key]);
  renderMoreFilterButtons();
  updateBasicFilterControl("more");
  $("#filter-name").value = "";
  updateClearAllFiltersVisibility();
  showToast("Фильтры очищены");
});

$$("[data-clear]").forEach((button) => {
  button.addEventListener("click", () => {
    const input = $(button.dataset.clear);
    input.value = "";
    input.focus();
    if (input.id === "rule-name") updateBreadcrumbTitle();
    if (input.id === "filter-name") updateClearAllFiltersVisibility();
    updateCreateState();
  });
});

$("#rule-name").addEventListener("input", () => {
  updateBreadcrumbTitle();
  updateCreateState();
});
$("#filter-name").addEventListener("input", updateClearAllFiltersVisibility);
$("#recovery").addEventListener("change", persistCurrentStep);

$("#delay-enabled").addEventListener("change", () => {
  persistCurrentStep();
  syncDelayUi();
});

$$("[data-delay-value]").forEach((input) => {
  input.addEventListener("input", () => {
    input.value = input.value.replace(/\D/g, "");
    const maximum = Number(input.dataset.delayMax);
    if (input.value && Number(input.value) > maximum) {
      input.value = String(maximum);
    }
    persistCurrentStep();
  });
  input.addEventListener("change", () => {
    persistCurrentStep();
    syncDelayUi();
  });
});

$$("[data-delay-unit]").forEach((button) => {
  button.addEventListener("click", () => {
    const unitMinutes = {
      days: 1440,
      hours: 60,
      minutes: 5
    }[button.dataset.delayUnit];
    const nextValue = getDelayInputMinutes() + unitMinutes * Number(button.dataset.delayDelta);
    ruleSteps[currentStep].delayMinutes = normalizeDelayMinutes(nextValue);
    syncDelayUi();
    persistCurrentStep();
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
  syncDropdownLayers();
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
      syncDropdownLayers();
      event.stopPropagation();
    });
  });

  $$("#timezone-dropdown .period-menu-option").forEach((option) => {
    option.addEventListener("click", (event) => {
      setTimezone(option.dataset.timezone);
      option.closest(".period-dropdown").classList.remove("open");
      syncDropdownLayers();
      event.stopPropagation();
    });
  });

  $$(".time-dropdown .period-menu-option").forEach((option) => {
    option.addEventListener("click", (event) => {
      const dropdown = option.closest(".time-dropdown");
      setTimeValue(dropdown, option.dataset.time);
      dropdown.classList.remove("open");
      syncDropdownLayers();
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
    if (button.dataset.incidentLevel) {
      persistCurrentStep();
    } else {
      syncPeriodicSettings();
    }
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
  updateStepSummaries();
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
  closeDeleteStepModal();
  window.history.back();
});

$("#create").addEventListener("click", () => {
  showToast("Правило создано: " + $("#rule-name").value.trim());
});

$$("[data-toast]").forEach((button) => {
  button.addEventListener("click", () => showToast(button.dataset.toast));
});

document.addEventListener("click", () => closeMenus());
let activeSummaryTooltipTarget = null;
document.addEventListener("mouseover", (event) => {
  const target = event.target.closest?.(".summary-icon-tooltip");
  if (!target) return;
  activeSummaryTooltipTarget = target;
  positionSummaryTooltip(target);
});
document.addEventListener("mouseout", (event) => {
  if (activeSummaryTooltipTarget && !activeSummaryTooltipTarget.contains(event.relatedTarget)) {
    activeSummaryTooltipTarget = null;
  }
});
document.addEventListener("focusin", (event) => {
  const target = event.target.closest?.(".summary-icon-tooltip");
  if (!target) return;
  activeSummaryTooltipTarget = target;
  positionSummaryTooltip(target);
});
document.addEventListener("focusout", (event) => {
  if (activeSummaryTooltipTarget && !activeSummaryTooltipTarget.contains(event.relatedTarget)) {
    activeSummaryTooltipTarget = null;
  }
});
document.addEventListener("scroll", () => {
  if (activeSummaryTooltipTarget?.isConnected) {
    positionSummaryTooltip(activeSummaryTooltipTarget);
  }
}, true);
window.addEventListener("resize", () => {
  const openSelect = $(".select-wrap.open");
  if (openSelect) positionSelectMenu(openSelect);
  if (activeSummaryTooltipTarget?.isConnected) {
    positionSummaryTooltip(activeSummaryTooltipTarget);
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMenus();
    closeDeleteStepModal();
  }
});
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
$$("[data-filter-control] input[type='checkbox']").forEach((input) => {
  input.checked = false;
});
Object.keys(basicFilterState).forEach(updateBasicFilterControl);
updateClearAllFiltersVisibility();
