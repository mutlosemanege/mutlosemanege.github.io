import { get, set, del, keys } from 'idb-keyval'
import { v4 as uuidv4 } from 'uuid'
import type { Task, Project } from '~/types/task'

const tasks = ref<Task[]>([])
const projects = ref<Project[]>([])
const isLoading = ref(false)
let isMutating = false

const TASK_PREFIX = 'task:'
const PROJECT_PREFIX = 'project:'

async function acquireMutex() {
  while (isMutating) {
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  isMutating = true
}

function releaseMutex() {
  isMutating = false
}

export function useTasks() {
  async function attachTaskToProject(projectId: string | undefined, taskId: string) {
    if (!projectId) return
    const project = await get<Project>(`${PROJECT_PREFIX}${projectId}`)
    if (!project || project.taskIds.includes(taskId)) return

    await set(`${PROJECT_PREFIX}${projectId}`, {
      ...project,
      taskIds: [...project.taskIds, taskId],
      updatedAt: new Date().toISOString(),
    })
  }

  async function detachTaskFromProject(projectId: string | undefined, taskId: string) {
    if (!projectId) return
    const project = await get<Project>(`${PROJECT_PREFIX}${projectId}`)
    if (!project || !project.taskIds.includes(taskId)) return

    await set(`${PROJECT_PREFIX}${projectId}`, {
      ...project,
      taskIds: project.taskIds.filter(id => id !== taskId),
      updatedAt: new Date().toISOString(),
    })
  }

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
    await acquireMutex()
    try {
      const now = new Date().toISOString()
      const task: Task = {
        ...data,
        id: uuidv4(),
        createdAt: now,
        updatedAt: now,
      }
      await set(`${TASK_PREFIX}${task.id}`, task)
      await attachTaskToProject(task.projectId, task.id)
      await loadProjects()
      await loadTasks()
      return task
    } finally {
      releaseMutex()
    }
  }

  async function updateTask(id: string, updates: Partial<Task>): Promise<Task | null> {
    await acquireMutex()
    try {
      const existing = await get<Task>(`${TASK_PREFIX}${id}`)
      if (!existing) return null
      const updated: Task = {
        ...existing,
        ...updates,
        id, // ID darf nicht ueberschrieben werden
        updatedAt: new Date().toISOString(),
      }
      await set(`${TASK_PREFIX}${id}`, updated)
      if (existing.projectId !== updated.projectId) {
        await detachTaskFromProject(existing.projectId, id)
        await attachTaskToProject(updated.projectId, id)
        await loadProjects()
      }
      await loadTasks()
      return updated
    } finally {
      releaseMutex()
    }
  }

  async function deleteTask(id: string): Promise<boolean> {
    await acquireMutex()
    try {
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
      // Hinweis: updateTask ruft acquireMutex() auf, daher direkt in DB schreiben
      for (const task of tasks.value) {
        if (task.dependencies.includes(id)) {
          const updatedDeps = task.dependencies.filter(dep => dep !== id)
          await set(`${TASK_PREFIX}${task.id}`, {
            ...task,
            dependencies: updatedDeps,
            updatedAt: new Date().toISOString(),
          })
        }
      }
      await loadTasks()
      return true
    } finally {
      releaseMutex()
    }
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

  async function deleteProjectWithTasks(id: string): Promise<boolean> {
    await acquireMutex()
    try {
      const existingProject = await get<Project>(`${PROJECT_PREFIX}${id}`)
      const taskIdsToDelete = new Set<string>([
        ...(existingProject?.taskIds || []),
        ...tasks.value
          .filter(task => task.projectId === id)
          .map(task => task.id),
      ])

      for (const taskId of taskIdsToDelete) {
        await del(`${TASK_PREFIX}${taskId}`)
      }

      for (const task of tasks.value) {
        if (taskIdsToDelete.has(task.id)) continue

        const updatedDeps = task.dependencies.filter(dep => !taskIdsToDelete.has(dep))
        if (updatedDeps.length !== task.dependencies.length) {
          await set(`${TASK_PREFIX}${task.id}`, {
            ...task,
            dependencies: updatedDeps,
            updatedAt: new Date().toISOString(),
          })
        }
      }

      await del(`${PROJECT_PREFIX}${id}`)
      await Promise.all([loadProjects(), loadTasks()])
      return true
    } finally {
      releaseMutex()
    }
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
    return tasks.value.filter(t =>
      (t.status === 'todo' || t.status === 'missed') &&
      (!t.scheduleBlocks || t.scheduleBlocks.length === 0)
    )
  }

  function getScheduledTasks(): Task[] {
    return tasks.value.filter(t => (t.scheduleBlocks?.length || 0) > 0)
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
    deleteProjectWithTasks,
    getTasksByProject,
    getUnscheduledTasks,
    getScheduledTasks,
    getPendingTasks,
  }
}
