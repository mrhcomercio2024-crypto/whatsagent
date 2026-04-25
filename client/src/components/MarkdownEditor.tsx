import { useRef, useState, useId } from "react";
import { Streamdown } from "streamdown";
import { Button } from "@/components/ui/button";
import {
  Bold,
  Italic,
  Heading2,
  List,
  ListOrdered,
  Quote,
  Link as LinkIcon,
  Code,
  Eye,
  Edit3,
  SplitSquareHorizontal,
} from "lucide-react";
import {
  insertLink,
  prefixLines,
  wrapSelection,
  type Selection,
} from "@/lib/markdownInsert";

type ViewMode = "edit" | "preview" | "split";

export type MarkdownEditorProps = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  rows?: number;
  label?: string;
  description?: string;
  /**
   * Quando true, esconde o botão de modo split (útil para campos curtos).
   */
  compact?: boolean;
};

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  rows = 8,
  label,
  description,
  compact = false,
}: MarkdownEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<ViewMode>("edit");
  const id = useId();

  function getSelection(): Selection {
    const el = ref.current;
    if (!el) return { start: value.length, end: value.length };
    return { start: el.selectionStart, end: el.selectionEnd };
  }

  function applyResult(result: { value: string; selection: Selection }) {
    onChange(result.value);
    // Restaura seleção no próximo tick para refletir o novo value já renderizado.
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(result.selection.start, result.selection.end);
    });
  }

  const actions: Array<{
    key: string;
    icon: React.ReactNode;
    title: string;
    run: () => void;
  }> = [
    {
      key: "bold",
      icon: <Bold className="size-3.5" />,
      title: "Negrito (Ctrl+B)",
      run: () => applyResult(wrapSelection(value, getSelection(), "**", "**")),
    },
    {
      key: "italic",
      icon: <Italic className="size-3.5" />,
      title: "Itálico (Ctrl+I)",
      run: () => applyResult(wrapSelection(value, getSelection(), "*", "*")),
    },
    {
      key: "h2",
      icon: <Heading2 className="size-3.5" />,
      title: "Título",
      run: () => applyResult(prefixLines(value, getSelection(), "## ")),
    },
    {
      key: "ul",
      icon: <List className="size-3.5" />,
      title: "Lista",
      run: () => applyResult(prefixLines(value, getSelection(), "- ")),
    },
    {
      key: "ol",
      icon: <ListOrdered className="size-3.5" />,
      title: "Lista numerada",
      run: () => applyResult(prefixLines(value, getSelection(), "1. ")),
    },
    {
      key: "quote",
      icon: <Quote className="size-3.5" />,
      title: "Citação",
      run: () => applyResult(prefixLines(value, getSelection(), "> ")),
    },
    {
      key: "code",
      icon: <Code className="size-3.5" />,
      title: "Código inline",
      run: () => applyResult(wrapSelection(value, getSelection(), "`", "`", "código")),
    },
    {
      key: "link",
      icon: <LinkIcon className="size-3.5" />,
      title: "Link",
      run: () => applyResult(insertLink(value, getSelection())),
    },
  ];

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
      if (e.key === "b" || e.key === "B") {
        e.preventDefault();
        applyResult(wrapSelection(value, getSelection(), "**", "**"));
      } else if (e.key === "i" || e.key === "I") {
        e.preventDefault();
        applyResult(wrapSelection(value, getSelection(), "*", "*"));
      }
    }
  }

  return (
    <div className="space-y-2">
      {label && (
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={id} className="text-sm font-medium">
            {label}
          </label>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant={mode === "edit" ? "default" : "ghost"}
              className="h-7 px-2"
              onClick={() => setMode("edit")}
              title="Editar"
            >
              <Edit3 className="size-3.5" />
            </Button>
            {!compact && (
              <Button
                type="button"
                size="sm"
                variant={mode === "split" ? "default" : "ghost"}
                className="h-7 px-2"
                onClick={() => setMode("split")}
                title="Editor + Preview"
              >
                <SplitSquareHorizontal className="size-3.5" />
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant={mode === "preview" ? "default" : "ghost"}
              className="h-7 px-2"
              onClick={() => setMode("preview")}
              title="Preview"
            >
              <Eye className="size-3.5" />
            </Button>
          </div>
        </div>
      )}
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      {(mode === "edit" || mode === "split") && (
        <div className="rounded-md border bg-background">
          <div className="flex flex-wrap items-center gap-0.5 border-b px-1.5 py-1">
            {actions.map(a => (
              <Button
                key={a.key}
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={a.run}
                title={a.title}
              >
                {a.icon}
              </Button>
            ))}
            <span className="ml-auto pr-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              Markdown
            </span>
          </div>
          <div className={mode === "split" ? "grid grid-cols-2 gap-0" : ""}>
            <textarea
              id={id}
              ref={ref}
              value={value}
              onChange={e => onChange(e.target.value)}
              onKeyDown={onKeyDown}
              rows={rows}
              placeholder={placeholder}
              className="w-full resize-y bg-transparent p-3 font-mono text-sm leading-relaxed outline-none placeholder:text-muted-foreground/60"
            />
            {mode === "split" && (
              <div className="prose prose-sm dark:prose-invert max-w-none border-l p-3">
                {value.trim() ? (
                  <Streamdown>{value}</Streamdown>
                ) : (
                  <p className="text-muted-foreground/60">
                    Nada para visualizar ainda…
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {mode === "preview" && (
        <div className="rounded-md border bg-muted/20 p-3 prose prose-sm dark:prose-invert max-w-none">
          {value.trim() ? (
            <Streamdown>{value}</Streamdown>
          ) : (
            <p className="text-muted-foreground/60">
              Nada para visualizar ainda…
            </p>
          )}
        </div>
      )}
    </div>
  );
}
