'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AmountDisplay } from '@/components/shared/amount-display';
import type { Project } from '@/types';

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      setProjects(data.projects || []);
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async (projectData: any) => {
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(projectData),
      });
      if (!res.ok) throw new Error('Failed to create project');
      const newProject = await res.json();
      router.push(`/projects/${newProject.id}`);
    } catch (error) {
      console.error('Failed to create project:', error);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-32 bg-surface rounded" />
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-24 bg-surface rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const activeProjects = projects.filter(p => p.status === 'active');
  const completedProjects = projects.filter(p => p.status === 'completed');

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Family Projects</h1>
          <p className="text-sm text-text-secondary">
            {activeProjects.length} active project{activeProjects.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="px-4 py-2 rounded-lg bg-primary text-background font-medium text-sm hover:bg-primary/90 transition-colors"
        >
          + New Project
        </button>
      </div>

      {/* Create form modal */}
      {showCreateForm && (
        <CreateProjectForm
          onSave={handleCreateProject}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {/* Active projects */}
      {activeProjects.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-text-secondary">Active</h2>
          {activeProjects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}

      {/* Completed projects */}
      {completedProjects.length > 0 && (
        <div className="space-y-3 mt-6">
          <h2 className="text-sm font-medium text-text-secondary">Completed</h2>
          {completedProjects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {projects.length === 0 && (
        <div className="text-center py-12">
          <p className="text-text-secondary text-sm mb-4">No projects yet</p>
          <button
            onClick={() => setShowCreateForm(true)}
            className="px-4 py-2 rounded-lg bg-primary text-background font-medium text-sm"
          >
            Create Your First Project
          </button>
        </div>
      )}
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const typeIcon = {
    construction: '🏗️',
    family: '👨‍👩‍👧‍👦',
    event: '🎉',
    other: '📁',
  };

  // Calculate balance from transactions for accuracy
  const calculatedBalance = (project.transactions || []).reduce((sum, txn) => {
    return sum + (txn.type === 'contribution' ? txn.amount : -txn.amount);
  }, 0);

  return (
    <Link
      href={`/projects/${project.id}`}
      className="block bg-surface border border-border rounded-xl p-4 hover:border-primary transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">{typeIcon[project.type]}</span>
            <h3 className="text-base font-semibold text-text-primary truncate">
              {project.name}
            </h3>
          </div>
          {project.description && (
            <p className="text-sm text-text-secondary line-clamp-2 mb-2">
              {project.description}
            </p>
          )}
          <div className="flex items-center gap-4 text-xs text-text-secondary">
            <span>Pool: <AmountDisplay amount={calculatedBalance} size="xs" /></span>
            {project.targetAmount && (
              <span>Target: <AmountDisplay amount={project.targetAmount} size="xs" /></span>
            )}
          </div>
        </div>
        <div className={`px-2 py-1 rounded text-xs font-medium ${
          project.status === 'active' ? 'bg-primary/10 text-primary' :
          project.status === 'completed' ? 'bg-success/10 text-success' :
          'bg-text-secondary/10 text-text-secondary'
        }`}>
          {project.status}
        </div>
      </div>
    </Link>
  );
}

function CreateProjectForm({ onSave, onCancel }: {
  onSave: (data: any) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'construction' | 'family' | 'event' | 'other'>('construction');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({ name, description, type, status: 'active', priority: 'medium' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
      <div className="bg-surface border border-border rounded-t-2xl sm:rounded-xl w-full sm:max-w-md">
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-text-primary">New Project</h3>
            <button
              type="button"
              onClick={onCancel}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-background text-text-secondary"
            >
              ✕
            </button>
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1">Project Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., House - Roofing, Family Event"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this project for?"
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary resize-none"
            />
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary"
            >
              <option value="construction">🏗️ Construction</option>
              <option value="family">👨‍👩‍👧‍👦 Family</option>
              <option value="event">🎉 Event</option>
              <option value="other">📁 Other</option>
            </select>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-2.5 rounded-lg border border-border text-text-secondary text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 rounded-lg bg-primary text-background font-medium text-sm disabled:opacity-50"
            >
              {saving ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
