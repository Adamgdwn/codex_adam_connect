function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderLoadingHtml(title: string, message: string, detail?: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        --navy: #dce9ff;
        --navy-soft: #8ba1c0;
        --surface: rgba(10, 18, 34, 0.94);
        --surface-2: rgba(16, 28, 49, 0.94);
        --teal: #53b9da;
        --accent: #3c7ac7;
        --muted: #98aac4;
        --line: rgba(95, 160, 219, 0.26);
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: Calibri, "Segoe UI", sans-serif;
        color: var(--navy);
        background:
          radial-gradient(circle at 18% 16%, rgba(83, 185, 218, 0.16), transparent 24%),
          radial-gradient(circle at 84% 18%, rgba(60, 122, 199, 0.14), transparent 26%),
          linear-gradient(180deg, #08101d 0%, #0d1728 52%, #111e31 100%);
      }

      .card {
        width: min(90vw, 620px);
        padding: 26px 24px;
        border-radius: 10px;
        border: 1px solid var(--line);
        background:
          linear-gradient(180deg, rgba(15, 25, 44, 0.96), rgba(10, 18, 34, 0.98));
        box-shadow:
          0 22px 48px rgba(0, 0, 0, 0.34),
          inset 0 0 0 1px rgba(205, 231, 255, 0.04);
        backdrop-filter: blur(18px);
        position: relative;
        overflow: hidden;
      }

      .card::before {
        content: "";
        position: absolute;
        inset: 0;
        background:
          linear-gradient(90deg, transparent 0, transparent calc(100% - 1px), rgba(95, 160, 219, 0.1) calc(100% - 1px)),
          linear-gradient(180deg, transparent 0, transparent calc(100% - 1px), rgba(95, 160, 219, 0.08) calc(100% - 1px));
        background-size: 28px 28px;
        pointer-events: none;
      }

      .eyebrow {
        display: inline-flex;
        align-items: center;
        min-height: 30px;
        padding: 0 12px;
        border-radius: 6px;
        background: rgba(83, 185, 218, 0.12);
        color: var(--teal);
        font-size: 0.76rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        position: relative;
        z-index: 1;
      }

      h1 {
        margin: 14px 0 10px;
        font-size: clamp(1.65rem, 2.8vw, 2.7rem);
        line-height: 1.02;
        position: relative;
        z-index: 1;
      }

      p {
        margin: 0;
        color: var(--muted);
        line-height: 1.55;
        font-size: 0.96rem;
        position: relative;
        z-index: 1;
      }

      .detail {
        margin-top: 16px;
        padding: 12px 14px;
        border-radius: 8px;
        border: 1px solid rgba(95, 160, 219, 0.16);
        background: rgba(14, 28, 48, 0.84);
        color: var(--navy-soft);
        font-family: "JetBrains Mono", monospace;
        font-size: 0.85rem;
        line-height: 1.45;
        max-height: 180px;
        overflow: auto;
        word-break: break-word;
        position: relative;
        z-index: 1;
      }

      .spinner {
        display: inline-flex;
        width: 38px;
        height: 38px;
        margin-top: 20px;
        border-radius: 8px;
        border: 3px solid rgba(95, 160, 219, 0.14);
        border-top-color: var(--teal);
        border-right-color: var(--accent);
        animation: spin 900ms linear infinite;
        position: relative;
        z-index: 1;
      }

      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    </style>
  </head>
  <body>
    <main class="card">
      <span class="eyebrow">Freedom Desktop</span>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
      ${detail ? `<div class="detail">${escapeHtml(detail)}</div>` : ""}
      <span class="spinner" aria-hidden="true"></span>
    </main>
  </body>
</html>`;
}
