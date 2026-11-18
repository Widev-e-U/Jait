import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

/**
 * A deterministic, self-contained "web shop" used to benchmark agent browser
 * steering. It reproduces patterns that make real sites slow to drive: a heavy
 * DOM, sticky/fixed overlays, client-rendered results, menus that appear on
 * demand, popups, redirect chains followed by a script redirect, multi-step
 * forms with validation, modal confirmation and SPA history routing.
 */
export interface FixtureSite {
  baseUrl: string;
  server: Server;
  close(): Promise<void>;
}

export interface FixtureSiteOptions {
  /** Product cards rendered on the home page (each is ~10 DOM nodes). */
  heavyCards?: number;
  /** Delay before client-rendered content appears. */
  renderDelayMs?: number;
}

const PRODUCTS = Array.from({ length: 120 }, (_, i) => ({
  id: i + 1,
  name: `${["Ergonomic", "Compact", "Studio", "Travel", "Smart"][i % 5]} ${["Chair", "Desk", "Lamp", "Monitor Arm", "Keyboard", "Headset"][i % 6]} ${i + 1}`,
  price: 49 + ((i * 37) % 400),
}));

const COUNTRIES = Array.from({ length: 200 }, (_, i) => `Country ${String(i + 1).padStart(3, "0")}`);

function layout(title: string, body: string, options: { cartCount?: number; cookies?: boolean } = {}): string {
  const banner = options.cookies === false ? "" : `
    <div id="cookie-banner" role="region" aria-label="Cookie consent" style="position:fixed;left:0;right:0;bottom:0;height:24vh;background:#222;color:#fff;padding:16px;z-index:50">
      We use cookies to improve this fixture.
      <button id="accept-cookies" onclick="document.cookie='consent=1;path=/';document.getElementById('cookie-banner').remove()">Accept cookies</button>
      <button onclick="document.getElementById('cookie-banner').remove()">Reject</button>
    </div>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>
  <style>
    body{font-family:sans-serif;margin:0}
    header{position:sticky;top:0;background:#fff;border-bottom:1px solid #ccc;padding:8px;z-index:20;display:flex;gap:8px;align-items:center}
    .mega{display:none} .card{display:inline-block;width:180px;margin:4px;border:1px solid #ddd;padding:4px}
    [role=menu]{border:1px solid #888;background:#fff;position:absolute}
    .hidden{display:none} #toast{position:fixed;top:60px;right:10px;background:#0a0;color:#fff;padding:8px}
    dialog::backdrop{background:#0006}
  </style></head><body>
  <header>
    <a href="/" id="logo">Fixture Shop</a>
    <form action="/search" method="get" role="search">
      <input name="q" id="search-input" aria-label="Search products" placeholder="Search products">
      <button id="search-submit" type="submit">Search</button>
    </form>
    <a href="/cart" id="cart-link">Cart (<span id="cart-count">${options.cartCount ?? 0}</span>)</a>
    <a href="/account" id="account-link">Account</a>
    <nav class="mega" aria-label="All categories">${Array.from({ length: 40 }, (_, c) =>
      `<ul>${Array.from({ length: 25 }, (_, l) => `<li><a href="/search?q=cat${c}-${l}">Category ${c} item ${l}</a></li>`).join("")}</ul>`).join("")}</nav>
  </header>
  <main>${body}</main>${banner}
  <script>if (document.cookie.includes('consent=1')) document.getElementById('cookie-banner')?.remove();</script>
  </body></html>`;
}

function homePage(cards: number): string {
  const grid = Array.from({ length: cards }, (_, i) => {
    const product = PRODUCTS[i % PRODUCTS.length]!;
    return `<div class="card" data-testid="card-${i}"><div><span>${product.name}</span><span> $${product.price}</span></div>
      <p>Rated <b>${(i % 5) + 1}</b> of 5 by <i>${(i * 13) % 997}</i> buyers</p>
      <button aria-label="Add ${product.name} (card ${i}) to wishlist">♡</button></div>`;
  }).join("");
  return layout("Fixture Shop — Home", `<h1>Welcome to Fixture Shop</h1><section aria-label="Popular products">${grid}</section>`);
}

