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
  $$(".select-wrap.open, .dropdown.open").forEach((node) => {
    if (node !== except) node.classList.remove("open");
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
    const select = button.closest(".channel").querySelector(".select-value");
    if (button.textContent.includes("адрес")) {
      select.textContent = "Введите групповой адрес";
    } else {
      const channelName = button.closest(".channel").querySelector(".channel-title > span").textContent;
      select.textContent = channelName === "Telegram"
        ? "Выберите получателей из списка или введите Telegram ID группового чата"
        : "Выберите получателей из списка";
    }
  });
});

$$(".select-button").forEach((button) => {
  button.addEventListener("click", (event) => {
    const wrap = button.closest(".select-wrap");
    closeMenus(wrap);
    wrap.classList.toggle("open");
    event.stopPropagation();
  });
});

$$(".select-wrap .menu button").forEach((button) => {
  button.addEventListener("click", () => {
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

$$(".radio-option").forEach((button) => {
  button.addEventListener("click", () => {
    const group = button.closest('[role="radiogroup"]') || document;
    $$(".radio-option", group).forEach((option) => {
      const active = option === button;
      option.classList.toggle("active", active);
      option.setAttribute("aria-checked", String(active));
    });
  });
});

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
  ruleSteps.initial.channels.clear();
  ruleSteps.initial.incidents.clear();
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
  $$(".select-wrap").forEach((wrap) => delete wrap.dataset.selected);
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
syncDefaultField();
syncIncidentChannels();
updateBreadcrumbTitle();
updateStepNames();
currentStep = "initial";
applyStepState("initial");
updateStepTabsLayout();
