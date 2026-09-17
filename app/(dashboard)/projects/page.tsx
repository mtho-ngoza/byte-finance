'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AmountDisplay } from '@/components/shared/amount-display';
import { useToast } from '@/components/shared/toast';
import { useMemberships } from '@/hooks/use-memberships';
import type { Project, Event, EventMembership } from '@/types';

type TabType = 'projects' | 'events';

export default function ProjectsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { memberships, loading: membershipsLoading } = useMemberships();
  const [activeTab, setActiveTab] = useState<TabType>('projects');
  const [projects, setProjects] = useState<Project[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateProjectForm, setShowCreateProjectForm] = useState(false);
  const [showCreateEventForm, setShowCreateEventForm] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [projectsRes, eventsRes] = await Promise.all([
        fetch('/api/projects'),
        fetch('/api/events'),
      ]);

      if (projectsRes.ok) {
        const data = await projectsRes.json();
        setProjects(data.projects || []);
      }
      if (eventsRes.ok) {
        const data = await eventsRes.json();
        setEvents(data.events || []);
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
      toast('Failed to load data', 'error');
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
      toast('Project created', 'success');
      router.push(`/projects/${newProject.id}`);
    } catch (err) {
      console.error('Failed to create project:', err);
      toast('Failed to create project', 'error');
    }
  };

  const handleCreateEvent = async (eventData: any) => {
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventData),
      });
      if (!res.ok) throw new Error('Failed to create event');
      const newEvent = await res.json();
      toast('Event created', 'success');
      router.push(`/events/${newEvent.id}`);
    } catch (err) {
      console.error('Failed to create event:', err);
      toast('Failed to create event', 'error');
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

  // Filter projects
  const nonArchivedProjects = projects.filter(p => p.status !== 'archived');
  const filteredProjects = nonArchivedProjects.filter(p => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const activeProjects = filteredProjects.filter(p => p.status === 'active');
  const completedProjects = filteredProjects.filter(p => p.status === 'completed');

  // Filter events
  const nonCancelledEvents = events.filter(e => e.status !== 'cancelled');
  const filteredEvents = nonCancelledEvents.filter(e => {
    if (search && !e.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const activeEvents = filteredEvents.filter(e => e.status !== 'completed');
  const completedEvents = filteredEvents.filter(e => e.status === 'completed');

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">
            {activeTab === 'projects' ? 'Family Projects' : 'Events'}
          </h1>
          <p className="text-sm text-text-secondary">
            {activeTab === 'projects'
              ? `${activeProjects.length} active project${activeProjects.length !== 1 ? 's' : ''}`
              : `${activeEvents.length} active event${activeEvents.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={() => activeTab === 'projects' ? setShowCreateProjectForm(true) : setShowCreateEventForm(true)}
          className="px-4 py-2 rounded-lg bg-primary text-background font-medium text-sm hover:bg-primary/90 transition-colors"
        >
          + New {activeTab === 'projects' ? 'Project' : 'Event'}
        </button>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-1 p-1 bg-surface rounded-lg border border-border">
        <button
          onClick={() => setActiveTab('projects')}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'projects'
              ? 'bg-primary text-background'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          Projects
        </button>
        <button
          onClick={() => setActiveTab('events')}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'events'
              ? 'bg-primary text-background'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          Events
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <input
          type="text"
          placeholder={`Search ${activeTab}...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-2 pl-10 rounded-lg border border-border bg-surface text-text-primary text-sm focus:outline-none focus:border-primary"
        />
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>

      {/* Modals */}
      {showCreateProjectForm && (
        <CreateProjectForm
          onSave={handleCreateProject}
          onCancel={() => setShowCreateProjectForm(false)}
        />
      )}
      {showCreateEventForm && (
        <CreateEventForm
          projects={activeProjects}
          onSave={handleCreateEvent}
          onCancel={() => setShowCreateEventForm(false)}
        />
      )}

      {/* Projects Tab Content */}
      {activeTab === 'projects' && (
        <>
          {activeProjects.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-text-secondary">Active</h2>
              {activeProjects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          )}

          {completedProjects.length > 0 && (
            <div className="space-y-3 mt-6">
              <h2 className="text-sm font-medium text-text-secondary">Completed</h2>
              {completedProjects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          )}

          {projects.length === 0 && (
            <div className="text-center py-12">
              <p className="text-text-secondary text-sm mb-4">No projects yet</p>
              <button
                onClick={() => setShowCreateProjectForm(true)}
                className="px-4 py-2 rounded-lg bg-primary text-background font-medium text-sm"
              >
                Create Your First Project
              </button>
            </div>
          )}
        </>
      )}

      {/* Events Tab Content */}
      {activeTab === 'events' && (
        <>
          {activeEvents.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-text-secondary">Active</h2>
              {activeEvents.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          )}

          {completedEvents.length > 0 && (
            <div className="space-y-3 mt-6">
              <h2 className="text-sm font-medium text-text-secondary">Completed</h2>
              {completedEvents.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          )}

          {events.length === 0 && (
            <div className="text-center py-12">
              <p className="text-text-secondary text-sm mb-4">No events yet</p>
              <button
                onClick={() => setShowCreateEventForm(true)}
                className="px-4 py-2 rounded-lg bg-primary text-background font-medium text-sm"
              >
                Plan Your First Event
              </button>
            </div>
          )}

          {/* Shared with me */}
          {memberships.length > 0 && (
            <div className="space-y-3 mt-6">
              <h2 className="text-sm font-medium text-text-secondary flex items-center gap-2">
                <span>Shared with me</span>
                <span className="px-1.5 py-0.5 bg-primary/10 text-primary text-xs rounded-full">
                  {memberships.length}
                </span>
              </h2>
              {memberships.map((membership) => (
                <SharedEventCard key={membership.id} membership={membership} />
              ))}
            </div>
          )}
        </>
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

function EventCard({ event }: { event: Event }) {
  const items = event.items || [];

  // Calculate totals
  let totalQuoted = 0;
  let totalPaid = 0;

  for (const item of items) {
    const subtotal = (item.unitPrice || 0) * (item.quantity || 1);
    totalQuoted += subtotal;
    const itemPaid = (item.payments || []).reduce((sum, p) => sum + (p.amount || 0), 0);
    totalPaid += itemPaid;
  }

  const progressPercent = totalQuoted > 0 ? Math.round((totalPaid / totalQuoted) * 100) : 0;

  const statusColors: Record<string, string> = {
    planning: 'bg-blue-500/10 text-blue-500',
    confirmed: 'bg-primary/10 text-primary',
    in_progress: 'bg-yellow-500/10 text-yellow-500',
    completed: 'bg-success/10 text-success',
    cancelled: 'bg-text-secondary/10 text-text-secondary',
  };

  const eventDate = event.eventDate?.toDate?.() ?? (event.eventDate ? new Date(event.eventDate as unknown as string) : null);

  return (
    <Link
      href={`/events/${event.id}`}
      className="block bg-surface border border-border rounded-xl p-4 hover:border-primary transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">📅</span>
            <h3 className="text-base font-semibold text-text-primary truncate">
              {event.name}
            </h3>
          </div>
          {event.description && (
            <p className="text-sm text-text-secondary line-clamp-1 mb-2">
              {event.description}
            </p>
          )}

          {/* Progress bar */}
          {totalQuoted > 0 && (
            <div className="mb-2">
              <div className="h-1.5 bg-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex items-center gap-4 text-xs text-text-secondary">
            {eventDate && (
              <span>{eventDate.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            )}
            <span>
              <AmountDisplay amount={totalPaid} size="xs" /> / <AmountDisplay amount={totalQuoted} size="xs" />
            </span>
            <span>{progressPercent}%</span>
          </div>
        </div>
        <div className={`px-2 py-1 rounded text-xs font-medium ${statusColors[event.status] || statusColors.planning}`}>
          {event.status.replace('_', ' ')}
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

function CreateEventForm({ projects, onSave, onCancel }: {
  projects: Project[];
  onSave: (data: any) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [linkedProjectId, setLinkedProjectId] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        name,
        description,
        eventDate: eventDate ? new Date(eventDate).toISOString() : null,
        linkedProjectId: linkedProjectId || null,
        status: 'planning',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
      <div className="bg-surface border border-border rounded-t-2xl sm:rounded-xl w-full sm:max-w-md">
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-text-primary">New Event</h3>
            <button
              type="button"
              onClick={onCancel}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-background text-text-secondary"
            >
              ✕
            </button>
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1">Event Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., John's Wedding, Birthday Party"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this event about?"
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary resize-none"
            />
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1">Event Date (optional)</label>
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary"
            />
          </div>

          {projects.length > 0 && (
            <div>
              <label className="block text-xs text-text-secondary mb-1">Link to Project (optional)</label>
              <select
                value={linkedProjectId}
                onChange={(e) => setLinkedProjectId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary"
              >
                <option value="">No linked project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

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
              {saving ? 'Creating...' : 'Create Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SharedEventCard({ membership }: { membership: EventMembership }) {
  const joinedAt = membership.joinedAt?.toDate?.()
    ?? (membership.joinedAt ? new Date((membership.joinedAt as unknown as { _seconds: number })._seconds * 1000) : null);

  return (
    <Link
      href={`/shared/${membership.ownerId}/${membership.eventId}`}
      className="block bg-surface border border-border rounded-xl p-4 hover:border-primary transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">🔗</span>
            <h3 className="text-base font-semibold text-text-primary truncate">
              {membership.eventName}
            </h3>
          </div>
          <div className="flex items-center gap-3 text-xs text-text-secondary">
            {joinedAt && (
              <span>Joined {joinedAt.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}</span>
            )}
          </div>
        </div>
        <div className="px-2 py-1 rounded text-xs font-medium bg-primary/10 text-primary">
          {membership.role}
        </div>
      </div>
    </Link>
  );
}