function searchPage(query: string, page: number, delayMs: number): string {
  return layout(`Search: ${query}`, `
    <h1>Results for “${escapeHtml(query)}”</h1>
    <p id="loading">Loading results…</p>
    <ol id="results" aria-label="Search results"></ol>
    <nav aria-label="Pagination" id="pager"></nav>
    <script>
      setTimeout(() => {
        const page = ${page};
        const items = ${JSON.stringify(PRODUCTS)}.slice((page - 1) * 20, page * 20);
        document.getElementById('results').innerHTML = items.map(p => '<li class="result"><a href="/product/' + p.id + '">' + p.name + '</a> — $' + p.price + '</li>').join('');
        document.getElementById('loading').remove();
        document.getElementById('pager').innerHTML = (page > 1 ? '<a id="prev-page" href="/search?q=${encodeURIComponent(query)}&page=' + (page - 1) + '">Previous page</a> ' : '')
          + '<a id="next-page" href="/search?q=${encodeURIComponent(query)}&page=' + (page + 1) + '">Next page</a>';
        document.body.dataset.ready = 'results';
      }, ${delayMs});
    </script>`, { cookies: true });
}

function productPage(id: number): string {
  const product = PRODUCTS[(id - 1) % PRODUCTS.length]!;
  return layout(product.name, `
    <h1 id="product-title">${product.name}</h1>
    <p>Price: $<span id="price">${product.price}</span></p>
    <div role="tablist" aria-label="Product information">
      <button role="tab" id="tab-details" aria-selected="true" aria-controls="panel-details">Details</button>
      <button role="tab" id="tab-reviews" aria-selected="false" aria-controls="panel-reviews">Reviews</button>
      <button role="tab" id="tab-shipping" aria-selected="false" aria-controls="panel-shipping">Shipping</button>
    </div>
    <div role="tabpanel" id="panel-details">Solid build. Ships flat packed.</div>
    <div role="tabpanel" id="panel-reviews" class="hidden">${Array.from({ length: 30 }, (_, i) => `<p>Review ${i + 1}: ${"Great product. ".repeat((i % 4) + 1)}</p>`).join("")}</div>
    <div role="tabpanel" id="panel-shipping" class="hidden">Free shipping over $100.</div>
    <div style="position:relative">
      <button id="options-button" aria-haspopup="menu" aria-expanded="false">More options</button>
    </div>
    <p id="menu-result"></p>
    <label>Size <select id="size" name="size"><option value="">Choose size</option><option value="s">Small</option><option value="m">Medium</option><option value="l">Large</option></select></label>
    <label>Quantity <input id="quantity" name="quantity" type="number" min="1" value="1"></label>
    <button id="add-to-cart">Add to cart</button>
    <a id="size-guide" href="/size-guide" target="_blank">Open size guide</a>
    <script>
      document.querySelectorAll('[role=tab]').forEach(tab => tab.addEventListener('click', () => {
        document.querySelectorAll('[role=tab]').forEach(other => {
          other.setAttribute('aria-selected', String(other === tab));
          document.getElementById(other.getAttribute('aria-controls')).classList.toggle('hidden', other !== tab);
        });
      }));
      const button = document.getElementById('options-button');
      button.addEventListener('click', () => {
        // Menus on real sites are rendered lazily after a short delay.
        setTimeout(() => {
          if (document.getElementById('options-menu')) return;
          const menu = document.createElement('div');
          menu.id = 'options-menu'; menu.setAttribute('role', 'menu');
          ['Compare', 'Share', 'Report'].forEach(label => {
            const item = document.createElement('button');
            item.setAttribute('role', 'menuitem'); item.id = 'menu-' + label.toLowerCase(); item.textContent = label;
            item.onclick = () => { document.getElementById('menu-result').textContent = label + ' selected'; menu.remove(); };
            menu.appendChild(item);
          });
          button.parentElement.appendChild(menu);
          button.setAttribute('aria-expanded', 'true');
        }, 120);
      });
      document.getElementById('add-to-cart').addEventListener('click', async () => {
        const size = document.getElementById('size').value;
        if (!size) { alertBox('Choose a size first'); return; }
        const qty = Number(document.getElementById('quantity').value) || 1;
        const res = await fetch('/api/cart', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: ${id}, size, qty }) });
        const data = await res.json();
        document.getElementById('cart-count').textContent = data.count;
        alertBox('Added ' + qty + ' to cart');
      });
      function alertBox(text) {
        let toast = document.getElementById('toast');
        if (!toast) { toast = document.createElement('div'); toast.id = 'toast'; toast.setAttribute('role', 'status'); document.body.appendChild(toast); }
        toast.textContent = text;
      }
    </script>`);
}

