const state = { services: [], widgets: [], editingId: null };
const $ = (selector) => document.querySelector(selector);

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function message(text) { $("#dashboard-message").textContent = text; }

function renderParameters() {
  const service = state.services.find((item) => item.name === $("#service").value);
  const widget = service?.widgets.find((item) => item.name === $("#widget").value);
  $("#configuration").innerHTML = (widget?.params || []).map((param) => `
    <label>${param.name.replaceAll("_", " ")}
      <input data-param="${param.name}" ${param.type === "integer" ? 'type="number" step="1"' : "type=text"} required>
    </label>`).join("");
}

function populateWidgetChoices() {
  const service = state.services.find((item) => item.name === $("#service").value);
  $("#widget").innerHTML = (service?.widgets || []).map((widget) => `<option value="${widget.name}">${widget.name.replaceAll("_", " ")}</option>`).join("");
  renderParameters();
}

function renderWidgets() {
  const grid = $("#widget-grid");
  if (!state.widgets.length) { grid.innerHTML = '<p class="empty">No widgets yet. Add your first one above.</p>'; return; }
  grid.innerHTML = state.widgets.map((item) => `
    <article class="widget">
      <p class="eyebrow">${item.service_name}</p><h3>${item.widget_name.replaceAll("_", " ")}</h3>
      <p>${Object.entries(item.configuration).map(([key, value]) => `${key.replaceAll("_", " ")}: ${value}`).join(" · ")}</p>
      <p>Refreshes every ${item.refresh_rate}s</p>
      <div class="widget-actions">
        <button class="secondary" data-action="move-up" data-id="${item.id}">Move up</button>
        <button class="secondary" data-action="edit" data-id="${item.id}">Edit</button>
        <button class="danger" data-action="delete" data-id="${item.id}">Delete</button>
      </div>
    </article>`).join("");
}

async function loadDashboard() {
  const [about, widgets] = await Promise.all([api("/about.json"), api("/api/widgets")]);
  state.services = about.server.services; state.widgets = widgets.widgets;
  $("#service").innerHTML = state.services.map((item) => `<option value="${item.name}">${item.name}</option>`).join("");
  populateWidgetChoices(); renderWidgets();
}

async function startDashboard() {
  const me = await api("/api/me");
  $("#user-name").textContent = me.user.username;
  $("#auth-view").hidden = true; $("#dashboard-view").hidden = false;
  await loadDashboard();
}

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault(); const form = new FormData(event.currentTarget);
  try { await api("/auth/login", { method: "POST", body: JSON.stringify(Object.fromEntries(form)) }); await startDashboard(); }
  catch (error) { $("#auth-message").textContent = error.message; }
});
$("#register-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try { const data = await api("/auth/register", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); $("#auth-message").textContent = `Account created. Development confirmation token: ${data.verification_token}`; }
  catch (error) { $("#auth-message").textContent = error.message; }
});
$("#service").addEventListener("change", populateWidgetChoices); $("#widget").addEventListener("change", renderParameters);
$("#widget-form").addEventListener("submit", async (event) => {
  event.preventDefault(); const form = event.currentTarget; const configuration = Object.fromEntries([...$("#configuration").querySelectorAll("[data-param]")].map((input) => [input.dataset.param, input.type === "number" ? Number(input.value) : input.value]));
  const payload = { service_name: $("#service").value, widget_name: $("#widget").value, configuration, refresh_rate: Number($("#refresh-rate").value) };
  try { await api(state.editingId ? `/api/widgets/${state.editingId}` : "/api/widgets", { method: state.editingId ? "PATCH" : "POST", body: JSON.stringify(payload) }); state.editingId = null; form.reset(); message("Widget saved."); await loadDashboard(); }
  catch (error) { message(error.message); }
});
$("#widget-grid").addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-id]"); if (!button) return;
  const item = state.widgets.find((widget) => widget.id === button.dataset.id);
  if (button.dataset.action === "delete") { await api(`/api/widgets/${item.id}`, { method: "DELETE" }); await loadDashboard(); }
  if (button.dataset.action === "move-up") { await api(`/api/widgets/${item.id}`, { method: "PATCH", body: JSON.stringify({ position_y: Math.max(0, item.position_y - 1) }) }); await loadDashboard(); }
  if (button.dataset.action === "edit") { state.editingId = item.id; $("#service").value = item.service_name; populateWidgetChoices(); $("#widget").value = item.widget_name; renderParameters(); Object.entries(item.configuration).forEach(([key, value]) => { const input = document.querySelector(`[data-param="${key}"]`); if (input) input.value = value; }); $("#refresh-rate").value = item.refresh_rate; message("Editing widget. Save to apply changes."); window.scrollTo({ top: 0, behavior: "smooth" }); }
});
$("#logout-button").addEventListener("click", async () => { await api("/auth/logout", { method: "POST" }); location.reload(); });
startDashboard().catch(() => {});
