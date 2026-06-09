"use client";

import { useEffect, useState, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import { renderToStaticMarkup } from "react-dom/server";
import { createClient } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Device {
  id: string;
  name: string;
  serial: string | null;
  qr_code: string;
}

// ---------------------------------------------------------------------------
// Print helper — opens a new window with clean HTML
// ---------------------------------------------------------------------------

function openPrintWindow(devicesToPrint: Device[]) {
  // Render each QR code SVG to a static string
  const cardsHtml = devicesToPrint
    .map((device) => {
      const qrSvg = renderToStaticMarkup(
        <QRCodeSVG value={device.qr_code} size={100} level="M" includeMargin={false} />
      );
      return `
        <div class="card">
          <div class="qr">${qrSvg}</div>
          <p class="name">${device.name}</p>
          ${device.serial ? `<p class="serial">${device.serial}</p>` : ""}
        </div>
      `;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>QR Codes — Controle de iPads</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: white;
      color: black;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      padding: 10mm;
      gap: 0;
    }

    .card {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 6mm 4mm;
      border: 0.5px solid #ccc;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .qr {
      display: block;
      line-height: 0;
    }

    .qr svg { display: block; }

    .name {
      margin-top: 3mm;
      font-size: 9pt;
      font-weight: 600;
      text-align: center;
      word-break: break-word;
      max-width: 120px;
      line-height: 1.3;
    }

    .serial {
      margin-top: 1mm;
      font-size: 7pt;
      color: #555;
      text-align: center;
      font-family: monospace;
    }

    @media print {
      html, body { width: 210mm; }
      .grid { padding: 10mm; }
    }
  </style>
</head>
<body>
  <div class="grid">${cardsHtml}</div>
  <script>
    window.onload = function() {
      window.focus();
      window.print();
    };
  </script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) {
    alert("Permita pop-ups para esta página para usar a impressão.");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function QrCodesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [networkError, setNetworkError] = useState(false);
  const [serverError, setServerError] = useState(false);

  // ---- fetch ----------------------------------------------------------------

  const loadDevices = useCallback(async () => {
    setLoading(true);
    setNetworkError(false);
    setServerError(false);

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("devices")
        .select("id, name, serial, qr_code")
        .order("name");

      if (error) {
        setServerError(true);
        return;
      }

      setDevices((data as Device[]) ?? []);
    } catch {
      setNetworkError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  // ---- selection ------------------------------------------------------------

  const toggleDevice = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) =>
      prev.size === devices.length
        ? new Set()
        : new Set(devices.map((d) => d.id))
    );
  };

  const allSelected = devices.length > 0 && selected.size === devices.length;
  const someSelected = selected.size > 0 && selected.size < devices.length;

  // ---- print ----------------------------------------------------------------

  const handlePrintAll = () => openPrintWindow(devices);

  const handlePrintSelected = () => {
    if (selected.size === 0) return;
    openPrintWindow(devices.filter((d) => selected.has(d.id)));
  };

  // ---- error / loading states -----------------------------------------------

  if (loading) {
    return (
      <main className="px-4 md:px-6 pb-24 md:pb-6">
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-[var(--color-outline-variant)] bg-[var(--color-surface-container)] h-44 animate-pulse"
            />
          ))}
        </div>
      </main>
    );
  }

  if (networkError || serverError) {
    return (
      <main className="px-4 md:px-6 pb-24 md:pb-6">
        <div className="mt-8 rounded-2xl border border-[var(--color-error-container)] bg-[var(--color-error-container)] text-[var(--color-on-error-container)] px-5 py-4 flex items-start gap-3">
          <span className="mt-0.5 shrink-0 text-lg">⚠</span>
          <div className="flex-1 min-w-0">
            <p className="font-medium">
              {networkError
                ? "Sem conexão com a internet"
                : "Erro ao carregar dispositivos"}
            </p>
            <p className="text-sm mt-0.5 opacity-80">
              {networkError
                ? "Verifique sua rede e tente novamente."
                : "Houve um problema no servidor. Tente novamente."}
            </p>
          </div>
          <button
            onClick={loadDevices}
            className="shrink-0 text-sm font-medium underline underline-offset-2 hover:no-underline"
          >
            Tentar novamente
          </button>
        </div>
      </main>
    );
  }

  if (devices.length === 0) {
    return (
      <main className="px-4 md:px-6 pb-24 md:pb-6">
        <div className="mt-16 flex flex-col items-center gap-2 text-[var(--color-on-surface-variant)]">
          <span className="text-4xl">📱</span>
          <p className="text-base font-medium">Nenhum dispositivo cadastrado</p>
          <p className="text-sm">
            Cadastre iPads em Dispositivos para gerar QR codes.
          </p>
        </div>
      </main>
    );
  }

  // ---- main render ----------------------------------------------------------

  return (
    <main className="px-4 md:px-6 pb-24 md:pb-6">
      {/* Header row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mt-2 mb-5">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-on-surface)]">
            QR Codes
          </h1>
          <p className="text-sm text-[var(--color-on-surface-variant)] mt-0.5">
            {devices.length} dispositivo{devices.length !== 1 ? "s" : ""}
            {selected.size > 0 && (
              <span className="ml-1 font-medium text-[var(--color-primary)]">
                · {selected.size} selecionado{selected.size !== 1 ? "s" : ""}
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handlePrintSelected}
            disabled={selected.size === 0}
            className="
              inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium
              border border-[var(--color-outline-variant)]
              bg-[var(--color-surface-container)]
              text-[var(--color-on-surface)]
              hover:bg-[var(--color-surface-container-high)]
              disabled:opacity-40 disabled:cursor-not-allowed
              transition-colors
            "
          >
            Imprimir selecionados
          </button>
          <button
            onClick={handlePrintAll}
            className="
              inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium
              bg-[var(--color-primary)] text-[var(--color-on-primary)]
              hover:opacity-90
              transition-opacity
            "
          >
            Imprimir todos
          </button>
        </div>
      </div>

      {/* Select all bar */}
      <div className="flex items-center gap-3 mb-4 px-1">
        <button
          onClick={toggleAll}
          className="
            w-5 h-5 shrink-0 rounded border-2 flex items-center justify-center
            transition-colors cursor-pointer
          "
          style={{
            backgroundColor: allSelected
              ? "var(--color-primary)"
              : someSelected
              ? "var(--color-primary-container)"
              : "var(--color-surface)",
            borderColor:
              allSelected || someSelected
                ? "var(--color-primary)"
                : "var(--color-outline)",
          }}
          aria-label={allSelected ? "Desselecionar todos" : "Selecionar todos"}
        >
          {allSelected && (
            <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none">
              <path
                d="M2 6l3 3 5-5"
                stroke="var(--color-on-primary)"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
          {someSelected && !allSelected && (
            <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none">
              <path
                d="M3 6h6"
                stroke="var(--color-primary)"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          )}
        </button>
        <span className="text-sm text-[var(--color-on-surface-variant)]">
          {allSelected ? "Desselecionar todos" : "Selecionar todos"}
        </span>
      </div>

      {/* Device grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {devices.map((device) => {
          const isSelected = selected.has(device.id);
          return (
            <button
              key={device.id}
              onClick={() => toggleDevice(device.id)}
              className="
                relative flex flex-col items-center gap-2 rounded-2xl p-4 text-left
                border-2 transition-all cursor-pointer
                hover:bg-[var(--color-surface-container-high)]
              "
              style={{
                borderColor: isSelected
                  ? "var(--color-primary)"
                  : "var(--color-outline-variant)",
                backgroundColor: isSelected
                  ? "var(--color-primary-container)"
                  : "var(--color-surface-container)",
              }}
              aria-pressed={isSelected}
              aria-label={`${isSelected ? "Desselecionar" : "Selecionar"} ${device.name}`}
            >
              {/* Checkbox indicator */}
              <span
                className="absolute top-2.5 right-2.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors"
                style={{
                  borderColor: isSelected
                    ? "var(--color-primary)"
                    : "var(--color-outline)",
                  backgroundColor: isSelected
                    ? "var(--color-primary)"
                    : "var(--color-surface)",
                }}
              >
                {isSelected && (
                  <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none">
                    <path
                      d="M2 6l3 3 5-5"
                      stroke="var(--color-on-primary)"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </span>

              {/* QR code */}
              <div className="rounded-xl p-2 bg-white" style={{ lineHeight: 0 }}>
                <QRCodeSVG
                  value={device.qr_code}
                  size={80}
                  level="M"
                  includeMargin={false}
                />
              </div>

              {/* Name */}
              <p className="text-sm font-semibold text-center leading-tight text-[var(--color-on-surface)] w-full truncate px-1">
                {device.name}
              </p>

              {/* Serial */}
              {device.serial ? (
                <p className="text-xs text-[var(--color-on-surface-variant)] font-mono text-center w-full truncate">
                  {device.serial}
                </p>
              ) : (
                <p className="text-xs text-[var(--color-on-surface-variant)] opacity-40 text-center">
                  sem serial
                </p>
              )}
            </button>
          );
        })}
      </div>
    </main>
  );
}