function cartPage(cart: CartLine[]): string {
  const rows = cart.map((line, i) => {
    const product = PRODUCTS[(line.id - 1) % PRODUCTS.length]!;
    return `<tr><td>${product.name}</td><td>${line.size}</td><td>${line.qty}</td><td><button aria-label="Remove line ${i + 1}">Remove</button></td></tr>`;
  }).join("");
  return layout("Your cart", `<h1>Your cart</h1><table><tbody id="cart-lines">${rows}</tbody></table>
    <a id="checkout" href="/checkout" role="button">Proceed to checkout</a>`, { cartCount: cart.reduce((sum, line) => sum + line.qty, 0) });
}

function shippingPage(): string {
  return layout("Checkout — Shipping", `<h1>Shipping details</h1>
    <form id="shipping-form" method="post" action="/checkout/shipping" novalidate>
      <label>Full name <input id="full-name" name="fullName" autocomplete="name"></label>
      <label>Email <input id="email" name="email" type="email"></label>
      <label>Street address <textarea id="address" name="address" rows="2" placeholder="Street and number"></textarea></label>
      <label>City <input id="city" name="city"></label>
      <label>Country <select id="country" name="country"><option value="">Select country</option>${COUNTRIES.map(country => `<option value="${country}">${country}</option>`).join("")}</select></label>
      <fieldset><legend>Delivery speed</legend>
        <label><input type="radio" name="speed" id="speed-standard" value="standard"> Standard</label>
        <label><input type="radio" name="speed" id="speed-express" value="express"> Express</label>
      </fieldset>
      <label><input type="checkbox" id="terms" name="terms" value="yes"> I accept the terms</label>
      <p id="form-error" role="alert"></p>
      <button id="continue" type="submit">Continue to payment</button>
    </form>
    <script>
      document.getElementById('shipping-form').addEventListener('submit', event => {
        const form = event.target;
        const missing = ['fullName', 'email', 'address', 'city', 'country'].filter(name => !form.elements[name].value.trim());
        if (!form.elements.speed.value) missing.push('speed');
        if (!form.elements.terms.checked) missing.push('terms');
        if (missing.length) { event.preventDefault(); document.getElementById('form-error').textContent = 'Missing: ' + missing.join(', '); }
      });
    </script>`);
}

