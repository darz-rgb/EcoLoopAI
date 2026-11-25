"use strict";
// build.py змінює RELEASE автоматично за вмістом усіх файлів.
const RELEASE = "882d6d195131";
const CACHE_PREFIX = `ecoloop-${self.registration.scope}-`;
const CACHE_NAME = `${CACHE_PREFIX}${RELEASE}`;
const APP_FILES = [
  "./index.html",
  `./style.css?v=${RELEASE}`,
  `./store.js?v=${RELEASE}`,
  `./app.js?v=${RELEASE}`,
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png"
];
const APP_URLS = new Set(APP_FILES.map(path => new URL(path, self.registration.scope).href));

self.addEventListener("install", (event) => {
  // Нова версія стає готовою лише після успішного отримання всіх файлів.
  event.waitUntil(caches.open(CACHE_NAME).then(cache => {
    return cache.addAll(APP_FILES.map(path => new Request(
      new URL(path, self.registration.scope), { cache: "reload" }
    )));
  }));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = (await caches.keys()).filter(name => name.startsWith(CACHE_PREFIX));
    // Залишаємо ще одну попередню версію для вже відкритих вкладок.
    const previous = names.filter(name => name !== CACHE_NAME).slice(-1);
    await Promise.all(names.filter(name => name !== CACHE_NAME && !previous.includes(name))
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function navigationResponse(request) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(request, { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error("Сторінка тимчасово недоступна");
    // Кешована сторінка прив’язана до RELEASE. Не змішуємо її з іншою версією.
    return response;
  } catch (error) {
    const cache = await caches.open(CACHE_NAME);
    const fallback = await cache.match(new URL("./index.html", self.registration.scope));
    return fallback || new Response("EcoLoop: відкрийте застосунок з інтернетом для першого завантаження.", {
      status: 503, headers: { "Content-Type": "text/plain;charset=utf-8" }
    });
  } finally { clearTimeout(timer); }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || !request.url.startsWith(self.registration.scope)) return;
  if (url.pathname.endsWith("/version.json") || url.pathname.endsWith("/update.html")) {
    event.respondWith(fetch(request, { cache: "no-store" }));
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(navigationResponse(request));
    return;
  }
  if (APP_URLS.has(request.url)) {
    event.respondWith(caches.open(CACHE_NAME).then(async cache => {
      return await cache.match(request) || fetch(request, { cache: "no-store" });
    }));
    return;
  }
  // Незнайомі версії ресурсів отримуємо із сервера, щоб старий worker
  // міг відкрити сторінку нового випуску до його активації.
  event.respondWith(fetch(request, { cache: "no-store" }));
});
