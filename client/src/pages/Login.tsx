import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, Lock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [, setLocation] = useLocation();

  // Se já estiver autenticado, redireciona para /dashboard
  const me = trpc.auth.me.useQuery();
  useEffect(() => {
    if (me.data && (me.data as any).id) setLocation("/dashboard");
  }, [me.data, setLocation]);

  const utils = trpc.useUtils();
  const login = trpc.auth.login.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      toast.success("Bem-vindo!");
      setLocation("/dashboard");
    },
    onError: (err) => {
      toast.error(err.message || "Falha no login.");
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    login.mutate({ email: email.trim().toLowerCase(), password });
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 text-primary mb-4">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h1 className="text-3xl font-serif font-bold tracking-tight">
            WhatsAgent
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Acesso restrito. Entre com suas credenciais.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="bg-card border border-border rounded-2xl p-8 shadow-2xl space-y-5"
        >
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              required
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={login.isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={login.isPending}
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={login.isPending || !email || !password}
          >
            {login.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Entrando...
              </>
            ) : (
              <>
                <Lock className="w-4 h-4 mr-2" />
                Entrar
              </>
            )}
          </Button>

          <p className="text-xs text-muted-foreground text-center pt-2">
            Cadastro fechado. Solicite acesso ao administrador.
          </p>
        </form>
      </div>
    </div>
  );
}
