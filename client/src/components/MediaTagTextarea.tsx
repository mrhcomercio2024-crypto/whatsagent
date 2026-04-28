import { useEffect, useMemo, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Image as ImageIcon,
  Video,
  FileAudio,
  FileText,
  X,
  Plus,
  Paperclip,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type MediaItem = {
  id: number;
  name: string;
  mediaType?: string | null;
  description?: string | null;
};

type Props = {
  value: string;
  onChange: (next: string) => void;
  mediaList: MediaItem[];
  rows?: number;
  placeholder?: string;
  onUploadNew?: () => void;
  /** Texto da dica acima do textarea, ex: usar @midia[] */
  hintLine?: React.ReactNode;
};

const MEDIA_TAG_RE = /@midia\[([^\]]+)\]/gi;

function iconFor(t?: string | null) {
  switch ((t ?? "").toLowerCase()) {
    case "image":
      return <ImageIcon className="h-3.5 w-3.5" />;
    case "video":
      return <Video className="h-3.5 w-3.5" />;
    case "audio":
      return <FileAudio className="h-3.5 w-3.5" />;
    default:
      return <FileText className="h-3.5 w-3.5" />;
  }
}

export function extractMediaTagsClient(text: string): {
  cleanText: string;
  uniqueNames: string[];
} {
  if (!text) return { cleanText: "", uniqueNames: [] };
  const found: string[] = [];
  text.replace(MEDIA_TAG_RE, (_m, n) => {
    const v = (n as string).trim();
    if (v) found.push(v);
    return "";
  });
  const cleanText = text
    .replace(MEDIA_TAG_RE, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .trim();
  const seen = new Set<string>();
  const uniqueNames: string[] = [];
  for (const f of found) {
    const k = f.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      uniqueNames.push(f);
    }
  }
  return { cleanText, uniqueNames };
}

export function MediaTagTextarea({
  value,
  onChange,
  mediaList,
  rows = 6,
  placeholder,
  onUploadNew,
  hintLine,
}: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [anchorPos, setAnchorPos] = useState<number | null>(null);

  const parsed = useMemo(() => extractMediaTagsClient(value), [value]);

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return mediaList.slice(0, 8);
    return mediaList
      .filter(m => (m.name || "").toLowerCase().includes(f))
      .slice(0, 8);
  }, [mediaList, filter]);

  // Detecta digitação de "@" para abrir o popover
  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    onChange(next);
    const cursor = e.target.selectionStart ?? next.length;
    // Procura o último "@" antes do cursor que não esteja dentro de @midia[
    const before = next.slice(0, cursor);
    const lastAt = before.lastIndexOf("@");
    if (lastAt >= 0) {
      const between = before.slice(lastAt);
      // Se já tem "[" significa que está fechando uma tag, não autocompletar
      if (!between.includes("[") && !between.includes(" ") && between.length <= 30) {
        const term = between.replace(/^@/, "");
        // Reconhece "midia" sendo digitado também
        if ("midia".startsWith(term.toLowerCase()) || term.length === 0) {
          setAnchorPos(lastAt);
          setFilter("");
          setPopoverOpen(true);
          return;
        }
      }
    }
    setPopoverOpen(false);
    setAnchorPos(null);
  }

  function insertTag(name: string) {
    const ta = taRef.current;
    if (!ta) return;
    const cursor = ta.selectionStart ?? value.length;
    const start = anchorPos ?? cursor;
    const before = value.slice(0, start);
    const after = value.slice(cursor);
    // Se o usuário não digitou nem "@" ainda, não vamos quebrar
    const insert = `@midia[${name}] `;
    const next = before + insert + after;
    onChange(next);
    setPopoverOpen(false);
    setAnchorPos(null);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = before.length + insert.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  function removeTag(name: string) {
    const re = new RegExp(`@midia\\[${name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\]\\s?`, "gi");
    onChange(value.replace(re, ""));
  }

  function appendTag(name: string) {
    const sep = value.endsWith(" ") || value.length === 0 ? "" : " ";
    onChange(`${value}${sep}@midia[${name}]`);
  }

  // Fecha popover com Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPopoverOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Resolve nomes de tag para itens conhecidos (para chip preview)
  const resolved = useMemo(() => {
    const byName = new Map<string, MediaItem>();
    for (const m of mediaList) byName.set((m.name || "").toLowerCase(), m);
    return parsed.uniqueNames.map(n => ({
      name: n,
      item: byName.get(n.toLowerCase()) ?? null,
    }));
  }, [parsed.uniqueNames, mediaList]);

  return (
    <div className="space-y-2">
      {hintLine && (
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          {hintLine}
        </div>
      )}
      <div className="relative">
        <Textarea
          ref={taRef}
          rows={rows}
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
        />
        {popoverOpen && (
          <div className="absolute z-30 mt-1 left-0 right-0 max-w-xs bg-popover text-popover-foreground border border-border rounded-lg shadow-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-border/60 text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <Paperclip className="h-3 w-3" /> Mídias do agente
            </div>
            <div className="max-h-56 overflow-auto">
              {filtered.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  Nenhuma mídia. {onUploadNew && "Faça upload na aba Mídias."}
                </div>
              ) : (
                filtered.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => insertTag(m.name)}
                    className="w-full text-left px-3 py-2 hover:bg-accent/40 flex items-center gap-2 text-sm"
                  >
                    {iconFor(m.mediaType)}
                    <span className="truncate">{m.name}</span>
                  </button>
                ))
              )}
              {onUploadNew && (
                <button
                  type="button"
                  onClick={() => {
                    setPopoverOpen(false);
                    onUploadNew();
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-accent/40 flex items-center gap-2 text-sm border-t border-border/60 text-accent"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Enviar nova mídia…
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Prévia */}
      <div className="rounded-lg bg-muted/40 border border-border/60 p-3 text-sm space-y-2">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Prévia:
        </div>
        <div className="whitespace-pre-wrap leading-relaxed">
          {parsed.cleanText || (
            <span className="text-muted-foreground italic">Sua mensagem aparecerá aqui…</span>
          )}{" "}
          {resolved.map(({ name, item }) => (
            <span
              key={name}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs ml-1",
                item
                  ? "bg-accent/20 text-accent-foreground border border-accent/40"
                  : "bg-destructive/15 text-destructive border border-destructive/40"
              )}
              title={item ? item.description ?? "" : "Mídia não encontrada com esse nome"}
            >
              {iconFor(item?.mediaType)}
              {item?.name ?? name}
              <button
                type="button"
                onClick={() => removeTag(name)}
                className="hover:opacity-70"
                aria-label={`Remover ${name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        {/* atalhos para anexar */}
        {mediaList.length > 0 && (
          <div className="pt-1 flex flex-wrap gap-1.5 border-t border-border/60">
            <span className="text-[11px] text-muted-foreground self-center mr-1">
              Anexar rápido:
            </span>
            {mediaList.slice(0, 6).map(m => {
              const already = parsed.uniqueNames.some(
                n => n.toLowerCase() === m.name.toLowerCase()
              );
              return (
                <Button
                  key={m.id}
                  type="button"
                  size="sm"
                  variant="outline"
                  className={cn("h-7 text-[11px] gap-1", already && "opacity-50")}
                  onClick={() => !already && appendTag(m.name)}
                  disabled={already}
                >
                  {iconFor(m.mediaType)}
                  <span className="max-w-[120px] truncate">{m.name}</span>
                </Button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
