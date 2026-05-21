"use client";
import { useEffect, useState } from "react";
import { Badge } from "../../components/Badge";
import { api } from "../../lib/api";

interface Role {
  _id: string;
  name: string;
  displayName: string;
  description?: string;
  isSystem: boolean;
  permissions: Array<{ resource: string; actions: string[] }>;
}

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", displayName: "", description: "" });

  const fetchRoles = () => {
    setLoading(true);
    api.get<any>("/admin/roles").then((d) => setRoles(d.roles || d)).catch(() => setRoles([])).finally(() => setLoading(false));
  };

  useEffect(() => { fetchRoles(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post("/admin/roles", form).catch(() => {});
    setShowCreate(false);
    setForm({ name: "", displayName: "", description: "" });
    fetchRoles();
  };

  const handleDelete = async (id: string, isSystem: boolean) => {
    if (isSystem) return alert("System roles cannot be deleted.");
    if (!confirm("Delete this role?")) return;
    await api.delete(`/admin/roles/${id}`).catch(() => {});
    fetchRoles();
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Roles</h1>
          <p className="text-gray-400 mt-1">Manage RBAC roles and permissions</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          + New Role
        </button>
      </div>

      {loading ? (
        <p className="text-gray-400">Loading...</p>
      ) : (
        <div className="space-y-4">
          {roles.map((role) => (
            <div key={role._id} className="bg-gray-900 rounded-xl border border-gray-800 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-white">{role.displayName}</h3>
                    <span className="text-xs font-mono text-gray-500">{role.name}</span>
                    {role.isSystem && <Badge label="System" variant="default" />}
                  </div>
                  {role.description && <p className="text-sm text-gray-400 mt-1">{role.description}</p>}
                </div>
                {!role.isSystem && (
                  <button
                    onClick={() => handleDelete(role._id, role.isSystem)}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Delete
                  </button>
                )}
              </div>

              {role.permissions.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {role.permissions.map((p, i) => (
                    <span key={i} className="bg-gray-800 text-gray-300 px-2 py-1 rounded text-xs font-mono">
                      {p.resource}:{p.actions.join(",")}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl border border-gray-700 p-6 w-full max-w-md">
            <h3 className="font-semibold text-white mb-4">Create Role</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Name (slug)</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  placeholder="e.g. analytics-viewer"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Display Name</label>
                <input required value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  placeholder="Analytics Viewer"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Description</label>
                <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
