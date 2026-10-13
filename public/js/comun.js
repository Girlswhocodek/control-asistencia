// Funciones compartidas por todas las pantallas.

// Llama a la API y devuelve el JSON; si hay error lanza una excepción con el mensaje del servidor.
async function api(url, opciones = {}) {
  const init = { credentials: 'same-origin', ...opciones };
  if (opciones.body && !(opciones.body instanceof FormData)) {
    init.headers = { 'Content-Type': 'application/json', ...(opciones.headers || {}) };
    init.body = JSON.stringify(opciones.body);
  }
  const res = await fetch(url, init);
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(datos.error || 'Ocurrió un error.');
    err.status = res.status;
    throw err;
  }
  return datos;
}

// Escapa texto antes de ponerlo en el HTML (evita inyección de código)
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
function fechaCorta(iso) { return iso ? iso.split('-').reverse().join('/') : ''; }
function fechaLarga(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dia = DIAS[new Date(y, m - 1, d).getDay()];
  return `${dia.charAt(0).toUpperCase() + dia.slice(1)} ${fechaCorta(iso)}`;
}
function horaDe(fechaHora) { return fechaHora ? fechaHora.slice(11, 16) : ''; }

const ETIQUETA = { PRESENTE: 'Presente', FALTA: 'Falta', PENDIENTE: 'Pendiente', PROGRAMADA: 'Programada' };
function badge(estado) { return `<span class="badge ${estado}">${ETIQUETA[estado] || estado}</span>`; }

let toastTimer;
function toast(mensaje, tipo = 'ok') {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.className = `alert ${tipo}`;
  el.textContent = mensaje;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3500);
}

// Verifica la sesión; si no corresponde al rol, vuelve al login
async function exigirSesion(rol) {
  const { usuario } = await api('/api/auth/me');
  if (!usuario || usuario.rol !== rol) { location.href = '/'; throw new Error('sin sesión'); }
  return usuario;
}

async function cerrarSesion() {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  location.href = '/';
}
