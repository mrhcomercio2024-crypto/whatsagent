import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { KeyRound, Loader2, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type Role = "user" | "admin";

export default function AdminUsers() {
  const { user, loading } = useAuth();
  const utils = trpc.useUtils();
  const list = trpc.adminUsers.list.useQuery(undefined, {
    enabled: !!user && user.role === "admin",
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<{
    id: number;
    email: string | null;
  } | null>(null);

  const create = trpc.adminUsers.create.useMutation({
    onSuccess: async () => {
      await utils.adminUsers.list.invalidate();
      setCreateOpen(false);
      toast.success("Usuário criado.");
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.adminUsers.update.useMutation({
    onSuccess: async () => {
      await utils.adminUsers.list.invalidate();
      toast.success("Atualizado.");
    },
    onError: (e) => toast.error(e.message),
  });
  const reset = trpc.adminUsers.resetPassword.useMutation({
    onSuccess: () => {
      setResetTarget(null);
      toast.success("Senha redefinida.");
    },
    onError: (e) => toast.error(e.message),
  });
  const del = trpc.adminUsers.delete.useMutation({
    onSuccess: async () => {
      await utils.adminUsers.list.invalidate();
      toast.success("Usuário excluído.");
    },
    onError: (e) => toast.error(e.message),
  });

  if (loading) {
    return (
      <AppLayout>
        <div className="container py-10">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      </AppLayout>
    );
  }

  if (!user || user.role !== "admin") {
    return (
      <AppLayout>
        <div className="container py-10">
          <Card>
            <CardHeader>
              <CardTitle>Acesso restrito</CardTitle>
              <CardDescription>
                Esta área é exclusiva para administradores.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container py-10 space-y-8 max-w-5xl">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-serif font-bold flex items-center gap-3">
              <ShieldCheck className="w-7 h-7 text-primary" />
              Usuários
            </h1>
            <p className="text-muted-foreground mt-1">
              Gestão de operadores. Cadastro fechado: novos usuários só são
              criados aqui.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)} size="lg">
            <UserPlus className="w-4 h-4 mr-2" /> Novo usuário
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Papel</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Último acesso</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(list.data ?? []).map((u: any) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      {u.name || "—"}
                    </TableCell>
                    <TableCell>{u.email || "—"}</TableCell>
                    <TableCell>
                      <Select
                        value={u.role as Role}
                        onValueChange={(v) =>
                          updateMut.mutate({
                            id: u.id,
                            patch: { role: v as Role },
                          })
                        }
                        disabled={u.id === user.id}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">user</SelectItem>
                          <SelectItem value="admin">admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {u.loginMethod || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {u.lastSignedIn
                        ? new Date(u.lastSignedIn).toLocaleString()
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setResetTarget({ id: u.id, email: u.email })
                        }
                      >
                        <KeyRound className="w-3 h-3 mr-1" /> Senha
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={u.id === user.id}
                        onClick={() => {
                          if (
                            confirm(
                              `Excluir ${u.email}? Esta ação não pode ser desfeita.`,
                            )
                          ) {
                            del.mutate({ id: u.id });
                          }
                        }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {list.data?.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center text-muted-foreground py-8"
                    >
                      Nenhum usuário.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={(v) => create.mutate(v)}
        pending={create.isPending}
      />

      <ResetPasswordDialog
        target={resetTarget}
        onClose={() => setResetTarget(null)}
        onSubmit={(newPassword) =>
          resetTarget &&
          reset.mutate({ id: resetTarget.id, newPassword })
        }
        pending={reset.isPending}
      />
    </AppLayout>
  );
}

function CreateUserDialog({
  open,
  onOpenChange,
  onSubmit,
  pending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (v: {
    email: string;
    name: string;
    password: string;
    role: Role;
  }) => void;
  pending: boolean;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("user");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo usuário</DialogTitle>
          <DialogDescription>
            Cadastre um operador. Ele poderá entrar com o e-mail e senha
            definidos aqui.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>E-mail</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Senha (mín. 8 chars, com letra e número)</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Papel</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">user</SelectItem>
                <SelectItem value="admin">admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => onSubmit({ email, name, password, role })}
            disabled={pending || !email || !name || password.length < 8}
          >
            {pending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({
  target,
  onClose,
  onSubmit,
  pending,
}: {
  target: { id: number; email: string | null } | null;
  onClose: () => void;
  onSubmit: (newPassword: string) => void;
  pending: boolean;
}) {
  const [password, setPassword] = useState("");
  return (
    <Dialog open={!!target} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Redefinir senha</DialogTitle>
          <DialogDescription>
            Definir nova senha para <strong>{target?.email}</strong>. A senha
            anterior deixará de funcionar.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label>Nova senha (mín. 8 chars, com letra e número)</Label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              onSubmit(password);
              setPassword("");
            }}
            disabled={pending || password.length < 8}
          >
            {pending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Redefinir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
