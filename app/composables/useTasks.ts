import { get, set, del, keys, entries } from 'idb-keyval'
import { v4 as uuidv4 } from 'uuid'
import type { Task, Project, TaskPriority, TaskStatus } from '~/types/task'

const tasks = ref<Task[]>([])
const projects = ref<Project[]>([])
const isLoading = ref(false)

const TASK_PREFIX = 'task:'
const PROJECT_PREFIX = 'project:'

export function useTasks() {
  // --- Task CRUD ---

  async function loadTasks() {
    isLoading.value = true
    try {
      const allKeys = await keys()
      const taskKeys = allKeys.filter(k => String(k).startsWith(TASK_PREFIX))
      const loaded: Task[] = []
      for (const key of taskKeys) {
        const task = await get<Task>(key)
        if (task) loaded.push(task)
      }
      tasks.value = loaded.sort((a, b) => {
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
        return priorityOrder[a.priority] - priorityOrder[b.priority]
      })
    } finally {
      isLoading.value = false
    }
  }

  async function createTask(data: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task> {
    const now = new Date().toISOString()
    const task: Task = {
      ...data,
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
    }
    await set(`${TASK_PREFIX}${task.id}`, task)
    await loadTasks()
    return task
  }

  async function updateTask(id: string, updates: Partial<Task>): Promise<Task | null> {
    const existing = await get<Task>(`${TASK_PREFIX}${id}`)
    if (!existing) return null
    const updated: Task = {
      ...existing,
      ...updates,
      id, // ID darf nicht ueberschrieben werden
      updatedAt: new Date().toISOString(),
    }
    await set(`${TASK_PREFIX}${id}`, updated)
    await loadTasks()
    return updated
  }

  async function deleteTask(id: string): Promise<boolean> {
    await del(`${TASK_PREFIX}${id}`)
    // Aus allen Projekten entfernen
    for (const project of projects.value) {
      if (project.taskIds.includes(id)) {
        await updateProject(project.id, {
          taskIds: project.taskIds.filter(tid => tid !== id),
        })
      }
    }
    // Aus Dependencies anderer Tasks entfernen
    for (const task of tasks.value) {
      if (task.dependencies.includes(id)) {
        await updateTask(task.id, {
          dependencies: [...task.dependencies].filter(dep => dep !== id),
        })
      }
    }
    await loadTasks()
    return true
  }

  function getTask(id: string): Task | undefined {
    return tasks.value.find(t => t.id === id)
  }

  // --- Project CRUD ---

  async function loadProjects() {
    const allKeys = await keys()
    const projectKeys = allKeys.filter(k => String(k).startsWith(PROJECT_PREFIX))
    const loaded: Project[] = []
    for (const key of projectKeys) {
      const project = await get<Project>(key)
      if (project) loaded.push(project)
    }
    projects.value = loaded.sort((a, b) => a.name.localeCompare(b.name))
  }

  async function createProject(data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> {
    const now = new Date().toISOString()
    const project: Project = {
      ...data,
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
    }
    await set(`${PROJECT_PREFIX}${project.id}`, project)
    await loadProjects()
    return project
  }

  async function updateProject(id: string, updates: Partial<Project>): Promise<Project | null> {
    const existing = await get<Project>(`${PROJECT_PREFIX}${id}`)
    if (!existing) return null
    const updated: Project = {
      ...existing,
      ...updates,
      id,
      updatedAt: new Date().toISOString(),
    }
    await set(`${PROJECT_PREFIX}${id}`, updated)
    await loadProjects()
    return updated
  }

  async function deleteProject(id: string): Promise<boolean> {
    await del(`${PROJECT_PREFIX}${id}`)
    await loadProjects()
    return true
  }

  // --- Hilfsfunktionen ---

  function getTasksByProject(projectId: string): Task[] {
    const project = projects.value.find(p => p.id === projectId)
    if (!project) return []
    return project.taskIds
      .map(id => tasks.value.find(t => t.id === id))
      .filter((t): t is Task => t !== undefined)
  }

  function getUnscheduledTasks(): Task[] {
    return tasks.value.filter(t => t.status === 'todo' && !t.scheduledStart)
  }

  function getScheduledTasks(): Task[] {
    return tasks.value.filter(t => t.scheduledStart !== undefined)
  }

  function getPendingTasks(): Task[] {
    return tasks.value.filter(t => t.status !== 'done')
  }

  // Initialisierung
  async function init() {
    await Promise.all([loadTasks(), loadProjects()])
  }

  return {
    tasks: readonly(tasks),
    projects: readonly(projects),
    isLoading: readonly(isLoading),
    init,
    loadTasks,
    loadProjects,
    createTask,
    updateTask,
    deleteTask,
    getTask,
    createProject,
    updateProject,
    deleteProject,
    getTasksByProject,
    getUnscheduledTasks,
    getScheduledTasks,
    getPendingTasks,
  }
}
