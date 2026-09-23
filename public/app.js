import {
  serviceInfo,
  titles,
  escapeHTML as esc,
  safeUrl,
  loadWidgetData,
} from "./data.js";

const $ = (selector) => document.querySelector(selector);
const state = {
  user: null,
  services: [],
  widgets: [],
  enabled: [],
  filter: "all",
  editingId: null,
  deletingId: null,
  runtimes: new Map(),
  moving: false,
  epoch: 0,
};
const label = (name) => titles[name] || name.replaceAll("_", " ");
const serviceTitle = (name) => serviceInfo[name]?.title || name;
function notify(text) {
  $("#dashboard-message").textContent = text;
}
async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
    signal: options.signal || AbortSignal.timeout(15000),
  });
  if (response.status === 204) return null;
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && state.user)
      showAuth("Your session has expired. Please sign in again.");
    const error = new Error(
      data.error || "Something went wrong. Please try again.",
    );
    error.status = response.status;
    throw error;
  }
  return data;
}
async function submit(form, target, action) {
  const buttons = [...form.querySelectorAll("button")];
  buttons.forEach((button) => {
    button.disabled = true;
  });
  $(target).textContent = "";
  try {
    await action();
  } catch (error) {
    $(target).textContent =
      error.message || "Request failed. Please try again.";
  } finally {
    buttons.forEach((button) => {
      button.disabled = false;
    });
  }
}
function stopTimers() {
  state.epoch++;
  for (const runtime of state.runtimes.values()) {
    clearTimeout(runtime.timer);
    runtime.controller?.abort();
  }
  state.runtimes.clear();
}
function showAuth(text = "") {
  stopTimers();
  state.user = null;
  state.widgets = [];
  state.editingId = null;
  state.deletingId = null;
  document.querySelectorAll("dialog[open]").forEach((dialog) => dialog.close());
  $(".skip-link").href = "#auth-title";
  $("#dashboard-view").hidden = true;
  $("#auth-view").hidden = false;
  $("#widget-grid").replaceChildren();
  setAuthMode("login");
  $("#auth-message").textContent = text;
}
function setAuthMode(mode) {
  for (const name of ["login", "register", "verify"])
    $(`#${name}-form`).hidden = mode !== name;
  $("#show-login").setAttribute("aria-pressed", String(mode === "login"));
  $("#show-register").setAttribute("aria-pressed", String(mode === "register"));
  $("#auth-title").textContent = {
    login: "Welcome back",
    register: "Make it your space",
    verify: "One last step",
  }[mode];
  $("#auth-subtitle").textContent = {
    login: "Sign in and pick up where you left off.",
    register: "Your everyday essentials, brought together.",
    verify: "Confirm your account to get started.",
  }[mode];
  $("#auth-message").textContent = "";
}
async function reloadServices() {
  const result = await api("/api/services");
  state.enabled = result.services
    .filter((service) => service.enabled)
    .map((service) => service.name);
  renderServices();
}
async function startDashboard() {
  const me = await api("/api/me");
  const [about, result, subscriptions] = await Promise.all([
    api("/about.json"),
    api("/api/widgets"),
    api("/api/services"),
  ]);
  stopTimers();
  state.user = me.user;
  state.services = about.server.services;
  state.widgets = result.widgets;
  state.filter = "all";
  state.enabled = subscriptions.services
    .filter((service) => service.enabled)
    .map((service) => service.name);
  $("#user-name").textContent = me.user.username;
  $("#user-avatar").textContent = me.user.username.slice(0, 1).toUpperCase();
  $("#profile-name").textContent = me.user.username;
  $("#profile-email").textContent = me.user.email;
  $(".skip-link").href = "#main-content";
  $("#auth-view").hidden = true;
  $("#dashboard-view").hidden = false;
  $("#login-form").reset();
  $("#register-form").reset();
  $("#verify-form").reset();
  $("#today").textContent = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date());
  $("#service-count").textContent = state.services.length;
  notify("");
  switchView("overview");
  renderServices();
  renderWidgets();
}
function switchView(view) {
  for (const name of ["overview", "services", "account"])
    $(`#${name}-page`).hidden = name !== view;
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
    if (button.dataset.view === view)
      button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  $("#breadcrumb").textContent = view[0].toUpperCase() + view.slice(1);
}
function renderServices() {
  $("#services-grid").innerHTML = state.services
    .map((service) => {
      const info = serviceInfo[service.name] || {
        icon: "◈",
        description: "Add widgets from this service.",
      };
      const enabled = state.enabled.includes(service.name);
      return `<article class="service-card"><span class="service-icon ${esc(service.name)}" aria-hidden="true">${info.icon}</span><span class="badge ${enabled ? "" : "inactive"}">${enabled ? "Enabled" : "Available"}</span><h2>${esc(serviceTitle(service.name))}</h2><p class="muted">${esc(info.description)}</p><ul>${service.widgets.map((widget) => `<li>${esc(label(widget.name))}</li>`).join("")}</ul><button class="${enabled ? "secondary" : "primary"} full" data-enable="${esc(service.name)}" ${service.name === "weather" ? "disabled" : ""}>${service.name === "weather" ? "Available by default" : enabled ? "Disable service" : "Enable service"}</button>${enabled ? `<button class="text-button" data-add="${esc(service.name)}">Add a widget ↗</button>` : ""}</article>`;
    })
    .join("");
  $("#enabled-count").textContent = state.enabled.length;
}
function renderParameters(values = {}) {
  const service = state.services.find(
    (item) => item.name === $("#service").value,
  );
  const widget = service?.widgets.find(
    (item) => item.name === $("#widget").value,
  );
  $("#widget-description").textContent = widget?.description || "";
  const hints = {
    city: "Barcelona",
    repository: "facebook/react",
    link: "https://example.com/feed.xml",
    number: "5",
  };
  $("#configuration").innerHTML = (widget?.params || [])
    .map(
      (param) =>
        `<label>${esc({ link: "Feed URL", number: "Number of items", repository: "Repository (owner/name)", city: "City" }[param.name] || label(param.name))}<input data-param="${esc(param.name)}" type="${param.type === "integer" ? "number" : param.name === "link" ? "url" : "text"}" ${param.type === "integer" ? 'step="1" min="1" max="20"' : 'maxlength="2048"'} placeholder="${esc(hints[param.name] || "")}" value="${esc(values[param.name] ?? (param.type === "integer" ? 5 : ""))}" required></label>`,
    )
    .join("");
  if (service?.name === "rss")
    $("#configuration").insertAdjacentHTML(
      "beforeend",
      '<p class="field-help">Use an RSS or Atom feed that allows browser access (CORS). Other feeds require a server proxy.</p>',
    );
  if (service?.name === "github")
    $("#configuration").insertAdjacentHTML(
      "beforeend",
      '<p class="field-help">Public repositories only. No token or private credentials are needed.</p>',
    );
}
function populateWidgetChoices(selected) {
  const service = state.services.find(
    (item) => item.name === $("#service").value,
  );
  $("#widget").innerHTML = (service?.widgets || [])
    .map(
      (widget) =>
        `<option value="${esc(widget.name)}">${esc(label(widget.name))}</option>`,
    )
    .join("");
  if (selected) $("#widget").value = selected;
  renderParameters();
}
function openEditor(item, serviceName) {
  state.editingId = item?.id || null;
  $("#widget-form").reset();
  $("#widget-message").textContent = "";
  $("#dialog-title").textContent = item ? "Edit widget" : "Add a widget";
  $("#save-widget").textContent = item ? "Save changes" : "Add widget";
  $("#service").innerHTML = state.services
    .filter((service) => state.enabled.includes(service.name))
    .map(
      (service) =>
        `<option value="${esc(service.name)}">${esc(serviceTitle(service.name))}</option>`,
    )
    .join("");
  if (item || serviceName)
    $("#service").value = item?.service_name || serviceName;
  populateWidgetChoices(item?.widget_name);
  if (item) {
    renderParameters(item.configuration);
    const value = String(item.refresh_rate);
    if (
      ![...$("#refresh-rate").options].some((option) => option.value === value)
    )
      $("#refresh-rate").add(new Option(`${value} seconds`, value));
    $("#refresh-rate").value = value;
  }
  $("#widget-dialog").showModal();
}
function runtimeFor(item) {
  if (!state.runtimes.has(item.id))
    state.runtimes.set(item.id, {
      html: "",
      error: "",
      updated: null,
      timer: null,
      controller: null,
      busy: false,
    });
  return state.runtimes.get(item.id);
}
function renderWidgets() {
  $("#widget-count").textContent = state.widgets.length;
  $(".sidebar-note [data-add]").textContent = state.widgets.length
    ? "Add another widget ↗"
    : "Add your first widget ↗";
  $("#refresh-summary").textContent = state.widgets.length
    ? "Automatic"
    : "Ready";
  document.querySelectorAll("[data-filter]").forEach((button) => {
    const active = button.dataset.filter === state.filter;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  const items = state.widgets.filter(
    (item) => state.filter === "all" || item.service_name === state.filter,
  );
  $("#widget-grid").innerHTML = items.length
    ? items
        .map((item) => {
          const index = state.widgets.indexOf(item),
            info = serviceInfo[item.service_name] || { icon: "◈" };
          return `<article class="widget" data-widget-id="${esc(item.id)}" aria-label="${esc(label(item.widget_name))}"><div class="widget-head"><span class="service-icon ${esc(item.service_name)}" aria-hidden="true">${info.icon}</span><p class="eyebrow">${esc(serviceTitle(item.service_name))}</p><button class="icon-button drag-handle" draggable="true" data-drag="${esc(item.id)}" title="Drag to reorder; use arrow buttons with a keyboard" aria-label="Drag to reorder ${esc(label(item.widget_name))}">⠿</button></div><h3>${esc(label(item.widget_name))}</h3><p class="widget-context" title="${esc(Object.values(item.configuration).join(" · "))}">${esc(Object.values(item.configuration).join(" · "))}</p><div class="widget-body"></div><div class="widget-footer"><span class="timestamp"></span><button data-action="refresh" data-id="${esc(item.id)}" aria-label="Refresh ${esc(label(item.widget_name))}" title="Refresh">↻</button><button data-action="up" data-id="${esc(item.id)}" aria-label="Move widget earlier" title="Move earlier" ${index === 0 ? "disabled" : ""}>←</button><button data-action="down" data-id="${esc(item.id)}" aria-label="Move widget later" title="Move later" ${index === state.widgets.length - 1 ? "disabled" : ""}>→</button><button class="edit-button" data-action="edit" data-id="${esc(item.id)}">Edit</button><button data-action="delete" data-id="${esc(item.id)}" aria-label="Remove ${esc(label(item.widget_name))}" title="Remove">×</button></div></article>`;
        })
        .join("")
    : `<div class="empty-state"><div class="empty-symbol" aria-hidden="true">▦</div><h2>${state.widgets.length ? "A little quiet here" : "Start with what matters"}</h2><p class="muted">${state.widgets.length ? "There are no widgets from this service yet. Add one to make it part of your day." : "Bring weather, news and your favourite projects into one personal space. Your first widget is a good place to start."}</p><button class="primary" data-add>+ Add a widget</button></div>`;
  for (const item of state.widgets) {
    const runtime = runtimeFor(item);
    paintWidget(item, runtime);
    if (!runtime.updated && !runtime.busy && !runtime.timer)
      refreshWidget(item);
  }
}
function paintWidget(item, runtime) {
  const card = [...document.querySelectorAll("[data-widget-id]")].find(
    (node) => node.dataset.widgetId === item.id,
  );
  if (!card) return;
  card
    .querySelector(".widget-body")
    .setAttribute("aria-busy", String(runtime.busy));
  card.querySelector(".widget-body").innerHTML = runtime.html
    ? runtime.html +
      (runtime.error
        ? `<p class="stale-note">Last successful data. ${esc(runtime.error)}</p>`
        : "")
    : runtime.error
      ? `<div class="widget-error" role="status">${esc(runtime.error)}</div>`
      : '<p class="loading">Loading your data…</p>';
  card.querySelector(".timestamp").textContent =
    `${runtime.busy ? "Updating…" : runtime.updated ? `Updated ${runtime.updated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : runtime.error ? "Update failed" : "Waiting"} · ${item.refresh_rate}s`;
  card.querySelector('[data-action="refresh"]').disabled = runtime.busy;
}
async function refreshWidget(item) {
  if (!state.user) return;
  const runtime = runtimeFor(item);
  if (runtime.busy) return;
  clearTimeout(runtime.timer);
  runtime.busy = true;
  runtime.controller = new AbortController();
  paintWidget(item, runtime);
  const epoch = state.epoch;
  const timeout = setTimeout(() => runtime.controller.abort(), 15000);
  try {
    const html = await loadWidgetData(item, runtime.controller.signal);
    if (epoch !== state.epoch) return;
    runtime.html = html;
    runtime.error = "";
    runtime.updated = new Date();
  } catch (error) {
    if (epoch !== state.epoch) return;
    runtime.error =
      error.name === "AbortError"
        ? "Request timed out. Try again."
        : error.message || "Could not reach the service.";
  } finally {
    clearTimeout(timeout);
    runtime.busy = false;
    if (
      epoch === state.epoch &&
      state.runtimes.get(item.id) === runtime &&
      state.user
    ) {
      paintWidget(item, runtime);
      runtime.timer = setTimeout(
        () => refreshWidget(item),
        item.refresh_rate * 1000,
      );
    }
  }
}
async function reloadWidgets() {
  const result = await api("/api/widgets");
  if (!state.user) return;
  stopTimers();
  state.widgets = result.widgets;
  renderWidgets();
  renderServices();
}
async function moveWidget(id, targetIndex) {
  if (state.moving) return;
  state.moving = true;
  try {
    const order = [...state.widgets],
      from = order.findIndex((item) => item.id === id);
    if (
      from < 0 ||
      targetIndex < 0 ||
      targetIndex >= order.length ||
      from === targetIndex
    )
      return;
    order.splice(targetIndex, 0, order.splice(from, 1)[0]);
    // Normalize every position: decrementing one value can leave tied positions.
    for (let index = 0; index < order.length; index++)
      await api(`/api/widgets/${order[index].id}`, {
        method: "PATCH",
        body: JSON.stringify({ position_y: index }),
      });
    await reloadWidgets();
    notify("Widget order saved.");
    const moved = [...document.querySelectorAll("[data-widget-id]")].find(
      (card) => card.dataset.widgetId === id,
    );
    moved?.querySelector('[data-action="edit"]').focus();
  } catch (error) {
    notify(`Could not finish saving the order: ${error.message}`);
    if (state.user) await reloadWidgets().catch(() => {});
  } finally {
    state.moving = false;
  }
}
$("#show-login").addEventListener("click", () => setAuthMode("login"));
$("#show-register").addEventListener("click", () => setAuthMode("register"));
$("#show-verify").addEventListener("click", () => setAuthMode("verify"));
$("#login-form").addEventListener("submit", (event) => {
  event.preventDefault();
  submit(event.currentTarget, "#auth-message", async () => {
    await api("/auth/login", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(new FormData(event.target))),
    });
    await startDashboard();
  });
});
$("#register-form").addEventListener("submit", (event) => {
  event.preventDefault();
  submit(event.currentTarget, "#auth-message", async () => {
    const data = await api("/auth/register", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(new FormData(event.target))),
    });
    setAuthMode("verify");
    $("#verify-form input").value = data.verification_token || "";
    $("#register-form").reset();
    $("#verify-form input").focus();
  });
});
$("#verify-form").addEventListener("submit", (event) => {
  event.preventDefault();
  submit(event.currentTarget, "#auth-message", async () => {
    await api("/auth/verify", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(new FormData(event.target))),
    });
    setAuthMode("login");
    $("#auth-message").textContent = "Account confirmed. You can now sign in.";
    $("#verify-form").reset();
    $("#login-form input").focus();
  });
});
$("#logout-button").addEventListener("click", async () => {
  try {
    await api("/auth/logout", { method: "POST" });
    showAuth();
  } catch (error) {
    notify(error.message);
  }
});
$("#service").addEventListener("change", () => populateWidgetChoices());
$("#widget").addEventListener("change", () => renderParameters());
$("#widget-form").addEventListener("submit", (event) => {
  event.preventDefault();
  submit(event.currentTarget, "#widget-message", async () => {
    const configuration = Object.fromEntries(
      [...$("#configuration").querySelectorAll("[data-param]")].map((input) => [
        input.dataset.param,
        input.type === "number" ? Number(input.value) : input.value.trim(),
      ]),
    );
    if (Object.values(configuration).some((value) => value === ""))
      throw new Error("Please fill in every configuration field.");
    if (
      configuration.repository &&
      !/^[\w.-]+\/[\w.-]+$/.test(configuration.repository)
    )
      throw new Error("Use owner/repository, for example facebook/react.");
    if (configuration.link && !safeUrl(configuration.link))
      throw new Error("Use a complete http:// or https:// feed address.");
    const payload = {
      service_name: $("#service").value,
      widget_name: $("#widget").value,
      configuration,
      refresh_rate: Number($("#refresh-rate").value),
    };
    await api(
      state.editingId ? `/api/widgets/${state.editingId}` : "/api/widgets",
      {
        method: state.editingId ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      },
    );
    $("#widget-dialog").close();
    state.editingId = null;
    state.filter = "all";
    switchView("overview");
    await reloadWidgets();
    notify("Widget saved.");
  });
});
$("#delete-form").addEventListener("submit", (event) => {
  event.preventDefault();
  submit(event.currentTarget, "#delete-message", async () => {
    await api(`/api/widgets/${state.deletingId}`, { method: "DELETE" });
    $("#delete-dialog").close();
    state.deletingId = null;
    await reloadWidgets();
    notify("Widget removed.");
  });
});
$("#refresh-all").addEventListener("click", () => {
  state.widgets.forEach((item) => refreshWidget(item));
});
document.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.hasAttribute("data-add")) {
    openEditor(null, button.dataset.add || null);
    return;
  }
  if (button.dataset.close) {
    $(`#${button.dataset.close}`).close();
    return;
  }
  if (button.dataset.view) {
    switchView(button.dataset.view);
    return;
  }
  if (button.dataset.filter) {
    state.filter = button.dataset.filter;
    renderWidgets();
    return;
  }
  if (button.dataset.enable) {
    const name = button.dataset.enable;
    try {
      if (state.enabled.includes(name)) await api(`/api/services/${encodeURIComponent(name)}`, { method: "DELETE" });
      else await api(`/api/services/${encodeURIComponent(name)}/enable`, { method: "POST" });
      await reloadServices();
      notify(`${serviceTitle(name)} service updated.`);
    } catch (error) {
      notify(error.message);
    }
    return;
  }
  const item = state.widgets.find((entry) => entry.id === button.dataset.id);
  if (!item) return;
  if (button.dataset.action === "refresh") refreshWidget(item);
  if (button.dataset.action === "edit") openEditor(item);
  if (button.dataset.action === "delete") {
    state.deletingId = item.id;
    $("#delete-message").textContent = "";
    $("#delete-dialog").showModal();
  }
  if (button.dataset.action === "up" || button.dataset.action === "down")
    moveWidget(
      item.id,
      state.widgets.indexOf(item) + (button.dataset.action === "up" ? -1 : 1),
    );
});
$("#widget-grid").addEventListener("dragstart", (event) => {
  const handle = event.target.closest("[data-drag]");
  if (!handle) {
    event.preventDefault();
    return;
  }
  event.dataTransfer.setData("text/plain", handle.dataset.drag);
  event.dataTransfer.effectAllowed = "move";
  handle.closest(".widget").classList.add("dragging");
});
$("#widget-grid").addEventListener("dragover", (event) => {
  const card = event.target.closest(".widget");
  if (card) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    card.classList.add("drag-over");
  }
});
$("#widget-grid").addEventListener("dragleave", (event) => {
  event.target.closest(".widget")?.classList.remove("drag-over");
});
function clearDrag() {
  document
    .querySelectorAll(".dragging,.drag-over")
    .forEach((card) => card.classList.remove("dragging", "drag-over"));
}
$("#widget-grid").addEventListener("dragend", clearDrag);
$("#widget-grid").addEventListener("drop", (event) => {
  event.preventDefault();
  const card = event.target.closest(".widget");
  clearDrag();
  if (card)
    moveWidget(
      event.dataTransfer.getData("text/plain"),
      state.widgets.findIndex((item) => item.id === card.dataset.widgetId),
    );
});
window.addEventListener("pagehide", stopTimers);
window.addEventListener("pageshow", (event) => {
  if (event.persisted && state.user) renderWidgets();
});
startDashboard().catch((error) => {
  showAuth(
    error.status === 401
      ? ""
      : `Unable to open your workspace. ${error.message}`,
  );
});
