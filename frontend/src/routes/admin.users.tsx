import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { inviteAdmin, listAdminUsers } from "@/lib/api";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminShell } from "@/components/AdminShell";
import { PasswordInput } from "@/components/AuthLayout";

export const Route = createFileRoute("/admin/users")({
  head: () => ({
    meta: [{ title: "Users — Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: () => (
    <ProtectedRoute role="admin">
      <AdminShell>
        <UsersAdmin />
      </AdminShell>
    </ProtectedRoute>
  ),
});

function UsersAdmin() {
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ["admin", "users"], queryFn: listAdminUsers });
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const invite = useMutation({
    mutationFn: inviteAdmin,
    onSuccess: (u) => {
      setOk(`Invited ${u.email} as admin. Share the password securely.`);
      setError(null);
      setForm({ name: "", email: "", password: "" });
      void qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (err: Error) => {
      setOk(null);
      setError(err.message);
    },
  });

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-xl font-semibold text-primary">Users</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          View every account and invite additional admins.
        </p>
      </header>

      <section className="rounded-md border border-hairline bg-background">
        <div className="border-b border-hairline px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground">
          Invite admin
        </div>
        <form
          className="grid gap-3 p-4 sm:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            invite.mutate(form);
          }}
        >
          <input
            required
            placeholder="Full name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="rounded border border-input bg-background px-3 py-2 text-sm"
          />
          <input
            required
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="rounded border border-input bg-background px-3 py-2 text-sm"
          />
          <PasswordInput
            required
            minLength={6}
            placeholder="Temporary password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full rounded border border-input bg-background px-3 py-2 text-sm pr-11"
            autoComplete="new-password"
          />
          <button
            type="submit"
            disabled={invite.isPending}
            className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-60"
          >
            {invite.isPending ? "Inviting…" : "Invite admin"}
          </button>
        </form>
        {error && <p className="px-4 pb-3 text-sm text-destructive">{error}</p>}
        {ok && <p className="px-4 pb-3 text-sm text-[var(--sage)]">{ok}</p>}
      </section>

      <section className="rounded-md border border-hairline bg-background">
        <div className="flex items-center justify-between border-b border-hairline px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground">
          <span>All users</span>
          <span>{users.data?.length ?? 0}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground">
              <tr className="border-b border-hairline">
                <th className="px-4 py-2 font-normal">Name</th>
                <th className="px-4 py-2 font-normal">Email</th>
                <th className="px-4 py-2 font-normal">Role</th>
                <th className="px-4 py-2 font-normal">Field</th>
              </tr>
            </thead>
            <tbody>
              {(users.data ?? []).map((u) => (
                <tr key={u.id} className="border-b border-hairline">
                  <td className="px-4 py-2 text-primary">{u.name}</td>
                  <td className="px-4 py-2">{u.email}</td>
                  <td className="px-4 py-2 capitalize">{u.role}</td>
                  <td className="px-4 py-2 text-muted-foreground">{u.fieldOfStudy || "—"}</td>
                </tr>
              ))}
              {users.data?.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                    No users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