function paymentPage(): string {
  return layout("Checkout — Payment", `<h1>Payment</h1>
    <form id="payment-form" method="post" action="/checkout/payment">
      <label>Card holder <input id="card-holder" name="holder"></label>
      <label>Card number <input id="card-number" name="number" inputmode="numeric"></label>
      <label>Expiry month <select id="exp-month" name="month">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${String(i + 1).padStart(2, "0")}</option>`).join("")}</select></label>
      <button id="place-order" type="button">Place order</button>
      <dialog id="confirm-dialog" aria-labelledby="confirm-title">
        <h2 id="confirm-title">Confirm your order</h2>
        <p>Your card will be charged now.</p>
        <button id="confirm-order" type="submit">Confirm order</button>
        <button id="cancel-order" type="button" onclick="this.closest('dialog').close()">Cancel</button>
      </dialog>
    </form>
    <script>
      document.getElementById('place-order').addEventListener('click', () => document.getElementById('confirm-dialog').showModal());
    </script>`);
}

function accountPage(): string {
  return layout("Account", `<h1>Your account</h1>
    <div role="tablist" aria-label="Account sections">
      <a role="tab" href="/account/orders" data-route="orders" id="route-orders">Orders</a>
      <a role="tab" href="/account/addresses" data-route="addresses" id="route-addresses">Addresses</a>
      <a role="tab" href="/account/activity" data-route="activity" id="route-activity">Activity</a>
    </div>
    <section id="view" aria-live="polite"></section>
    <ul id="feed" aria-label="Activity feed"></ul>
    <p id="feed-end" style="height:20px">Loading more…</p>
    <script>
      const views = { orders: 'Order history: 3 orders', addresses: 'Saved addresses: 2', activity: 'Recent activity log' };
      function render() {
        const route = location.pathname.split('/')[2] || 'orders';
        document.getElementById('view').textContent = views[route] || 'Unknown section';
        document.querySelectorAll('[data-route]').forEach(tab => tab.setAttribute('aria-selected', String(tab.dataset.route === route)));
        document.title = 'Account — ' + route;
      }
      document.querySelectorAll('[data-route]').forEach(tab => tab.addEventListener('click', event => {
        event.preventDefault(); history.pushState({}, '', tab.getAttribute('href')); render();
      }));
      addEventListener('popstate', render);
      let loaded = 0;
      function more() {
        const feed = document.getElementById('feed');
        for (let i = 0; i < 40; i++) { const li = document.createElement('li'); li.style.height = '30px'; li.textContent = 'Activity entry ' + (++loaded); feed.appendChild(li); }
        feed.dataset.count = String(loaded);
      }
      more();
      new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) setTimeout(more, 80); }).observe(document.getElementById('feed-end'));
      render();
    </script>`, { cookies: false });
}

interface CartLine { id: number; size: string; qty: number }

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);
}

async function readBody(request: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of request) body += String(chunk);
  return body;
}

export async function startFixtureSite(options: FixtureSiteOptions = {}): Promise<FixtureSite> {
  const heavyCards = options.heavyCards ?? 3000;
  const renderDelayMs = options.renderDelayMs ?? 150;
  const cart: CartLine[] = [];
  const orders: string[] = [];
  const html = (response: ServerResponse, body: string, status = 200) => {
    response.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    response.end(body);
  };
  const redirect = (response: ServerResponse, location: string, status = 302) => {
    response.writeHead(status, { location });
    response.end();
  };
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://fixture.local");
    const path = url.pathname;
    try {
      if (path === "/") {
        // `?fresh=1` starts a journey with the consent banner showing again.
        if (url.searchParams.get("fresh") === "1") response.setHeader("set-cookie", "consent=; Max-Age=0; Path=/");
        return html(response, homePage(heavyCards));
      }
      if (path === "/search") return html(response, searchPage(url.searchParams.get("q") ?? "", Number(url.searchParams.get("page") ?? 1) || 1, renderDelayMs));
      if (path.startsWith("/product/")) return html(response, productPage(Number(path.split("/")[2]) || 1));
      if (path === "/size-guide") return html(response, layout("Size guide", `<h1>Size guide</h1><table><tr><th>S</th><td>90cm</td></tr><tr><th>M</th><td>100cm</td></tr></table>`, { cookies: false }));
      if (path === "/api/cart" && request.method === "POST") {
        const line = JSON.parse(await readBody(request)) as CartLine;
        cart.push(line);
        response.writeHead(200, { "content-type": "application/json" });
        return response.end(JSON.stringify({ count: cart.reduce((sum, item) => sum + item.qty, 0) }));
      }
      if (path === "/cart") return html(response, cartPage(cart));
      // Sign-in style redirect chain, then a script redirect right after the
      // document starts (reproduces "Execution context was destroyed").
      if (path === "/checkout") return redirect(response, "/auth/session-check?next=/checkout/start");
      if (path === "/auth/session-check") return redirect(response, url.searchParams.get("next") ?? "/");
      if (path === "/checkout/start") return html(response, `<!doctype html><title>Redirecting…</title><p>Signing you in…</p><script>setTimeout(() => location.replace('/checkout/shipping'), 30)</script>`);
      if (path === "/checkout/shipping" && request.method === "POST") {
        const form = new URLSearchParams(await readBody(request));
        if (!form.get("fullName") || form.get("terms") !== "yes") return html(response, shippingPage(), 422);
        return redirect(response, "/checkout/payment", 303);
      }
      if (path === "/checkout/shipping") return html(response, shippingPage());
      if (path === "/checkout/payment" && request.method === "POST") {
        const form = new URLSearchParams(await readBody(request));
        const order = `FX-${String(orders.length + 1).padStart(5, "0")}`;
        orders.push(`${order}:${form.get("holder")}`);
        return redirect(response, `/order/${order}`, 303);
      }
      if (path === "/checkout/payment") return html(response, paymentPage());
      if (path.startsWith("/order/")) return html(response, layout("Order confirmed", `<h1 id="confirmation">Order ${escapeHtml(path.split("/")[2] ?? "")} confirmed</h1><p>Thank you for your purchase.</p>`, { cookies: false }));
      if (path.startsWith("/account")) return html(response, accountPage());
      html(response, layout("Not found", "<h1>Not found</h1>"), 404);
    } catch (error) {
      response.writeHead(500).end(String(error));
    }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fixture site did not start");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    server,
    close: () => new Promise<void>((resolve, reject) => {
      server.closeAllConnections?.();
      server.close(error => error ? reject(error) : resolve());
    }),
  };
}
